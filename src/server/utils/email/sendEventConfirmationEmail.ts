import { env } from "~/env.mjs";
import { type ParticipantWithBusAndEvent } from "../../api/routers/eventPayment";
import EventSignUp from "~/components/emails/EventSignUp";
import { render } from "@react-email/components";
import { sendSesEmail } from "./sendSesEmail";

export const sendEventConfirmationEmail = async (
  participant: ParticipantWithBusAndEvent
) => {
  const cancellationUrl = `${env.CANCELLATION_URL}?token=${
    participant?.cancellationToken || ""
  }`;

  return await sendSesEmail({
    to: participant.email,
    subject: `Anmälan till ${participant?.event?.name}`,
    body: await render(EventSignUp({ participant, cancellationUrl }))
  });
};
