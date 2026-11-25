import { Role } from "~/generated/prisma/client";
import { subMinutes } from "date-fns";
import { http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { featureFlags } from "~/utils/featureFlags";
import { authBrowser, loginCode, settleLoginCodes } from "../helpers/auth";
import { prisma } from "../helpers/db";
import { createSeason, createUser } from "../helpers/factories";
import { server } from "../mocks/server";
import { getSentEmails, SES_URL } from "../mocks/ses";

const signedIn = async (email: string) => {
  const browser = authBrowser();
  await browser.sendCode(email);
  await browser.signIn(email, await loginCode(email));
  return browser;
};

/** Any 6-digit code that isn't `code`. */
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

describe("signing in with an email code", () => {
  afterEach(() => {
    featureFlags.ENABLE_LOGIN = true;
  });

  it("signs in with a code sent by email and creates the account", async () => {
    const browser = authBrowser();

    await browser.sendCode("ny@x.se");

    const code = await loginCode("ny@x.se");
    expect(code).toMatch(/^\d{6}$/);
    expect(getSentEmails()).toEqual([
      expect.objectContaining({ to: "ny@x.se", subject: "Din inloggningskod till Västra Sidan" })
    ]);

    expect((await browser.signIn("ny@x.se", code)).status).toBe(200);

    expect((await browser.getSession())?.user).toMatchObject({
      email: "ny@x.se",
      role: Role.USER,
      isMember: false
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { email: "ny@x.se" } })).toMatchObject({
      emailVerified: true,
      role: Role.USER
    });
  });

  it("links to the sign-in page with the email and code in the fragment", async () => {
    await authBrowser().sendCode("anna+vss@x.se");
    const code = await loginCode("anna+vss@x.se");

    const [email] = getSentEmails();

    // The fragment never reaches the server log, analytics or Sentry
    expect(email?.html).toContain(
      `href="${process.env.BETTER_AUTH_URL}/loggain#email=anna%2Bvss%40x.se&amp;kod=${code}"`
    );
    expect(email?.html).not.toContain("loggain?");
  });

  it("normalises the email", async () => {
    const browser = authBrowser();

    await browser.sendCode(" Ny@X.se ");
    await browser.signIn("ny@x.se", await loginCode("ny@x.se"));

    expect((await browser.getSession())?.user.email).toBe("ny@x.se");
    expect(await prisma.user.findMany({ select: { email: true } })).toEqual([{ email: "ny@x.se" }]);
  });

  it("rejects a wrong code", async () => {
    const browser = authBrowser();
    await browser.sendCode("ny@x.se");

    const { status } = await browser.signIn("ny@x.se", wrong(await loginCode("ny@x.se")));

    expect(status).toBe(400);
    expect(await browser.getSession()).toBeNull();
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects an expired code", async () => {
    const browser = authBrowser();
    await browser.sendCode("ny@x.se");
    await prisma.verification.updateMany({ data: { expiresAt: subMinutes(new Date(), 1) } });

    const { status } = await browser.signIn("ny@x.se", await loginCode("ny@x.se"));

    expect(status).toBe(400);
    expect(await browser.getSession()).toBeNull();
  });

  it("locks the code after 3 wrong attempts", async () => {
    const browser = authBrowser();
    await browser.sendCode("ny@x.se");
    const code = await loginCode("ny@x.se");

    for (let i = 0; i < 3; i++) {
      expect((await browser.signIn("ny@x.se", wrong(code))).status).toBe(400);
    }

    expect((await browser.signIn("ny@x.se", code)).status).toBe(403);
    expect(await browser.getSession()).toBeNull();
  });

  it("answers the same for known and unknown emails", async () => {
    const { user } = await createUser();

    const known = await authBrowser().sendCode(user.email);
    const unknown = await authBrowser().sendCode("okand@x.se");

    expect(known).toEqual(unknown);
  });

  it("does not let sign-up set the role", async () => {
    const browser = authBrowser();
    await browser.sendCode("ny@x.se");

    await browser.post("sign-in/email-otp", {
      email: "ny@x.se",
      otp: await loginCode("ny@x.se"),
      role: Role.ADMIN
    });

    expect((await browser.getSession())?.user.role).toBe(Role.USER);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "ny@x.se" } })).role).toBe(Role.USER);
  });

  it("with login disabled, sends a code only to admins", async () => {
    featureFlags.ENABLE_LOGIN = false;
    const { user } = await createUser();
    const { user: admin } = await createUser({ role: Role.ADMIN });

    const forUnknown = await authBrowser().sendCode("okand@x.se");
    const forUser = await authBrowser().sendCode(user.email);
    await settleLoginCodes();
    expect(getSentEmails()).toEqual([]);

    const adminBrowser = authBrowser();
    const forAdmin = await adminBrowser.sendCode(admin.email);
    const adminCode = await loginCode(admin.email);

    expect(forUnknown).toEqual(forAdmin);
    expect(forUser).toEqual(forAdmin);
    expect(getSentEmails().map((e) => e.to)).toEqual([admin.email]);
    expect(await prisma.user.count()).toBe(2);

    await adminBrowser.signIn(admin.email, adminCode);
    expect((await adminBrowser.getSession())?.user).toMatchObject({
      email: admin.email,
      role: Role.ADMIN
    });
  });

  it("with login disabled, does not create an account even with a valid code", async () => {
    const browser = authBrowser();
    await browser.sendCode("ny@x.se");
    const code = await loginCode("ny@x.se");
    featureFlags.ENABLE_LOGIN = false;

    const { status } = await browser.signIn("ny@x.se", code);

    expect(status).toBe(403);
    expect(await browser.getSession()).toBeNull();
    expect(await prisma.user.count()).toBe(0);
  });

  it("with login disabled, does not sign in an existing user even with a valid code", async () => {
    const { user } = await createUser();
    const browser = authBrowser();
    await browser.sendCode(user.email);
    const code = await loginCode(user.email);
    featureFlags.ENABLE_LOGIN = false;

    const { status } = await browser.signIn(user.email, code);

    expect(status).toBe(403);
    expect(await browser.getSession()).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it("with login disabled, answers an admin before their code is sent", async () => {
    featureFlags.ENABLE_LOGIN = false;
    const { user: admin } = await createUser({ role: Role.ADMIN });
    // Hold the email in SES until the answer is back
    let releaseEmail = () => {};
    const emailReleased = new Promise<void>((resolve) => (releaseEmail = resolve));
    server.use(
      http.post(SES_URL, async () => {
        await emailReleased;
      })
    );

    const forUnknown = await authBrowser().sendCode("okand@x.se");
    const forAdmin = await authBrowser().sendCode(admin.email);

    expect(forAdmin).toEqual(forUnknown);
    expect(getSentEmails()).toEqual([]);
    releaseEmail();
    expect(await loginCode(admin.email)).toMatch(/^\d{6}$/);
  });

  it("revokes every session", async () => {
    const { user } = await createUser();
    const laptop = await signedIn(user.email);
    const phone = await signedIn(user.email);
    expect(await laptop.getSession()).not.toBeNull();
    expect(await phone.getSession()).not.toBeNull();

    await phone.revokeSessions();

    expect(await laptop.getSession()).toBeNull();
    expect(await phone.getSession()).toBeNull();
  });

  it("puts membership status on the session", async () => {
    const { regular } = await createSeason();
    const { user } = await createUser();
    await prisma.member.create({
      data: {
        firstName: "Anna",
        lastName: "Medlem",
        email: user.email,
        phone: "0700000000",
        memberships: { connect: { id: regular.id } }
      }
    });

    const browser = await signedIn(user.email);

    expect((await browser.getSession())?.user.isMember).toBe(true);
  });
});
