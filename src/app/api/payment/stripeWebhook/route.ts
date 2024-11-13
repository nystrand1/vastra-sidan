import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "~/env.mjs";
import { stripe } from "~/server/stripe";
import { sendEventConfirmationEmail } from "~/server/utils/email/sendEventConfirmationEmail";
import { handleChargeUpdate, handleFailedPayment, handleRefund, handleSuccessfulPayment } from "./utils";
import { captureException } from "@sentry/nextjs";
import { sendMemberConfirmationEmail } from "~/server/utils/email/sendMemberConfirmationEmail";
import { attachMembershipToMembers } from "./attachMembershipToMembers";


const endpointSecret = env.STRIPE_WEBHOOK_SECRET || "whsec_8691b2bf8e9dca6022c686d929fd5dc87acd4c888c46a9ea6902a157b19334b7";


const handleStripeEvent = async (event: Stripe.Event) => {
  switch (event.type) {
    case 'payment_intent.succeeded':
      const { participants, members } = await handleSuccessfulPayment(event);
      if (event.data.object.metadata.type === 'EVENT') {
        const emailPromises = participants.map(sendEventConfirmationEmail);
        await Promise.all(emailPromises);
      }
      if (event.data.object.metadata.type === 'MEMBERSHIP') {
        await attachMembershipToMembers({
          members,
          membershipId: event.data.object.metadata.membershipId
        });
        // send membership confirmation email
        const emailPromises = members.map(sendMemberConfirmationEmail);
        await Promise.all(emailPromises);
      }
      break;
    case 'payment_intent.payment_failed':
      await handleFailedPayment(event);
      break;
    case 'charge.updated': 
      await handleChargeUpdate(event);
      break;
    case 'charge.refunded':
      await handleRefund(event);
      break;
    default:
      console.log('Unhandled event', event);
      break;
  }
}


export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) { 
    return NextResponse.json("No signature", { status: 400 });
  }

  try {
    const rawEvent = await req.text();
    const event = stripe.webhooks.constructEvent(rawEvent, sig, endpointSecret);
    await handleStripeEvent(event);
  } catch (err) {
    console.log('error', err);
    captureException(err);
    const error = err as Error;
    return NextResponse.json(`Webhook Error: ${error.message}`, { status: 400 });
  }
  return NextResponse.json("ok", { status: 201 });
}