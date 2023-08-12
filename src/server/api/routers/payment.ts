import { TRPCError } from "@trpc/server";
import { Resend } from 'resend';
import { z } from "zod";
import { env } from "~/env.mjs";
import {
  createTRPCRouter,
  publicProcedure
} from "~/server/api/trpc";
import { participantSchema, swishCallbackSchema } from "~/utils/zodSchemas";
import { EventSignUp } from "~/components/emails/EventSignUp";
import { PAYMENT_STATUS, createPaymentRequest, getPaymentStatus } from "~/utils/swishHelpers";
import { type Participant, type PrismaClient, type VastraEvent } from "@prisma/client";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
const resend = new Resend(env.RESEND_API_KEY);

type ParticipantInput = z.infer<typeof participantSchema>;

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

const sendConfirmationEmail = async (participant: Participant, event: VastraEvent) => {
  const cancellationUrl = `${env.CANCELLATION_URL}?token=${participant?.cancellationToken || ''}`;
  return await resend.sendEmail({
    from: env.BOOKING_EMAIL,
    to: participant?.email || 'filip.nystrand@gmail.com',
    subject: `Anmälan till ${event?.name}`,
    react: EventSignUp({ name: participant?.name || '' , cancellationUrl })
  });
}

const pollPaymentStatus = async (id: string, url: string, prisma: PrismaClient, attempt = 0) : Promise<{ success : boolean }> => {
  // Retry 30 times
  if (attempt > 30) {
    console.error(`Payment timed out - attempt: ${attempt}`);
    const failedPayment = await prisma.swishPayment.findFirst({
      where: {
        id: id,
      }
    });
    if (failedPayment) {
      console.error("Failed payment", JSON.stringify(failedPayment, null, 2));
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Payment timed out"
    })
  }
  const successfulPayment = await prisma.swishPayment.findFirst({
    where: {
      id: id,
      status: PAYMENT_STATUS.PAID
    }
  })
  console.log(`successfulPayment - attempt: ${attempt}`, successfulPayment)
  if (successfulPayment) {
    return {
      success: true
    }
  } else {
    // Wait 1 second before checking again
    await delay(1000);
    return pollPaymentStatus(id, url, prisma, attempt + 1);
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
        "message" : message,
      };
      try {
        const res = await createPaymentRequest(data);
        const paymentRequestUrl = res.headers.location as string;
        // ID is the last part of the URL
        const paymentRequestId = paymentRequestUrl.split('/').pop() as string;
        // Create payment request in our database
        const swishPayment = await ctx.prisma.swishPayment.create({
          data: {
            paymentRequestUrl,
            paymentId: paymentRequestId,
            payerAlias: payer.phone,
            payeeAlias: "1234679304",
            amount: cost,
            message: message,
            status: PAYMENT_STATUS.CREATED,
          }
        });

        // Poll payment status from our DB
        const paymentStatus = await pollPaymentStatus(swishPayment.id, paymentRequestId, ctx.prisma);
        if (!paymentStatus?.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR"
          })
        }

        // Create participants for event
        const participants = await ctx.prisma.$transaction(
          input.participants.map(({ consent: _consent, ...participant }) => (
            ctx.prisma.participant.create({
             data: {
               ...participant,
               payAmount: getParticipantCost(participant, event),
               eventId: input.eventId,
               swishPaymentId: swishPayment.id,
             }
           })
          ))
        );

        // Send email confirmation to all participants
        await Promise.all(participants.map(p => sendConfirmationEmail(p, event)));
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
        }
      });

      if (!participant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        })
      }

      await delay(1000);
      return "you can now see this secret message!";
  }),
  swishCallback: publicProcedure
    .input(swishCallbackSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Protect this endpoint with a secret
      await ctx.prisma.swishPayment.update({
        where: {
          paymentId: input.id
        },
        data: {
          status: input.status,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          datePaid: new Date(input.datePaid),
          paymentReference: input.paymentReference,
        }
      })
      console.log("SWISH CALLBACK");
      console.log("input", input);
      return {
        status: 200
      }
    }),
  getSwishPaymentStatus: publicProcedure
    .query(async () => {
      const id = "F4DB8C8DA9BB41238459A50015154AF3"
      try {
        const res = await getPaymentStatus(id);
        console.log("res", res.data);
      } catch (err) {
        console.error(err)
      }
    })
});
