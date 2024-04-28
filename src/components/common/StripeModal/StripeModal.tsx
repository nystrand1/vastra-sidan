import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "~/components/atoms/Button/Button";
import Modal from "~/components/atoms/Modal/Modal";
import { env } from "~/env.mjs";

interface StripeModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret?: string;
}



export const StripeModal = ({ isOpen, onClose, clientSecret } : StripeModalProps) => {
  const stripe = useStripe();
  const elements = useElements();
  if (!clientSecret || !stripe || !elements) return null;

  const onSubmit = async () => {
    console.log('submitting');
    console.log('elements', elements)
    // Call stripe.confirmCardPayment
    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded.
      // Make sure to disable form submission until Stripe.js has loaded.
      return;
    }
    const result = await stripe.confirmPayment({
      //`Elements` instance that was used to create the Payment Element
      elements,
      confirmParams: {
        return_url: env.NEXT_PUBLIC_WEBSITE_URL,
      },
    });

    if (result.error) {
      // Show error to your customer (for example, payment details incomplete)
      console.log(result.error.message);
    } else {
      console.log('successful', result)
      // Your customer will be redirected to your `return_url`. For some payment
      // methods like iDEAL, your customer will be redirected to an intermediate
      // site first to authorize the payment, then redirected to the `return_url`.
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
    >
      <PaymentElement />
      <Button disabled={!stripe} className="w-full" onClick={onSubmit}>Betala</Button>
    </Modal>
  )
}
