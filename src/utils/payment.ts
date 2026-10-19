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
  token: string,
  checkRefundStatus: ({ token }: { token: string }) => Promise<{ status: string }>,
  attempt = 0
): Promise<{ success: boolean }> => {
  if (attempt > 30) {
    // Still pending: the booking is cancelled, Stripe just hasn't confirmed the refund yet
    return {
      success: false
    };
  }

  const refund = await checkRefundStatus({ token });

  if (refund.status === StripeRefundStatus.REFUNDED) {
    return {
      success: true
    };
  }
  if (refund.status === StripeRefundStatus.ERROR) {
    throw new Error("Refund failed");
  }
  await delay(1000);
  return pollRefundStatus(token, checkRefundStatus, attempt + 1);
};
