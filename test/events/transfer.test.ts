import { captureException } from "@sentry/nextjs";
import { addHours, subMinutes } from "date-fns";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { adminCaller, publicCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, participantInput } from "../helpers/factories";
import { availableSeats, book, bookAndPay } from "../helpers/flows";
import { getSentEmails, resetSentEmails } from "../mocks/ses";
import { server } from "../mocks/server";
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

const view = (token: string | null) =>
  publicCaller().eventPayment.getManagableBooking({ token: token ?? "" });

/** Two (or more) paid travellers on one payment. */
const bookGroup = async (count: number, eventOptions: Parameters<typeof createEvent>[0] = {}) => {
  const event = await createEvent(eventOptions);
  const busId = event.buses[0]!.id;
  const { participants } = await bookAndPay(
    event.id,
    Array.from({ length: count }, () => participantInput(busId))
  );
  return { event, busId, participants };
};

const newToken = async (id: string) => (await reload(id)).cancellationToken!;

describe("managing a transferred seat", () => {
  it("shows the new holder only their own seat", async () => {
    const {
      participants: [_a, b]
    } = await bookGroup(2);
    await transfer(b!.cancellationToken);

    const booking = await view(await newToken(b!.id));

    expect(booking.participants).toEqual([
      expect.objectContaining({ email: "kalle@test.se", transferred: true })
    ]);
    expect(booking.transferredAway).toBe(false);
  });

  it("hides a transferred seat from the rest of the group", async () => {
    const {
      participants: [a, b]
    } = await bookGroup(2);
    await transfer(b!.cancellationToken);

    const booking = await view(a!.cancellationToken);

    expect(booking.participants).toEqual([
      expect.objectContaining({ email: a!.email, transferred: false })
    ]);
    expect(booking.transferredAway).toBe(false);
  });

  it("shows the group's old link that the seat has been transferred", async () => {
    const {
      participants: [a, b]
    } = await bookGroup(2);
    await transfer(a!.cancellationToken);

    const booking = await view(a!.cancellationToken);

    expect(booking.transferredAway).toBe(true);
    expect(booking.participants).toEqual([expect.objectContaining({ email: b!.email })]);
  });

  it("shows only the message when a one-person booking was transferred", async () => {
    const { participant } = await bookOne();
    await transfer(participant.cancellationToken);

    const booking = await view(participant.cancellationToken);

    expect(booking.transferredAway).toBe(true);
    expect(booking.participants).toEqual([]);
  });

  it("does not show the original group to an earlier new holder", async () => {
    const {
      participants: [_a, b]
    } = await bookGroup(2);
    await transfer(b!.cancellationToken);
    const t2 = await newToken(b!.id);
    await transfer(t2, buyer({ email: "lisa@test.se" }));
    const t3 = await newToken(b!.id);

    const earlier = await view(t2);
    expect(earlier.transferredAway).toBe(true);
    expect(earlier.participants).toEqual([]);

    const current = await view(t3);
    expect(current.participants).toEqual([
      expect.objectContaining({ email: "lisa@test.se", transferred: true })
    ]);

    expect(await prisma.participantTransfer.count()).toBe(2);
  });

  it("gives each seat transferred to the same person its own link", async () => {
    const {
      participants: [a, b, c]
    } = await bookGroup(3);
    await transfer(b!.cancellationToken);
    await transfer(c!.cancellationToken);
    const tb = await newToken(b!.id);
    const tc = await newToken(c!.id);

    expect(tb).not.toBe(tc);
    expect((await view(tb)).participants).toEqual([
      expect.objectContaining({ cancellationToken: tb, email: "kalle@test.se" })
    ]);
    expect((await view(tc)).participants).toEqual([
      expect.objectContaining({ cancellationToken: tc, email: "kalle@test.se" })
    ]);
    expect((await view(a!.cancellationToken)).participants).toEqual([
      expect.objectContaining({ email: a!.email })
    ]);
  });

  it("refuses to cancel a transferred seat, without asking Stripe for a refund", async () => {
    const { participant } = await bookOne();
    await transfer(participant.cancellationToken);

    await expect(cancel(await newToken(participant.id))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Platsen har överlåtits och kan inte avbokas. Kontakta info@vastrasidan.se"
    });
    expect(fakeStripe.requestsTo("POST", "/refunds")).toEqual([]);
    expect((await reload(participant.id)).cancellationDate).toBeNull();
  });

  it("lets the new holder change bus", async () => {
    const event = await createEvent({
      buses: [
        { name: "Buss 1", seats: 50 },
        { name: "Buss 2", seats: 50 }
      ]
    });
    const [bus1, bus2] = event.buses;
    const {
      participants: [p]
    } = await bookAndPay(event.id, [participantInput(bus1!.id)]);
    await transfer(p!.cancellationToken);

    await publicCaller().eventPayment.changeBus({
      token: await newToken(p!.id),
      busId: bus2!.id
    });

    expect((await reload(p!.id)).busId).toBe(bus2!.id);
  });

  it("stops the old token from managing the seat", async () => {
    const event = await createEvent({
      buses: [
        { name: "Buss 1", seats: 50 },
        { name: "Buss 2", seats: 50 }
      ]
    });
    const [bus1, bus2] = event.buses;
    const {
      participants: [p]
    } = await bookAndPay(event.id, [participantInput(bus1!.id)]);
    const oldToken = p!.cancellationToken;
    await transfer(oldToken);
    const notFound = { code: "BAD_REQUEST", message: "Participant not found" };

    await expect(cancel(oldToken)).rejects.toMatchObject(notFound);
    await expect(
      publicCaller().eventPayment.changeBus({ token: oldToken!, busId: bus2!.id })
    ).rejects.toMatchObject(notFound);
    await expect(transfer(oldToken, buyer({ email: "lisa@test.se" }))).rejects.toMatchObject(
      notFound
    );
    expect(await reload(p!.id)).toMatchObject({ busId: bus1!.id, email: "kalle@test.se" });
    expect(fakeStripe.requestsTo("POST", "/refunds")).toEqual([]);
  });
});

describe("transfer emails", () => {
  it("sends the new holder a confirmation with their own manage link", async () => {
    const { event, participant: p } = await bookOne();
    resetSentEmails();

    await transfer(p.cancellationToken);

    const newToken = (await reload(p.id)).cancellationToken;
    const emails = getSentEmails();
    const toNew = emails.find((e) => e.to === "kalle@test.se");
    expect(toNew?.subject).toBe(`Plats överlåten: ${event.name}`);
    expect(toNew?.html).toContain(`token=${newToken}`);
    expect(toNew?.html).toContain("info@vastrasidan.se");
    expect(toNew?.html).not.toContain("medlems-/ungdomspris");

    const toOld = emails.find((e) => e.to === p.email);
    expect(toOld?.subject).toBe(`Du har överlåtit din plats: ${event.name}`);
    expect(toOld?.html).toContain("Kalle Köpare");
  });

  it("tells the new holder the seat was bought at member or youth price", async () => {
    const { participant: p } = await bookOne({ overrides: { member: true } });
    resetSentEmails();

    await transfer(p.cancellationToken);

    const toNew = getSentEmails().find((e) => e.to === "kalle@test.se");
    expect(toNew?.html).toContain("medlems-/ungdomspris");
  });

  it("keeps the transfer when the email can't be sent", async () => {
    const { participant: p } = await bookOne();
    server.use(http.post("https://email.eu-north-1.amazonaws.com/", () => HttpResponse.error()));

    await expect(transfer(p.cancellationToken)).resolves.toEqual({ ok: true });

    expect((await reload(p.id)).email).toBe("kalle@test.se");
    expect(captureException).toHaveBeenCalled();
  });

  it("resends the transfer notice from admin", async () => {
    const { participant: p } = await bookOne();
    await transfer(p.cancellationToken);
    const newToken = (await reload(p.id)).cancellationToken;
    resetSentEmails();

    await adminCaller().admin.sendParticipantEmail({ id: p.id });

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]?.html).toContain(`token=${newToken}`);
    expect(emails[0]?.html).toContain("info@vastrasidan.se");
  });

  it("shows admins the transfer history, newest first", async () => {
    const { participant: p } = await bookOne();
    await transfer(p.cancellationToken);
    const token = (await reload(p.id)).cancellationToken;
    await transfer(token, buyer({ firstName: "Lisa", lastName: "Lind", email: "lisa@test.se" }));

    const { transfers } = await adminCaller().admin.getEventParticipantById({ id: p.id });

    expect(transfers).toHaveLength(2);
    expect(transfers[0]).toMatchObject({ toEmail: "lisa@test.se", fromEmail: "kalle@test.se" });
    expect(transfers[1]).toMatchObject({ fromEmail: p.email, toEmail: "kalle@test.se" });
    expect(transfers[0]).not.toHaveProperty("previousToken");
  });
});
