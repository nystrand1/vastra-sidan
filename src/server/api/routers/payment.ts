import { SwishPayment, type Prisma, type PrismaClient, type VastraEvent } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { Resend } from 'resend';
import { z } from "zod";
import { EventSignUp } from "~/components/emails/EventSignUp";
import { env } from "~/env.mjs";
import {
  createTRPCRouter,
  publicProcedure
} from "~/server/api/trpc";
import { PAYMENT_STATUS, createPaymentRequest, createRefundRequest } from "~/utils/swishHelpers";
import { participantSchema, swishCallbackPaymentSchema, swishCallbackRefundSchema } from "~/utils/zodSchemas";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
const resend = new Resend(env.RESEND_API_KEY);

type ParticipantInput = z.infer<typeof participantSchema>;

export type ParticipantWithBusAndEvent = Prisma.ParticipantGetPayload<{
  include: {
    event: true,
    bus: true
  }
}>

const getParticipantCost = (participant: Omit<ParticipantInput, 'consent'>, event: VastraEvent) => {
  if (participant.youth && participant.member) {
    return event.youthMemberPrice;
  } else if (participant.youth && !participant.member) {
    return event.youthPrice;
  } else if (!participant.youth && participant.member) {
    return event.memberPrice;
  } else {
    return event.defaultPrice;
  }
}

const calculateCost = (participants: ParticipantInput[], event: VastraEvent) => {
  const totalCost = participants.reduce((acc, participant) => {
    return acc + getParticipantCost(participant, event);
  }, 0);
  return totalCost;
}

const sendConfirmationEmail = async (participant: ParticipantWithBusAndEvent) => {
  const cancellationUrl = `${env.CANCELLATION_URL}?token=${participant?.cancellationToken || ''}`;
  return await resend.sendEmail({
    from: env.BOOKING_EMAIL,
    to: participant?.email || 'filip.nystrand@gmail.com',
    subject: `Anmälan till ${participant?.event?.name}`,
    react: EventSignUp({participant, cancellationUrl })
  });
}

const pollPaymentStatus = async (paymentIntent: SwishPayment, prisma: PrismaClient, attempt = 0) : Promise<{ success : boolean }> => {
  // Retry 30 times
  if (attempt > 30) {
    console.error(`Payment timed out - attempt: ${attempt}`);
    console.error("Failed payment id: ", paymentIntent.paymentId);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Payment timed out"
    })
  }
  const successfulPayment = await prisma.swishPayment.findFirst({
    where: {
      paymentId: paymentIntent.paymentId,
      status: PAYMENT_STATUS.PAID
    }
  })
  if (successfulPayment) {
    console.info(`successfulPayment - attempt: ${attempt}`, successfulPayment?.paymentId)
    return {
      success: true
    }
  } else {
    // Wait 1 second before checking again
    await delay(1000);
    return pollPaymentStatus(paymentIntent, prisma, attempt + 1);
  }
};

export const paymentRouter = createTRPCRouter({
  requestSwishPayment: publicProcedure
    .input(z.object({
      participants: participantSchema.array().min(1),
      eventId: z.string(),
    }))
    .mutation(async({ input, ctx }) => {
      const event = await ctx.prisma.vastraEvent.findFirst({
        where: {
          id: input.eventId
        }
      });
      if (!event) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event not found"
        })
      }

      const cost = calculateCost(input.participants, event);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const payer = input.participants[0]!
      const message = `${event.name}. ${input.participants.length} resenärer`.slice(0, 50).replaceAll('/', '-');
      const data = {
        "payeePaymentReference" : "0123456789",
        "callbackUrl" : `${env.API_URL}/payment/swishCallback`,
        "payerAlias" : payer.phone,
        "payeeAlias" : "1234679304",
        "amount" : cost,
        "currency" : "SEK",
        "message" : "RF07",
      };
      try {
        // Create participants for event
        const participants = await ctx.prisma.$transaction(
          input.participants.map(({ consent: _consent, ...participant }) => (
            ctx.prisma.participant.create({
             data: {
               ...participant,
               payAmount: getParticipantCost(participant, event),
               eventId: event.id,
            }
           })
          ))
        );
        const res = await createPaymentRequest(data);
        const paymentRequestUrl = res.headers.location as string;
        // ID is the last part of the URL
        const paymentRequestId = paymentRequestUrl.split('/').pop() as string;
        // Create payment request in our database
        const paymentIntent = await ctx.prisma.swishPayment.create({
          data: {
            paymentRequestUrl,
            paymentId: paymentRequestId,
            payerAlias: payer.phone,
            payeeAlias: "1234679304",
            amount: cost,
            message: message,
            status: PAYMENT_STATUS.CREATED,
            participants: {
              connect: participants.map((p) => ({ id: p.id }))
            }
          }
        });

        // Poll payment status from our DB
        const paymentStatus = await pollPaymentStatus(paymentIntent, ctx.prisma);
        if (!paymentStatus?.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR"
          })
        }

        console.info('Payment request created');
        return {
          status: 201
        };
      } catch (err) {
        console.error('Error creating payment request');
        const error = err as { response: { data: any } };
        console.error(error);
        console.error(error?.response?.data);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        })
      }


    }),
  cancelBooking: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async({ input, ctx }) => {
      const participant = await ctx.prisma.participant.findFirst({
        where: {
          cancellationToken: input.token
        },
        include: {
          swishPayments: true,
          event: true,
        }
      });

      if (!participant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        })
      }

      const { swishPayments, payAmount, event } = participant;

      const swishPayment = swishPayments?.find((p) => p.status === PAYMENT_STATUS.PAID);

      if (!swishPayment || !payAmount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        })
      }

      if (!event) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No related event to participant: ${participant.id}`
        })
      }
      const [eventNameShort] = event.name.replaceAll('/', '-').split(' ');
      const message = `Återbetalning: ${eventNameShort ?? ''}, ${participant.name}`;
      const refundData = {
        originalPaymentReference: swishPayment.paymentId,
        "callbackUrl" : `${env.API_URL}/payment/swishCallback`,
        payerAlias: "1234679304",
        amount: payAmount,
        currency: "SEK",
        message,
      }

      try {
        const res = await createRefundRequest(refundData);
        // const refund = await ctx.prisma.swishRefund.create({
        //   data: {
        //     ...refundData,
        //     status: 'CREATED',
        //   }
        // });
        console.log("refundresponse", res.data);
      } catch (err) {
        console.error('Error creating refund request');
        const error = err as { response: { data: any } };
        console.error(error?.response?.data);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        })
      }

      await delay(1000);
      return "you can now see this secret message!";
  }),
  swishPaymentCallback: publicProcedure
    .input(swishCallbackPaymentSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Protect this endpoint with a secret
      console.info("SWISH PAYMENT CALLBACK", input);
      const originalPayment = await ctx.prisma.swishPayment.findFirst({
        where: {
          paymentId: input.id,
        },
        include: {
          participants: true,
        },
      })

      if (!originalPayment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        })
      }

      const newPayment = await ctx.prisma.swishPayment.create({
        include: {
          participants: {
            include: {
              bus: true,
              event: true,
            }
          }
        },
        data: {
          paymentId: input.id,
          payerAlias: input.payerAlias,
          payeeAlias: input.payeeAlias,
          amount: input.amount,
          message: input.message,
          paymentReference: input.paymentReference,
          paymentRequestUrl: originalPayment.paymentRequestUrl,
          createdAt: new Date(input.dateCreated),
          updatedAt: new Date(),
          status: input.status,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          participants: {
            connect: originalPayment.participants.map(p => ({ id: p.id }))
          },
        }
      })

      if (newPayment.status === PAYMENT_STATUS.PAID) {
        try {
          console.log("participants", newPayment.participants);
          console.log("Sending confirmation email to: ", newPayment.participants.map(p => p.email).join(", "));
          await Promise.all(newPayment.participants.map(p => sendConfirmationEmail(p)));
        } catch(error) {
          console.error("Error sending confirmation email");
          console.error(error);
          // Don't return error to Swish
        }
      }

      console.log("SWISH CALLBACK");
      console.log("input", input);
      return {
        status: 200
      }
    }),
    swishRefundCallback: publicProcedure
      .input(swishCallbackRefundSchema)
      .mutation(async ({ input, ctx }) => {
        console.log("SWISH REFUND CALLBACK", input);

        try {
          const swishPayment = await ctx.prisma.swishPayment.findFirst({
            where: {
              paymentId: input.originalPaymentReference
            }
          })

          if (!swishPayment) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Payment not found"
            })
          }

          // Refund is successful
          if (input.status === 'PAID') {
            // Update refund status
          }

        } catch (err) {
          console.error(err);
          throw err
        }
        return "ok";
      })
});
