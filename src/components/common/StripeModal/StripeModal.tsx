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
    if (!stripe || !elements) {
      return;
    }
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: env.NEXT_PUBLIC_WEBSITE_URL,
      },
    });

    if (result.error) {
      console.log(result.error.message);
    } else {
      console.log('successful', result)
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
    >
      <PaymentElement options={{
        fields: {
          billingDetails: {
              address: {
                  country: 'never',
                  postalCode: 'never'
              }
          }
      }
      }} />
      <Button disabled={!stripe} className="w-full mt-3" onClick={onSubmit}>Betala</Button>
    </Modal>
  )
}
