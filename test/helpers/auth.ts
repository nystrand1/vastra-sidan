import { auth, toAppSession } from "~/server/auth";
import { getSentEmails } from "../mocks/ses";

type CustomSession = Parameters<typeof toAppSession>[0];

/**
 * A browser talking to the real Better Auth handler (/api/auth/*), keeping its
 * cookies between requests like a browser would.
 */
export const authBrowser = () => {
  const cookies = new Map<string, string>();

  const request = async (method: "GET" | "POST", path: string, body?: object) => {
    const response = await auth.handler(
      new Request(`${process.env.BETTER_AUTH_URL}/api/auth/${path}`, {
        method,
        headers: {
          origin: process.env.WEBSITE_URL!,
          cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
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
    /** Any POST to the auth API, e.g. one the app's own pages would never send. */
    post: (path: string, body: object) => request("POST", path, body),
    /** Asks for a sign-in code by email. */
    sendCode: (email: string) =>
      request("POST", "email-otp/send-verification-otp", { email, type: "sign-in" }),
    /** Signs in (or up) with the code from the email. */
    signIn: async (email: string, otp: string) => {
      const { status } = await request("POST", "sign-in/email-otp", { email, otp });
      return { status };
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

/** The sign-in code in the latest login email sent to `email`, or null if none was sent. */
export const lastLoginCode = (email: string): string | null => {
  const sent = getSentEmails().filter(
    (e) => e.to === email && e.subject === "Din inloggningskod till Västra Sidan"
  );
  return sent.at(-1)?.html?.match(/kod=(\d{6})/)?.[1] ?? null;
};
