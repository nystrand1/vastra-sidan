import { describe, expect, it } from "vitest";
import { userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, participantInput } from "../helpers/factories";
import { bookAndPay } from "../helpers/flows";
import { getSentEmails } from "../mocks/ses";
import { fakeStripe } from "../mocks/stripe";

const payer = "konto@test.se";
const summarySubject = (eventName: string) => `Din bokning: ${eventName}`;

/** A signed-in user pays for the given travellers, and Stripe confirms the payment. */
const bookAsSignedIn = async (
  email: string,
  travellers: ReturnType<typeof participantInput>[],
  eventId: string
) => {
  const clientSecret = await userCaller({ email }).eventPayment.requestStripePayment({
    eventId,
    participants: travellers
  });
  const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientSecret);
  const res = await fakeStripe.succeedPayment(paymentIntent.id);
  expect(res.status).toBe(201);
  return prisma.participant.findMany({
    where: { stripePayments: { some: { stripePaymentId: paymentIntent.id } } }
  });
};

describe("confirmation to a payer who isn't travelling", () => {
  it("sends the signed-in payer a summary of the seats they booked", async () => {
    const event = await createEvent({ name: "Bortamatch mot Gais" });
    const busId = event.buses[0]!.id;
    const travellers = [
      participantInput(busId, { firstName: "Bo", lastName: "Berg" }),
      participantInput(busId, { firstName: "Cia", lastName: "Cederlund" })
    ];

    const booked = await bookAsSignedIn(payer, travellers, event.id);

    const emails = getSentEmails();
    const summaries = emails.filter((e) => e.to === payer);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;
    expect(summary.subject).toBe(summarySubject("Bortamatch mot Gais"));
    expect(summary.html).toContain("Bo Berg");
    expect(summary.html).toContain("Cia Cederlund");
    expect(summary.html).toContain(`${process.env.WEBSITE_URL}/mina-bussresor`);
    // The travellers still get their own confirmations
    for (const t of travellers) {
      expect(emails.some((e) => e.to === t.email)).toBe(true);
    }
    // The payer manages the seats from the account; the email carries no manage links
    for (const p of booked) {
      expect(summary.html).not.toContain(p.cancellationToken!);
    }
  });

  it("sends no summary when the signed-in payer is one of the travellers", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;

    await bookAsSignedIn(
      payer,
      [participantInput(busId, { email: "Konto@Test.se" }), participantInput(busId)],
      event.id
    );

    const toPayer = getSentEmails().filter((e) => e.to === payer);
    expect(toPayer).toHaveLength(1);
    expect(toPayer[0]!.subject).not.toBe(summarySubject(event.name));
  });

  it("sends no summary for a guest booking", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const travellers = [participantInput(busId), participantInput(busId)];

    await bookAndPay(event.id, travellers);

    expect(getSentEmails()).toHaveLength(travellers.length);
    expect(getSentEmails().some((e) => e.subject === summarySubject(event.name))).toBe(false);
  });

  it("sends the summary once when Stripe delivers the payment twice", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const clientSecret = await userCaller({ email: payer }).eventPayment.requestStripePayment({
      eventId: event.id,
      participants: [participantInput(busId)]
    });
    const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientSecret);
    await fakeStripe.succeedPayment(paymentIntent.id);
    const [succeededEvent] = fakeStripe.events();
    const res = await fakeStripe.redeliver(succeededEvent!.id);
    expect(res.status).toBe(201);

    expect(getSentEmails().filter((e) => e.to === payer)).toHaveLength(1);
  });
});
