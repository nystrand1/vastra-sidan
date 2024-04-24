import { Elements, PaymentElement } from "@stripe/react-stripe-js";
import { type loadStripe } from "@stripe/stripe-js";
import { Button } from "~/components/atoms/Button/Button";
import Modal from "~/components/atoms/Modal/Modal";

interface StripeModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret?: string;
  stripePromise?: ReturnType<typeof loadStripe>;
}



export const StripeModal = ({ isOpen, onClose, clientSecret, stripePromise } : StripeModalProps) => {
  if (!clientSecret || !stripePromise) return null;

  const onSubmit = async () => {
    // Call stripe.confirmCardPayment
  };

  return (
    <Elements 
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          'theme': 'night'
        }
      }}
       >
    <Modal
      isOpen={isOpen}
      onClose={onClose}
    >
      <PaymentElement />
      <Button className="w-full">Betala</Button>
    </Modal>
    </Elements>
  )
}