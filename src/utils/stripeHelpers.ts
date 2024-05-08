import { type Participant } from "@prisma/client";
import { stripe } from "~/server/stripe";


interface CreatePaymentIntentInput {
  amount: number;
  description: string;
  payee: Participant
}

export const createPaymentIntent = async (data: CreatePaymentIntentInput) => {
  const {
    amount,
    description,
    payee
  } = data;

  const listCustomers = await stripe.customers.list({
    email: payee.email,
  });

  let existingCustomer = listCustomers.data[0];

  if (!existingCustomer) {
    existingCustomer = await stripe.customers.create({
      email: payee.email,
      name: payee.name,
    });
  }

  return stripe.paymentIntents.create({
    amount: amount,
    currency: "sek",
    description,
    customer: existingCustomer.id,
  });
};


interface CreateRefundIntentInput {
  paymentIntentId: string;
  amount: number;
 }

export const createRefundIntent = async ({ paymentIntentId, amount }: CreateRefundIntentInput) => {
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
    reason: "requested_by_customer",
  });
}

