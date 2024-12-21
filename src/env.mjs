import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AWS_CLIENT_ID: z.string().min(1),
    AWS_CLIENT_SECRET: z.string().min(1),
    DATABASE_URL: z.string().url(),
    ENABLE_AWS_SES_EMAILS: z.literal("true").or(z.literal("false")).default("false").transform((val) => val === "true"),
    NODE_ENV: z.enum(["development", "test", "production"]),
    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().min(1).optional(),
    NEXTAUTH_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) => process.env.VERCEL_URL ?? str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string().min(1) : z.string().url()
    ),
    // Add `.min(1) on ID and SECRET if you want to make sure they're not empty
    WORDPRESS_API_KEY: z.string().min(1),
    CRON_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    CANCELLATION_URL: z.string().min(1),
    MEMBERSHIP_URL: z.string().min(1),
    API_URL: z.string().min(1),
    BOOKING_EMAIL: z.string().email(),
    STRIPE_API_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: (
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().min(1).optional()
    ),
    USE_DEV_MODE: z.literal("true").or(z.literal("false")).default("false"),
    CARDSKIPPER_USERNAME: z.string().min(1),
    CARDSKIPPER_PASSWORD: z.string().min(1),
    CARDSKIPPER_ORG_NUMBER: z.string().min(1),
    WEBSITE_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) => process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string().min(1) : z.string().url()
    )
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string().min(1),
    NEXT_PUBLIC_WORDPRESS_URL: z.string(),
    NEXT_PUBLIC_ENABLE_MEMBERSHIPS: z.literal("true").or(z.literal("false")).default("false"),
    NEXT_PUBLIC_ENABLE_LOGIN: z.literal("true").or(z.literal("false")).default("false"),
    NEXT_PUBLIC_ENABLE_AWAYGAMES: z.literal("true").or(z.literal("false")).default("false"),
    NEXT_PUBLIC_STRIPE_API_KEY: z.string().min(1),
    NEXT_PUBLIC_WEBSITE_URL: z.string().url().default(`https://${process.env.NEXT_PUBLIC_VERCEL_URL || 'localhost:3000'}`),
    NEXT_PUBLIC_ENABLE_ANALYTICS: z.literal("true").or(z.literal("false")).default("false"),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AWS_CLIENT_ID: process.env.AWS_CLIENT_ID,
    AWS_CLIENT_SECRET: process.env.AWS_CLIENT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    WORDPRESS_API_KEY: process.env.WORDPRESS_API_KEY,
    NEXT_PUBLIC_WORDPRESS_URL: process.env.NEXT_PUBLIC_WORDPRESS_URL,
    CRON_KEY: process.env.CRON_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CANCELLATION_URL: process.env.CANCELLATION_URL,
    MEMBERSHIP_URL: process.env.MEMBERSHIP_URL,
    API_URL: process.env.API_URL,
    BOOKING_EMAIL: process.env.BOOKING_EMAIL,
    STRIPE_API_KEY: process.env.STRIPE_API_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    USE_DEV_MODE: process.env.USE_DEV_MODE,
    CARDSKIPPER_USERNAME: process.env.CARDSKIPPER_USERNAME,
    CARDSKIPPER_PASSWORD: process.env.CARDSKIPPER_PASSWORD,
    CARDSKIPPER_ORG_NUMBER: process.env.CARDSKIPPER_ORG_NUMBER,
    WEBSITE_URL: process.env.WEBSITE_URL,
    ENABLE_AWS_SES_EMAILS: process.env.ENABLE_AWS_SES_EMAILS,
    NEXT_PUBLIC_ENABLE_MEMBERSHIPS: process.env.NEXT_PUBLIC_ENABLE_MEMBERSHIPS,
    NEXT_PUBLIC_ENABLE_LOGIN: process.env.NEXT_PUBLIC_ENABLE_LOGIN,
    NEXT_PUBLIC_ENABLE_AWAYGAMES: process.env.NEXT_PUBLIC_ENABLE_AWAYGAMES,
    NEXT_PUBLIC_ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS,
    NEXT_PUBLIC_STRIPE_API_KEY: process.env.NEXT_PUBLIC_STRIPE_API_KEY,
    NEXT_PUBLIC_WEBSITE_URL: process.env.NEXT_PUBLIC_WEBSITE_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   * This is especially useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
