import { describe, expect, it } from "vitest";
import { adminCaller, publicCaller, userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, createParticipant, fillSeats } from "../helpers/factories";
import { availableSeats } from "../helpers/flows";
import { itKnownBug } from "../helpers/knownBug";

const setup = async ({ targetSeats = 2 }: { targetSeats?: number } = {}) => {
  const event = await createEvent({
    buses: [
      { name: "Buss 1", seats: 2 },
      { name: "Buss 2", seats: targetSeats }
    ]
  });
  const [currentBus, targetBus] = event.buses;
  const participant = await createParticipant({ eventId: event.id, busId: currentBus!.id });
  return { event, currentBus: currentBus!, targetBus: targetBus!, participant };
};

const busOf = async (participantId: string) =>
  (await prisma.participant.findUniqueOrThrow({ where: { id: participantId } })).busId;

describe("changing bus (traveller)", () => {
  const changeBus = (token: string | null, busId: string) =>
    publicCaller().eventPayment.changeBus({ token: token ?? "", busId });

  it("moves the traveller to a bus with a free seat", async () => {
    const { event, currentBus, targetBus, participant } = await setup();

    await expect(changeBus(participant.cancellationToken, targetBus.id)).resolves.toBe("ok");

    expect(await busOf(participant.id)).toBe(targetBus.id);
    expect(await availableSeats(event.id, currentBus.id)).toBe(2);
    expect(await availableSeats(event.id, targetBus.id)).toBe(1);
  });

  it("lists the buses with their free seats on the manage-booking page", async () => {
    const { currentBus, targetBus, participant } = await setup();

    const booking = await publicCaller().eventPayment.getManagableBooking({
      token: participant.cancellationToken!
    });

    expect(booking.buses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: currentBus.id, availableSeats: 1 }),
        expect.objectContaining({ id: targetBus.id, availableSeats: 2 })
      ])
    );
  });

  it("rejects a full bus", async () => {
    const { event, currentBus, targetBus, participant } = await setup();
    await fillSeats(event.id, targetBus.id, 2);

    await expect(changeBus(participant.cancellationToken, targetBus.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Bus is full"
    });
    expect(await busOf(participant.id)).toBe(currentBus.id);
  });

  it("rejects an unknown token or bus", async () => {
    const { targetBus, participant } = await setup();

    await expect(changeBus("not-a-token", targetBus.id)).rejects.toMatchObject({
      message: "Participant not found"
    });
    await expect(changeBus(participant.cancellationToken, "no-such-bus")).rejects.toMatchObject({
      message: "Bus not found"
    });
  });

  // Known bug: `if (!availableSeats)` lets a negative seat count through.
  itKnownBug("rejects an overbooked bus", async () => {
    const { event, targetBus, participant } = await setup({ targetSeats: 1 });
    await fillSeats(event.id, targetBus.id, 2);

    await expect(changeBus(participant.cancellationToken, targetBus.id)).rejects.toMatchObject({
      message: "Bus is full"
    });
  });

  // Known bug: the bus isn't checked against the traveller's event.
  itKnownBug("rejects a bus that belongs to another event", async () => {
    const { participant } = await setup();
    const otherEvent = await createEvent();

    await expect(
      changeBus(participant.cancellationToken, otherEvent.buses[0]!.id)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("changing bus (admin)", () => {
  it("is only available to admins", async () => {
    const { targetBus, participant } = await setup();
    const input = { participantId: participant.id, busId: targetBus.id };

    await expect(publicCaller().admin.changeBus(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(userCaller().admin.changeBus(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("moves the traveller to a bus with a free seat", async () => {
    const { targetBus, participant } = await setup();

    await adminCaller().admin.changeBus({ participantId: participant.id, busId: targetBus.id });

    expect(await busOf(participant.id)).toBe(targetBus.id);
  });

  it("rejects a full bus", async () => {
    const { event, currentBus, targetBus, participant } = await setup();
    await fillSeats(event.id, targetBus.id, 2);

    await expect(
      adminCaller().admin.changeBus({ participantId: participant.id, busId: targetBus.id })
    ).rejects.toMatchObject({ message: "Bus is full" });
    expect(await busOf(participant.id)).toBe(currentBus.id);
  });

  // Known bug: `if (!availableSeats)` lets a negative seat count through.
  itKnownBug("rejects an overbooked bus", async () => {
    const { event, targetBus, participant } = await setup({ targetSeats: 1 });
    await fillSeats(event.id, targetBus.id, 2);

    await expect(
      adminCaller().admin.changeBus({ participantId: participant.id, busId: targetBus.id })
    ).rejects.toMatchObject({ message: "Bus is full" });
  });
});
