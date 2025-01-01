import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";

export const paidPassengerQuery = {
  where: {
    stripePayments: {
      some: {
        status: StripePaymentStatus.SUCCEEDED
      }
    },
    stripeRefunds: {
      none: {
        status: StripeRefundStatus.REFUNDED
      }
    }
  }
};
