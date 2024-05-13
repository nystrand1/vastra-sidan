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
}



export const StripeModal = ({ isOpen, onClose, clientSecret } : StripeModalProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  if (!clientSecret || !stripe || !elements) return null;

  const onSubmit = async () => {
    if (!stripe || !elements) {
      return;
    }
    setIsLoading(true);
    const result = await toast.promise(stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: env.NEXT_PUBLIC_WEBSITE_URL,
        payment_method_data: {
          billing_details: {
            address: {
              country: 'SE',
            }
          }
        }
      },
    }), {
      loading: 'Laddar...',
      success: 'Klart!',
      error: 'Något gick fel'
    });
    setIsLoading(false);
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
              }
          }
      }
      }} />
      <Button disabled={!stripe || isLoading} className="w-full mt-3" onClick={onSubmit}>Betala</Button>
    </Modal>
  )
}
