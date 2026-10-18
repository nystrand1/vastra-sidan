import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";
import { addHours } from "date-fns";
import { describe, expect, it } from "vitest";
import { adminCaller, publicCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, createParticipant, participantInput } from "../helpers/factories";
import { availableSeats, bookAndPay } from "../helpers/flows";
import { itKnownBug } from "../helpers/knownBug";
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

describe("cancelling a booking", () => {
  it("refunds the traveller's share minus their part of the Stripe fee", async () => {
    const { event, busId, paymentIntent, member, nonMember } = await bookTwoTravellers();

    const originalPaymentId = await cancel(member.cancellationToken);

    // 30000 öre - floor(1500 * 30000 / 70000) = 30000 - 642
    expect(fakeStripe.requestsTo("POST", "/refunds")).toEqual([
      expect.objectContaining({
        body: { payment_intent: paymentIntent.id, amount: "29358", reason: "requested_by_customer" }
      })
    ]);
    const succeededPayment = await prisma.stripePayment.findFirstOrThrow({
      where: { stripePaymentId: paymentIntent.id, status: StripePaymentStatus.SUCCEEDED }
    });
    expect(originalPaymentId).toBe(succeededPayment.id);
    expect(await prisma.stripeRefund.findMany()).toEqual([
      expect.objectContaining({
        amount: 29358,
        status: StripeRefundStatus.CREATED,
        participantId: member.id,
        originalPaymentId
      })
    ]);

    // Until Stripe confirms, the seat is still taken and the refund is pending
    expect(await publicCaller().eventPayment.checkRefundStatus({ originalPaymentId })).toEqual({
      status: "Not found"
    });
    expect(await availableSeats(event.id, busId)).toBe(8);

    const [refund] = fakeStripe.refunds();
    const res = await fakeStripe.completeRefund(refund!.id);
    expect(res.status).toBe(201);

    expect(await publicCaller().eventPayment.checkRefundStatus({ originalPaymentId })).toEqual({
      status: StripeRefundStatus.REFUNDED
    });
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

  // Known bug: nothing stops a traveller from cancelling again, which refunds them twice
  // (paid for by the rest of the group's share of the charge).
  itKnownBug("does not refund the same traveller twice", async () => {
    const { member } = await bookTwoTravellers();
    await cancel(member.cancellationToken);
    await fakeStripe.completeRefund(fakeStripe.refunds()[0]!.id);

    await expect(cancel(member.cancellationToken)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fakeStripe.refunds()).toHaveLength(1);
  });

  // Known bug: the refund is based on the event's current price, not `payAmount`,
  // so a price change synced from WordPress changes what travellers get back.
  itKnownBug("refunds what the traveller paid, even if the price changed afterwards", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [participantInput(busId)]);
    await prisma.vastraEvent.update({ where: { id: event.id }, data: { defaultPrice: 450 } });

    await cancel(participants[0]!.cancellationToken);

    expect(fakeStripe.refunds()).toEqual([expect.objectContaining({ amount: 40000 })]);
  });

  // Known bug: a free (admin-added) booking has a 0 SEK payment, so the fee split divides
  // by zero and `amount=NaN` is sent to Stripe.
  itKnownBug("cancels a free admin booking without sending an invalid refund to Stripe", async () => {
    const event = await createEvent();
    const { consent: _consent, ...input } = participantInput(event.buses[0]!.id);
    await adminCaller().admin.addParticipant({ ...input, eventId: event.id });
    const participant = await prisma.participant.findFirstOrThrow();

    await cancel(participant.cancellationToken).catch(() => undefined);

    expect(fakeStripe.requestsTo("POST", "/refunds")).toHaveLength(0);
  });
});
