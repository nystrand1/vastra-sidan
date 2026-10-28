import {
  Prisma,
  type PrismaClient,
  StripePaymentStatus,
  StripeRefundStatus
} from "~/generated/prisma/client";
import { captureException, captureMessage } from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";
import { subMinutes } from "date-fns";
import type Stripe from "stripe";

/** How long an unpaid booking may wait for its payment before it's cancelled. */
export const SEAT_HOLD_MINUTES = 15;

const holdCutoff = () => subMinutes(new Date(), SEAT_HOLD_MINUTES);

/**
 * Participants that take up a seat on their bus:
 * - paid, and not refunded;
 * - booked and waiting for the payment, until it fails or is cancelled
 *   (`releaseExpiredSeatHolds` cancels it after `SEAT_HOLD_MINUTES`);
 * - just created, before their payment row exists (`requestStripePayment`
 *   creates the participants first, then talks to Stripe).
 */
export const seatHoldingPassengerWhere = (): Prisma.ParticipantWhereInput => ({
  stripeRefunds: {
    none: {
      status: StripeRefundStatus.REFUNDED
    }
  },
  OR: [
    {
      stripePayments: {
        some: {
          status: StripePaymentStatus.SUCCEEDED
        }
      }
    },
    {
      stripePayments: {
        some: {
          status: StripePaymentStatus.CREATED
        },
        none: {
          status: StripePaymentStatus.CANCELED
        }
      }
    },
    {
      stripePayments: {
        none: {}
      },
      createdAt: {
        gt: holdCutoff()
      }
    }
  ]
});

/** Include for an event's buses with `_count.passengers` = seats taken. */
export const busesWithBookedSeats = () => ({
  buses: {
    include: {
      _count: {
        select: {
          passengers: {
            where: seatHoldingPassengerWhere()
          }
        }
      }
    }
  }
});

/**
 * Locks the given buses of an event until the transaction ends and returns
 * them with their free seats. Check capacity and create the seat-holding
 * participants in the same transaction, so two bookings can't both take the
 * last seat. Buses that don't belong to the event are left out.
 */
export const lockBusesWithFreeSeats = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  busIds: string[]
) => {
  const ids = [...new Set(busIds)].sort();
  if (ids.length === 0) return [];
  await tx.$queryRaw`SELECT id FROM Bus WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  const buses = await tx.bus.findMany({
    where: {
      id: {
        in: ids
      },
      eventId
    },
    include: busesWithBookedSeats().buses.include
  });
  return buses.map((bus) => ({
    ...bus,
    availableSeats: bus.seats - bus._count.passengers
  }));
};

/**
 * Runs `takeSeat` in a transaction with the bus locked, if it belongs to the
 * event and has a free seat. Throws "Bus not found" or "Bus is full" otherwise.
 */
export const withFreeSeat = <T>(
  prisma: PrismaClient,
  eventId: string,
  busId: string,
  takeSeat: (tx: Prisma.TransactionClient) => Promise<T>
) =>
  prisma.$transaction(async (tx) => {
    const [bus] = await lockBusesWithFreeSeats(tx, eventId, [busId]);
    if (!bus) {
      captureMessage("Bus not found");
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Bus not found"
      });
    }
    if (bus.availableSeats <= 0) {
      captureMessage("Bus is full");
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Bus is full"
      });
    }
    return takeSeat(tx);
  });

/**
 * Cancels a booking's PaymentIntent and records it as CANCELED, which gives
 * its seats back. Returns false if Stripe refuses, e.g. because the customer
 * is paying or has paid: then the booking keeps its seats and the webhook
 * records the outcome.
 */
export const cancelPendingPayment = async (
  prisma: PrismaClient,
  stripe: Stripe,
  payment: { stripePaymentId: string; amount: number; participants: { id: string }[] }
) => {
  try {
    await stripe.paymentIntents.cancel(payment.stripePaymentId);
  } catch (err) {
    // Cancelling twice is an error in Stripe; for us it's done.
    const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentId);
    if (paymentIntent.status !== "canceled") return false;
  }
  await prisma.stripePayment.create({
    data: {
      stripePaymentId: payment.stripePaymentId,
      amount: payment.amount,
      status: StripePaymentStatus.CANCELED,
      participants: {
        connect: payment.participants
      }
    }
  });
  return true;
};

/**
 * Cancels unpaid bookings older than `SEAT_HOLD_MINUTES`, for one event or
 * all upcoming ones, so their seats go back on sale. Runs from the cron job and
 * before every capacity check. Returns how many bookings were cancelled.
 */
export const releaseExpiredSeatHolds = async (
  prisma: PrismaClient,
  stripe: Stripe,
  eventId?: string
) => {
  const expired = await prisma.stripePayment.findMany({
    where: {
      status: StripePaymentStatus.CREATED,
      createdAt: {
        lte: holdCutoff()
      },
      participants: {
        some: {
          // Past events don't need their seats back
          event: eventId ? { id: eventId } : { date: { gt: new Date() } },
          stripePayments: {
            none: {
              status: {
                in: [StripePaymentStatus.SUCCEEDED, StripePaymentStatus.CANCELED]
              }
            }
          }
        }
      }
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

  let released = 0;
  for (const payment of expired) {
    try {
      if (await cancelPendingPayment(prisma, stripe, payment)) released++;
    } catch (err) {
      captureException(err);
    }
  }
  return released;
};
