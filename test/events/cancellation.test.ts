import { StripePaymentStatus, StripeRefundStatus, type Participant } from "@prisma/client";
import { captureMessage } from "@sentry/nextjs";
import { addHours } from "date-fns";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { adminCaller, publicCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, createParticipant, participantInput } from "../helpers/factories";
import { availableSeats, bookAndPay } from "../helpers/flows";
import { server } from "../mocks/server";
import { fakeStripe } from "../mocks/stripe";


/**
 * A member (300 SEK) and a non-member (400 SEK) book together: one payment of
 * 700 SEK, on which Stripe charges a 15 SEK fee.
 */
const bookTwoTravellers = async ({ departure }: { departure?: Date } = {}) => {
  const event = await createEvent({ departure, buses: [{ name: "Buss 1", seats: 10 }] });
  const busId = event.buses[0]!.id;
  const { paymentIntent, participants } = await bookAndPay(event.id, [
    participantInput(busId, { member: true }),
    participantInput(busId)
  ]);
  const settled = await fakeStripe.settleCharge(paymentIntent.id, { fee: 1500 });
  expect(settled.status).toBe(201);
  const [member, nonMember] = participants;
  return { event, busId, paymentIntent, member: member!, nonMember: nonMember! };
};

const cancel = (token: string | null) =>
  publicCaller().eventPayment.cancelBooking({ token: token ?? "" });

const refundStatusOf = (participant: Participant) =>
  publicCaller().eventPayment.checkRefundStatus({ token: participant.cancellationToken! });

/** StripeRefund is append-only, so its rows in order tell what happened. */
const refundHistory = async () =>
  (await prisma.stripeRefund.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(
    ({ stripeRefundId, status, participantId, amount }) => ({ stripeRefundId, status, participantId, amount })
  );

describe("cancelling a booking", () => {
  it("refunds the traveller's share minus their part of the Stripe fee", async () => {
    const { event, busId, paymentIntent, member, nonMember } = await bookTwoTravellers();

    const originalPaymentId = await cancel(member.cancellationToken);

    // 30000 öre - floor(1500 * 30000 / 70000) = 30000 - 642
    expect(fakeStripe.requestsTo("POST", "/refunds")).toEqual([
      expect.objectContaining({
        body: {
          payment_intent: paymentIntent.id,
          amount: "29358",
          reason: "requested_by_customer",
          metadata: { participantId: member.id }
        },
        idempotencyKey: `cancel-${member.id}-0`
      })
    ]);
    const succeededPayment = await prisma.stripePayment.findFirstOrThrow({
      where: { stripePaymentId: paymentIntent.id, status: StripePaymentStatus.SUCCEEDED }
    });
    expect(originalPaymentId).toBe(succeededPayment.id);
    const [refund] = fakeStripe.refunds();
    expect(await refundHistory()).toEqual([
      { stripeRefundId: refund!.id, status: StripeRefundStatus.CREATED, participantId: member.id, amount: 29358 }
    ]);
    expect((await prisma.stripeRefund.findFirstOrThrow()).originalPaymentId).toBe(originalPaymentId);

    // Until Stripe confirms, the seat is still taken and the refund is pending
    expect(await refundStatusOf(member)).toEqual({ status: StripeRefundStatus.CREATED });
    expect(await availableSeats(event.id, busId)).toBe(8);

    const res = await fakeStripe.completeRefund(refund!.id);
    expect(res.status).toBe(201);

    // The outcome is a new row: the CREATED row is kept as it was
    expect(await refundHistory()).toEqual([
      { stripeRefundId: refund!.id, status: StripeRefundStatus.CREATED, participantId: member.id, amount: 29358 },
      { stripeRefundId: refund!.id, status: StripeRefundStatus.REFUNDED, participantId: member.id, amount: 29358 }
    ]);
    expect(await refundStatusOf(member)).toEqual({ status: StripeRefundStatus.REFUNDED });
    expect(await refundStatusOf(nonMember)).toEqual({ status: "Not found" });
    const cancelled = await prisma.participant.findUniqueOrThrow({ where: { id: member.id } });
    expect(cancelled.cancellationDate).toBeInstanceOf(Date);
    expect(await availableSeats(event.id, busId)).toBe(9);

    // The other traveller in the booking is unaffected
    const booking = await publicCaller().eventPayment.getManagableBooking({
      token: nonMember.cancellationToken!
    });
    expect(booking.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: member.email, hasCancelled: true }),
        expect.objectContaining({ email: nonMember.email, hasCancelled: false })
      ])
    );
  });

  it("refunds the full price when Stripe hasn't reported a fee yet", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [participantInput(busId)]);

    await cancel(participants[0]!.cancellationToken);

    expect(fakeStripe.refunds()).toEqual([expect.objectContaining({ amount: 40000 })]);
  });

  it("allows cancelling until 36 hours before departure", async () => {
    const { member } = await bookTwoTravellers({ departure: addHours(new Date(), 37) });

    await expect(cancel(member.cancellationToken)).resolves.toBeTruthy();
  });

  it("rejects cancelling within 36 hours of departure", async () => {
    const { member } = await bookTwoTravellers({ departure: addHours(new Date(), 35) });

    await expect(cancel(member.cancellationToken)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Du kan inte avboka inom 36h"
    });
    expect(fakeStripe.requestsTo("POST", "/refunds")).toHaveLength(0);
    expect(await prisma.stripeRefund.count()).toBe(0);

    const booking = await publicCaller().eventPayment.getManagableBooking({
      token: member.cancellationToken!
    });
    expect(booking.participants.every((p) => p.cancellationDisabled)).toBe(true);
  });

  it("rejects an unknown cancellation token", async () => {
    await expect(cancel("not-a-token")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Participant not found"
    });
  });

  it("rejects a booking that was never paid", async () => {
    const event = await createEvent();
    const participant = await createParticipant({
      eventId: event.id,
      busId: event.buses[0]!.id,
      payment: "pending"
    });

    await expect(cancel(participant.cancellationToken)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Payment not found"
    });
    expect(fakeStripe.requests()).toHaveLength(0);
  });

  it("does not refund the same traveller twice", async () => {
    const { member } = await bookTwoTravellers();
    await cancel(member.cancellationToken);
    await fakeStripe.completeRefund(fakeStripe.refunds()[0]!.id);

    await expect(cancel(member.cancellationToken)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fakeStripe.refunds()).toHaveLength(1);
  });

  it("refunds what the traveller paid, even if the price changed afterwards", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [participantInput(busId)]);
    await prisma.vastraEvent.update({ where: { id: event.id }, data: { defaultPrice: 350 } });

    await cancel(participants[0]!.cancellationToken);

    expect(fakeStripe.refunds()).toEqual([expect.objectContaining({ amount: 40000 })]);
  });

  it("cancels a free admin booking without sending an invalid refund to Stripe", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { consent: _consent, ...input } = participantInput(busId);
    await adminCaller().admin.addParticipant({ ...input, eventId: event.id });
    const participant = await prisma.participant.findFirstOrThrow();

    await cancel(participant.cancellationToken);

    expect(fakeStripe.requestsTo("POST", "/refunds")).toHaveLength(0);
    const cancelled = await prisma.participant.findUniqueOrThrow({ where: { id: participant.id } });
    expect(cancelled.cancellationDate).toBeInstanceOf(Date);
    expect(await availableSeats(event.id, busId)).toBe(event.buses[0]!.seats);
  });

  it("rejects cancelling again while the refund is pending", async () => {
    const { member } = await bookTwoTravellers();
    await cancel(member.cancellationToken);

    await expect(cancel(member.cancellationToken)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fakeStripe.refunds()).toHaveLength(1);
  });

  it("lets the traveller cancel again after Stripe reports the refund failed", async () => {
    const { event, busId, member } = await bookTwoTravellers();
    await cancel(member.cancellationToken);
    const [failed] = fakeStripe.refunds();

    const res = await fakeStripe.failRefund(failed!.id);

    expect(res.status).toBe(201);
    expect(await refundHistory()).toEqual([
      expect.objectContaining({ stripeRefundId: failed!.id, status: StripeRefundStatus.CREATED }),
      expect.objectContaining({ stripeRefundId: failed!.id, status: StripeRefundStatus.ERROR })
    ]);
    expect(
      await prisma.stripeRefund.findFirst({ where: { status: StripeRefundStatus.ERROR } })
    ).toMatchObject({ errorCode: "expired_or_canceled_card" });
    expect(await refundStatusOf(member)).toEqual({ status: StripeRefundStatus.ERROR });
    const stillBooked = await prisma.participant.findUniqueOrThrow({ where: { id: member.id } });
    expect(stillBooked.cancellationDate).toBeNull();
    expect(await availableSeats(event.id, busId)).toBe(8);

    await cancel(member.cancellationToken);
    // A new idempotency key, or Stripe would hand back the failed refund
    expect(fakeStripe.requestsTo("POST", "/refunds").map((r) => r.idempotencyKey)).toEqual([
      `cancel-${member.id}-0`,
      `cancel-${member.id}-1`
    ]);
    const retry = fakeStripe.refunds()[1]!;
    await fakeStripe.completeRefund(retry.id);

    expect(
      await prisma.stripeRefund.findFirst({ where: { status: StripeRefundStatus.REFUNDED } })
    ).toMatchObject({ stripeRefundId: retry.id, participantId: member.id });
    expect(await availableSeats(event.id, busId)).toBe(9);
  });

  it("refunds only once when cancelling twice at the same time (a double-click)", async () => {
    const { member } = await bookTwoTravellers();

    const results = await Promise.allSettled([
      cancel(member.cancellationToken),
      cancel(member.cancellationToken)
    ]);

    // Depending on timing, the second one is rejected or gets the same refund back
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(fakeStripe.refunds()).toHaveLength(1);
    const rows = await prisma.stripeRefund.findMany();
    expect(new Set(rows.map((r) => r.stripeRefundId))).toEqual(new Set([fakeStripe.refunds()[0]!.id]));
    expect(await refundStatusOf(member)).toEqual({ status: StripeRefundStatus.CREATED });
  });

  it("handles the refund webhook arriving before Stripe's API response", async () => {
    const { event, busId, member } = await bookTwoTravellers();
    fakeStripe.completeRefundsImmediately();

    await cancel(member.cancellationToken);

    const [refund] = fakeStripe.refunds();
    expect(refund!.status).toBe("succeeded");
    // The webhook recorded the outcome first; the CREATED row came after
    expect(await refundHistory()).toEqual([
      { stripeRefundId: refund!.id, status: StripeRefundStatus.REFUNDED, participantId: member.id, amount: refund!.amount },
      { stripeRefundId: refund!.id, status: StripeRefundStatus.CREATED, participantId: member.id, amount: refund!.amount }
    ]);
    expect(await refundStatusOf(member)).toEqual({ status: StripeRefundStatus.REFUNDED });
    const cancelled = await prisma.participant.findUniqueOrThrow({ where: { id: member.id } });
    expect(cancelled.cancellationDate).toBeInstanceOf(Date);
    expect(await availableSeats(event.id, busId)).toBe(9);
  });

  it("marks the refund as failed when Stripe refuses it, so the traveller can try again", async () => {
    const { member } = await bookTwoTravellers();
    server.use(
      http.post(
        "https://api.stripe.com/v1/refunds",
        () =>
          HttpResponse.json(
            { error: { type: "invalid_request_error", message: "Charge has been disputed" } },
            { status: 400 }
          ),
        { once: true }
      )
    );

    await expect(cancel(member.cancellationToken)).rejects.toThrow("Charge has been disputed");

    expect(await prisma.stripeRefund.findMany()).toEqual([
      expect.objectContaining({
        status: StripeRefundStatus.ERROR,
        errorMessage: "Charge has been disputed",
        participantId: member.id
      })
    ]);
    await expect(cancel(member.cancellationToken)).resolves.toBeTruthy();
    // The refused request (answered by the override above) used attempt 0; the retry needs a new key
    expect(fakeStripe.requestsTo("POST", "/refunds").map((r) => r.idempotencyKey)).toEqual([
      `cancel-${member.id}-1`
    ]);
    expect(fakeStripe.refunds()).toHaveLength(1);
  });

  it.each(["refund.failed", "refund.updated"] as const)(
    "keeps a completed refund and reports it when Stripe later sends %s with a failure",
    async (failureEvent) => {
      const { event, busId, member } = await bookTwoTravellers();
      await cancel(member.cancellationToken);
      const [refund] = fakeStripe.refunds();
      await fakeStripe.completeRefund(refund!.id);

      const res = await fakeStripe.failRefund(refund!.id, { event: failureEvent });

      expect(res.status).toBe(201);
      expect(await refundHistory()).toEqual([
        expect.objectContaining({ stripeRefundId: refund!.id, status: StripeRefundStatus.CREATED }),
        expect.objectContaining({ stripeRefundId: refund!.id, status: StripeRefundStatus.REFUNDED })
      ]);
      expect(await availableSeats(event.id, busId)).toBe(9);
      expect(captureMessage).toHaveBeenCalledWith(
        `Stripe refund ${refund!.id} failed after it succeeded`,
        expect.objectContaining({ level: "error" })
      );
    }
  );

  it("refunds a group booking one traveller at a time", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 10 }] });
    const busId = event.buses[0]!.id;
    const { paymentIntent, participants } = await bookAndPay(event.id, [
      participantInput(busId),
      participantInput(busId),
      participantInput(busId),
      participantInput(busId)
    ]);
    await fakeStripe.settleCharge(paymentIntent.id, { fee: 4000 });
    const [a, b, c, d] = participants as [Participant, Participant, Participant, Participant];

    await cancel(a.cancellationToken);
    await fakeStripe.completeRefund(fakeStripe.refunds()[0]!.id);
    await cancel(b.cancellationToken);

    // A's refund being done must not make B's look done
    expect(await refundStatusOf(a)).toEqual({ status: StripeRefundStatus.REFUNDED });
    expect(await refundStatusOf(b)).toEqual({ status: StripeRefundStatus.CREATED });
    const booking = await publicCaller().eventPayment.getManagableBooking({ token: c.cancellationToken! });
    expect(booking.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: a.email, hasCancelled: true, refundPending: false }),
        expect.objectContaining({ email: b.email, hasCancelled: false, refundPending: true }),
        expect.objectContaining({ email: c.email, hasCancelled: false, refundPending: false })
      ])
    );

    await fakeStripe.completeRefund(fakeStripe.refunds()[1]!.id);

    // Each gets their own 40000 minus a quarter of the fee, based on the original payment
    const [refundA, refundB] = fakeStripe.refunds();
    expect([refundA!.amount, refundB!.amount]).toEqual([39000, 39000]);
    expect(await refundHistory()).toEqual([
      { stripeRefundId: refundA!.id, status: StripeRefundStatus.CREATED, participantId: a.id, amount: 39000 },
      { stripeRefundId: refundA!.id, status: StripeRefundStatus.REFUNDED, participantId: a.id, amount: 39000 },
      { stripeRefundId: refundB!.id, status: StripeRefundStatus.CREATED, participantId: b.id, amount: 39000 },
      { stripeRefundId: refundB!.id, status: StripeRefundStatus.REFUNDED, participantId: b.id, amount: 39000 }
    ]);
    expect(await refundStatusOf(b)).toEqual({ status: StripeRefundStatus.REFUNDED });
    expect(await availableSeats(event.id, busId)).toBe(8);
    for (const p of [c, d]) {
      const stillBooked = await prisma.participant.findUniqueOrThrow({ where: { id: p.id } });
      expect(stillBooked.cancellationDate).toBeNull();
    }
  });
});
