import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "~/env.mjs";
import { stripe } from "~/server/stripe";
import { sendEventConfirmationEmail } from "~/server/utils/email";
import { handleFailedPayment, handleRefund, handleSuccessfulPayment } from "./utils";


const endpointSecret = env.STRIPE_WEBHOOK_SECRET || "whsec_8691b2bf8e9dca6022c686d929fd5dc87acd4c888c46a9ea6902a157b19334b7";


const handleStripeEvent = async (event: Stripe.Event) => {
  switch (event.type) {
    case 'payment_intent.succeeded':
      const { participants } = await handleSuccessfulPayment(event);
      const emailPromises = participants.map(sendEventConfirmationEmail);
      await Promise.all(emailPromises);
      break;
    case 'payment_intent.payment_failed':
      await handleFailedPayment(event);
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
    const error = err as Error;
    return NextResponse.json(`Webhook Error: ${error.message}`, { status: 400 });
  }
  return NextResponse.json("ok", { status: 201 });
}