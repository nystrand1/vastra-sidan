import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";
import { captureMessage } from "@sentry/nextjs";
import type Stripe from "stripe";
import { prisma } from "~/server/db";
import { stripe } from "~/server/stripe";
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

/**
 * Applies the outcome of a refund to the StripeRefund row we saved when creating it
 * (e.g. when a traveller cancels). Safe to call more than once for the same refund.
 *
 * @returns false if we have no record of the refund, e.g. it was made from the Stripe dashboard.
 */
const applyRefundOutcome = async (refund: Stripe.Refund) => {
  // The row is saved before the refund is created, so the webhook can arrive before the row
  // has Stripe's refund id. The refund's metadata points at the row in that case.
  const rowId = refund.metadata?.stripeRefundRowId;
  const dbRefund = await prisma.stripeRefund.findFirst({
    where: {
      OR: [{ stripeRefundId: refund.id }, ...(rowId ? [{ id: rowId }] : [])]
    }
  });
  if (!dbRefund) {
    return false;
  }

  if (refund.status === "succeeded") {
    // Only the first delivery changes the row. A refund we marked as failed because
    // Stripe's answer never reached us may still have gone through.
    const { count } = await prisma.stripeRefund.updateMany({
      where: {
        id: dbRefund.id,
        status: {
          in: [StripeRefundStatus.CREATED, StripeRefundStatus.ERROR]
        }
      },
      data: {
        status: StripeRefundStatus.REFUNDED,
        stripeRefundId: refund.id,
        amount: refund.amount,
        errorCode: null,
        errorMessage: null
      }
    });
    if (count > 0 && dbRefund.participantId) {
      await prisma.participant.updateMany({
        where: {
          id: dbRefund.participantId,
          cancellationDate: null
        },
        data: {
          cancellationDate: new Date()
        }
      });
    }
  }

  if (refund.status === "failed" || refund.status === "canceled") {
    if (dbRefund.status === StripeRefundStatus.REFUNDED) {
      // The money was already reported as returned and the seat released, so this needs a human
      captureMessage(`Stripe refund ${refund.id} ${refund.status} after it succeeded`, {
        level: "error",
        extra: { stripeRefundRowId: dbRefund.id, failureReason: refund.failure_reason }
      });
      return true;
    }
    await prisma.stripeRefund.updateMany({
      where: {
        id: dbRefund.id,
        status: StripeRefundStatus.CREATED
      },
      data: {
        status: StripeRefundStatus.ERROR,
        stripeRefundId: refund.id,
        errorCode: refund.failure_reason ?? refund.status,
        errorMessage: `Refund ${refund.status}`
      }
    });
  }

  return true;
};

/** A refund made from the Stripe dashboard, which we have no record of. */
const recordDashboardRefund = async (
  refund: Stripe.Refund,
  paymentId: string,
  membershipId: string | undefined
) => {
  const dbRefund = await prisma.stripeRefund.create({
    data: {
      status: StripeRefundStatus.REFUNDED,
      amount: refund.amount,
      stripeRefundId: refund.id,
      originalPaymentId: paymentId
    }
  });
  if (!membershipId) {
    return;
  }
  const membersRelatedToRefund = await prisma.member.findMany({
    where: {
      stripePayments: {
        some: {
          id: paymentId,
          status: StripePaymentStatus.SUCCEEDED
        }
      }
    }
  });

  // Attach a refund to the members
  const refundPromise = prisma.stripeRefund.update({
    where: {
      id: dbRefund.id
    },
    data: {
      members: {
        connect: membersRelatedToRefund.map((m) => ({ id: m.id }))
      }
    }
  });

  // Remove the membership from the members
  const disconnectPromise = prisma.membership.update({
    where: {
      id: membershipId
    },
    data: {
      members: {
        disconnect: membersRelatedToRefund.map((m) => ({ id: m.id }))
      }
    }
  });

  await Promise.all([refundPromise, disconnectPromise]);
};

/**
 * `charge.refunded` is sent when more of a charge has been refunded. It carries the Charge,
 * not the Refund, so we look up the charge's refunds and reconcile each of them.
 */
export const handleRefund = async (event: Stripe.ChargeRefundedEvent) => {
  const charge = event.data.object;
  if (!charge.payment_intent) {
    throw new Error("Payment intent not found");
  }
  const payment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: idOf(charge.payment_intent),
      status: StripePaymentStatus.SUCCEEDED
    }
  });
  if (!payment) {
    throw new Error("Payment not found");
  }

  const unknownRefunds: Stripe.Refund[] = [];
  for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100 })) {
    const isKnown = await applyRefundOutcome(refund);
    if (!isKnown && refund.status === "succeeded") {
      unknownRefunds.push(refund);
    }
  }
  if (unknownRefunds.length === 0) {
    return;
  }

  // Never record more than Stripe says has been refunded. This skips dashboard refunds we
  // already recorded, including older records that stored the charge id instead of the refund id.
  const recorded = await prisma.stripeRefund.aggregate({
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
    await recordDashboardRefund(refund, payment.id, charge.metadata.membershipId);
  }
};

/** `refund.updated` / `refund.failed`: the only events that tell us a refund failed. */
export const handleRefundUpdate = async (
  event: Stripe.RefundUpdatedEvent | Stripe.RefundFailedEvent
) => {
  await applyRefundOutcome(event.data.object);
};
