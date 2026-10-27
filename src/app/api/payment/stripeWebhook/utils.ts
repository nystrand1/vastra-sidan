import { type Prisma, StripePaymentStatus, StripeRefundStatus } from "~/generated/prisma/client";
import { captureMessage } from "@sentry/nextjs";
import type Stripe from "stripe";
import { prisma } from "~/server/db";
import { stripe } from "~/server/stripe";
import { refundStatuses } from "~/server/utils/refunds";
import { attachMembershipToMembers } from "./attachMembershipToMembers";

/**
 * Records the payment as SUCCEEDED and, for a membership, gives the members their membership.
 * Both happen in one transaction, so if either fails nothing is saved and Stripe's retry starts over.
 *
 * @returns null if an earlier delivery of this event was already processed.
 */
export const handleSuccessfulPayment = async (event: Stripe.PaymentIntentSucceededEvent) => {
  const paymentIntent = event.data.object;
  return prisma.$transaction(async (tx) => {
    // Stripe delivers events at least once, possibly at the same time. Lock the payment's
    // rows so deliveries are processed one at a time and only the first one records it.
    await tx.$queryRaw`SELECT id FROM StripePayment WHERE stripePaymentId = ${paymentIntent.id} FOR UPDATE`;
    const payments = await tx.stripePayment.findMany({
      where: {
        stripePaymentId: paymentIntent.id
      },
      include: {
        participants: true,
        members: true
      }
    });
    if (payments.some((p) => p.status === StripePaymentStatus.SUCCEEDED)) {
      return null;
    }
    const originalPayment =
      payments.find((p) => p.status === StripePaymentStatus.CREATED) ?? payments[0];
    if (!originalPayment) {
      throw new Error("Payment not found");
    }
    const payment = await tx.stripePayment.create({
      data: {
        amount: paymentIntent.amount,
        netAmount: paymentIntent.amount,
        stripePaymentId: paymentIntent.id,
        status: StripePaymentStatus.SUCCEEDED,
        participants: {
          connect: originalPayment.participants.map((p) => ({ id: p.id }))
        },
        members: {
          connect: originalPayment.members.map((m) => ({ id: m.id }))
        }
      },
      include: {
        participants: {
          include: {
            event: true,
            bus: true
          }
        },
        members: true
      }
    });
    const membership =
      paymentIntent.metadata.type === "MEMBERSHIP"
        ? await attachMembershipToMembers(
            {
              members: payment.members,
              membershipId: paymentIntent.metadata.membershipId,
              membershipOwnerId: paymentIntent.metadata.membershipOwnerId
            },
            tx
          )
        : null;
    return { ...payment, membership };
  });
};

export const handleFailedPayment = async (paymentIntent: Stripe.PaymentIntentPaymentFailedEvent) => {
  // Link the participants so their booking stops holding seats on the bus
  const participants = await prisma.participant.findMany({
    where: {
      stripePayments: {
        some: {
          stripePaymentId: paymentIntent.data.object.id
        }
      }
    },
    select: {
      id: true
    }
  });
  await prisma.stripePayment.create({
    data: {
      amount: paymentIntent.data.object.amount,
      stripePaymentId: paymentIntent.data.object.id,
      status: StripePaymentStatus.CANCELED,
      participants: {
        connect: participants
      }
    }
  });
};

export const handleChargeUpdate = async (charge: Stripe.ChargeUpdatedEvent) => {
  const paymentIntentId = charge.data.object.payment_intent;
  const transactionId = charge.data.object.balance_transaction;
  if (!paymentIntentId) {
    throw new Error("Payment intent not found");
  }
  const payment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: typeof paymentIntentId === 'string' ? paymentIntentId : paymentIntentId.id,
      status: StripePaymentStatus.SUCCEEDED
    }
  });
  if (!payment || !transactionId) {
    throw new Error("Payment not found");
  }

  const strapiFee = await stripe.balanceTransactions.retrieve(typeof transactionId === 'string' ? transactionId : transactionId.id);

  if (strapiFee.fee) {
    await prisma.stripePayment.update({
      where: {
        id: payment.id
      },
      data: {
        netAmount: strapiFee.net,
        amount: strapiFee.amount,
      }
    });
  }
}


const idOf = (value: string | { id: string }) =>
  typeof value === "string" ? value : value.id;

type PaymentForRefunds = { id: string };

/**
 * Runs `fn` with the payment's row locked, so that refund events for the same payment
 * (Stripe sends several per refund, possibly at the same time) are handled one at a time.
 */
const withPaymentLocked = <T>(
  paymentId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
) =>
  prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM StripePayment WHERE id = ${paymentId} FOR UPDATE`;
    return fn(tx);
  });

const findSucceededPayment = async (paymentIntent: string | { id: string } | null) => {
  if (!paymentIntent) {
    throw new Error("Payment intent not found");
  }
  const payment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: idOf(paymentIntent),
      status: StripePaymentStatus.SUCCEEDED
    },
    include: {
      participants: {
        select: {
          eventId: true
        }
      }
    }
  });
  if (!payment) {
    throw new Error("Payment not found");
  }
  return payment;
};

/**
 * Appends the outcome of a refund we asked for (e.g. when a traveller cancels), unless it's
 * already recorded. StripeRefund is append-only: see ~/server/utils/refunds.ts.
 *
 * @returns false if the refund isn't one of ours, e.g. it was made from the Stripe dashboard.
 */
const recordRefundOutcome = async (
  tx: Prisma.TransactionClient,
  payment: PaymentForRefunds,
  refund: Stripe.Refund
) => {
  const rows = await tx.stripeRefund.findMany({
    where: {
      stripeRefundId: refund.id
    }
  });
  // The webhook can arrive before cancelBooking has saved its row, so the refund says whose it is
  const participantId =
    rows.find((r) => r.participantId)?.participantId ?? refund.metadata?.participantId ?? null;
  if (rows.length === 0 && !participantId) {
    return false;
  }
  const status = refundStatuses(rows).get(refund.id);

  if (refund.status === "succeeded" && status !== StripeRefundStatus.REFUNDED) {
    await tx.stripeRefund.create({
      data: {
        status: StripeRefundStatus.REFUNDED,
        amount: refund.amount,
        stripeRefundId: refund.id,
        originalPaymentId: payment.id,
        participantId
      }
    });
    if (participantId) {
      await tx.participant.updateMany({
        where: {
          id: participantId,
          cancellationDate: null
        },
        data: {
          cancellationDate: new Date()
        }
      });
    }
  }

  if (refund.status === "failed" || refund.status === "canceled") {
    if (status === StripeRefundStatus.REFUNDED) {
      // The money was already reported as returned and the seat released, so this needs a human
      captureMessage(`Stripe refund ${refund.id} ${refund.status} after it succeeded`, {
        level: "error",
        extra: { paymentId: payment.id, participantId, failureReason: refund.failure_reason }
      });
    } else if (status !== StripeRefundStatus.ERROR) {
      await tx.stripeRefund.create({
        data: {
          status: StripeRefundStatus.ERROR,
          amount: refund.amount,
          stripeRefundId: refund.id,
          errorCode: refund.failure_reason ?? refund.status,
          errorMessage: `Refund ${refund.status}`,
          originalPaymentId: payment.id,
          participantId
        }
      });
    }
  }

  return true;
};

/** A refund made from the Stripe dashboard, which we have no record of. */
const recordDashboardRefund = async (
  tx: Prisma.TransactionClient,
  refund: Stripe.Refund,
  paymentId: string,
  membershipId: string | undefined
) => {
  const membersRelatedToRefund = membershipId
    ? await tx.member.findMany({
        where: {
          stripePayments: {
            some: {
              id: paymentId,
              status: StripePaymentStatus.SUCCEEDED
            }
          }
        }
      })
    : [];

  await tx.stripeRefund.create({
    data: {
      status: StripeRefundStatus.REFUNDED,
      amount: refund.amount,
      stripeRefundId: refund.id,
      originalPaymentId: paymentId,
      members: {
        connect: membersRelatedToRefund.map((m) => ({ id: m.id }))
      }
    }
  });

  if (membershipId) {
    // Remove the membership from the members
    await tx.membership.update({
      where: {
        id: membershipId
      },
      data: {
        members: {
          disconnect: membersRelatedToRefund.map((m) => ({ id: m.id }))
        }
      }
    });
  }
};

/**
 * `charge.refunded` is sent when more of a charge has been refunded. It carries the Charge,
 * not the Refund, so we look up all of the charge's refunds and record any we're missing.
 *
 * @returns the ids of the events the payment booked seats on.
 */
export const handleRefund = async (event: Stripe.ChargeRefundedEvent) => {
  const charge = event.data.object;
  const payment = await findSucceededPayment(charge.payment_intent);

  const refunds: Stripe.Refund[] = [];
  for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100 })) {
    refunds.push(refund);
  }

  await withPaymentLocked(payment.id, async (tx) => {
    const unknownRefunds: Stripe.Refund[] = [];
    for (const refund of refunds) {
      const isOurs = await recordRefundOutcome(tx, payment, refund);
      if (!isOurs && refund.status === "succeeded") {
        unknownRefunds.push(refund);
      }
    }
    if (unknownRefunds.length === 0) {
      return;
    }

    // Never record more than Stripe says has been refunded. This skips dashboard refunds we
    // already recorded, including older records that stored the charge id instead of the refund id.
    const recorded = await tx.stripeRefund.aggregate({
      _sum: {
        amount: true
      },
      where: {
        originalPaymentId: payment.id,
        status: StripeRefundStatus.REFUNDED
      }
    });
    let unrecordedAmount = charge.amount_refunded - (recorded._sum.amount ?? 0);
    for (const refund of unknownRefunds) {
      if (refund.amount > unrecordedAmount) {
        // Our records claim more was refunded than Stripe says (e.g. older rows that stored
        // the full charge amount), so this refund can't be told apart from one already recorded.
        captureMessage(`Skipped recording Stripe refund ${refund.id}: already counted as refunded`, {
          level: "warning",
          extra: {
            paymentId: payment.id,
            chargeAmountRefunded: charge.amount_refunded,
            unrecordedAmount
          }
        });
        continue;
      }
      unrecordedAmount -= refund.amount;
      await recordDashboardRefund(tx, refund, payment.id, charge.metadata.membershipId);
    }
  });
  return payment.participants.map((p) => p.eventId);
};

/**
 * `refund.updated` / `refund.failed`: the only events that tell us a refund failed.
 *
 * @returns the ids of the events the payment booked seats on.
 */
export const handleRefundUpdate = async (
  event: Stripe.RefundUpdatedEvent | Stripe.RefundFailedEvent
) => {
  const refund = event.data.object;
  const payment = await findSucceededPayment(refund.payment_intent);
  await withPaymentLocked(payment.id, (tx) => recordRefundOutcome(tx, payment, refund));
  return payment.participants.map((p) => p.eventId);
};
