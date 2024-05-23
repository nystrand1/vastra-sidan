import { Resend } from "resend";
import { env } from "~/env.mjs";

const globalForResend = globalThis as unknown as {
  resend: Resend | undefined;
};

export const resend =
  globalForResend.resend ??
  new Resend(env.RESEND_API_KEY)

if (env.NODE_ENV !== "production") globalForResend.resend = resend;
