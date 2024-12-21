import { env } from "~/env.mjs";
import { type ParticipantWithBusAndEvent } from "../../api/routers/eventPayment";
import { resend } from "../../resend";
import EventSignUp from "~/components/emails/EventSignUp";
import { render } from "@react-email/components";
import { sendSesEmail } from "./sendSesEmail";


export const sendEventConfirmationEmail = async (
  participant: ParticipantWithBusAndEvent
) => {
  const cancellationUrl = `${env.CANCELLATION_URL}?token=${
    participant?.cancellationToken || ""
  }`;

  if (env.ENABLE_AWS_SES_EMAILS) {
    return await sendSesEmail({
      to: participant.email,
      subject: `Anmälan till ${participant?.event?.name}`,
      body: await render(EventSignUp({ participant, cancellationUrl }))
    })
  }

  return await resend.emails.send({
    from: `Västra Sidan <${env.BOOKING_EMAIL}>`,
    to: env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : participant.email,
    subject: `Anmälan till ${participant?.event?.name}`,
    react: EventSignUp({ participant, cancellationUrl })
  });
};