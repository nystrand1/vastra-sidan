import { addDays } from "date-fns";
import { type IncomingMessage } from "http";
import { Role } from "~/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { getServerAuthSession } from "~/server/auth";
import { authBrowser, loginCode } from "../helpers/auth";
import { prisma } from "../helpers/db";
import { createUser } from "../helpers/factories";

const signedInUser = async () => {
  const { user } = await createUser();
  const browser = authBrowser();
  await browser.sendCode(user.email);
  await browser.signIn(user.email, await loginCode(user.email));
  return { user, browser };
};

describe("the session", () => {
  it("reloads the profile from the database", async () => {
    const { user, browser } = await signedInUser();

    await prisma.user.update({
      where: { id: user.id },
      data: { firstName: "Bertil", lastName: "Bortafan", phone: "0711111111" }
    });

    expect((await browser.getSession())?.user).toMatchObject({
      id: user.id,
      firstName: "Bertil",
      lastName: "Bortafan",
      name: "Bertil Bortafan",
      phone: "0711111111",
      email: user.email,
      role: Role.USER
    });
  });

  it("picks up a role change made in the database", async () => {
    const { user, browser } = await signedInUser();

    await prisma.user.update({ where: { id: user.id }, data: { role: Role.ADMIN } });

    expect((await browser.getSession())?.user.role).toBe(Role.ADMIN);
  });

  it("ignores a role sent by the browser", async () => {
    const { user, browser } = await signedInUser();

    await browser.post("update-user", { role: Role.ADMIN, firstName: "Hacker" });

    expect((await browser.getSession())?.user).toMatchObject({
      role: Role.USER,
      firstName: user.firstName
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      role: Role.USER,
      firstName: user.firstName
    });
  });

  it("is not renewed when the server reads it, only by the browser", async () => {
    const { user, browser } = await signedInUser();
    // Signed in two days ago, so it is due for renewal
    const expiresAt = addDays(new Date(), 12);
    await prisma.session.updateMany({ data: { expiresAt } });

    const session = await getServerAuthSession({
      req: { headers: { cookie: browser.cookie() } } as IncomingMessage
    });

    expect(session?.user.id).toBe(user.id);
    expect((await prisma.session.findFirstOrThrow()).expiresAt).toEqual(expiresAt);

    await browser.getSession();

    expect((await prisma.session.findFirstOrThrow()).expiresAt.getTime()).toBeGreaterThan(
      expiresAt.getTime()
    );
  });
});

describe("the client address", () => {
  const addressOnSignIn = async (forwardedFor: string) => {
    const { user } = await createUser();
    const browser = authBrowser({ "x-forwarded-for": forwardedFor });
    await browser.sendCode(user.email);
    await browser.signIn(user.email, await loginCode(user.email));
    return (await prisma.session.findFirstOrThrow()).ipAddress;
  };

  it("is the address the proxy added, not one the client sent", async () => {
    expect(await addressOnSignIn("1.2.3.4, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("skips local proxy hops", async () => {
    expect(await addressOnSignIn("203.0.113.7, 127.0.0.1")).toBe("203.0.113.7");
  });
});
