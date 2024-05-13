import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "~/server/db";

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
    throw new Error("Refund not found");
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