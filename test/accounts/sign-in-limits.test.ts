import { describe, expect, it } from "vitest";
import { authBrowser, lastLoginCode, loginCode, settleLoginCodes } from "../helpers/auth";
import { prisma } from "../helpers/db";
import { getSentEmails } from "../mocks/ses";

const loginEmailsTo = (email: string) => getSentEmails().filter((e) => e.to === email);

/** Any 6-digit code that isn't `code`. */
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

describe("sign-in limits per email", () => {
  it("sends at most 5 codes an hour to one email, and answers the 6th the same", async () => {
    const browser = authBrowser();
    const answers = [];
    for (let i = 0; i < 5; i++) {
      answers.push(await browser.sendCode("anna@x.se"));
      await loginCode("anna@x.se");
    }
    const fifthCode = lastLoginCode("anna@x.se")!;
    const storedCodes = await prisma.verification.findMany();

    const sixth = await browser.sendCode(" Anna@X.se ");
    await settleLoginCodes();

    expect(sixth).toEqual(answers[0]);
    expect(loginEmailsTo("anna@x.se")).toHaveLength(5);
    // No new code was made either: the last one sent still works
    expect(await prisma.verification.findMany()).toEqual(storedCodes);
    expect((await browser.signIn("anna@x.se", fifthCode)).status).toBe(200);
  });

  it("counts each email on its own", async () => {
    for (let i = 0; i < 5; i++) {
      await authBrowser().sendCode("anna@x.se");
    }

    await authBrowser().sendCode("bertil@x.se");

    expect(await loginCode("bertil@x.se")).toMatch(/^\d{6}$/);
  });

  it("rejects even the right code after 15 failed sign-ins in an hour", async () => {
    const browser = authBrowser();
    const failed = [];
    for (let i = 0; i < 15; i++) {
      failed.push(await browser.signIn("anna@x.se", "123456"));
    }
    await browser.sendCode("anna@x.se");
    const code = await loginCode("anna@x.se");

    const withRightCode = await browser.signIn("anna@x.se", code);

    expect(withRightCode).toEqual(failed[0]);
    expect(withRightCode.status).toBe(400);
    expect(await browser.getSession()).toBeNull();
    // Another email is not affected
    const other = authBrowser();
    await other.sendCode("bertil@x.se");
    expect((await other.signIn("bertil@x.se", await loginCode("bertil@x.se"))).status).toBe(200);
  });

  it("counts wrong codes towards the limit", async () => {
    const browser = authBrowser();
    // 4 codes, each locked by 3 wrong attempts, then 3 more tries: 15 failures
    for (let i = 0; i < 4; i++) {
      await browser.sendCode("anna@x.se");
      const code = await loginCode("anna@x.se");
      for (let a = 0; a < 3; a++) await browser.signIn("anna@x.se", wrong(code));
    }
    for (let a = 0; a < 3; a++) await browser.signIn("anna@x.se", "123456");
    await browser.sendCode("anna@x.se");
    await settleLoginCodes();
    expect(loginEmailsTo("anna@x.se")).toHaveLength(5);

    const { status } = await browser.signIn("anna@x.se", lastLoginCode("anna@x.se")!);

    expect(status).toBe(400);
    expect(await browser.getSession()).toBeNull();
  });
});
