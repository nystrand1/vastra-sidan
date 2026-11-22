import type Stripe from "stripe";
import { type PrismaClient } from "~/generated/prisma/client";
import { normaliseEmail } from "~/utils/email";

/**
 * Fills in `StripePayment.payerEmail` for bookings made before it was stored.
 * Admin-added bookings use their traveller's email. Others use the email of the
 * Stripe customer, or the first traveller when Stripe can't tell. Counts bookings
 * (payment intents). Only touches payments with a participant and no payer yet.
 */
export const backfillPayerEmails = async (db: PrismaClient, stripe: Stripe) => {
  const result = { fromStripe: 0, fromFirstTraveller: 0, adminComp: 0 };

  // A payment intent has one row per status change (created, succeeded, ...), all
  // with the same travellers. They are one booking, so they get the same payer.
  const rows = await db.stripePayment.findMany({
    where: { payerEmail: null, participants: { some: {} } },
    select: {
      stripePaymentId: true,
      participants: {
        select: { email: true, createdAt: true, id: true }
      }
    }
  });

  const firstTravellerByPayment = new Map<string, string>();
  for (const row of rows) {
    const first = row.participants.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
    )[0];
    if (first && !firstTravellerByPayment.has(row.stripePaymentId)) {
      firstTravellerByPayment.set(row.stripePaymentId, first.email);
    }
  }

  for (const [stripePaymentId, firstTraveller] of [...firstTravellerByPayment].sort()) {
    let payerEmail: string;
    let source: keyof typeof result;
    if (stripePaymentId.startsWith("admin-comp-")) {
      payerEmail = firstTraveller;
      source = "adminComp";
    } else {
      const customerEmail = await stripeCustomerEmail(stripe, stripePaymentId);
      payerEmail = customerEmail ?? firstTraveller;
      source = customerEmail ? "fromStripe" : "fromFirstTraveller";
    }

    await db.stripePayment.updateMany({
      where: { stripePaymentId, payerEmail: null },
      data: { payerEmail: normaliseEmail(payerEmail) }
    });
    result[source] += 1;
  }
  return result;
};

const stripeCustomerEmail = async (stripe: Stripe, paymentIntentId: string) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["customer"]
    });
    const { customer } = paymentIntent;
    return customer && typeof customer !== "string" && !customer.deleted
      ? (customer.email ?? undefined)
      : undefined;
  } catch {
    return undefined;
  }
};
