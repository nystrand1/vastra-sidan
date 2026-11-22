import { passkey } from "@better-auth/passkey";
import { captureException } from "@sentry/nextjs";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import { customSession, emailOTP } from "better-auth/plugins";
import { type IncomingMessage } from "http";
import { render } from "react-email";
import LoginCode from "~/components/emails/LoginCode";
import { env } from "~/env.mjs";
import { Role } from "~/generated/prisma/client";
import { prisma } from "~/server/db";
import { sendSesEmail } from "~/server/utils/email/sendSesEmail";
import { isMemberEmail } from "~/server/utils/member/isMemberEmail";
import { toAppSession, type AppSession } from "~/utils/appSession";
import { normaliseEmail } from "~/utils/email";
import { featureFlags } from "~/utils/featureFlags";

const LOGIN_CODE_SUBJECT = "Din inloggningskod till Västra Sidan";

/**
 * Emails a sign-in code. While login is off, only admins get one; everyone else gets
 * the same response from the endpoint but no email, so nobody else can sign in.
 * Failures are reported, not thrown, so the response never depends on them.
 */
const sendLoginCode = async ({ email, otp, type }: { email: string; otp: string; type: string }) => {
  // Codes for password reset or email verification are useless without passwords.
  if (type !== "sign-in") return;
  try {
    if (!featureFlags.ENABLE_LOGIN) {
      const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
      if (user?.role !== Role.ADMIN) return;
    }
    const signInUrl = `${env.WEBSITE_URL}/loggain?email=${encodeURIComponent(email)}&kod=${otp}`;
    await sendSesEmail({
      to: email,
      subject: LOGIN_CODE_SUBJECT,
      body: await render(LoginCode({ code: otp, signInUrl }))
    });
  } catch (error) {
    captureException(error);
  }
};

const options = {
  database: prismaAdapter(prisma, { provider: "mysql" }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEBSITE_URL],
  advanced: {
    // Let Prisma fill ids with `@default(cuid())`
    database: { generateId: false },
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] }
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
    // Better Auth lowercases emails but does not trim them
    before: createAuthMiddleware((ctx) => {
      const body: unknown = ctx.body;
      return Promise.resolve(
        body && typeof body === "object" && "email" in body && typeof body.email === "string"
          ? { context: { body: { ...body, email: normaliseEmail(body.email) } } }
          : undefined
      );
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
      origin: env.WEBSITE_URL
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

/** The session of the request's cookie, read from the database, or null when signed out. */
export const getServerAuthSession = async (ctx: { req: IncomingMessage }): Promise<AppSession | null> =>
  toAppSession(await auth.api.getSession({ headers: fromNodeHeaders(ctx.req.headers) }));
