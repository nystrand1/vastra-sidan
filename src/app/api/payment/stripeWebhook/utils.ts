import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "~/server/db";
import { stripe } from "~/server/stripe";

export const handleSuccessfulPayment = async (paymentIntent: Stripe.PaymentIntentSucceededEvent) => {
  const originalPayment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: paymentIntent.data.object.id
    },
    include: {
      participants: true
    }
  });
  if (!originalPayment) {
    throw new Error("Payment not found");
  }
  return await prisma.stripePayment.create({
    data: {
      amount: paymentIntent.data.object.amount,
      netAmount: paymentIntent.data.object.amount,
      stripePaymentId: paymentIntent.data.object.id,
      status: StripePaymentStatus.SUCCEEDED,
      participants: {
        connect: originalPayment.participants.map(p => ({ id: p.id }))
      }
    },
    include: {
      participants: {
        include: {
          event: true,
          bus: true
        }
      }
    }
  });
}

export const handleFailedPayment = async (paymentIntent: Stripe.PaymentIntentPaymentFailedEvent) => {
  await prisma.stripePayment.create({
    data: {
      amount: paymentIntent.data.object.amount,
      stripePaymentId: paymentIntent.data.object.id,
      status: StripePaymentStatus.CANCELED,
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
      stripePaymentId: paymentIntentId.toString(),
      status: StripePaymentStatus.SUCCEEDED
    }
  });
  if (!payment || !transactionId) {
    throw new Error("Payment not found");
  }

  const strapiFee = await stripe.balanceTransactions.retrieve(transactionId.toString());

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


export const handleRefund = async (refund: Stripe.ChargeRefundedEvent) => {
  const refundId = refund.data.object.id;
  const paymentIntentId = refund.data.object.payment_intent;
  const status = refund.data.object.status;
  if (!paymentIntentId) {
    throw new Error("Payment intent not found");
  }
  const payment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: paymentIntentId.toString(),
      status: StripePaymentStatus.SUCCEEDED
    }
  });
  if (!payment) {
    throw new Error("Payment not found");
  }
  const refundIntent = await prisma.stripeRefund.findFirst({
    where: {
      originalPaymentId: payment.id,
      status: StripeRefundStatus.CREATED,
      participant: {
        stripeRefunds: {
          none: {
            status: StripeRefundStatus.REFUNDED
          }
        }
      }
    }
  });

  if (!refundIntent) {
    // Manual refund from Stripe dashboard
    if (status === 'succeeded') {
      await prisma.stripeRefund.create({
        data: {
          status: StripeRefundStatus.REFUNDED,
          amount: refund.data.object.amount,
          stripeRefundId: refundId,
          originalPaymentId: payment.id,        
        }
      });
    }
    if (status === 'failed') {
      await prisma.stripeRefund.create({
        data: {
          status: StripeRefundStatus.ERROR,
          amount: refund.data.object.amount_refunded,
          stripeRefundId: refundId,
          errorMessage: refund.data.object.failure_message,
          errorCode: refund.data.object.failure_code,
          originalPaymentId: payment.id,
        }
      });
    }
    return;
  }
  
  if (!refundIntent.participantId) {
    throw new Error("Participant not found");
  }

  if (status === 'succeeded') {
    await prisma.stripeRefund.create({
      data: {
        status: StripeRefundStatus.REFUNDED,
        amount: refund.data.object.amount,
        stripeRefundId: refundId,
        originalPaymentId: payment.id,
        participantId: refundIntent.participantId,
      }
    });
    await prisma.participant.update({
      where: {
        id: refundIntent.participantId
      },
      data: {
        cancellationDate: new Date()
      }
    });
  }

  if (status === 'failed') {
    await prisma.stripeRefund.create({
      data: {
        status: StripeRefundStatus.ERROR,
        amount: refund.data.object.amount_refunded,
        stripeRefundId: refundId,
        errorMessage: refund.data.object.failure_message,
        errorCode: refund.data.object.failure_code,
        originalPaymentId: payment.id,
        participantId: refundIntent.participantId,
      }
    });
  }

}