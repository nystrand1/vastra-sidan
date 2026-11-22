import Stripe from "stripe";
import { type PrismaClient } from "~/generated/prisma/client";
import { normaliseEmail } from "~/utils/email";

/**
 * Fills in `StripePayment.payerEmail` for bookings made before it was stored.
 * Admin-added bookings use their traveller's email. Others use the email of the
 * Stripe customer, or the first traveller when Stripe can't tell. Counts bookings
 * (payment intents). Also fills membership payments, counted under `memberships`.
 */
export const backfillPayerEmails = async (db: PrismaClient, stripe: Stripe) => {
  const result = {
    fromStripe: 0,
    fromFirstTraveller: 0,
    adminComp: 0,
    memberships: {
      fromStripe: 0,
      fromOwnerMetadata: 0,
      adminComp: 0,
      unresolved: 0,
      membershipIds: 0
    }
  };

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
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    )[0];
    if (first && !firstTravellerByPayment.has(row.stripePaymentId)) {
      firstTravellerByPayment.set(row.stripePaymentId, first.email);
    }
  }

  for (const [stripePaymentId, firstTraveller] of [
    ...firstTravellerByPayment
  ].sort()) {
    let payerEmail: string;
    let source: "fromStripe" | "fromFirstTraveller" | "adminComp";
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
  await backfillMembershipPayers(db, stripe, result.memberships);
  return result;
};

/**
 * Membership payments (linked to members, not travellers). The Stripe customer is the person who
 * filled in the form. Without one, the owner recorded in the PaymentIntent metadata. Otherwise the
 * payer stays null, which shows the family nothing but their own memberships. Never guessed.
 * The membership bought comes from the PaymentIntent metadata; without it the payment shows no family.
 * Admin-added memberships have no Stripe payment: a payment with exactly one member is theirs.
 */
const backfillMembershipPayers = async (
  db: PrismaClient,
  stripe: Stripe,
  result: {
    fromStripe: number;
    fromOwnerMetadata: number;
    adminComp: number;
    unresolved: number;
    membershipIds: number;
  }
) => {
  const rows = await db.stripePayment.findMany({
    where: {
      OR: [{ payerEmail: null }, { membershipId: null }],
      members: { some: {} },
      participants: { none: {} }
    },
    select: {
      id: true,
      stripePaymentId: true,
      payerEmail: true,
      membershipId: true,
      members: { select: { email: true } }
    }
  });

  // Admin payments are named after the owner, so one id can cover several seasons: go by row
  for (const row of rows.filter(
    (r) => r.stripePaymentId.startsWith("admin-comp-") && r.payerEmail === null
  )) {
    const [only, ...rest] = row.members;
    if (only && rest.length === 0) {
      await db.stripePayment.updateMany({
        where: { id: row.id, payerEmail: null },
        data: { payerEmail: normaliseEmail(only.email) }
      });
      result.adminComp += 1;
    } else {
      result.unresolved += 1;
    }
  }

  const intents = [
    ...new Set(
      rows
        .map((r) => r.stripePaymentId)
        .filter((id) => !id.startsWith("admin-comp-"))
    )
  ].sort();
  for (const stripePaymentId of intents) {
    const intentRows = rows.filter(
      (r) => r.stripePaymentId === stripePaymentId
    );
    const paymentIntent = await retrievePaymentIntent(stripe, stripePaymentId);

    if (intentRows.some((r) => r.payerEmail === null)) {
      let payerEmail = paymentIntent && customerEmailOf(paymentIntent);
      let source: "fromStripe" | "fromOwnerMetadata" = "fromStripe";
      const ownerId = paymentIntent?.metadata?.membershipOwnerId;
      if (!payerEmail && ownerId) {
        payerEmail = (
          await db.member.findUnique({
            where: { id: ownerId },
            select: { email: true }
          })
        )?.email;
        source = "fromOwnerMetadata";
      }
      if (payerEmail) {
        await db.stripePayment.updateMany({
          where: { stripePaymentId, payerEmail: null },
          data: { payerEmail: normaliseEmail(payerEmail) }
        });
        result[source] += 1;
      } else {
        result.unresolved += 1;
      }
    }

    const membershipId = paymentIntent?.metadata?.membershipId;
    if (membershipId && intentRows.some((r) => r.membershipId === null)) {
      await db.stripePayment.updateMany({
        where: { stripePaymentId, membershipId: null },
        data: { membershipId }
      });
      result.membershipIds += 1;
    }
  }
};

const customerEmailOf = (paymentIntent: Stripe.PaymentIntent) => {
  const { customer } = paymentIntent;
  return customer && typeof customer !== "string" && !customer.deleted
    ? (customer.email ?? undefined)
    : undefined;
};

const stripeCustomerEmail = async (stripe: Stripe, paymentIntentId: string) => {
  const paymentIntent = await retrievePaymentIntent(stripe, paymentIntentId);
  return paymentIntent && customerEmailOf(paymentIntent);
};

const retrievePaymentIntent = async (
  stripe: Stripe,
  paymentIntentId: string
) => {
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["customer"]
    });
  } catch (error) {
    // Only a payment Stripe doesn't have falls back. Anything else (network, rate
    // limit, 5xx) aborts, so a re-run can still fill the row in.
    if (
      error instanceof Stripe.errors.StripeError &&
      (error.statusCode === 404 || error.code === "resource_missing")
    ) {
      return undefined;
    }
    throw error;
  }
};
