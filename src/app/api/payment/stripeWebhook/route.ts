import { StripePaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "~/env.mjs";
import { prisma } from "~/server/db";
import { stripe } from "~/server/stripe";


const endpointSecret = env.STRIPE_WEBHOOK_SECRET || "whsec_8691b2bf8e9dca6022c686d929fd5dc87acd4c888c46a9ea6902a157b19334b7";


const handleStripeEvent = async (event: Stripe.Event) => {
  switch (event.type) {
    case 'payment_intent.succeeded':
      const originalPayment = await prisma.stripePayment.findFirst({
        where: {
          stripePaymentId: event.data.object.id
        },
        include: {
          participants: true
        }
      });
      if (!originalPayment) {
        throw new Error("Payment not found");
      }
      await prisma.stripePayment.create({
        data: {
          amount: event.data.object.amount,
          stripePaymentId: event.data.object.id,
          status: StripePaymentStatus.SUCCEEDED,
          participants: {
            connect: originalPayment.participants.map(p => ({ id: p.id }))
          }
        }
      });
      break;
    case 'payment_intent.payment_failed':
      await prisma.stripePayment.create({
        data: {
          amount: event.data.object.amount,
          stripePaymentId: event.data.object.id,
          status: StripePaymentStatus.CANCELED,
        }
      });
      break;
    case 'refund.created':
      console.log("Refund created", event.data.object);
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
    console.log("Stripe webhook event", event);
  } catch (err) {
    console.log('error', err);
    const error = err as Error;
    return NextResponse.json(`Webhook Error: ${error.message}`, { status: 400 });
  }
  return NextResponse.json("ok", { status: 201 });
}