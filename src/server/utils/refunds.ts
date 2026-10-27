import { StripeRefundStatus, type StripeRefund } from "~/generated/prisma/client";

/*
 * StripeRefund is append-only. A refund gets a CREATED row when we ask Stripe for it, and a
 * REFUNDED or ERROR row when Stripe reports how it went. Rows are never updated or deleted, so a
 * refund's status is worked out from all of its rows (grouped by `stripeRefundId`).
 */

type RefundRow = Pick<StripeRefund, "stripeRefundId" | "status">;

const precedence: Record<StripeRefundStatus, number> = {
  [StripeRefundStatus.CREATED]: 0,
  [StripeRefundStatus.ERROR]: 1,
  [StripeRefundStatus.REFUNDED]: 2
};

/** Each refund's current status: REFUNDED or ERROR once Stripe has reported, otherwise CREATED. */
export const refundStatuses = (rows: RefundRow[]) => {
  const statuses = new Map<string, StripeRefundStatus>();
  for (const row of rows) {
    const current = statuses.get(row.stripeRefundId);
    if (!current || precedence[row.status] > precedence[current]) {
      statuses.set(row.stripeRefundId, row.status);
    }
  }
  return statuses;
};

/** Where a participant's refunds stand, from their StripeRefund rows. */
export const participantRefundState = (rows: RefundRow[]) => {
  const statuses = [...refundStatuses(rows).values()];
  return {
    refunded: statuses.includes(StripeRefundStatus.REFUNDED),
    pending: statuses.includes(StripeRefundStatus.CREATED),
    failedAttempts: statuses.filter((s) => s === StripeRefundStatus.ERROR).length
  };
};
