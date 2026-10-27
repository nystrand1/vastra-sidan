import { type Participant } from "~/generated/prisma/browser";
import { stripe } from "~/server/stripe";


interface CreatePaymentIntentInput {
  amount: number;
  description: string;
  payee: Pick<Participant, "email" | "name">;
  metadata: Record<string, string> & {
    type: 'MEMBERSHIP' | 'EVENT';
  };
}

export const createPaymentIntent = async (data: CreatePaymentIntentInput) => {
  const {
    amount,
    description,
    payee
  } = data;

  // Stripe matches emails case-sensitively, so always use the lowercased email
  const email = payee.email.toLowerCase();

  const listCustomers = await stripe.customers.list({
    email,
  });

  let existingCustomer = listCustomers.data[0];

  if (!existingCustomer) {
    existingCustomer = await stripe.customers.create({
      email,
      name: payee.name,
    });
  }

  return stripe.paymentIntents.create({
    amount: amount,
    currency: "sek",
    description,
    customer: existingCustomer.id,
    metadata: data.metadata,
  });
};


interface CreateRefundIntentInput {
  paymentIntentId: string;
  amount: number;
  /** Makes Stripe return the first refund instead of creating another for the same key. */
  idempotencyKey: string;
  metadata: Record<string, string>;
}

export const createRefundIntent = async ({
  paymentIntentId,
  amount,
  idempotencyKey,
  metadata
}: CreateRefundIntentInput) => {
  return stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount,
      reason: "requested_by_customer",
      metadata
    },
    { idempotencyKey }
  );
}

