import { describe, expect, it } from "vitest";
import { publicCaller, userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, participantInput } from "../helpers/factories";
import { bookAndPay } from "../helpers/flows";
import { fakeStripe } from "../mocks/stripe";

const view = (token: string | null) =>
  publicCaller().eventPayment.getManagableBooking({ token: token ?? "" });

const newHolder = {
  firstName: "Doris",
  lastName: "Ny",
  email: "doris@test.se",
  phone: "0701112233",
  consent: true
};

const transfer = (token: string | null) =>
  publicCaller().eventPayment.transferBooking({ token: token ?? "", ...newHolder });

/** Three paid travellers on one payment. The first (A) is the payer. */
const bookThree = async (overrides: Parameters<typeof participantInput>[1][] = []) => {
  const event = await createEvent();
  const busId = event.buses[0]!.id;
  const { participants } = await bookAndPay(
    event.id,
    [0, 1, 2].map((i) => participantInput(busId, overrides[i]))
  );
  const [a, b, c] = participants;
  return { a: a!, b: b!, c: c! };
};

describe("who a booking link manages", () => {
  it("shows the payer's link every seat", async () => {
    const { a } = await bookThree();

    const { participants } = await view(a.cancellationToken);

    expect(participants).toHaveLength(3);
    for (const p of participants) expect(p.cancellationToken).toBeTruthy();
  });

  it("shows a traveller's link only their own seat", async () => {
    const { b } = await bookThree();

    const { participants } = await view(b.cancellationToken);

    expect(participants).toEqual([expect.objectContaining({ cancellationToken: b.cancellationToken })]);
    expect(participants).toHaveLength(1);
  });

  it("shows every link that shares the payer's email the whole booking", async () => {
    const { a, b, c } = await bookThree([{ email: "Delad@test.se" }, {}, { email: "delad@test.se" }]);

    expect((await view(a.cancellationToken)).participants).toHaveLength(3);
    expect((await view(c.cancellationToken)).participants).toHaveLength(3);
    expect((await view(b.cancellationToken)).participants).toHaveLength(1);
  });

  it("shows the first traveller only their own seat when a signed-in user paid", async () => {
    const event = await createEvent();
    const busId = event.buses[0]!.id;
    const clientSecret = await userCaller({ email: "konto@test.se" }).eventPayment.requestStripePayment({
      eventId: event.id,
      participants: [participantInput(busId), participantInput(busId)]
    });
    const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientSecret);
    await fakeStripe.succeedPayment(paymentIntent.id);
    const [a] = await prisma.participant.findMany({
      where: { stripePayments: { some: { stripePaymentId: paymentIntent.id } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    const { participants } = await view(a!.cancellationToken);

    expect(participants).toEqual([expect.objectContaining({ cancellationToken: a!.cancellationToken })]);
  });

  it("shows the payer's old link the rest of the group after the payer's seat is transferred", async () => {
    const { a, b, c } = await bookThree();
    await transfer(a.cancellationToken);

    const booking = await view(a.cancellationToken);

    expect(booking.transferredAway).toBe(true);
    expect(booking.participants.map((p) => p.cancellationToken).sort()).toEqual(
      [b.cancellationToken, c.cancellationToken].sort()
    );
    for (const p of booking.participants) expect(p.cancellationToken).toBeTruthy();
  });

  it("shows a traveller's old link nothing after their seat is transferred", async () => {
    const { b } = await bookThree();
    await transfer(b.cancellationToken);

    const booking = await view(b.cancellationToken);

    expect(booking.transferredAway).toBe(true);
    expect(booking.participants).toEqual([]);
  });

  it("does not let a traveller act on another seat", async () => {
    const { a, b, c } = await bookThree();

    const booking = await view(b.cancellationToken);
    const json = JSON.stringify(booking);

    expect(json).not.toContain(a.cancellationToken);
    expect(json).not.toContain(c.cancellationToken);
  });
});
