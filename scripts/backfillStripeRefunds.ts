/** Logic for scripts/backfill-stripe-refunds.ts, kept separate so it can be tested. */
import { type PrismaClient, StripeRefundStatus, type StripeRefund } from "@prisma/client";
import type Stripe from "stripe";

type RowState = Pick<StripeRefund, "status" | "stripeRefundId" | "amount">;

export type Change =
  | {
      kind: "update-refund";
      id: string;
      before: RowState;
      after: Partial<RowState> & { errorCode?: string };
      reason: string;
    }
  | { kind: "delete-refund"; id: string; before: RowState; reason: string }
  | {
      kind: "set-cancellation-date";
      participantId: string;
      cancellationDate: string;
      reason: string;
    };

export interface Issue {
  paymentId: string;
  chargeId: string | null;
  rowId?: string;
  message: string;
}

export interface PaymentCheck {
  paymentId: string;
  chargeId: string;
  chargeAmountRefunded: number;
  recordedBefore: number;
  recordedAfter: number;
}

export interface BackfillPlan {
  createdAt: string;
  changes: Change[];
  issues: Issue[];
  checks: PaymentCheck[];
}

const isLegacyRow = (row: Pick<StripeRefund, "stripeRefundId">) =>
  row.stripeRefundId.startsWith("ch_");

const sumRefunded = (rows: RowState[]) =>
  rows
    .filter((r) => r.status === StripeRefundStatus.REFUNDED)
    .reduce((acc, r) => acc + r.amount, 0);

const listRefunds = async (stripe: Stripe, chargeId: string) => {
  const refunds: Stripe.Refund[] = [];
  for await (const refund of stripe.refunds.list({ charge: chargeId, limit: 100 })) {
    refunds.push(refund);
  }
  // Oldest first, so dashboard refunds pair up with their rows in order
  return refunds.sort((a, b) => a.created - b.created);
};

/** Works out the changes without writing anything. */
export const planRefundBackfill = async ({
  prisma,
  stripe
}: {
  prisma: PrismaClient;
  stripe: Stripe;
}): Promise<BackfillPlan> => {
  const candidates = await prisma.stripeRefund.findMany({
    where: {
      OR: [
        { stripeRefundId: { startsWith: "ch_" } },
        { status: StripeRefundStatus.CREATED, stripeRefundId: { startsWith: "re_" } }
      ]
    },
    select: { originalPaymentId: true }
  });
  const paymentIds = [...new Set(candidates.map((r) => r.originalPaymentId))].sort();

  const changes: Change[] = [];
  const issues: Issue[] = [];
  const checks: PaymentCheck[] = [];

  for (const paymentId of paymentIds) {
    const payment = await prisma.stripePayment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        stripeRefunds: {
          include: { participant: { select: { id: true, cancellationDate: true } } },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    const rows = payment.stripeRefunds;
    const legacyChargeIds = [...new Set(rows.filter(isLegacyRow).map((r) => r.stripeRefundId))];
    if (legacyChargeIds.length > 1) {
      issues.push({
        paymentId,
        chargeId: null,
        message: `Rows reference several charges (${legacyChargeIds.join(", ")}). Skipped.`
      });
      continue;
    }

    let chargeId = legacyChargeIds[0] ?? null;
    if (!chargeId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentId);
      const latestCharge = paymentIntent.latest_charge;
      chargeId = typeof latestCharge === "string" ? latestCharge : (latestCharge?.id ?? null);
    }
    if (!chargeId) {
      issues.push({ paymentId, chargeId: null, message: "Stripe has no charge for this payment. Skipped." });
      continue;
    }
    const charge = await stripe.charges.retrieve(chargeId);
    const refunds = await listRefunds(stripe, chargeId);

    // Simulated state of every row of this payment after the changes so far
    const state = new Map<string, RowState>(
      rows.map((r) => [r.id, { status: r.status, stripeRefundId: r.stripeRefundId, amount: r.amount }])
    );
    const update = (row: (typeof rows)[number], after: Partial<RowState> & { errorCode?: string }, reason: string) => {
      const before = { status: row.status, stripeRefundId: row.stripeRefundId, amount: row.amount };
      changes.push({ kind: "update-refund", id: row.id, before, after, reason });
      state.set(row.id, { ...state.get(row.id)!, ...after });
    };

    // 1. Rows that already have the real refund id
    const unmatchedRefunds: Stripe.Refund[] = [];
    for (const refund of refunds) {
      const matching = rows.filter((r) => r.stripeRefundId === refund.id);
      if (matching.length === 0) {
        if (refund.status === "succeeded") unmatchedRefunds.push(refund);
        continue;
      }
      if (matching.length > 1) {
        issues.push({
          paymentId,
          chargeId,
          message: `${matching.length} rows share refund ${refund.id}. Left as they are.`
        });
        continue;
      }
      const row = matching[0]!;
      if (refund.status === "succeeded") {
        if (row.status !== StripeRefundStatus.REFUNDED || row.amount !== refund.amount) {
          update(
            row,
            { status: StripeRefundStatus.REFUNDED, amount: refund.amount },
            `Stripe refund ${refund.id} succeeded`
          );
        }
        if (row.participant && !row.participant.cancellationDate) {
          changes.push({
            kind: "set-cancellation-date",
            participantId: row.participant.id,
            cancellationDate: new Date(refund.created * 1000).toISOString(),
            reason: `Refund ${refund.id} succeeded, but the traveller was never marked as cancelled`
          });
        }
      } else if (refund.status === "failed" || refund.status === "canceled") {
        if (row.status === StripeRefundStatus.CREATED) {
          update(
            row,
            { status: StripeRefundStatus.ERROR, errorCode: refund.failure_reason ?? refund.status },
            `Stripe refund ${refund.id} ${refund.status}`
          );
        } else if (row.status === StripeRefundStatus.REFUNDED) {
          issues.push({
            paymentId,
            chargeId,
            rowId: row.id,
            message: `Row is REFUNDED, but Stripe refund ${refund.id} is ${refund.status}.`
          });
        }
      } else if (row.status === StripeRefundStatus.REFUNDED) {
        issues.push({
          paymentId,
          chargeId,
          rowId: row.id,
          message: `Row is REFUNDED, but Stripe refund ${refund.id} is still ${refund.status}.`
        });
      }
    }

    // 2. A traveller's `ch_` row duplicates their own refund row once that one is REFUNDED
    for (const row of rows.filter((r) => isLegacyRow(r) && r.participantId)) {
      const ownRefunded = rows.some(
        (r) =>
          r.id !== row.id &&
          !isLegacyRow(r) &&
          r.participantId === row.participantId &&
          state.get(r.id)!.status === StripeRefundStatus.REFUNDED
      );
      if (ownRefunded) {
        changes.push({
          kind: "delete-refund",
          id: row.id,
          before: { status: row.status, stripeRefundId: row.stripeRefundId, amount: row.amount },
          reason: `Duplicate of participant ${row.participantId}'s own refund row`
        });
        state.delete(row.id);
      } else {
        issues.push({
          paymentId,
          chargeId,
          rowId: row.id,
          message: `Row marks participant ${row.participantId} as refunded, but they have no succeeded refund of their own in Stripe. Left as it is.`
        });
      }
    }

    // 3. A dashboard refund's `ch_` row (no participant) gets the next unrecorded refund, in order
    for (const row of rows.filter((r) => isLegacyRow(r) && !r.participantId)) {
      const refund = unmatchedRefunds.shift();
      if (!refund) {
        issues.push({
          paymentId,
          chargeId,
          rowId: row.id,
          message: "Dashboard refund row has no matching unrecorded refund in Stripe. Left as it is."
        });
        continue;
      }
      update(
        row,
        { stripeRefundId: refund.id, amount: refund.amount },
        `Dashboard refund ${refund.id}`
      );
    }
    for (const refund of unmatchedRefunds) {
      issues.push({
        paymentId,
        chargeId,
        message: `Stripe refund ${refund.id} (${refund.amount} öre) has no row. Not created automatically.`
      });
    }

    const recordedBefore = sumRefunded(rows);
    const recordedAfter = sumRefunded([...state.values()]);
    checks.push({
      paymentId,
      chargeId,
      chargeAmountRefunded: charge.amount_refunded,
      recordedBefore,
      recordedAfter
    });
  }

  return { createdAt: new Date().toISOString(), changes, issues, checks };
};

const touchedRefundIds = (plan: BackfillPlan) =>
  plan.changes.flatMap((c) => (c.kind === "set-cancellation-date" ? [] : [c.id]));
const touchedParticipantIds = (plan: BackfillPlan) =>
  plan.changes.flatMap((c) => (c.kind === "set-cancellation-date" ? [c.participantId] : []));

/** The full rows the plan changes, as they are now. Save it before applying. */
export const snapshotRows = async (prisma: PrismaClient, plan: BackfillPlan) => ({
  takenAt: new Date().toISOString(),
  stripeRefunds: await prisma.stripeRefund.findMany({ where: { id: { in: touchedRefundIds(plan) } } }),
  participants: await prisma.participant.findMany({
    where: { id: { in: touchedParticipantIds(plan) } },
    select: { id: true, cancellationDate: true }
  })
});

/** Applies exactly the planned changes in one transaction, or nothing if a row changed since. */
export const applyRefundBackfill = async ({
  prisma,
  plan
}: {
  prisma: PrismaClient;
  plan: BackfillPlan;
}) =>
  prisma.$transaction(
    async (tx) => {
      for (const change of plan.changes) {
        if (change.kind === "set-cancellation-date") {
          const { count } = await tx.participant.updateMany({
            where: { id: change.participantId, cancellationDate: null },
            data: { cancellationDate: new Date(change.cancellationDate) }
          });
          if (count !== 1) {
            throw new Error(`Participant ${change.participantId} changed since the plan was made`);
          }
          continue;
        }
        const unchanged = { id: change.id, ...change.before };
        const { count } =
          change.kind === "delete-refund"
            ? await tx.stripeRefund.deleteMany({ where: unchanged })
            : await tx.stripeRefund.updateMany({ where: unchanged, data: change.after });
        if (count !== 1) {
          throw new Error(`StripeRefund ${change.id} changed since the plan was made`);
        }
      }
      return plan.changes.length;
    },
    { timeout: 60_000 }
  );

export const formatPlan = (plan: BackfillPlan) => {
  const lines = [`# Refund backfill plan (${plan.createdAt})`, ""];
  lines.push(`## Changes (${plan.changes.length})`, "");
  for (const c of plan.changes) {
    if (c.kind === "update-refund") {
      const diff = Object.entries(c.after)
        .map(([key, value]) => `${key}: ${String(c.before[key as keyof RowState] ?? "-")} → ${String(value)}`)
        .join(", ");
      lines.push(`- UPDATE StripeRefund ${c.id}: ${diff} (${c.reason})`);
    } else if (c.kind === "delete-refund") {
      lines.push(
        `- DELETE StripeRefund ${c.id} [${c.before.status} ${c.before.stripeRefundId} ${c.before.amount}] (${c.reason})`
      );
    } else {
      lines.push(`- UPDATE Participant ${c.participantId}: cancellationDate → ${c.cancellationDate} (${c.reason})`);
    }
  }
  lines.push("", `## Needs a human (${plan.issues.length})`, "");
  for (const i of plan.issues) {
    lines.push(`- payment ${i.paymentId}, charge ${i.chargeId ?? "-"}${i.rowId ? `, row ${i.rowId}` : ""}: ${i.message}`);
  }
  const mismatches = plan.checks.filter((c) => c.recordedAfter !== c.chargeAmountRefunded);
  lines.push(
    "",
    `## Check: REFUNDED total vs Stripe's amount_refunded (${plan.checks.length - mismatches.length}/${plan.checks.length} match after the changes)`,
    ""
  );
  for (const c of plan.checks) {
    const mark = c.recordedAfter === c.chargeAmountRefunded ? "ok" : "MISMATCH";
    lines.push(
      `- ${mark} payment ${c.paymentId}, charge ${c.chargeId}: Stripe ${c.chargeAmountRefunded}, ours ${c.recordedBefore} → ${c.recordedAfter}`
    );
  }
  return lines.join("\n") + "\n";
};

