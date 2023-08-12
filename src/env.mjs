import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
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
    CANCELLATION_URL: z.preprocess(
      (str) =>  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/bortaresor/avboka` : str,
      z.string().min(1)
    ),
    API_URL: z.preprocess(
      (str) =>  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api` : str,
      z.string().min(1)
    ),
    SWISH_MERCHANT_BASEURL: z.string().url(),
    BOOKING_EMAIL: z.string().email(),
    LOCAL_SWISH_CERTS: z.literal("true").or(z.literal("false")).default("true"),
    SWISH_CERT: process.env.VERCEL_URL ? z.string().min(1) : z.string().min(1).optional(),
    SWISH_KEY: process.env.VERCEL_URL ? z.string().min(1) : z.string().min(1).optional(),
    SWISH_CA: process.env.VERCEL_URL ? z.string().min(1) : z.string().min(1).optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string().min(1),
    NEXT_PUBLIC_WORDPRESS_URL: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    WORDPRESS_API_KEY: process.env.WORDPRESS_API_KEY,
    NEXT_PUBLIC_WORDPRESS_URL: process.env.NEXT_PUBLIC_WORDPRESS_URL,
    CRON_KEY: process.env.CRON_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CANCELLATION_URL: process.env.CANCELLATION_URL,
    SWISH_MERCHANT_BASEURL: process.env.SWISH_MERCHANT_BASEURL,
    API_URL: process.env.API_URL,
    BOOKING_EMAIL: process.env.BOOKING_EMAIL,
    LOCAL_SWISH_CERTS: process.env.LOCAL_SWISH_CERTS,
    SWISH_CA: process.env.SWISH_CA,
    SWISH_CERT: process.env.SWISH_CERT,
    SWISH_KEY: process.env.SWISH_KEY,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   * This is especially useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
