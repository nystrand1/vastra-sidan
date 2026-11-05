import { type ParticipantTransfer, type VastraEvent } from "~/generated/prisma/client";
import BookingTransferred from "~/components/emails/BookingTransferred";
import { render } from "react-email";
import { sendSesEmail } from "./sendSesEmail";

export const sendBookingTransferredEmail = async ({
  transfer,
  event
}: {
  transfer: ParticipantTransfer;
  event: VastraEvent;
}) =>
  await sendSesEmail({
    to: transfer.fromEmail,
    subject: `Du har överlåtit din plats: ${event.name}`,
    body: await render(BookingTransferred({ transfer, event }))
  });
