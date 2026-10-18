import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { adminCaller, publicCaller, userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, createParticipant, fillSeats, participantInput } from "../helpers/factories";
import { availableSeats, bookAndPay } from "../helpers/flows";
import { itKnownBug } from "../helpers/knownBug";
import { getSentEmails } from "../mocks/ses";
import { fakeStripe } from "../mocks/stripe";

describe("public event booking", () => {
  it("creates the participants and a pending payment priced per traveller", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const participants = [
      participantInput(busId),
      participantInput(busId, { member: true }),
      participantInput(busId, { youth: true }),
      participantInput(busId, { youth: true, member: true, note: "Allergisk mot nötter" })
    ];

    const clientSecret = await publicCaller().eventPayment.requestStripePayment({
      eventId: event.id,
      participants
    });

    // 400 + 300 + 200 + 100 SEK, in öre
    const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientSecret);
    expect(paymentIntent).toMatchObject({
      amount: 100000,
      currency: "sek",
      metadata: { type: "EVENT" },
      description: `${event.name}. 4 resenärer`
    });

    const booked = await prisma.participant.findMany({
      include: { stripePayments: true },
      orderBy: { createdAt: "asc" }
    });
    expect(booked.map((p) => p.payAmount)).toEqual([400, 300, 200, 100]);
    expect(booked[3]).toMatchObject({
      name: `${participants[3]!.firstName} ${participants[3]!.lastName}`,
      note: "Allergisk mot nötter",
      eventId: event.id,
      busId,
      cancellationDate: null
    });
    for (const participant of booked) {
      expect(participant.stripePayments).toEqual([
        expect.objectContaining({
          stripePaymentId: paymentIntent.id,
          amount: 100000,
          status: StripePaymentStatus.CREATED
        })
      ]);
    }
    expect(getSentEmails()).toHaveLength(0);
  });

  it("confirms the booking and emails every traveller once Stripe confirms the payment", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 10 }] });
    const busId = event.buses[0]!.id;
    const participants = [participantInput(busId), participantInput(busId, { member: true })];

    const { paymentIntent, participants: booked } = await bookAndPay(event.id, participants);

    expect(await availableSeats(event.id, busId)).toBe(8);
    expect(getSentEmails().map((e) => e.to).sort()).toEqual(participants.map((p) => p.email).sort());
    for (const participant of booked) {
      expect(getSentEmails().find((e) => e.to === participant.email)?.html).toContain(
        `token=${participant.cancellationToken}`
      );
    }

    const booking = await publicCaller().eventPayment.getBooking({ paymentId: paymentIntent.id });
    expect(booking).toMatchObject({ eventName: event.name, totalPrice: 700 });
    expect(booking.participants).toHaveLength(2);
  });

  it("allows booking exactly the remaining seats", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 3 }] });
    const busId = event.buses[0]!.id;
    await fillSeats(event.id, busId, 1);

    await bookAndPay(event.id, [participantInput(busId), participantInput(busId)]);

    expect(await availableSeats(event.id, busId)).toBe(0);
  });

  it("rejects a group larger than the remaining seats", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 3 }] });
    const busId = event.buses[0]!.id;
    await fillSeats(event.id, busId, 2);

    await expect(
      publicCaller().eventPayment.requestStripePayment({
        eventId: event.id,
        participants: [participantInput(busId), participantInput(busId)]
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "BUS_FULL" });

    expect(await prisma.participant.count()).toBe(2);
    expect(fakeStripe.requests()).toHaveLength(0);
  });

  it("checks capacity per bus", async () => {
    const event = await createEvent({
      buses: [
        { name: "Buss 1", seats: 2 },
        { name: "Buss 2", seats: 2 }
      ]
    });
    const [fullBus, freeBus] = event.buses;
    await fillSeats(event.id, fullBus!.id, 2);

    await expect(
      publicCaller().eventPayment.requestStripePayment({
        eventId: event.id,
        participants: [participantInput(freeBus!.id), participantInput(fullBus!.id)]
      })
    ).rejects.toMatchObject({ message: "BUS_FULL" });

    await bookAndPay(event.id, [participantInput(freeBus!.id), participantInput(freeBus!.id)]);
    expect(await availableSeats(event.id, freeBus!.id)).toBe(0);
  });

  it("gives back the seats of refunded travellers", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 1 }] });
    const busId = event.buses[0]!.id;
    const passenger = await createParticipant({ eventId: event.id, busId });
    const [payment] = await prisma.stripePayment.findMany();
    await prisma.stripeRefund.create({
      data: {
        stripeRefundId: "re_seed",
        amount: 40000,
        status: StripeRefundStatus.REFUNDED,
        participantId: passenger.id,
        originalPaymentId: payment!.id
      }
    });

    expect(await availableSeats(event.id, busId)).toBe(1);
    await bookAndPay(event.id, [participantInput(busId)]);
  });

  it("releases the seat when the payment fails", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 1 }] });
    const busId = event.buses[0]!.id;
    const clientSecret = await publicCaller().eventPayment.requestStripePayment({
      eventId: event.id,
      participants: [participantInput(busId)]
    });

    const res = await fakeStripe.failPayment(fakeStripe.paymentIntentByClientSecret(clientSecret).id);

    expect(res.status).toBe(201);
    expect(await availableSeats(event.id, busId)).toBe(1);
    await bookAndPay(event.id, [participantInput(busId)]);
  });

  it("rejects an unknown event", async () => {
    await expect(
      publicCaller().eventPayment.requestStripePayment({
        eventId: "does-not-exist",
        participants: [participantInput("some-bus")]
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Event not found" });
  });

  it("requires at least one traveller who accepted the terms", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;

    await expect(
      publicCaller().eventPayment.requestStripePayment({ eventId: event.id, participants: [] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      publicCaller().eventPayment.requestStripePayment({
        eventId: event.id,
        participants: [participantInput(busId, { consent: false })]
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await prisma.participant.count()).toBe(0);
  });

  // Known bug: only paid passengers are counted, so two people can pay for the last seat.
  // Intended: an unpaid booking holds its seat until the payment succeeds or fails.
  itKnownBug("holds the seat of a pending booking until the payment completes", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 1 }] });
    const busId = event.buses[0]!.id;
    await publicCaller().eventPayment.requestStripePayment({
      eventId: event.id,
      participants: [participantInput(busId)]
    });

    expect(await availableSeats(event.id, busId)).toBe(0);
    await expect(
      publicCaller().eventPayment.requestStripePayment({
        eventId: event.id,
        participants: [participantInput(busId)]
      })
    ).rejects.toMatchObject({ message: "BUS_FULL" });
  });

  // Known bug: the capacity check only looks at the event's own buses, so a bus id from
  // another event (or a made-up one) skips it entirely.
  itKnownBug("rejects a bus that belongs to another event", async () => {
    const event = await createEvent();
    const otherEvent = await createEvent({ buses: [{ name: "Buss 1", seats: 1 }] });
    const otherBusId = otherEvent.buses[0]!.id;
    await fillSeats(otherEvent.id, otherBusId, 1);

    await expect(
      publicCaller().eventPayment.requestStripePayment({
        eventId: event.id,
        participants: [participantInput(otherBusId)]
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("admin: add participant", () => {
  const adminInput = (eventId: string, busId: string) => {
    const { consent: _consent, ...input } = participantInput(busId);
    return { ...input, eventId };
  };

  it("is only available to admins", async () => {
    const event = await createEvent();
    const input = adminInput(event.id, event.buses[0]!.id);

    await expect(publicCaller().admin.addParticipant(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(userCaller().admin.addParticipant(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await prisma.participant.count()).toBe(0);
  });

  it("books a free seat without Stripe and emails the traveller", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 2 }] });
    const busId = event.buses[0]!.id;
    const input = adminInput(event.id, busId);

    await adminCaller().admin.addParticipant(input);

    const participant = await prisma.participant.findFirstOrThrow({ include: { stripePayments: true } });
    expect(participant).toMatchObject({ email: input.email, busId, payAmount: 0 });
    expect(participant.stripePayments).toEqual([
      expect.objectContaining({
        stripePaymentId: `admin-comp-${participant.id}`,
        amount: 0,
        status: StripePaymentStatus.SUCCEEDED
      })
    ]);
    expect(await availableSeats(event.id, busId)).toBe(1);
    expect(fakeStripe.requests()).toHaveLength(0);
    expect(getSentEmails().map((e) => e.to)).toEqual([input.email]);
  });

  it("rejects a full bus", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 1 }] });
    const busId = event.buses[0]!.id;
    await fillSeats(event.id, busId, 1);

    await expect(adminCaller().admin.addParticipant(adminInput(event.id, busId))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Bus is full"
    });
    expect(await prisma.participant.count()).toBe(1);
  });

  // Known bug: `if (!availableSeats)` lets a negative seat count through.
  itKnownBug("rejects an overbooked bus", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 1 }] });
    const busId = event.buses[0]!.id;
    await fillSeats(event.id, busId, 2);

    await expect(adminCaller().admin.addParticipant(adminInput(event.id, busId))).rejects.toMatchObject({
      message: "Bus is full"
    });
  });

  // Known bug: the bus isn't checked against `eventId`.
  itKnownBug("rejects a bus that belongs to another event", async () => {
    const event = await createEvent();
    const otherEvent = await createEvent();

    await expect(
      adminCaller().admin.addParticipant(adminInput(event.id, otherEvent.buses[0]!.id))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
