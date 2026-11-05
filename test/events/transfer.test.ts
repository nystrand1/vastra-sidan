import { addHours, subMinutes } from "date-fns";
import { describe, expect, it } from "vitest";
import { adminCaller, publicCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, participantInput } from "../helpers/factories";
import { availableSeats, book, bookAndPay } from "../helpers/flows";
import { fakeStripe } from "../mocks/stripe";

const buyer = (overrides = {}) => ({
  firstName: "Kalle",
  lastName: "Köpare",
  email: "kalle@test.se",
  phone: "0701112233",
  consent: true,
  ...overrides
});

const transfer = (token: string | null, to = buyer()) =>
  publicCaller().eventPayment.transferBooking({ token: token ?? "", ...to });

const reload = (id: string) => prisma.participant.findUniqueOrThrow({ where: { id } });

const cancel = (token: string | null) =>
  publicCaller().eventPayment.cancelBooking({ token: token ?? "" });

/** One paid traveller on a fresh event. */
const bookOne = async ({
  departure,
  overrides = {}
}: { departure?: Date; overrides?: Parameters<typeof participantInput>[1] } = {}) => {
  const event = await createEvent({ departure });
  const busId = event.buses[0]!.id;
  const { participants } = await bookAndPay(event.id, [participantInput(busId, overrides)]);
  return { event, busId, participant: participants[0]! };
};

describe("transferring a booking", () => {
  it("hands the seat to the new person and replaces the manage token", async () => {
    const { event, busId, participant: p } = await bookOne({
      overrides: { note: "Glutenfri", member: true }
    });
    const seatsBefore = await availableSeats(event.id, busId);

    await expect(transfer(p.cancellationToken)).resolves.toEqual({ ok: true });

    const after = await reload(p.id);
    expect(after).toMatchObject({
      name: "Kalle Köpare",
      email: "kalle@test.se",
      userEmail: "kalle@test.se",
      phone: "0701112233",
      note: null,
      busId: p.busId,
      payAmount: p.payAmount,
      member: true
    });
    expect(after.cancellationToken).toEqual(expect.any(String));
    expect(after.cancellationToken).not.toBe("");
    expect(after.cancellationToken).not.toBe(p.cancellationToken);

    expect(await prisma.participantTransfer.findMany()).toEqual([
      expect.objectContaining({
        participantId: p.id,
        previousToken: p.cancellationToken,
        fromName: p.name,
        fromEmail: p.email,
        fromPhone: p.phone,
        toName: "Kalle Köpare",
        toEmail: "kalle@test.se",
        toPhone: "0701112233"
      })
    ]);
    expect(fakeStripe.requestsTo("POST", "/refunds")).toEqual([]);
    expect(await availableSeats(event.id, busId)).toBe(seatsBefore);
  });

  it("trims names and email", async () => {
    const { participant: p } = await bookOne();

    await transfer(
      p.cancellationToken,
      buyer({ firstName: "  Kalle ", lastName: " Köpare ", email: " Kalle@Test.se " })
    );

    const after = await reload(p.id);
    expect(after.name).toBe("Kalle Köpare");
    expect(after.email).toBe("kalle@test.se");
  });

  it("lets someone in the group transfer another traveller's seat", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [
      participantInput(busId),
      participantInput(busId)
    ]);
    const [a, b] = participants;

    // The token a's manage page holds for b
    await transfer(b!.cancellationToken);

    expect(await reload(b!.id)).toMatchObject({ name: "Kalle Köpare", email: "kalle@test.se" });
    expect(await reload(a!.id)).toEqual(a);
  });

  it("transfers a free admin booking", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { consent: _consent, ...input } = participantInput(busId);
    await adminCaller().admin.addParticipant({ ...input, eventId: event.id });
    const participant = await prisma.participant.findFirstOrThrow({
      where: { email: input.email }
    });

    await transfer(participant.cancellationToken);

    expect(await prisma.participantTransfer.count()).toBe(1);
  });

  it("allows a transfer within 36 hours of departure", async () => {
    const { participant } = await bookOne({ departure: addHours(new Date(), 2) });

    await expect(transfer(participant.cancellationToken)).resolves.toEqual({ ok: true });
  });

  it("rejects a transfer after departure", async () => {
    const { event, participant } = await bookOne();
    await prisma.vastraEvent.update({
      where: { id: event.id },
      data: { date: subMinutes(new Date(), 1) }
    });

    await expect(transfer(participant.cancellationToken)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Resan har redan avgått"
    });
    expect(await prisma.participantTransfer.count()).toBe(0);
  });

  it("rejects a cancelled seat", async () => {
    const { participant } = await bookOne();
    await cancel(participant.cancellationToken);
    await fakeStripe.completeRefund(fakeStripe.refunds()[0]!.id);

    await expect(transfer(participant.cancellationToken)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Bokningen är avbokad"
    });
    expect(await prisma.participantTransfer.count()).toBe(0);
  });

  it("rejects a seat with a pending refund", async () => {
    const { participant } = await bookOne();
    await cancel(participant.cancellationToken);

    await expect(transfer(participant.cancellationToken)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Bokningen är avbokad"
    });
    expect(await prisma.participantTransfer.count()).toBe(0);
  });

  it("rejects an unpaid booking", async () => {
    const event = await createEvent();
    const { paymentIntent } = await book(event.id, [participantInput(event.buses[0]!.id)]);
    const participant = await prisma.participant.findFirstOrThrow({
      where: { stripePayments: { some: { stripePaymentId: paymentIntent.id } } }
    });

    await expect(transfer(participant.cancellationToken)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Bokningen är inte betald"
    });
    expect(await prisma.participantTransfer.count()).toBe(0);
  });

  it("rejects an unknown token", async () => {
    await bookOne();

    await expect(transfer("not-a-token")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Participant not found"
    });
  });

  it("never gives two travellers the same manage token", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [
      participantInput(busId),
      participantInput(busId)
    ]);
    const [a, b] = participants;

    await expect(
      prisma.participant.update({
        where: { id: b!.id },
        data: { cancellationToken: a!.cancellationToken }
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("lets only one of two simultaneous transfers through", async () => {
    const { participant } = await bookOne();
    const token = participant.cancellationToken;

    const results = await Promise.allSettled([
      transfer(token, buyer()),
      transfer(token, buyer({ email: "other@test.se" }))
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "BAD_REQUEST", message: "Participant not found" })
      })
    ]);
    expect(await prisma.participantTransfer.count()).toBe(1);
  });
});
