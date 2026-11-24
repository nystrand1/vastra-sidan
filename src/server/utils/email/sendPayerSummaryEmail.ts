import { render } from "react-email";
import PayerBookingSummary from "~/components/emails/PayerBookingSummary";
import { env } from "~/env.mjs";
import { normaliseEmail } from "~/utils/email";
import { sendSesEmail } from "./sendSesEmail";

interface PaidBooking {
  payerEmail: string | null;
  /** What Stripe charged, in öre */
  amount: number;
  participants: { name: string; email: string; event: { name: string; date: Date } }[];
}

/**
 * The payer gets a summary only when they aren't one of the travellers: travellers already get
 * their own confirmation. That happens when a signed-in user books seats only for others.
 */
export const payerNeedsSummary = ({ payerEmail, participants }: PaidBooking) =>
  !!payerEmail &&
  participants.length > 0 &&
  participants.every((p) => normaliseEmail(p.email) !== normaliseEmail(payerEmail));

export const sendPayerSummaryEmail = async (booking: PaidBooking) => {
  const event = booking.participants[0]?.event;
  if (!booking.payerEmail || !event) return;

  await sendSesEmail({
    to: booking.payerEmail,
    subject: `Din bokning: ${event.name}`,
    body: await render(
      PayerBookingSummary({
        eventName: event.name,
        eventDate: event.date,
        travellers: booking.participants.map((p) => ({ name: p.name })),
        totalAmount: booking.amount / 100,
        myTripsUrl: `${env.WEBSITE_URL}/mina-bussresor`,
        websiteUrl: env.WEBSITE_URL
      })
    )
  });
};
