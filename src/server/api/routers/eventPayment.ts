import {
  StripePaymentStatus,
  StripeRefundStatus,
  type Prisma,
  type VastraEvent
} from "~/generated/prisma/client";
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
import { sendBookingTransferredEmail } from "~/server/utils/email/sendBookingTransferredEmail";
import { sendEventConfirmationEmail } from "~/server/utils/email/sendEventConfirmationEmail";
import { isEventCancelable } from "~/server/utils/event";
import { checkRefundStatus } from "~/server/utils/payment";
import { participantRefundState } from "~/server/utils/refunds";
import { awayGamePaths, revalidatePages } from "~/server/utils/revalidate";
import { transferBooking } from "~/server/utils/transferBooking";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { createPaymentIntent, createRefundIntent } from "~/utils/stripeHelpers";
import { isTrainEvent } from "~/utils/transport";
import { participantSchema, transferBookingSchema } from "~/utils/zodSchemas";

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
            transfers: { select: { id: true } };
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
  const refundState = participantRefundState(participant.stripeRefunds);
  const hasCancelled = refundState.refunded;
  // Cancelled, but Stripe hasn't confirmed the refund yet
  const refundPending = !hasCancelled && refundState.pending;

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
    refundable: participant.event.refundable,
    hasCancelled,
    refundPending,
    member: participant.member,
    youth: participant.youth,
    // Handed over from the original booking; can't be cancelled through the site
    transferred: participant.transfers.length > 0
  };
  return res;
};

/** What a participant row needs to be shown with `participantFormatter`. */
const formattedParticipantInclude = {
  event: true,
  stripeRefunds: true,
  transfers: { select: { id: true } }
} satisfies Prisma.ParticipantInclude;

/**
 * A participant with its event, buses and the participants on its succeeded payment,
 * for the manage-booking page.
 */
const findBookingParticipant = (
  prisma: Prisma.TransactionClient,
  where: Prisma.ParticipantWhereUniqueInput
) =>
  prisma.participant.findUnique({
    where,
    select: {
      id: true,
      event: {
        include: busesWithBookedSeats()
      },
      transfers: { select: { id: true } },
      stripePayments: {
        select: {
          id: true,
          participants: {
            include: formattedParticipantInclude
          }
        },
        where: {
          status: StripePaymentStatus.SUCCEEDED
        }
      }
    }
  });

type BookingParticipant = NonNullable<Awaited<ReturnType<typeof findBookingParticipant>>>;

const succeededPayment = (participant: BookingParticipant) => {
  const [payment] = participant.stripePayments;
  if (!payment) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Payment not found"
    });
  }
  return payment;
};

/** The payment's travellers that are still with the group, i.e. not transferred to someone else. */
const groupParticipants = (participant: BookingParticipant) =>
  succeededPayment(participant).participants.filter((p) => p.transfers.length === 0);

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
          transfers: { select: { id: true } },
          stripeRefunds: {
            select: {
              stripeRefundId: true,
              status: true
            }
          },
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

      // The refund would go to the original buyer's card, not to the new holder
      if (participant.transfers.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Platsen har överlåtits och kan inte avbokas. Kontakta info@vastrasidan.se"
        });
      }

      if (!participant.event.refundable) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Den här resan går inte att avboka"
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

      // payAmount is what the participant paid, in SEK (older bookings may lack it).
      // Convert to cents (öre) to be synced with Stripe.
      const paidAmount =
        participant.payAmount ?? getParticipantCost(participant, event);
      const participantCost = Math.round(paidAmount * 100);

      // Free bookings (e.g. added by an admin) have nothing to refund through Stripe
      const isFree = participantCost <= 0 || stripePayment.amount <= 0;

      const stripeFee = stripePayment.amount - stripePayment.netAmount;

      // How big is the fee for this participant
      const participantFeeFraction = isFree ? 0 : participantCost / stripePayment.amount;
      const participantFee = Math.floor(stripeFee * participantFeeFraction);

      // So, this is the amount that the participant will get back after the Stripe fees.
      const participantPayAmount = participantCost - participantFee;

      if (participant.cancellationDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Resenären har redan avbokats"
        });
      }

      // A failed refund may be retried, a pending or completed one may not
      const refundState = participantRefundState(participant.stripeRefunds);
      if (refundState.refunded || refundState.pending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Avbokningen behandlas redan"
        });
      }

      if (isFree) {
        await ctx.prisma.$transaction([
          ctx.prisma.stripeRefund.create({
            data: {
              stripeRefundId: `no-refund-${participant.id}`,
              amount: 0,
              status: StripeRefundStatus.REFUNDED,
              participantId: participant.id,
              originalPaymentId: stripePayment.id
            }
          }),
          ctx.prisma.participant.update({
            where: {
              id: participant.id
            },
            data: {
              cancellationDate: new Date()
            }
          })
        ]);
        return stripePayment.id;
      }

      // One key per attempt: cancelling twice at once (e.g. a double-click) gets the same
      // refund from Stripe, while a retry after a failed refund gets a new one.
      const attempt = refundState.failedAttempts;
      let stripeRefund;
      try {
        stripeRefund = await createRefundIntent({
          paymentIntentId: stripePayment.stripePaymentId,
          amount: participantPayAmount,
          idempotencyKey: `cancel-${participant.id}-${attempt}`,
          metadata: {
            participantId: participant.id
          }
        });
      } catch (err) {
        console.error("Error creating refund request");
        console.error(err);
        const errorType = (err as { type?: string }).type;
        if (errorType === "StripeIdempotencyError") {
          // The same cancellation is being made right now
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Avbokningen behandlas redan"
          });
        }
        captureException(err);
        // If Stripe couldn't be reached, the refund may still have been created: a retry with
        // the same key gets it. Otherwise Stripe refused it, and a retry needs a new key.
        if (errorType !== "StripeConnectionError") {
          await ctx.prisma.stripeRefund.create({
            data: {
              stripeRefundId: `refused-${participant.id}-${attempt}`,
              amount: participantPayAmount,
              status: StripeRefundStatus.ERROR,
              errorMessage: (err as Error).message,
              participantId: participant.id,
              originalPaymentId: stripePayment.id
            }
          });
        }
        throw err;
      }

      // The webhook may already have recorded the outcome; this row is still added (append-only)
      await ctx.prisma.stripeRefund.create({
        data: {
          stripeRefundId: stripeRefund.id,
          amount: participantPayAmount,
          status: StripeRefundStatus.CREATED,
          participantId: participant.id,
          originalPaymentId: stripePayment.id
        }
      });

      return stripePayment.id;
    }),
  checkRefundStatus: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return checkRefundStatus(input.token, ctx.prisma);
    }),
  getManagableBooking: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input, ctx }) => {
      const toBooking = (
        participant: BookingParticipant,
        participants: BookingParticipant["stripePayments"][number]["participants"],
        transferredAway: boolean
      ) => ({
        participants: participants.map(participantFormatter),
        // The token's seat has been transferred to someone else
        transferredAway,
        eventName: participant.event.name,
        isTrain: isTrainEvent(participant.event),
        departureTime: formatSwedishTime(participant.event.date, "HH:mm"),
        refundable: participant.event.refundable,
        buses: participant.event.buses.map((bus) => ({
          ...bus,
          availableSeats: bus.seats - bus._count.passengers
        }))
      });

      const holder = await findBookingParticipant(ctx.prisma, {
        cancellationToken: input.token
      });

      if (holder) {
        if (holder.transfers.length > 0) {
          // A transferred seat is managed by its new holder alone
          const own = succeededPayment(holder).participants.filter((p) => p.id === holder.id);
          return toBooking(holder, own, false);
        }
        return toBooking(holder, groupParticipants(holder), false);
      }

      // The old link of a seat that has since been transferred. It never grants management.
      const transfer = await ctx.prisma.participantTransfer.findFirst({
        where: { previousToken: input.token },
        select: { id: true, participantId: true }
      });

      if (!transfer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        });
      }

      const participant = await findBookingParticipant(ctx.prisma, {
        id: transfer.participantId
      });

      if (!participant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Participant not found"
        });
      }

      const firstTransfer = await ctx.prisma.participantTransfer.findFirst({
        where: { participantId: transfer.participantId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true }
      });

      // Only the first transfer's token belonged to the original group. A later one belonged to
      // an earlier new holder, who must not see the group.
      const participants =
        firstTransfer?.id === transfer.id ? groupParticipants(participant) : [];

      return toBooking(participant, participants, true);
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
      await revalidatePages(awayGamePaths([participant.eventId]));

      return "ok";
    }),
  transferBooking: publicProcedure
    .input(transferBookingSchema)
    .mutation(async ({ input, ctx }) => {
      const { participant, transfer } = await transferBooking(ctx.prisma, input);
      // Emails are best effort: the transfer is already committed.
      const results = await Promise.allSettled([
        sendEventConfirmationEmail(participant, { transferred: true }),
        sendBookingTransferredEmail({ transfer, event: participant.event })
      ]);
      for (const result of results) {
        if (result.status === "rejected") {
          captureException(result.reason);
        }
      }
      // The new token goes only to the new holder, by email
      return { ok: true };
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
            include: formattedParticipantInclude
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
        gameInfo: payment.participants[0]?.event.description,
        refundable: participants[0].refundable
      };
    })
});
