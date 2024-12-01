import Stripe from "stripe";
import { env } from "~/env.mjs";

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

export const stripe =
  globalForStripe.stripe ??
  new Stripe(env.STRIPE_API_KEY, {
    typescript: true,
    apiVersion: '2024-09-30.acacia'
  });

if (env.NODE_ENV !== "production") globalForStripe.stripe = stripe;
