import { captureException, captureMessage } from "@sentry/nextjs";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import Modal from "~/components/atoms/Modal/Modal";
import { env } from "~/env.mjs";

interface StripeModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret?: string;
  isMemberSignup?: boolean;
}



export const StripeModal = ({ isOpen, onClose, clientSecret, isMemberSignup } : StripeModalProps) => {
  const stripe = useStripe();
  
  const elements = useElements();
  console.log('StripeModal', clientSecret, stripe, elements);
  const [isLoading, setIsLoading] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  if (!clientSecret || !stripe || !elements) return null;
  const onSubmit = async () => {
    if (!stripe || !elements) {
      console.log("Stripe or elements not loaded");
      captureMessage("Stripe or elements not loaded");
      return;
    }
    setIsLoading(true);
    const toastId = toast.loading('Laddar...');
    const returnUrl = isMemberSignup ? env.NEXT_PUBLIC_WEBSITE_URL + '/bli-medlem/tack' : env.NEXT_PUBLIC_WEBSITE_URL + '/bortaresor/tack';
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
        payment_method_data: {
          billing_details: {
            address: {
              country: 'SE',
            }
          }
        }
      },
    })
    setIsLoading(false);
    if (result.error) {
      console.log(result.error.message);
      toast.error(result.error.message || 'Något gick fel med betalningen', { id: toastId});
      captureException(result.error);
      captureMessage(result.error.message || 'Något gick fel med betalningen');
    } else {
      toast.success('Klart!', { id: toastId });
    }
  };
  console.log('StripeModal ready');
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
    >
      <PaymentElement 
        onReady={() => setStripeReady(true)}
        options={{
          fields: {
            billingDetails: {
                address: {
                    country: 'never',
                }
            }
          }
        }} 
      />
      <Button disabled={!stripe || isLoading || !stripeReady} className="w-full mt-3" onClick={onSubmit}>Betala</Button>
    </Modal>
  )
}
