import { type Stripe, loadStripe } from '@stripe/stripe-js';
import { env } from '~/env.mjs';

let stripePromise: Promise<Stripe | null>;
const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(env.NEXT_PUBLIC_STRIPE_API_KEY);
  }
  return stripePromise;
};

export default getStripe;