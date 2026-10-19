import { StripePaymentStatus, StripeRefundStatus, type Participant } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { stripe } from "~/server/stripe";
import {
  applyRefundBackfill,
  planRefundBackfill
} from "../../scripts/backfillStripeRefunds";
import { publicCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, participantInput } from "../helpers/factories";
import { bookAndPay } from "../helpers/flows";
import { fakeStripe } from "../mocks/stripe";

const cancel = (participant: Participant) =>
  publicCaller().eventPayment.cancelBooking({ token: participant.cancellationToken! });

/** The refund the traveller's cancellation created in Stripe. */
const refundOf = async (participant: Participant) => {
  const row = await prisma.stripeRefund.findFirstOrThrow({ where: { participantId: participant.id } });
  return fakeStripe.refunds().find((r) => r.id === row.stripeRefundId)!;
};

/** What the old `charge.refunded` handler wrote: the charge id and the full charge amount. */
const writeLegacyRow = async (paymentIntentId: string, participant: Participant | null) => {
  const pi = fakeStripe.paymentIntents().find((p) => p.id === paymentIntentId)!;
  const payment = await prisma.stripePayment.findFirstOrThrow({
    where: { stripePaymentId: paymentIntentId, status: StripePaymentStatus.SUCCEEDED }
  });
  if (participant) {
    await prisma.participant.update({ where: { id: participant.id }, data: { cancellationDate: new Date() } });
  }
  return prisma.stripeRefund.create({
    data: {
      stripeRefundId: pi.latest_charge!,
      amount: pi.amount,
      status: StripeRefundStatus.REFUNDED,
      participantId: participant?.id,
      originalPaymentId: payment.id
    }
  });
};

/**
 * One booking of three travellers (40000 öre each) with the mix of old rows we expect in production:
 * - A cancelled and was refunded; the old handler attributed it correctly.
 * - B cancelled and was refunded, but the old handler attributed B's refund to C.
 * - C cancelled, but C's refund failed.
 * - An admin refunded 5000 öre from the dashboard.
 */
const seedLegacyBooking = async () => {
  const event = await createEvent();
  const busId = event.buses[0]!.id;
  const { paymentIntent, participants } = await bookAndPay(event.id, [
    participantInput(busId),
    participantInput(busId),
    participantInput(busId)
  ]);
  const [a, b, c] = participants as [Participant, Participant, Participant];
  for (const p of participants) await cancel(p);

  const refundA = fakeStripe.completeRefundWithoutWebhook((await refundOf(a)).id);
  const legacyA = await writeLegacyRow(paymentIntent.id, a);
  const refundB = fakeStripe.completeRefundWithoutWebhook((await refundOf(b)).id);
  const legacyC = await writeLegacyRow(paymentIntent.id, c);
  const refundC = await refundOf(c);
  refundC.status = "failed";
  refundC.failure_reason = "expired_or_canceled_card";
  const dashboard = fakeStripe.refundFromDashboardWithoutWebhook(paymentIntent.id, 5000);
  const legacyDashboard = await writeLegacyRow(paymentIntent.id, null);

  return { paymentIntent, a, b, c, refundA, refundB, refundC, dashboard, legacyA, legacyC, legacyDashboard };
};

describe("refund backfill script", () => {
  it("plans the fixes without writing anything", async () => {
    const seed = await seedLegacyBooking();
    const rowsBefore = await prisma.stripeRefund.findMany({ orderBy: { id: "asc" } });

    const plan = await planRefundBackfill({ prisma, stripe });

    expect(await prisma.stripeRefund.findMany({ orderBy: { id: "asc" } })).toEqual(rowsBefore);
    const rowOf = async (p: Participant) =>
      (await prisma.stripeRefund.findFirstOrThrow({
        where: { participantId: p.id, stripeRefundId: { startsWith: "re_" } }
      })).id;
    expect(plan.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "update-refund",
          id: await rowOf(seed.a),
          after: { status: StripeRefundStatus.REFUNDED, amount: 40000 }
        }),
        expect.objectContaining({ kind: "delete-refund", id: seed.legacyA.id }),
        expect.objectContaining({
          kind: "update-refund",
          id: await rowOf(seed.b),
          after: { status: StripeRefundStatus.REFUNDED, amount: 40000 }
        }),
        expect.objectContaining({ kind: "set-cancellation-date", participantId: seed.b.id }),
        expect.objectContaining({
          kind: "update-refund",
          id: await rowOf(seed.c),
          after: { status: StripeRefundStatus.ERROR, errorCode: "expired_or_canceled_card" }
        }),
        expect.objectContaining({
          kind: "update-refund",
          id: seed.legacyDashboard.id,
          after: { stripeRefundId: seed.dashboard.id, amount: 5000 }
        })
      ])
    );
    expect(plan.changes).toHaveLength(6);
    // C's old row claims a refund Stripe never made: left for a human
    expect(plan.issues).toEqual([expect.objectContaining({ rowId: seed.legacyC.id })]);
    expect(plan.checks).toEqual([
      expect.objectContaining({
        chargeAmountRefunded: 85000,
        recordedBefore: 3 * 120000,
        recordedAfter: 85000 + 120000
      })
    ]);
  });

  it("applies the plan, after which there is nothing left to do", async () => {
    const seed = await seedLegacyBooking();
    const plan = await planRefundBackfill({ prisma, stripe });

    await applyRefundBackfill({ prisma, plan });

    const rows = await prisma.stripeRefund.findMany();
    expect(rows).toHaveLength(5);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stripeRefundId: seed.refundA.id, status: StripeRefundStatus.REFUNDED }),
        expect.objectContaining({ stripeRefundId: seed.refundB.id, status: StripeRefundStatus.REFUNDED }),
        expect.objectContaining({ stripeRefundId: seed.refundC.id, status: StripeRefundStatus.ERROR }),
        expect.objectContaining({ id: seed.legacyC.id, status: StripeRefundStatus.REFUNDED }),
        expect.objectContaining({
          stripeRefundId: seed.dashboard.id,
          amount: 5000,
          participantId: null,
          status: StripeRefundStatus.REFUNDED
        })
      ])
    );
    const b = await prisma.participant.findUniqueOrThrow({ where: { id: seed.b.id } });
    expect(b.cancellationDate).toBeInstanceOf(Date);

    const again = await planRefundBackfill({ prisma, stripe });
    expect(again.changes).toEqual([]);
    expect(again.issues).toEqual(plan.issues);
  });

  it("fully reconciles a booking whose only problem is the old rows", async () => {
    const event = await createEvent();
    const { paymentIntent, participants } = await bookAndPay(event.id, [
      participantInput(event.buses[0]!.id)
    ]);
    const traveller = participants[0]!;
    await cancel(traveller);
    fakeStripe.completeRefundWithoutWebhook((await refundOf(traveller)).id);
    await writeLegacyRow(paymentIntent.id, traveller);

    const plan = await planRefundBackfill({ prisma, stripe });
    await applyRefundBackfill({ prisma, plan });

    expect(plan.issues).toEqual([]);
    expect(plan.checks).toEqual([
      expect.objectContaining({ chargeAmountRefunded: 40000, recordedAfter: 40000 })
    ]);
    expect(await prisma.stripeRefund.findMany()).toEqual([
      expect.objectContaining({ status: StripeRefundStatus.REFUNDED, amount: 40000, participantId: traveller.id })
    ]);
  });

  it("applies nothing if a row changed after the plan was made", async () => {
    const seed = await seedLegacyBooking();
    const plan = await planRefundBackfill({ prisma, stripe });
    const rowsAtPlan = await prisma.stripeRefund.findMany({ orderBy: { id: "asc" } });
    await prisma.stripeRefund.update({
      where: { id: seed.legacyDashboard.id },
      data: { amount: 1 }
    });

    await expect(applyRefundBackfill({ prisma, plan })).rejects.toThrow(
      `StripeRefund ${seed.legacyDashboard.id} changed since the plan was made`
    );

    const rowsNow = await prisma.stripeRefund.findMany({ orderBy: { id: "asc" } });
    expect(rowsNow).toEqual(
      rowsAtPlan.map((r) =>
        r.id === seed.legacyDashboard.id ? { ...r, amount: 1, updatedAt: expect.any(Date) as unknown } : r
      )
    );
  });
});
