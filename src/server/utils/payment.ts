import {
  type PrismaClient,
  SwishPaymentStatus,
  SwishRefundStatus
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
  refundId: string,
  prisma: PrismaClient
) => {
  const refund = await prisma.swishRefund.findFirst({
    where: {
      refundId,
      status: SwishRefundStatus.PAID
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
