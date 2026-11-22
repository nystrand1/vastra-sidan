import { passkey } from "@better-auth/passkey";
import { captureException } from "@sentry/nextjs";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import { customSession, emailOTP } from "better-auth/plugins";
import { type IncomingMessage } from "http";
import { render } from "react-email";
import LoginCode from "~/components/emails/LoginCode";
import { env } from "~/env.mjs";
import { Role } from "~/generated/prisma/client";
import { prisma } from "~/server/db";
import { failedLoginCodes, loginCodeSends } from "~/server/utils/accounts/emailLimits";
import { sendSesEmail } from "~/server/utils/email/sendSesEmail";
import { isMemberEmail } from "~/server/utils/member/isMemberEmail";
import { toAppSession, type AppSession } from "~/utils/appSession";
import { normaliseEmail } from "~/utils/email";
import { featureFlags } from "~/utils/featureFlags";

const LOGIN_CODE_SUBJECT = "Din inloggningskod till Västra Sidan";

/** Sign-in codes still being sent, so tests can wait for them. */
const deliveries = new Set<Promise<void>>();

/** Resolves once every sign-in code asked for so far has been sent or skipped. */
export const loginCodesDelivered = async () => {
  await Promise.all(deliveries);
};

const deliverLoginCode = async (email: string, otp: string) => {
  if (!featureFlags.ENABLE_LOGIN) {
    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    if (user?.role !== Role.ADMIN) return;
  }
  // In the fragment, so the code never reaches the server log, analytics or Sentry
  const signInUrl = `${env.BETTER_AUTH_URL}/loggain#email=${encodeURIComponent(email)}&kod=${otp}`;
  await sendSesEmail({
    to: email,
    subject: LOGIN_CODE_SUBJECT,
    body: await render(LoginCode({ code: otp, signInUrl }))
  });
};

/**
 * Emails a sign-in code. While login is off, only admins get one; everyone else gets
 * the same response from the endpoint but no email, so nobody else can sign in.
 * The email goes out in the background, so the response takes the same time whether
 * or not one is sent (which would reveal who the admins are). Failures are reported.
 */
const sendLoginCode = ({ email, otp, type }: { email: string; otp: string; type: string }) => {
  // Codes for password reset or email verification are useless without passwords.
  if (type !== "sign-in") return Promise.resolve();
  const delivery = deliverLoginCode(email, otp).catch((error: unknown) => {
    captureException(error);
  });
  deliveries.add(delivery);
  void delivery.finally(() => deliveries.delete(delivery));
  return Promise.resolve();
};

const SEND_CODE_PATH = "/email-otp/send-verification-otp";
const SIGN_IN_PATH = "/sign-in/email-otp";

const emailOf = (body: unknown) =>
  body && typeof body === "object" && "email" in body && typeof body.email === "string"
    ? normaliseEmail(body.email)
    : null;

const options = {
  database: prismaAdapter(prisma, { provider: "mysql" }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEBSITE_URL],
  advanced: {
    // Let Prisma fill ids with `@default(cuid())`
    database: { generateId: false },
    // Apache on the same box appends the client's address: the rightmost address that is
    // not this box is the client, whatever the client itself put in the header.
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: ["127.0.0.1", "::1"] }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24
  },
  user: {
    // `input: false`: the browser can never set these, on sign-up or on update-user
    additionalFields: {
      firstName: { type: "string", required: false, input: false, defaultValue: "" },
      lastName: { type: "string", required: false, input: false, defaultValue: "" },
      phone: { type: "string", required: false, input: false },
      role: { type: "string", required: false, input: false, defaultValue: Role.USER }
    }
  },
  // On in production only (the library default)
  rateLimit: {
    storage: "memory",
    customRules: {
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 10 }
    }
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const email = emailOf(ctx.body);
      if (email === null) return;
      // Per email, on top of the per-address limit above, and also outside production.
      // A send over the limit answers as usual but makes and sends no code.
      if (ctx.path === SEND_CODE_PATH) {
        if (loginCodeSends.isOver(email)) return ctx.json({ success: true });
        loginCodeSends.add(email);
      }
      // Over the limit, even the right code is rejected as a wrong one
      if (ctx.path === SIGN_IN_PATH && failedLoginCodes.isOver(email)) {
        throw new APIError("BAD_REQUEST", { message: "Invalid OTP", code: "INVALID_OTP" });
      }
      // Better Auth lowercases emails but does not trim them
      return { context: { body: { ...(ctx.body as object), email } } };
    }),
    after: createAuthMiddleware((ctx) => {
      const email = emailOf(ctx.body);
      if (ctx.path === SIGN_IN_PATH && email !== null && isAPIError(ctx.context.returned)) {
        failedLoginCodes.add(email);
      }
      return Promise.resolve();
    })
  },
  databaseHooks: {
    user: {
      create: {
        // Refused while login is off, so only existing admins can sign in
        before: () =>
          featureFlags.ENABLE_LOGIN
            ? Promise.resolve()
            : Promise.reject(new APIError("FORBIDDEN", { message: "Kontoregistrering är avstängd" }))
      }
    },
    session: {
      create: {
        // While login is off only admins may sign in, with a code or a passkey
        before: async (session) => {
          if (featureFlags.ENABLE_LOGIN) return;
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { role: true }
          });
          if (user?.role !== Role.ADMIN) {
            throw new APIError("FORBIDDEN", { message: "Inloggning är avstängd" });
          }
        }
      }
    }
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 3,
      sendVerificationOTP: sendLoginCode
    }),
    passkey({
      rpID: env.PASSKEY_RP_ID,
      rpName: "Västra Sidan",
      // The origin the site is served from, which is also trusted for every auth request
      origin: env.BETTER_AUTH_URL
    })
  ]
} satisfies BetterAuthOptions;

export { toAppSession, type AppSession };

export const auth = betterAuth({
  ...options,
  plugins: [
    ...options.plugins,
    customSession(
      async ({ user, session }) => ({
        user: { ...user, isMember: await isMemberEmail(prisma, user.email) },
        session
      }),
      options
    )
  ]
});

/**
 * The session of the request's cookie, read from the database, or null when signed out.
 * It never renews the session: the browser's own get-session does, which can set the cookie.
 */
export const getServerAuthSession = async (ctx: { req: IncomingMessage }): Promise<AppSession | null> =>
  toAppSession(
    await auth.api.getSession({
      headers: fromNodeHeaders(ctx.req.headers),
      query: { disableRefresh: true }
    })
  );
