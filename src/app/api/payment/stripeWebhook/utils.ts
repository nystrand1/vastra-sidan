import { StripePaymentStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "~/server/db";

export const handleSucessfulPayment = async (paymentIntent: Stripe.PaymentIntentSucceededEvent) => {
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
