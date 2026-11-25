import { describe, expect, it } from "vitest";
import { normaliseStoredEmails } from "~/server/utils/accounts/normaliseStoredEmails";
import { normaliseEmail } from "~/utils/email";
import { prisma } from "../helpers/db";
import {
  createEvent,
  createSeason,
  memberSignupInput,
  participantInput
} from "../helpers/factories";
import { bookAndPay, signUpAndPay } from "../helpers/flows";

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail(" Anna@Exempel.SE ")).toBe("anna@exempel.se");
  });
});

describe("email normalisation on input", () => {
  it("stores booking emails lowercased", async () => {
    const event = await createEvent();
    const { participants } = await bookAndPay(event.id, [
      participantInput(event.buses[0]!.id, { email: " Anna@Exempel.se" })
    ]);

    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({
      email: "anna@exempel.se",
      userEmail: "anna@exempel.se"
    });
  });

  it("stores membership emails lowercased", async () => {
    const { regular } = await createSeason();

    await signUpAndPay(memberSignupInput(regular, { email: "Bo@Exempel.se" }));

    const member = await prisma.member.findFirstOrThrow();
    expect(member.email).toBe("bo@exempel.se");
  });
});

describe("normaliseStoredEmails", () => {
  const participantData = async (email: string) => {
    const event = await createEvent();
    return {
      name: "Ced",
      email,
      phone: "0700000000",
      eventId: event.id,
      busId: event.buses[0]!.id
    };
  };
  const memberData = (email: string) => ({
    firstName: "E",
    lastName: "X",
    phone: "0700000000",
    email
  });

  it("normalises stored emails", async () => {
    const participant = await prisma.participant.create({
      data: await participantData("Ced@X.se ")
    });
    const transfer = await prisma.participantTransfer.create({
      data: {
        participantId: participant.id,
        previousToken: "t",
        fromName: "A",
        fromEmail: " From@X.se",
        fromPhone: "1",
        toName: "D",
        toEmail: "D@X.SE",
        toPhone: "2"
      }
    });

    const result = await normaliseStoredEmails(prisma);

    expect(result.collisions).toEqual([]);
    expect(result.updated.Participant).toBeGreaterThanOrEqual(1);
    expect(result.updated.ParticipantTransfer).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.participant.findUniqueOrThrow({ where: { id: participant.id } })).email
    ).toBe("ced@x.se");
    expect(
      await prisma.participantTransfer.findUniqueOrThrow({ where: { id: transfer.id } })
    ).toMatchObject({ fromEmail: "from@x.se", toEmail: "d@x.se" });
  });

  it("only reports counts on a dry run", async () => {
    const participant = await prisma.participant.create({
      data: await participantData("Ced@X.se")
    });

    const result = await normaliseStoredEmails(prisma, { dryRun: true });

    expect(result.updated.Participant).toBe(1);
    expect(
      (await prisma.participant.findUniqueOrThrow({ where: { id: participant.id } })).email
    ).toBe("Ced@X.se");
  });

  it("refuses to normalise when two members would collide", async () => {
    // The email columns are utf8mb4_unicode_ci, so case alone can't collide...
    await prisma.member.create({ data: memberData("e@x.se") });
    await expect(prisma.member.create({ data: memberData("E@x.se") })).rejects.toThrow();
    // ...but leading whitespace can, since only trailing spaces are ignored.
    const [a, b] = await Promise.all([
      prisma.member.findFirstOrThrow(),
      prisma.member.create({ data: memberData(" e@x.se") })
    ]);
    const other = await prisma.participant.create({ data: await participantData("Zed@X.se") });

    const result = await normaliseStoredEmails(prisma);

    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]).toMatchObject({ table: "Member", email: "e@x.se" });
    expect([...result.collisions[0]!.ids].sort()).toEqual([a.id, b.id].sort());
    expect((await prisma.member.findUniqueOrThrow({ where: { id: b.id } })).email).toBe(" e@x.se");
    expect(
      (await prisma.participant.findUniqueOrThrow({ where: { id: other.id } })).email
    ).toBe("Zed@X.se");
  });
});
