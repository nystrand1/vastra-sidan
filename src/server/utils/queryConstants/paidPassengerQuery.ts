import { StripePaymentStatus, StripeRefundStatus } from "~/generated/prisma/client";

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
