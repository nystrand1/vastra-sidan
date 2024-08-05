import {
  StripeRefundStatus,
  type PrismaClient
} from "@prisma/client";

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
