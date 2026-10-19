import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "~/env.mjs";
import { stripe } from "~/server/stripe";
import { sendEventConfirmationEmail } from "~/server/utils/email/sendEventConfirmationEmail";
import {
  handleChargeUpdate,
  handleFailedPayment,
  handleRefund,
  handleRefundUpdate,
  handleSuccessfulPayment
} from "./utils";
import { captureException } from "@sentry/nextjs";
import { sendMemberConfirmationEmail } from "~/server/utils/email/sendMemberConfirmationEmail";

const endpointSecret =
  env.STRIPE_WEBHOOK_SECRET ||
  "whsec_8691b2bf8e9dca6022c686d929fd5dc87acd4c888c46a9ea6902a157b19334b7";

const handleStripeEvent = async (event: Stripe.Event) => {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const payment = await handleSuccessfulPayment(event);
      if (!payment) {
        // Already handled in an earlier delivery of this event
        break;
      }
      const { participants, members, membership } = payment;
      const emails =
        event.data.object.metadata.type === "MEMBERSHIP" && membership
          ? members.map((m) => sendMemberConfirmationEmail(m, membership))
          : event.data.object.metadata.type === "EVENT"
            ? participants.map(sendEventConfirmationEmail)
            : [];
      // Emails are best effort: the payment is already saved, so failing the webhook would
      // only make Stripe retry an event that is then skipped.
      const results = await Promise.allSettled(emails);
      for (const result of results) {
        if (result.status === "rejected") {
          captureException(result.reason);
        }
      }
      break;
    }
    case "payment_intent.payment_failed":
      await handleFailedPayment(event);
      break;
    case "charge.updated":
      await handleChargeUpdate(event);
      break;
    case "charge.refunded":
      await handleRefund(event);
      break;
    case "refund.updated":
    case "refund.failed":
      await handleRefundUpdate(event);
      break;
    default:
      console.log("Unhandled event", event);
      break;
  }
};

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json("No signature", { status: 400 });
  }

  try {
    const rawEvent = await req.text();
    const event = stripe.webhooks.constructEvent(rawEvent, sig, endpointSecret);
    await handleStripeEvent(event);
  } catch (err) {
    console.log("error", err);
    captureException(err);
    const error = err as Error;
    return NextResponse.json(`Webhook Error: ${error.message}`, {
      status: 400
    });
  }
  return NextResponse.json("ok", { status: 201 });
}
