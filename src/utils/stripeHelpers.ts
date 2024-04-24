import { stripe } from "~/server/stripe";


interface CreatePaymentIntentInput {
  amount: number;
}

export const createPaymentIntent = async (data: CreatePaymentIntentInput) => {
  const {
    amount,
  } = data;

  return stripe.paymentIntents.create({
    amount: amount * 100,
    currency: "sek",
  });
};