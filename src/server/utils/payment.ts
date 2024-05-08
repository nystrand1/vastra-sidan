import {
  StripeRefundStatus,
  SwishPaymentStatus,
  type PrismaClient
} from "@prisma/client";

export const checkPaymentStatus = async (
  paymentId: string,
  prisma: PrismaClient
) => {
  const payment = await prisma.swishPayment.findFirst({
    where: {
      paymentId,
      status: SwishPaymentStatus.PAID
    }
  });
  if (!payment) {
    return {
      status: "Not found"
    };
  }
  return {
    status: payment.status
  };
};

export const checkRefundStatus = async (
  originalPaymentId: string,
  prisma: PrismaClient
) => {
  const refund = await prisma.stripeRefund.findFirst({
    where: {
      originalPaymentId: originalPaymentId,
      status: StripeRefundStatus.REFUNDED
    }
  });
  if (!refund) {
    return {
      status: "Not found"
    };
  }
  return {
    status: refund.status
  };
};
