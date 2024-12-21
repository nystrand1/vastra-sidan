import { captureException } from "@sentry/nextjs";
import { env } from "~/env.mjs";
import { ses } from "~/server/ses";


interface SendSesEmailParams {
  to: string;
  subject: string;
  body: string;
}

export const sendSesEmail = async (params: SendSesEmailParams) => {
  const res = await ses.sendEmail({
    Source: `Västra Sidan <${env.BOOKING_EMAIL}>`,
    Destination: {
      ToAddresses: [
        env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : params.to,
      ],
    },
    Message: {
      Subject: {
        Charset: "UTF-8",
        Data: params.subject,
      },
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: params.body,
        },
      },
    },
  })

  if (res.$metadata.httpStatusCode !== 200) {
    captureException(new Error(`Failed to send email: ${JSON.stringify(res, null, 2)}`));
  }
}
