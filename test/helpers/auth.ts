import { type NextApiRequest, type NextApiResponse } from "next";
import { type Session } from "next-auth";
import nextAuthRoute from "~/pages/api/auth/[...nextauth]";

// next-auth types `NextAuth(options)` as `any`.
const nextAuthHandler = nextAuthRoute as (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

interface HandlerResult {
  status: number;
  body: unknown;
}

/**
 * A browser talking to the real NextAuth API route (/api/auth/*), keeping the
 * session and CSRF cookies between requests like a browser would.
 */
export const authBrowser = () => {
  const cookies = new Map<string, string>();

  const request = async (method: "GET" | "POST", path: string, body?: object) => {
    const result: HandlerResult = { status: 200, body: undefined };
    const headers = new Map<string, string | string[]>();
    const res = {
      status: (code: number) => {
        result.status = code;
        return res;
      },
      getHeader: (name: string) => headers.get(name.toLowerCase()),
      setHeader: (name: string, value: string | string[]) => {
        headers.set(name.toLowerCase(), value);
        return res;
      },
      send: (data: unknown) => {
        result.body = data;
      },
      json: (data: unknown) => {
        result.body = data;
      },
      end: () => undefined
    };
    const req = {
      method,
      query: { nextauth: path.split("/") },
      headers: {
        host: new URL(process.env.NEXTAUTH_URL!).host,
        ...(body && { "content-type": "application/json" })
      },
      cookies: Object.fromEntries(cookies),
      body
    };

    await nextAuthHandler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    for (const header of [headers.get("set-cookie") ?? []].flat()) {
      const [pair = ""] = header.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = decodeURIComponent(pair.slice(separator + 1));
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    return result;
  };

  const csrfToken = async () => {
    const { body } = await request("GET", "csrf");
    return (body as { csrfToken: string }).csrfToken;
  };

  return {
    /** Logs in through the credentials form. */
    signIn: async (email: string, password: string) => {
      await request("POST", "callback/credentials", {
        csrfToken: await csrfToken(),
        username: email,
        password
      });
    },
    /** What `useSession().update(data)` sends: a POST to /api/auth/session. */
    updateSession: async (data?: unknown) =>
      request("POST", "session", { csrfToken: await csrfToken(), data }),
    /** What `useSession()` reads, or null when logged out. */
    getSession: async () => {
      const { body } = await request("GET", "session");
      return body && Object.keys(body).length ? (body as Session) : null;
    }
  };
};
