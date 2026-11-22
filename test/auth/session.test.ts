import { Role } from "~/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { authBrowser, lastLoginCode } from "../helpers/auth";
import { prisma } from "../helpers/db";
import { createUser } from "../helpers/factories";

const signedInUser = async () => {
  const { user } = await createUser();
  const browser = authBrowser();
  await browser.sendCode(user.email);
  await browser.signIn(user.email, lastLoginCode(user.email)!);
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
});
