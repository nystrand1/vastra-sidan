import {
  type Prisma,
  type PrismaClient,
  StripePaymentStatus,
  StripeRefundStatus
} from "@prisma/client";
import { captureException } from "@sentry/nextjs";
import { subMinutes } from "date-fns";
import type Stripe from "stripe";

/** How long an unpaid booking holds its seats before they're given back. */
export const SEAT_HOLD_MINUTES = 15;

const holdCutoff = () => subMinutes(new Date(), SEAT_HOLD_MINUTES);

/**
 * Participants that take up a seat on their bus: those who have paid, and
 * those who booked within the last `SEAT_HOLD_MINUTES` and are still waiting
 * for the payment to succeed or fail. Refunded participants give their seat back.
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
          status: StripePaymentStatus.CREATED,
          createdAt: {
            gt: holdCutoff()
          }
        },
        none: {
          status: StripePaymentStatus.CANCELED
        }
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
 * Cancels the PaymentIntents of an event's unpaid bookings whose seat hold has
 * expired, so a late payment can't take a seat that's been given to someone
 * else. Call it before checking whether a bus has room.
 */
export const releaseExpiredSeatHolds = async (
  prisma: PrismaClient,
  stripe: Stripe,
  eventId: string
) => {
  const expired = await prisma.stripePayment.findMany({
    where: {
      status: StripePaymentStatus.CREATED,
      createdAt: {
        lte: holdCutoff()
      },
      participants: {
        some: {
          eventId
        }
      }
    },
    include: {
      participants: {
        select: {
          id: true
        }
      }
    }
  });
  if (expired.length === 0) return;

  const settled = await prisma.stripePayment.findMany({
    where: {
      stripePaymentId: {
        in: expired.map((p) => p.stripePaymentId)
      },
      status: {
        in: [StripePaymentStatus.SUCCEEDED, StripePaymentStatus.CANCELED]
      }
    },
    select: {
      stripePaymentId: true
    }
  });
  const settledIds = new Set(settled.map((p) => p.stripePaymentId));

  await Promise.all(
    expired
      .filter((payment) => !settledIds.has(payment.stripePaymentId))
      .map(async (payment) => {
        try {
          await cancelPaymentIntent(stripe, payment.stripePaymentId);
        } catch (err) {
          // Already paid or mid-payment: leave it to the webhook.
          captureException(err);
          return;
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
      })
  );
};

const cancelPaymentIntent = async (stripe: Stripe, paymentIntentId: string) => {
  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    // Cancelling twice is an error in Stripe; that's fine for us.
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "canceled") throw err;
  }
};
