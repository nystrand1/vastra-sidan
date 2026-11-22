import { addDays, subDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { publicCaller, userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, participantInput } from "../helpers/factories";
import { book, bookAndPay } from "../helpers/flows";
import { fakeStripe } from "../mocks/stripe";

const trips = (email: string) => userCaller({ email }).user.getMyBookings();

const buyer = (email: string) => ({
  firstName: "Doris",
  lastName: "Ny",
  email,
  phone: "0701112233",
  consent: true
});

/** Every seat of every trip in a response. */
const allSeats = (res: Awaited<ReturnType<typeof trips>>) =>
  [...res.upcoming, ...res.past].flatMap((t) => t.seats);

describe("Mina bussresor", () => {
  it("lists my own seat on someone else's booking, without the others", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [
      participantInput(busId, { email: "a@x.se" }),
      participantInput(busId, { email: "b@x.se" })
    ]);
    const [, b] = participants;

    const { upcoming, past } = await trips("b@x.se");

    expect(past).toEqual([]);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({ eventId: event.id, eventName: event.name });
    expect(upcoming[0]!.seats).toEqual([
      expect.objectContaining({
        email: "b@x.se",
        isOwn: true,
        transferredAway: false,
        cancellationToken: b!.cancellationToken
      })
    ]);
  });

  it("lists every seat I paid for", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [
      participantInput(busId, { email: "a@x.se" }),
      participantInput(busId, { email: "b@x.se" })
    ]);
    const [a, b] = participants;

    const { upcoming } = await trips("a@x.se");

    expect(upcoming).toHaveLength(1);
    const seats = upcoming[0]!.seats;
    expect(seats).toHaveLength(2);
    expect(seats.find((s) => s.email === "a@x.se")).toMatchObject({
      isOwn: true,
      cancellationToken: a!.cancellationToken
    });
    expect(seats.find((s) => s.email === "b@x.se")).toMatchObject({
      isOwn: false,
      transferredAway: false,
      cancellationToken: b!.cancellationToken
    });
  });

  it("lists seats I paid for when I wasn't travelling", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const clientSecret = await userCaller({ email: "konto@test.se" }).eventPayment.requestStripePayment({
      eventId: event.id,
      participants: [participantInput(busId), participantInput(busId)]
    });
    const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientSecret);
    await fakeStripe.succeedPayment(paymentIntent.id);

    const { upcoming } = await trips("konto@test.se");

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]!.seats).toHaveLength(2);
    for (const seat of upcoming[0]!.seats) {
      expect(seat.isOwn).toBe(false);
      expect(seat.cancellationToken).toEqual(expect.any(String));
    }
  });

  it("matches emails regardless of case", async () => {
    const event = await createEvent();
    await bookAndPay(event.id, [participantInput(event.buses[0]!.id, { email: " Anna@X.se" })]);

    const { upcoming } = await trips("anna@x.se");

    expect(upcoming[0]!.seats).toEqual([expect.objectContaining({ email: "anna@x.se", isOwn: true })]);
  });

  it("lists every seat under my email when I booked my children with it", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    await bookAndPay(event.id, [
      participantInput(busId, { email: "anna@x.se" }),
      participantInput(busId, { email: "anna@x.se", youth: true })
    ]);

    const { upcoming } = await trips("anna@x.se");

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]!.seats).toHaveLength(2);
    for (const seat of upcoming[0]!.seats) {
      expect(seat).toMatchObject({ isOwn: true, cancellationToken: expect.any(String) });
    }
  });

  it("shows a seat transferred away as transferred, without a token", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [
      participantInput(busId, { email: "a@x.se" }),
      participantInput(busId, { email: "b@x.se" })
    ]);
    const [a, b] = participants;
    await publicCaller().eventPayment.transferBooking({
      token: b!.cancellationToken!,
      ...buyer("d@x.se")
    });

    // B gave their seat away. They see it, read-only, and nothing else.
    const asB = await trips("b@x.se");
    expect(asB.upcoming[0]!.seats).toEqual([
      expect.objectContaining({ isOwn: false, transferredAway: true, cancellationToken: null })
    ]);

    // D holds it now, with a token.
    const asD = await trips("d@x.se");
    expect(asD.upcoming[0]!.seats).toEqual([
      expect.objectContaining({
        email: "d@x.se",
        isOwn: true,
        transferredAway: false,
        cancellationToken: expect.any(String)
      })
    ]);
    expect(asD.upcoming[0]!.seats[0]!.cancellationToken).not.toBe(b!.cancellationToken);

    // The payer sees their own seat with a token and the transferred one once, without.
    const asA = await trips("a@x.se");
    const seats = asA.upcoming[0]!.seats;
    expect(seats).toHaveLength(2);
    expect(seats.find((s) => s.email === "a@x.se")).toMatchObject({
      cancellationToken: a!.cancellationToken
    });
    expect(seats.find((s) => s.email === "d@x.se")).toMatchObject({
      isOwn: false,
      transferredAway: true,
      cancellationToken: null
    });
  });

  it("shows the payer their own seat once, transferred away, when they gave it away", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [
      participantInput(busId, { email: "a@x.se" }),
      participantInput(busId, { email: "b@x.se" })
    ]);
    await publicCaller().eventPayment.transferBooking({
      token: participants[0]!.cancellationToken!,
      ...buyer("d@x.se")
    });

    const { upcoming } = await trips("a@x.se");

    expect(upcoming[0]!.seats).toHaveLength(2);
    expect(upcoming[0]!.seats.filter((s) => s.transferredAway)).toEqual([
      expect.objectContaining({ email: "d@x.se", cancellationToken: null })
    ]);
  });

  it("shows cancelled and refund-pending seats", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { paymentIntent, participants } = await bookAndPay(event.id, [
      participantInput(busId, { email: "a@x.se" }),
      participantInput(busId, { email: "b@x.se" }),
      participantInput(busId, { email: "c@x.se" })
    ]);
    await fakeStripe.settleCharge(paymentIntent.id, { fee: 1500 });
    const [, b, c] = participants;
    await publicCaller().eventPayment.cancelBooking({ token: b!.cancellationToken! });
    await publicCaller().eventPayment.cancelBooking({ token: c!.cancellationToken! });
    const refunds = fakeStripe.refunds();
    expect(refunds).toHaveLength(2);
    await fakeStripe.completeRefund(refunds[1]!.id);

    const seats = (await trips("a@x.se")).upcoming[0]!.seats;

    expect(seats.find((s) => s.email === "a@x.se")).toMatchObject({ hasCancelled: false, refundPending: false });
    expect(seats.find((s) => s.email === "b@x.se")).toMatchObject({ hasCancelled: false, refundPending: true });
    expect(seats.find((s) => s.email === "c@x.se")).toMatchObject({ hasCancelled: true, refundPending: false });
  });

  it("puts past trips in past with no tokens", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const other = await createEvent({ departure: addDays(new Date(), 3) });
    await bookAndPay(event.id, [
      participantInput(busId, { email: "a@x.se" }),
      participantInput(busId, { email: "b@x.se" })
    ]);
    await bookAndPay(other.id, [participantInput(other.buses[0]!.id, { email: "a@x.se" })]);
    await prisma.vastraEvent.update({ where: { id: event.id }, data: { date: subDays(new Date(), 2) } });

    const { upcoming, past } = await trips("a@x.se");

    expect(upcoming.map((t) => t.eventId)).toEqual([other.id]);
    expect(past.map((t) => t.eventId)).toEqual([event.id]);
    expect(past[0]!.seats).toHaveLength(2);
    for (const seat of past[0]!.seats) expect(seat.cancellationToken).toBeNull();
  });

  it("sorts upcoming trips soonest first and past trips latest first", async () => {
    const events = [
      await createEvent({ departure: addDays(new Date(), 20) }),
      await createEvent({ departure: addDays(new Date(), 5) }),
      await createEvent({ departure: addDays(new Date(), 10) })
    ];
    for (const e of events) {
      await bookAndPay(e.id, [participantInput(e.buses[0]!.id, { email: "a@x.se" })]);
    }
    const olds = [
      await createEvent({ departure: addDays(new Date(), 1) }),
      await createEvent({ departure: addDays(new Date(), 2) })
    ];
    for (const e of olds) {
      await bookAndPay(e.id, [participantInput(e.buses[0]!.id, { email: "a@x.se" })]);
    }
    await prisma.vastraEvent.update({ where: { id: olds[0]!.id }, data: { date: subDays(new Date(), 30) } });
    await prisma.vastraEvent.update({ where: { id: olds[1]!.id }, data: { date: subDays(new Date(), 10) } });

    const { upcoming, past } = await trips("a@x.se");

    expect(upcoming.map((t) => t.eventId)).toEqual([events[1]!.id, events[2]!.id, events[0]!.id]);
    expect(past.map((t) => t.eventId)).toEqual([olds[1]!.id, olds[0]!.id]);
  });

  it("describes the trip's buses and transport", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 10 }] });
    await bookAndPay(event.id, [participantInput(event.buses[0]!.id, { email: "a@x.se" })]);

    const [trip] = (await trips("a@x.se")).upcoming;

    expect(trip).toMatchObject({ isTrain: false, refundable: true, departureTime: expect.any(String) });
    expect(trip!.buses).toEqual([
      expect.objectContaining({
        id: event.buses[0]!.id,
        name: "Buss 1",
        seats: 10,
        availableSeats: 9,
        _count: { passengers: 1 }
      })
    ]);
  });

  it("leaves out unpaid bookings", async () => {
    const event = await createEvent();
    await book(event.id, [participantInput(event.buses[0]!.id, { email: "a@x.se" })]);

    expect(await trips("a@x.se")).toEqual({ upcoming: [], past: [] });
  });

  it("lists nothing for someone with no bookings", async () => {
    const event = await createEvent();
    await bookAndPay(event.id, [participantInput(event.buses[0]!.id, { email: "a@x.se" })]);

    expect(await trips("ingen@x.se")).toEqual({ upcoming: [], past: [] });
  });

  it("never returns a token for a seat I can't manage", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { participants } = await bookAndPay(event.id, [
      participantInput(busId, { email: "a@x.se" }),
      participantInput(busId, { email: "b@x.se" }),
      participantInput(busId, { email: "c@x.se" })
    ]);
    const [a, b, c] = participants;
    await publicCaller().eventPayment.transferBooking({
      token: c!.cancellationToken!,
      ...buyer("d@x.se")
    });

    for (const email of ["a@x.se", "b@x.se", "c@x.se", "d@x.se", "e@x.se"]) {
      const res = await trips(email);
      for (const seat of allSeats(res)) {
        const manageable =
          (seat.isOwn || email === "a@x.se") && !seat.transferredAway;
        if (!manageable) expect(seat.cancellationToken).toBeNull();
      }
      const json = JSON.stringify(res);
      if (email === "b@x.se") {
        expect(json).not.toContain(a!.cancellationToken);
        expect(json).not.toContain(c!.cancellationToken);
      }
      if (email === "c@x.se") {
        expect(json).not.toContain(c!.cancellationToken);
        expect(json).not.toContain(b!.cancellationToken);
      }
    }
  });
});
