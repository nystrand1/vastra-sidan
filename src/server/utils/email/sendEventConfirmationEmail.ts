import { env } from "~/env.mjs";
import { type ParticipantWithBusAndEvent } from "../../api/routers/eventPayment";
import { resend } from "../../resend";
import EventSignUp from "~/components/emails/EventSignUp";

export const sendEventConfirmationEmail = async (
  participant: ParticipantWithBusAndEvent
) => {
  const cancellationUrl = `${env.CANCELLATION_URL}?token=${
    participant?.cancellationToken || ""
  }`;
  return await resend.emails.send({
    from: env.BOOKING_EMAIL,
    to: env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : participant.email,
    subject: `Anmälan till ${participant?.event?.name}`,
    react: EventSignUp({ participant, cancellationUrl })
  });
};