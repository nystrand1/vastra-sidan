import { captureException } from "@sentry/nextjs";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { TRPCClientError } from "@trpc/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { env } from "~/env.mjs";
import { participantSchema } from "~/utils/zodSchemas";
import { api } from "../../../utils/api";
import { Button } from "../../atoms/Button/Button";
import { StripeModal } from "../StripeModal/StripeModal";
import { PassengerForm, getPassengerPrice, type IPassenger, type PassengerWithIndex } from "./PassengerForm";

const formToParticipant = (form: Record<string, IPassenger>) => {
  return Object.values(form).map((input) => {
    return {
      ...input,
      name: `${input.firstName} ${input.lastName}`,
      member: !!input.member,
      youth: !!input.youth,
    }
  })
}

const stripePromise = loadStripe(env.NEXT_PUBLIC_STRIPE_API_KEY);


export const AwayGameForm = () => {
  const { query } = useRouter();
  const { id } = query as { id: string };
  const { data: awayGame, isLoading } = api.public.getAwayGame.useQuery({ id: id });
  const { mutateAsync: createPaymentIntent, data: clientSecret } = api.eventPayment.requestStripePayment.useMutation();

  const { data: sessionData } = useSession();
  const [passengers, setPassengers] = useState<PassengerWithIndex[]>([{ index: 0 }]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null); 
  const firstAvailableBus = awayGame?.buses.find((bus) => bus.availableSeats > 0);

  useEffect(() => {
    const initialPassenger: PassengerWithIndex = {
      index: 0,
      firstName: sessionData?.user.firstName ?? '',
      lastName: sessionData?.user.lastName ?? '',
      email: sessionData?.user.email ?? '',
      member: !!sessionData?.user.isMember,
      phone: sessionData?.user.phone ?? '',
      busId: firstAvailableBus?.id ?? '',
    }
    setPassengers([initialPassenger]);
  }, [sessionData, firstAvailableBus])

  if (!id) return null
  if (isLoading) return null;
  if (!awayGame) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData.entries());
    const formattedValues = Object.entries(values).reduce((acc, [key, value]) => {
      const [type, index] = key.split("_") as [string, string];
      if (!acc[index]) acc[index] = {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      acc[index][type] = value;
      if (["consent", "member", "youth"].includes(type)) {
        // Handle checkbox values (on/off)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        acc[index][type] = value === "on";
      }
      return acc;
    }, {} as Record<string, any>);
    const participants = participantSchema.array().parse(formToParticipant(formattedValues));
    if (participants.length < 1) return;
    setModalOpen(true);
    
    const fullBusses = awayGame.buses.filter((bus) => {
      const participantsOnBus = participants.filter((p) => p.busId === bus.id);
      return bus.availableSeats < participantsOnBus.length;
    });

    if (fullBusses.length > 0) {
      const busNames = fullBusses.map((bus) => bus.name).join(", ");
      toast.error(`${busNames} har för få platser, vänligen välj en annan buss.`);
      setModalOpen(false);
      return;
    }

    try {
      await createPaymentIntent({
        participants,
        eventId: id,
      });
    } catch (error) {
      if (error instanceof TRPCClientError) {
        setModalOpen(false);
        if (error.message === 'BUS_FULL') {
          toast.error("Någon buss är fullbokad, vänligen välj en annan buss");
          return;
        }
        captureException(error);
        toast.error("Något gick fel, försök igen!");
      }
    }
  }
  return (
    <>
    {clientSecret && (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' }, locale: 'sv' }}>
        <StripeModal 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)} 
          clientSecret={clientSecret} 
        />
      </Elements>
    )}
      <form onSubmit={async (event) => {
        setIsSubmitting(true);
        await handleSubmit(event);
        setIsSubmitting(false);
      }} ref={formRef} className="w-full md:w-96">
        <div className="w-full grid gap-8">
          {passengers.map((passenger) => {
            return (
              <div key={passenger.index}>
                <PassengerForm
                  buses={awayGame.buses}
                  passenger={passenger}                  
                  eventId={id}
                  onChange={(x: Partial<IPassenger>) => {
                    setPassengers(passengers.map((p) => {
                      if (p.index === passenger.index) {
                        return {
                          ...p,
                          ...x,
                        }
                      }
                      return p;
                    }))
                  }}
                  onRemove={(x: number) => {
                    setPassengers(passengers.filter((p) => p.index !== x));
                  }} 
                />
              </div>
            )
          })}
          <div className="flex flex-col space-y-2">
            <Button
              type="button"
              onClick={() => {
                setPassengers([...passengers, { index: passengers.length, busId: awayGame.buses[0]?.id, }])
              }}
              >
                Lägg till passagerare
              </Button>
            <Button disabled={isSubmitting || modalOpen} type="submit">Anmäl</Button>
              <p className="text-center">Summa: {passengers.reduce((acc, { member, youth }) => {
                return acc + getPassengerPrice(!!member, !!youth, awayGame);
              }, 0)} kr</p>
          </div>
        </div>
    </form>
    </>
);
}