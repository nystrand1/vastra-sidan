import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";
import { captureMessage } from "@sentry/nextjs";
import type Stripe from "stripe";
import { prisma } from "~/server/db";
import { stripe } from "~/server/stripe";

export const handleSuccessfulPayment = async (paymentIntent: Stripe.PaymentIntentSucceededEvent) => {
  const originalPayment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: paymentIntent.data.object.id
    },
    include: {
      participants: true,
      members: true,
    }
  });
  if (!originalPayment) {
    throw new Error("Payment not found");
  }
  // Stripe delivers events at least once, so a redelivered event must not be processed again
  const alreadySucceeded = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: paymentIntent.data.object.id,
      status: StripePaymentStatus.SUCCEEDED
    }
  });
  if (alreadySucceeded) {
    return null;
  }
  return await prisma.stripePayment.create({
    data: {
      amount: paymentIntent.data.object.amount,
      netAmount: paymentIntent.data.object.amount,
      stripePaymentId: paymentIntent.data.object.id,
      status: StripePaymentStatus.SUCCEEDED,
      participants: {
        connect: originalPayment.participants.map(p => ({ id: p.id }))
      },
      members: {
        connect: originalPayment.members.map(m => ({ id: m.id }))
      },
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
}

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
 * Applies the outcome of a refund to the StripeRefund row we stored when creating it
 * (e.g. when a traveller cancels). Safe to call more than once for the same refund.
 *
 * @returns false if we have no record of the refund, e.g. it was made from the Stripe dashboard.
 */
const applyRefundOutcome = async (refund: Stripe.Refund) => {
  const dbRefund = await prisma.stripeRefund.findFirst({
    where: {
      stripeRefundId: refund.id
    }
  });
  if (!dbRefund) {
    return false;
  }

  if (refund.status === "succeeded") {
    // Only the first delivery moves the refund out of CREATED
    const { count } = await prisma.stripeRefund.updateMany({
      where: {
        id: dbRefund.id,
        status: StripeRefundStatus.CREATED
      },
      data: {
        status: StripeRefundStatus.REFUNDED,
        amount: refund.amount
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
      // The money was already reported as returned, so this needs a human
      captureMessage(`Stripe refund ${refund.id} ${refund.status} after it succeeded`);
      return true;
    }
    await prisma.stripeRefund.updateMany({
      where: {
        id: dbRefund.id,
        status: StripeRefundStatus.CREATED
      },
      data: {
        status: StripeRefundStatus.ERROR,
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
