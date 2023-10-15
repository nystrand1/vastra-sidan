import { SwishRefundStatus } from "@prisma/client";
import { delay } from "./helpers";

export const pollPaymentStatus = async (
  paymentId: string, 
  checkPaymentStatus: ({ paymentId } : { paymentId: string}) => Promise<{ status: string }>,
  attempt = 0,
  ): Promise<{ success : boolean }> => {
  if (attempt > 30) {
    throw new Error("Could not poll payment status");
  }
  
  const payment = await checkPaymentStatus({ paymentId });

  if (payment.status === SwishRefundStatus.PAID) {
    return {
      success: true,
    }
  }
  await delay(1000);
  return pollPaymentStatus(paymentId, checkPaymentStatus, attempt + 1);
}

export const pollRefundStatus = async (
  refundId: string, 
  checkRefundStatus: ({ refundId } : { refundId: string}) => Promise<{ status: string }>,
  attempt = 0,
  ): Promise<{ success : boolean }> => {
  if (attempt > 30) {
    throw new Error("Could not poll refund status");
  }
  
  const refund = await checkRefundStatus({ refundId });

  if (refund.status === SwishRefundStatus.PAID) {
    return {
      success: true,
    }
  }
  await delay(1000);
  return pollRefundStatus(refundId, checkRefundStatus, attempt + 1);
}