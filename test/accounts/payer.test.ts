import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { backfillPayerEmails } from "~/server/utils/accounts/backfillPayerEmails";
import { stripe } from "~/server/stripe";
import { adminCaller, publicCaller, userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, participantInput } from "../helpers/factories";
import { bookAndPay } from "../helpers/flows";
import { server } from "../mocks/server";
import { fakeStripe } from "../mocks/stripe";

const paymentFor = (stripePaymentId: string) =>
  prisma.stripePayment.findFirstOrThrow({ where: { stripePaymentId } });

describe("payer of a booking", () => {
  it("records the first traveller as payer of a guest booking", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const a = participantInput(busId, { email: "A@Test.se" });
    const b = participantInput(busId);
    const { paymentIntent } = await bookAndPay(event.id, [a, b]);

    expect((await paymentFor(paymentIntent.id)).payerEmail).toBe("a@test.se");
  });

  it("records the signed-in user as payer even when they are not the first traveller", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const clientSecret = await userCaller({ email: "Konto@test.se" }).eventPayment.requestStripePayment({
      eventId: event.id,
      participants: [participantInput(busId), participantInput(busId)]
    });
    const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientSecret);

    expect((await paymentFor(paymentIntent.id)).payerEmail).toBe("konto@test.se");
  });

  it("records an admin-added traveller as their own payer", async () => {
    const event = await createEvent();
    await adminCaller().admin.addParticipant({
      eventId: event.id,
      firstName: "Ada",
      lastName: "Admin",
      email: "Ada@Test.se",
      phone: "0700000000",
      busId: event.buses[0]!.id,
      member: false,
      youth: false
    });

    const payment = await prisma.stripePayment.findFirstOrThrow({
      where: { stripePaymentId: { startsWith: "admin-comp-" } }
    });
    expect(payment.payerEmail).toBe("ada@test.se");
  });
});

describe("payer across the payment's status history", () => {
  it("keeps the payer on the paid record", async () => {
    const event = await createEvent();
    const { paymentIntent } = await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);

    const rows = await prisma.stripePayment.findMany({
      where: { stripePaymentId: paymentIntent.id }
    });
    expect(rows.map((r) => r.status).sort()).toEqual(["CREATED", "SUCCEEDED"]);
    expect(rows.every((r) => r.payerEmail !== null)).toBe(true);
  });

  it("keeps the payer on the cancelled record", async () => {
    const event = await createEvent();
    const clientSecret = await publicCaller().eventPayment.requestStripePayment({
      eventId: event.id,
      participants: [participantInput(event.buses[0]!.id)]
    });
    const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientSecret);
    await fakeStripe.failPayment(paymentIntent.id);

    const rows = await prisma.stripePayment.findMany({
      where: { stripePaymentId: paymentIntent.id }
    });
    expect(rows.map((r) => r.status).sort()).toEqual(["CANCELED", "CREATED"]);
    expect(rows.every((r) => r.payerEmail !== null)).toBe(true);
  });
});

describe("backfillPayerEmails", () => {
  const bookTwo = async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const { paymentIntent, participants } = await bookAndPay(event.id, [
      participantInput(busId),
      participantInput(busId)
    ]);
    await prisma.stripePayment.updateMany({ data: { payerEmail: null } });
    return { paymentIntent, participants };
  };

  it("backfills the payer from the Stripe customer", async () => {
    const { paymentIntent } = await bookTwo();
    fakeStripe.customers().find((c) => c.id === paymentIntent.customer)!.email = "betalare@x.se";

    const result = await backfillPayerEmails(prisma, stripe);

    expect(result).toEqual({ fromStripe: 1, fromFirstTraveller: 0, adminComp: 0 });
    expect((await paymentFor(paymentIntent.id)).payerEmail).toBe("betalare@x.se");
  });

  it("falls back to the first-created traveller", async () => {
    const { paymentIntent, participants } = await bookTwo();
    // Stripe no longer knows the payment
    await prisma.stripePayment.updateMany({ data: { stripePaymentId: "pi_gone" } });
    // Same createdAt: the lowest id wins
    const sameTime = new Date();
    await prisma.participant.updateMany({ data: { createdAt: sameTime } });
    const first = [...participants].sort((x, y) => x.id.localeCompare(y.id))[0]!;

    const result = await backfillPayerEmails(prisma, stripe);

    expect(result).toEqual({ fromStripe: 0, fromFirstTraveller: 1, adminComp: 0 });
    expect((await paymentFor("pi_gone")).payerEmail).toBe(first.email);
    expect(paymentIntent.id).not.toBe("pi_gone");
  });

  it("uses the earliest created traveller when times differ", async () => {
    const { participants } = await bookTwo();
    await prisma.stripePayment.updateMany({ data: { stripePaymentId: "pi_gone" } });
    const [p1, p2] = participants;
    await prisma.participant.update({
      where: { id: p1!.id },
      data: { createdAt: new Date("2026-01-02") }
    });
    await prisma.participant.update({
      where: { id: p2!.id },
      data: { createdAt: new Date("2026-01-01") }
    });

    await backfillPayerEmails(prisma, stripe);

    expect((await paymentFor("pi_gone")).payerEmail).toBe(p2!.email);
  });

  it("aborts without writing a payer when Stripe fails", async () => {
    await bookTwo();
    server.use(
      http.get("https://api.stripe.com/v1/payment_intents/:id", () =>
        HttpResponse.json({ error: { type: "api_error", message: "Boom" } }, { status: 500 })
      )
    );

    await expect(backfillPayerEmails(prisma, stripe)).rejects.toThrow();

    const payments = await prisma.stripePayment.findMany();
    expect(payments.every((p) => p.payerEmail === null)).toBe(true);
  });

  it("backfills admin bookings without calling Stripe", async () => {
    const event = await createEvent();
    await adminCaller().admin.addParticipant({
      eventId: event.id,
      firstName: "Ada",
      lastName: "Admin",
      email: "ada@test.se",
      phone: "0700000000",
      busId: event.buses[0]!.id,
      member: false,
      youth: false
    });
    await prisma.stripePayment.updateMany({ data: { payerEmail: null } });
    const before = fakeStripe.requests().length;

    const result = await backfillPayerEmails(prisma, stripe);

    expect(result).toEqual({ fromStripe: 0, fromFirstTraveller: 0, adminComp: 1 });
    expect(fakeStripe.requests()).toHaveLength(before);
    const payment = await prisma.stripePayment.findFirstOrThrow();
    expect(payment.payerEmail).toBe("ada@test.se");
  });

  it("running the backfill twice changes nothing", async () => {
    await bookTwo();
    await backfillPayerEmails(prisma, stripe);
    const afterFirst = await prisma.stripePayment.findMany({ orderBy: { id: "asc" } });

    const second = await backfillPayerEmails(prisma, stripe);

    expect(second).toEqual({ fromStripe: 0, fromFirstTraveller: 0, adminComp: 0 });
    expect(await prisma.stripePayment.findMany({ orderBy: { id: "asc" } })).toEqual(afterFirst);
  });
});
