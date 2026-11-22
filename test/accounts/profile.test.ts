import { StripePaymentStatus } from "~/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { authBrowser, lastLoginCode } from "../helpers/auth";
import { userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, createUser } from "../helpers/factories";

const book = async (eventId: string, data: { name: string; email: string; userEmail?: string }) =>
  prisma.participant.create({
    data: { phone: "0709999999", eventId, busId: null, ...data }
  });

describe("profile prefill", () => {
  it("prefills from the latest membership", async () => {
    const caller = userCaller();
    const email = "user@test.vastrasidan.se";
    await prisma.member.create({
      data: { firstName: "Karin", lastName: "Medlem", email, phone: "0701112233" }
    });

    expect(await caller.user.getProfilePrefill()).toEqual({
      firstName: "Karin",
      lastName: "Medlem",
      phone: "0701112233"
    });
  });

  it("prefills from the latest booking when there is no membership", async () => {
    const event = await createEvent();
    await book(event.id, { name: "Anna Maria Svensson", email: "user@test.vastrasidan.se" });

    expect(await userCaller().user.getProfilePrefill()).toEqual({
      firstName: "Anna",
      lastName: "Maria Svensson",
      phone: "0709999999"
    });
  });

  it("never prefills from another email", async () => {
    const event = await createEvent();
    await book(event.id, { name: "Anna Svensson", email: "other@x.se" });
    await prisma.member.create({
      data: { firstName: "Karin", lastName: "Medlem", email: "other@x.se", phone: "0701112233" }
    });

    expect(await userCaller().user.getProfilePrefill()).toBeNull();
  });
});

describe("updating the profile", () => {
  it("saves the profile and keeps the email", async () => {
    const { user } = await createUser();
    const caller = userCaller({ id: user.id, email: user.email });

    await caller.user.updateProfile({ firstName: "Bertil", lastName: "Bortafan", phone: "0701234567" });

    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      firstName: "Bertil",
      lastName: "Bortafan",
      name: "Bertil Bortafan",
      phone: "0701234567",
      email: user.email
    });

    // An email in the input is ignored, never written.
    await caller.user.updateProfile({
      firstName: "Bertil",
      lastName: "Bortafan",
      phone: "0701234567",
      email: "kapad@x.se"
    } as never);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(user.email);
    expect(await prisma.user.findUnique({ where: { email: "kapad@x.se" } })).toBeNull();
  });
});

describe("deleting the account", () => {
  it("deletes the account but keeps bookings and memberships", async () => {
    const email = "radera@x.se";
    const browser = authBrowser();
    await browser.sendCode(email);
    await browser.signIn(email, lastLoginCode(email)!);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.passkey.create({
      data: {
        userId: user.id,
        publicKey: "k",
        credentialID: "c",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false
      }
    });

    const event = await createEvent();
    const participant = await book(event.id, { name: "Radera Mig", email, userEmail: email });
    const payment = await prisma.stripePayment.create({
      data: {
        stripePaymentId: "pi_radera",
        amount: 40000,
        status: StripePaymentStatus.SUCCEEDED,
        payerEmail: email,
        userId: user.id,
        participants: { connect: { id: participant.id } }
      }
    });
    const member = await prisma.member.create({
      data: { firstName: "Radera", lastName: "Mig", email, phone: "0700000000" }
    });

    expect(await browser.getSession()).not.toBeNull();
    expect(await userCaller({ id: user.id, email }).user.deleteAccount()).toEqual({ status: 200 });

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.account.count()).toBe(0);
    expect(await prisma.passkey.count()).toBe(0);
    expect(await prisma.participant.findUniqueOrThrow({ where: { id: participant.id } })).toMatchObject({
      userEmail: email
    });
    expect(await prisma.stripePayment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
      payerEmail: email,
      status: StripePaymentStatus.SUCCEEDED
    });
    expect(await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({ email });
    expect(await browser.getSession()).toBeNull();
  });
});
