import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";
import { delay } from "./helpers";

export const pollPaymentStatus = async (
  paymentId: string,
  checkPaymentStatus: ({
    paymentId
  }: {
    paymentId: string;
  }) => Promise<{ status: string }>,
  attempt = 0
): Promise<{ success: boolean }> => {
  if (attempt > 30) {
    throw new Error("Could not poll payment status");
  }

  const payment = await checkPaymentStatus({ paymentId });

  if (payment.status === StripePaymentStatus.SUCCEEDED) {
    return {
      success: true
    };
  }
  await delay(1000);
  return pollPaymentStatus(paymentId, checkPaymentStatus, attempt + 1);
};

export const pollRefundStatus = async (
  originalPaymentId: string,
  checkRefundStatus: ({
    originalPaymentId
  }: {
    originalPaymentId: string;
  }) => Promise<{ status: string }>,
  attempt = 0
): Promise<{ success: boolean }> => {
  if (attempt > 30) {
    throw new Error("Could not poll refund status");
  }

  const refund = await checkRefundStatus({ originalPaymentId });

  if (refund.status === StripeRefundStatus.REFUNDED) {
    return {
      success: true
    };
  }
  await delay(1000);
  return pollRefundStatus(originalPaymentId, checkRefundStatus, attempt + 1);
};
