import { captureException, captureMessage } from "@sentry/nextjs";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useState } from "react";
import toast from "react-hot-toast";
import { env } from "~/env.mjs";
import DialogDrawer from "../DialogDrawer/DialogDrawer";
import { Button } from "~/components/ui/button";

interface StripeWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret?: string;
  isMemberSignup?: boolean;
  title?: string;
  subTitle?: string;
}



export const StripeWidget = ({ title, subTitle, isOpen, onClose, clientSecret, isMemberSignup } : StripeWidgetProps) => {
  const stripe = useStripe();
  
  const elements = useElements();

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

  const content = (
    <>
      {title && (
        <p className="text-xl">{title}</p>
      )}
      {subTitle && (
        <p className="text-lg">{subTitle}</p>
      )}
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
      <Button variant="outline" className="w-full mt-3" onClick={onClose}>Avbryt</Button>
    </>
  )

  return (
    <DialogDrawer
      content={content}
      trigger={<></>}
      open={isOpen}
      setOpen={onClose}
      disableOutsideClick
    /> 
  )
}
