import { expect } from "vitest";
import { auth, loginCodesDelivered, toAppSession } from "~/server/auth";
import { getSentEmails } from "../mocks/ses";

type CustomSession = Parameters<typeof toAppSession>[0];

/**
 * A browser talking to the real Better Auth handler (/api/auth/*), keeping its
 * cookies between requests like a browser would. `headers` go on every request
 * (e.g. the `x-forwarded-for` the proxy adds).
 */
export const authBrowser = (headers: Record<string, string> = {}) => {
  const cookies = new Map<string, string>();
  const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");

  const request = async (method: "GET" | "POST", path: string, body?: object) => {
    const response = await auth.handler(
      new Request(`${process.env.BETTER_AUTH_URL}/api/auth/${path}`, {
        method,
        headers: {
          ...headers,
          origin: process.env.WEBSITE_URL!,
          cookie: cookieHeader(),
          ...(body && { "content-type": "application/json" })
        },
        body: body && JSON.stringify(body)
      })
    );

    for (const header of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = header.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1);
      const expired = attributes.some((a) => a.trim().toLowerCase() === "max-age=0");
      if (value && !expired) cookies.set(name, value);
      else cookies.delete(name);
    }

    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  };

  return {
    /** The Cookie header this browser sends. */
    cookie: cookieHeader,
    /** Any POST to the auth API, e.g. one the app's own pages would never send. */
    post: (path: string, body: object) => request("POST", path, body),
    /** Asks for a sign-in code by email. */
    sendCode: (email: string) =>
      request("POST", "email-otp/send-verification-otp", { email, type: "sign-in" }),
    /** Signs in (or up) with the code from the email. */
    signIn: async (email: string, otp: string) => {
      const { status, body } = await request("POST", "sign-in/email-otp", { email, otp });
      return { status, body };
    },
    /** What the app sees as the session, or null when signed out. */
    getSession: async () => {
      const { body } = await request("GET", "get-session");
      return toAppSession(body as CustomSession);
    },
    /** "Sign out on all devices". */
    revokeSessions: () => request("POST", "revoke-sessions", {}),
    signOut: () => request("POST", "sign-out", {})
  };
};

/**
 * The sign-in code in the latest login email sent to `email`, or null if none was sent.
 * Codes are sent in the background: use `loginCode` to wait for one.
 */
export const lastLoginCode = (email: string): string | null => {
  const sent = getSentEmails().filter(
    (e) => e.to === email && e.subject === "Din inloggningskod till Västra Sidan"
  );
  return sent.at(-1)?.html?.match(/kod=(\d{6})/)?.[1] ?? null;
};

/** Waits until every sign-in code asked for so far has been sent, or skipped. */
export const settleLoginCodes = loginCodesDelivered;

/** Waits for the login emails asked for so far, then returns the latest code sent to `email`. */
export const loginCode = async (email: string): Promise<string> => {
  await settleLoginCodes();
  const code = lastLoginCode(email);
  expect(code, `no login code was sent to ${email}`).toMatch(/^\d{6}$/);
  return code!;
};
