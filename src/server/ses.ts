import { SES } from "@aws-sdk/client-ses";
import { env } from "~/env.mjs";

const globalForSES = globalThis as unknown as {
  ses: SES | undefined;
};

export const ses =
  globalForSES.ses ??
  new SES({
    region: 'eu-north-1',
  })

if (env.NODE_ENV !== "production") globalForSES.ses = ses;
