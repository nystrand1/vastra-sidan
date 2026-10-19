import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { authBrowser } from "../helpers/auth";
import { prisma } from "../helpers/db";
import { createUser } from "../helpers/factories";

describe("session update", () => {
  it("ignores a role, email or membership sent by the browser", async () => {
    const { user, password } = await createUser();
    const other = await createUser();
    const browser = authBrowser();
    await browser.signIn(user.email!, password);
    expect((await browser.getSession())?.user).toMatchObject({ email: user.email, role: Role.USER });

    await browser.updateSession({
      user: { role: Role.ADMIN, email: other.user.email, isMember: true, firstName: "Hacker" }
    });

    const session = await browser.getSession();
    expect(session?.user).toMatchObject({
      email: user.email,
      role: Role.USER,
      isMember: false,
      firstName: user.firstName
    });
  });

  it("reloads the profile from the database", async () => {
    const { user, password } = await createUser();
    const browser = authBrowser();
    await browser.signIn(user.email!, password);

    // The profile page saves through tRPC, then calls `update()` to refresh the session.
    await prisma.user.update({
      where: { id: user.id },
      data: { firstName: "Bertil", lastName: "Bortafan", phone: "0711111111", email: "ny@test.se" }
    });
    await browser.updateSession();

    expect((await browser.getSession())?.user).toMatchObject({
      firstName: "Bertil",
      lastName: "Bortafan",
      name: "Bertil Bortafan",
      phone: "0711111111",
      email: "ny@test.se",
      role: Role.USER
    });
  });

  it("picks up a role change made in the database", async () => {
    const { user, password } = await createUser();
    const browser = authBrowser();
    await browser.signIn(user.email!, password);

    await prisma.user.update({ where: { id: user.id }, data: { role: Role.ADMIN } });
    await browser.updateSession();

    expect((await browser.getSession())?.user.role).toBe(Role.ADMIN);
  });
});
