import {
  StripePaymentStatus,
  StripeRefundStatus,
  type Prisma,
  type VastraEvent
} from "@prisma/client";
import { captureException, captureMessage } from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  busesWithBookedSeats,
  cancelPendingPayment,
  lockBusesWithFreeSeats,
  releaseExpiredSeatHolds,
  withFreeSeat
} from "~/server/utils/busCapacity";
import { isEventCancelable } from "~/server/utils/event";
import { checkRefundStatus } from "~/server/utils/payment";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { createPaymentIntent, createRefundIntent } from "~/utils/stripeHelpers";
import { participantSchema } from "~/utils/zodSchemas";

type ParticipantInput = z.infer<typeof participantSchema>;

export type ParticipantWithBusAndEvent = Prisma.ParticipantGetPayload<{
  include: {
    event: true;
    bus: true;
  };
}>;

export type ParticipantWithParticipants = Prisma.ParticipantGetPayload<{
  select: {
    phone: true;
    event: true;
    stripePayments: {
      select: {
        id: true;
        participants: {
          include: {
            event: true;
            stripeRefunds: true;
            cancellationDate: true;
          };
        };
      };
    };
  };
}>;

const getParticipantCost = (
  participant: Pick<ParticipantInput, "youth" | "member">,
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
/**
 * Calculates the total cost
 * @param participants
 * @param event
 * @returns The total cost in cents (ören)
 */
const calculateCost = (
  participants: ParticipantInput[],
  event: VastraEvent
) => {
  const totalCost = participants.reduce((acc, participant) => {
    return acc + getParticipantCost(participant, event);
  }, 0);
  return totalCost * 100;
};

const participantFormatter = (
  participant: ParticipantWithParticipants["stripePayments"][number]["participants"][number]
) => {
  const isCancelable = isEventCancelable(participant.event.date);
  const hasCancelled = participant.stripeRefunds.some(
    (x) => x.status === StripeRefundStatus.REFUNDED
  );

  const res = {
    name: participant.name,
    email: participant.email,
    cancellationToken: participant.cancellationToken,
    eventName: participant.event.name,
    payAmount: participant.payAmount,
    busId: participant.busId,
    departureTime: formatSwedishTime(participant.event.date, "HH:mm"),
    cancellationDate: participant.cancellationDate
      ? formatSwedishTime(participant.cancellationDate, "yyyy-MM-dd HH:mm")
      : null,
    note: participant.note,
    cancellationDisabled: !isCancelable,
    hasCancelled
  };
  return res;
};

export const eventPaymentRouter = createTRPCRouter({
  requestStripePayment: publicProcedure
    .input(
      z.object({
        participants: participantSchema.array().min(1),
        eventId: z.string()
      })
    )
    .mutation(async ({ input, ctx }) => {
      await releaseExpiredSeatHolds(ctx.prisma, ctx.stripe, input.eventId);

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

      // Check the seats and hold them in one go, so two bookings can't both
      // take the last seat. The participants hold their seats from here on.
      const participants = await ctx.prisma.$transaction(async (tx) => {
        const buses = await lockBusesWithFreeSeats(
          tx,
          event.id,
          input.participants.map((p) => p.busId)
        );

        const eventBusIds = new Set(buses.map((bus) => bus.id));
        if (input.participants.some((p) => !eventBusIds.has(p.busId))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Bus not found"
          });
        }

        const someBusIsFull = buses.some((bus) => {
          const participantsOnBus = input.participants.filter(
            (p) => p.busId === bus.id
          );
          return bus.availableSeats < participantsOnBus.length;
        });

        if (someBusIsFull) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "BUS_FULL"
          });
        }

        const created = [];
        for (const {
          consent: _consent,
          firstName,
          lastName,
          ...participant
        } of input.participants) {
          created.push(
            await tx.participant.create({
              data: {
                ...participant,
                name: `${firstName} ${lastName}`,
                userEmail: participant.email,
                payAmount: getParticipantCost(participant, event),
                eventId: event.id
              }
            })
          );
        }
        return created;
      });

      const cost = calculateCost(input.participants, event);

      try {
        const payee = participants[0];

        if (!payee) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No payee found"
          });
        }

        const description =
          `${event.name}. ${input.participants.length} resenärer`
            .slice(0, 50)
            .replaceAll("/", "-");
        const stripeRes = await createPaymentIntent({
          amount: cost,
          description,
          payee,
          metadata: {
            type: "EVENT"
          }
        });

        // Create payment request in our database
        await ctx.prisma.stripePayment.create({
          data: {
            stripePaymentId: stripeRes.id,
            amount: cost,
            status: StripePaymentStatus.CREATED,
            participants: {
              connect: participants.map((p) => ({ id: p.id }))
            }
          }
        });
        return stripeRes.client_secret;
      } catch (err) {
        console.error("Error creating payment request");
        const error = err as { response: { data: any } };
        console.error(error);
        console.error(error?.response?.data);
        captureMessage("Error creating payment request");
        captureException(err);
        // Give the seats back
        await ctx.prisma.participant.deleteMany({
          where: {
            id: {
              in: participants.map((p) => p.id)
            },
            stripePayments: {
              none: {}
            }
          }
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    }),
  releasePendingBooking: publicProcedure
    .input(z.object({ clientSecret: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // The client secret proves the caller made the booking
      const [paymentIntentId] = input.clientSecret.split("_secret_");
      const payment = await ctx.prisma.stripePayment.findFirst({
        where: {
          stripePaymentId: paymentIntentId,
          status: StripePaymentStatus.CREATED
        },
        select: {
          stripePaymentId: true,
          amount: true,
          participants: {
            select: {
              id: true
            }
          }
        }
      });
      if (!payment) {
        return { released: false };
      }
      const paymentIntent = await ctx.stripe.paymentIntents.retrieve(
        payment.stripePaymentId
      );
      if (paymentIntent.client_secret !== input.clientSecret) {
        return { released: false };
      }
      return {
        released: await cancelPendingPayment(ctx.prisma, ctx.stripe, payment)
      };
    }),
  cancelBooking: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const participant = await ctx.prisma.participant.findFirst({
        where: {
          cancellationToken: input.token
        },
        include: {
          event: true,
          stripePayments: {
            select: {
              id: true,
              stripePaymentId: true,
              participants: true,
              amount: true,
              netAmount: true,
              status: true
            }
          }
        }
      });

      if (!participant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        });
      }

      const isCancelable = isEventCancelable(participant.event.date);
      if (!isCancelable) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Du kan inte avboka inom 36h"
        });
      }

      const { event, stripePayments } = participant;

      const stripePayment = stripePayments?.find(
        (p) => p.status === StripePaymentStatus.SUCCEEDED
      );

      if (!stripePayment) {
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

      let eventCost = event.defaultPrice;

      if (participant.youth && participant.member) {
        eventCost = event.youthMemberPrice;
      } else if (participant.member) {
        eventCost = event.memberPrice;
      } else if (participant.youth) {
        eventCost = event.youthPrice;
      }

      // Eventcost is in SEK, we need to convert it to cents (öre) to be synced with Stripe
      eventCost = eventCost * 100;

      const stripeFee = stripePayment.amount - stripePayment.netAmount;

      // How big is the fee for this participant
      const eventCostFeeFraction = eventCost / stripePayment.amount;
      const eventCostFee = Math.floor(stripeFee * eventCostFeeFraction);

      // So, this is the amount that the participant will get back after the Stripe fees.
      const participantPayAmount = eventCost - eventCostFee;

      try {
        const stripeRefundIntent = await createRefundIntent({
          paymentIntentId: stripePayment.stripePaymentId,
          amount: participantPayAmount
        });

        const refundIntent = await ctx.prisma.stripeRefund.create({
          data: {
            stripeRefundId: stripeRefundIntent.id,
            amount: participantPayAmount,
            status: StripePaymentStatus.CREATED,
            participantId: participant.id,
            originalPaymentId: stripePayment.id
          }
        });

        return refundIntent.originalPaymentId;
      } catch (err) {
        console.error("Error creating refund request");
        console.error(err);
        throw err;
      }
    }),
  checkRefundStatus: publicProcedure
    .input(z.object({ originalPaymentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return checkRefundStatus(input.originalPaymentId, ctx.prisma);
    }),
  getManagableBooking: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const payer = await ctx.prisma.participant.findFirst({
        where: {
          cancellationToken: input.token
        },
        select: {
          phone: true,
          busId: true,
          event: {
            include: busesWithBookedSeats()
          },
          cancellationDate: true,
          stripePayments: {
            select: {
              id: true,
              participants: {
                include: {
                  event: true,
                  stripeRefunds: true
                }
              }
            },
            where: {
              status: StripePaymentStatus.SUCCEEDED,
              participants: {
                some: {
                  cancellationToken: input.token
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

      const [payment] = payer.stripePayments;

      if (!payment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        });
      }

      const participants = payment.participants.map(participantFormatter);

      return {
        participants,
        eventName: payer.event.name,
        departureTime: formatSwedishTime(payer.event.date, "HH:mm"),
        buses: payer.event.buses.map((bus) => ({
          ...bus,
          availableSeats: bus.seats - bus._count.passengers
        }))
      };
    }),
  changeBus: publicProcedure
    .input(z.object({ busId: z.string(), token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const participant = await ctx.prisma.participant.findFirst({
        where: {
          cancellationToken: input.token
        }
      });

      if (!participant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        });
      }

      if (participant.busId === input.busId) {
        return "ok";
      }

      await releaseExpiredSeatHolds(ctx.prisma, ctx.stripe, participant.eventId);

      await withFreeSeat(ctx.prisma, participant.eventId, input.busId, (tx) =>
        tx.participant.update({
          where: {
            id: participant.id
          },
          data: {
            busId: input.busId
          }
        })
      );

      return "ok";
    }),
  getBooking: publicProcedure
    .input(z.object({ paymentId: z.string() }))
    .query(async ({ input, ctx }) => {
      const payment = await ctx.prisma.stripePayment.findFirst({
        where: {
          stripePaymentId: input.paymentId,
          status: StripePaymentStatus.SUCCEEDED
        },
        include: {
          participants: {
            include: {
              event: true,
              stripeRefunds: true
            }
          }
        }
      });

      if (!payment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment not found"
        });
      }

      const participants = payment.participants.map(participantFormatter);
      if (participants.length < 1 || !participants[0]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No participants found"
        });
      }
      return {
        participants,
        eventName: participants[0].eventName,
        departureTime: participants[0].departureTime,
        totalPrice: payment.amount / 100,
        gameInfo: payment.participants[0]?.event.description
      };
    })
});
