import {
  SwishPaymentStatus,
  SwishRefundStatus,
  type Prisma,
  type VastraEvent
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { format, isWithinInterval, subDays } from "date-fns";
import { Resend } from "resend";
import { z } from "zod";
import { EventSignUp } from "~/components/emails/EventSignUp";
import { env } from "~/env.mjs";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { isEventCancelable } from "~/server/utils/event";
import { isSamePhoneNumber } from "~/server/utils/helpers";
import { checkPaymentStatus, checkRefundStatus } from "~/server/utils/payment";
import { createPaymentIntentPayload } from "~/utils/payment";
import {
  createPaymentRequest,
  createRefundRequest
} from "~/utils/swishHelpers";
import {
  participantSchema,
  swishCallbackPaymentSchema,
  swishCallbackRefundSchema
} from "~/utils/zodSchemas";

const resend = new Resend(env.RESEND_API_KEY);

type ParticipantInput = z.infer<typeof participantSchema>;

export type ParticipantWithBusAndEvent = Prisma.ParticipantGetPayload<{
  include: {
    event: true;
    bus: true;
  };
}>;

export type ParticipantWithParticipants = Prisma.ParticipantGetPayload<{
  select: {
    phone: true,
    event: true,
    swishPayments: {
      select: {
        id: true,
        participants: {
          include: {
            event: true,
            swishRefunds: true
          }
        },
      },      
    }
  }
}>;

const getParticipantCost = (
  participant: Omit<ParticipantInput, "consent">,
  event: VastraEvent
) => {
  if (participant.youth && participant.member) {
    return event.youthMemberPrice;
  } else if (participant.youth && !participant.member) {
    return event.youthPrice;
  } else if (!participant.youth && participant.member) {
    return event.memberPrice;
  } else {
    return event.defaultPrice;
  }
};

const calculateCost = (
  participants: ParticipantInput[],
  event: VastraEvent
) => {
  const totalCost = participants.reduce((acc, participant) => {
    return acc + getParticipantCost(participant, event);
  }, 0);
  return totalCost;
};

const sendConfirmationEmail = async (
  participant: ParticipantWithBusAndEvent
) => {
  const cancellationUrl = `${env.CANCELLATION_URL}?token=${
    participant?.cancellationToken || ""
  }`;
  return await resend.sendEmail({
    from: env.BOOKING_EMAIL,
    to: env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : participant.email,
    subject: `Anmälan till ${participant?.event?.name}`,
    react: EventSignUp({ participant, cancellationUrl })
  });
};


const participantFormatter = (participant: ParticipantWithParticipants['swishPayments'][number]['participants'][number]) => {
  const isCancelable = isEventCancelable(participant.event.date);
  const hasCancelled = participant.swishRefunds.some(
    (x) => x.status === SwishRefundStatus.PAID
  );

  const res = {
    name: participant.name,
    email: participant.email,
    cancellationToken: participant.cancellationToken,
    eventName: participant.event.name,
    payAmount: participant.payAmount,
    departureTime: format(participant.event.date, "HH:mm"),
    note: participant.note,
    cancellationDisabled: !isCancelable,
    hasCancelled,
  }
  return res;
};

export const eventPaymentRouter = createTRPCRouter({
  requestSwishPayment: publicProcedure
    .input(
      z.object({
        participants: participantSchema.array().min(1),
        eventId: z.string()
      })
    )
    .mutation(async ({ input, ctx }) => {
      const event = await ctx.prisma.vastraEvent.findFirst({
        where: {
          id: input.eventId
        }
      });
      if (!event) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event not found"
        });
      }

      const cost = calculateCost(input.participants, event);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const payer = input.participants[0]!;
      const message = `${event.name}. ${input.participants.length} resenärer`
        .slice(0, 50)
        .replaceAll("/", "-");
      const data = createPaymentIntentPayload({
        message,
        payerAlias: payer.phone,
        amount: cost,
        callbackEndPoint: "swishEventCallback"
      });
      try {
        // Create participants for event
        const participants = await ctx.prisma.$transaction(
          input.participants.map(({ consent: _consent, ...participant }) =>
            ctx.prisma.participant.create({
              data: {
                ...participant,
                userEmail: participant.email,
                payAmount: getParticipantCost(participant, event),
                eventId: event.id
              }
            })
          )
        );
        const res = await createPaymentRequest(data);
        const paymentRequestUrl = res.headers.location as string;
        // ID is the last part of the URL
        const paymentRequestId = paymentRequestUrl.split("/").pop() as string;
        // Create payment request in our database
        const paymentIntent = await ctx.prisma.swishPayment.create({
          data: {
            paymentRequestUrl,
            paymentId: paymentRequestId,
            payerAlias: payer.phone,
            payeeAlias: data.payeeAlias,
            amount: cost,
            message: message,
            status: SwishPaymentStatus.CREATED,
            participants: {
              connect: participants.map((p) => ({ id: p.id }))
            }
          }
        });
        return paymentIntent.paymentId;
      } catch (err) {
        console.error("Error creating payment request");
        const error = err as { response: { data: any } };
        console.error(error);
        console.error(error?.response?.data);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    }),
  cancelBooking: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const participant = await ctx.prisma.participant.findFirst({
        where: {
          cancellationToken: input.token
        },
        include: {
          swishPayments: true,
          event: true
        }
      });

      if (!participant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        });
      }

      // You can't cancel within 48 hours of the departure
      const twoDaysBeforeDeparture = subDays(participant.event.date, 2);
      const today = new Date();
      const isWithin48Hours = isWithinInterval(today, {
        start: twoDaysBeforeDeparture,
        end: participant.event.date
      });

      if (isWithin48Hours) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Du kan inte avboka inom 48h"
        });
      }

      const { swishPayments, payAmount, event } = participant;

      const swishPayment = swishPayments?.find(
        (p) => p.status === SwishPaymentStatus.PAID
      );

      if (!swishPayment || !payAmount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        });
      }

      if (!event) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No related event to participant: ${participant.id}`
        });
      }
      const [eventNameShort] = event.name.replaceAll("/", "-").split(" ");
      const message = `Återbetalning: ${eventNameShort ?? ""}, ${
        participant.name
      }`;
      const refundData = {
        originalPaymentReference: swishPayment.paymentId,
        callbackUrl: `${env.API_URL}/payment/swishEventCallback`,
        payerAlias: "1234679304",
        amount: payAmount,
        currency: "SEK",
        message
      };

      try {
        const res = await createRefundRequest(refundData);
        const refundRequestUrl = res.headers.location as string;
        // ID is the last part of the URL
        const refundRequestId = refundRequestUrl.split("/").pop() as string;
        const refundIntent = await ctx.prisma.swishRefund.create({
          data: {
            refundId: refundRequestId,
            paymentId: swishPayment.id,
            paymentReference: swishPayment.paymentReference,
            payerAlias: refundData.payerAlias,
            payeeAlias: swishPayment.payerAlias,
            amount: refundData.amount,
            message: refundData.message,
            status: "CREATED",
            participantId: participant.id
          }
        });

        return refundIntent.refundId;
      } catch (err) {
        console.error("Error creating refund request");
        const error = err as { response: { data: any } };
        console.error(error?.response?.data);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    }),
  checkPaymentStatus: publicProcedure
    .input(z.object({ paymentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return checkPaymentStatus(input.paymentId, ctx.prisma);
    }),
  checkRefundStatus: publicProcedure
    .input(z.object({ refundId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return checkRefundStatus(input.refundId, ctx.prisma);
    }),
  swishPaymentCallback: publicProcedure
    .input(swishCallbackPaymentSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Protect this endpoint with a secret
      console.info("SWISH PAYMENT CALLBACK", input);
      const originalPayment = await ctx.prisma.swishPayment.findFirst({
        where: {
          paymentId: input.id
        },
        include: {
          participants: true
        }
      });

      if (!originalPayment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        });
      }

      const newPayment = await ctx.prisma.swishPayment.create({
        include: {
          participants: {
            include: {
              bus: true,
              event: true
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
            connect: originalPayment.participants.map((p) => ({ id: p.id }))
          }
        }
      });

      if (newPayment.status === SwishPaymentStatus.PAID) {
        try {
          console.log("participants", newPayment.participants);
          console.log(
            "Sending confirmation email to: ",
            newPayment.participants.map((p) => p.email).join(", ")
          );
          await Promise.all(
            newPayment.participants.map((p) => sendConfirmationEmail(p))
          );
        } catch (error) {
          console.error("Error sending confirmation email");
          console.error(error);
          // Don't return error to Swish
        }
      }

      console.log("SWISH CALLBACK");
      console.log("input", input);
      return {
        status: 200
      };
    }),
  swishRefundCallback: publicProcedure
    .input(swishCallbackRefundSchema)
    .mutation(async ({ input, ctx }) => {
      console.log("SWISH REFUND CALLBACK", input);
      try {
        const refundIntent = await ctx.prisma.swishRefund.findFirst({
          where: {
            refundId: input.id
          },
          include: {
            participant: true
          }
        });

        if (!refundIntent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Refund not found"
          });
        }

        if (!refundIntent.participant) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Refund has no participant"
          });
        }

        await ctx.prisma.swishRefund.create({
          include: {
            participant: true
          },
          data: {
            refundId: input.id,
            paymentId: refundIntent.paymentId,
            payerAlias: input.payerAlias,
            payeeAlias: input.payeeAlias || refundIntent.payeeAlias,
            amount: input.amount,
            message: input.message,
            paymentReference: input.originalPaymentReference,
            createdAt: new Date(input.dateCreated),
            updatedAt: new Date(),
            status: input.status,
            participantId: refundIntent.participant.id
          }
        });

        await ctx.prisma.participant.update({
          where: {
            id: refundIntent.participant.id
          },
          data: {
            cancellationDate: new Date()
          }
        });
      } catch (err) {
        console.error(err);
        throw err;
      }
      return "ok";
    }),
  getManagableBooking: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const payer = await ctx.prisma.participant.findFirst({
        where: {
          cancellationToken: input.token,
        },
        select: {
          phone: true,
          event: true,
          swishPayments: {
            select: {
              id: true,
              payerAlias: true,
              participants: {
                include: {
                  event: true,
                  swishRefunds: true
                }
              },
            },
            where: {
              status: SwishPaymentStatus.PAID,
              participants: {
                some: {
                  cancellationToken: input.token,
                }
              }
            }
          }
        }
      });

      if (!payer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        });
      }

      const [payment] = payer.swishPayments;

      if (!payment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        });
      }

      const participants = payment.participants.map(participantFormatter); 
      const isPayer = isSamePhoneNumber(payer.phone, payment.payerAlias);
      if (!isPayer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You are not the payer"
        });
      }

      return {
        participants,
        eventName: payer.event.name,
        departureTime: format(payer.event.date, "HH:mm"),
      }
    })
});
