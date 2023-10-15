import { SwishRefundStatus, type VastraEvent } from "@prisma/client";
import { type inferRouterOutputs } from "@trpc/server";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import Checkbox from "~/components/atoms/Checkbox/Checkbox";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { TextArea } from "~/components/atoms/TextArea/TextArea";
import { type AppRouter } from "~/server/api/root";
import { participantSchema } from "~/utils/zodSchemas";
import { api } from "../../../utils/api";
import { Button } from "../../atoms/Button/Button";
import { InputField } from "../../atoms/InputField/InputField";
import { OutlinedButton } from "../../atoms/OutlinedButton/OutlinedButton";
import { SwishModal } from "../SwishModal/SwishModal";
import { useSession } from "next-auth/react";
import { pollPaymentStatus } from "~/utils/payment";


interface IPassenger {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  member: boolean;
  youth: boolean;
  note: string;
  consent: boolean;
  busId: string;
}

type PassengerWithIndex = Partial<IPassenger> & { index: number };

interface PassengerFormProps {
  passenger: PassengerWithIndex;
  onRemove: (index: number) => void;
  onChange: (passenger: Partial<IPassenger>) => void;
  buses: inferRouterOutputs<AppRouter>['public']['getAwayGame']['buses'];
  eventId: string;
}

const getPassengerPrice = (member: boolean, youth: boolean, event: VastraEvent) => {
  if (member && youth) {
    return event.youthMemberPrice;
  }
  if (youth) {
    return event.youthPrice;
  }
  if (member) {
    return event.memberPrice;
  }
  return event.defaultPrice
};

const PassengerForm = ({ passenger, onRemove, onChange, buses, eventId } : PassengerFormProps) => {
  const { data: event } = api.public.getAwayGame.useQuery({ id: eventId });
  const { index, member, youth } = passenger;
  if (!event) return null;
  const busOptions = buses.map((bus) => {
    const fullyBooked = bus._count.passengers >= bus.seats;
    return {
      value: bus.id,
      label: `${bus.name} - (${bus._count.passengers}/${bus.seats})` + (fullyBooked ? " - Fullbokad" : "") ,
      disabled: fullyBooked
    }
  })

  const isSwishNumber = index === 0;

  return (
    <div className="flex flex-col space-y-2 p-4 bg-gray-700 rounded-md">
      <InputField
        label="Förnamn"
        placeholder="förnamn..."
        id={`firstName_${index}`}
        name={`firstName_${index}`}
        value={passenger.firstName}
        onChange={(e) => {
          onChange({ firstName: e.target.value });
        }}
        required
      />
       <InputField
        label="Efternamn"
        placeholder="efternamn..."
        id={`lastName_${index}`}
        name={`lastName_${index}`}
        value={passenger.lastName}
        onChange={(e) => { onChange({ lastName: e.target.value }) }}
        required
      />
       <InputField
        label="Mobilnummer"
        placeholder="mobil..."
        id={`phone_${index}`}
        name={`phone_${index}`}
        type="tel"
        value={passenger.phone}
        onChange={(e) => { onChange({ phone: e.target.value }) }}
        required
      />
      {isSwishNumber && (
        <span className="text-xs">Detta nummer kommer användas för Swish-betalning</span>
      )}
      <InputField
        label="Email"
        placeholder="email..."
        id={`email_${index}`}
        name={`email_${index}`}
        value={passenger.email}
        onChange={(e) => { onChange({ email: e.target.value }) }}
        required
      />
      <SelectField
        label="Buss"
        id={`busId_${index}`}
        name={`busId_${index}`}
        placeholder="Välj buss..."
        onChange={(e) => { onChange({ busId: e.target.value }) }}
        options={busOptions}
      />
      <TextArea
        label="Övrigt"
        id={`note_${index}`}
        name={`note_${index}`}
        onChange={(e) => { onChange({ note: e.target.value }) }}
        placeholder="Övrigt... (t.ex endast dit)"
      />
      <Checkbox
        label="Medlem"
        id={`member_${index}`}
        name={`member_${index}`}
        onChange={(e) => { 
          onChange({ member: e.target.checked });
        }}
      />
      <Checkbox
        label="Ungdom (upp till 20 år)"
        id={`youth_${index}`}
        name={`youth_${index}`}
        onChange={(e) => { 
          onChange({ youth: e.target.checked }) 
        }}
      />
      <Checkbox
        label="Jag har läst & förstått reglerna kring bussresorna"
        id={`consent_${index}`}
        name={`consent_${index}`}
        onChange={(e) => { onChange({ consent: e.target.checked }) }}
        required
      />
      {index > 0 && (
        <OutlinedButton type="button" onClick={() => onRemove(index)}>Ta bort</OutlinedButton>
      )}
      <p>Pris: {getPassengerPrice(!!member, !!youth, event)} kr</p>
    </div>
  )
}

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


export const AwayGameForm = () => {
  const { query } = useRouter();
  const { data: sessionData } = useSession();
  const { id } = query;
  const [passengers, setPassengers] = useState<PassengerWithIndex[]>([{ index: 0 }]);
  const [modalOpen, setModalOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null); 
  useEffect(() => {
    if (sessionData?.user) {
      const initialPassenger: PassengerWithIndex = {
        index: 0,
        firstName: sessionData?.user.firstName ?? '',
        lastName: sessionData?.user.lastName ?? '',
        email: sessionData?.user.email ?? ''
      }
      setPassengers([initialPassenger]);
    }
  }, [sessionData])
  if (!id) return null
  if (Array.isArray(id)) return null;
  const { data: awayGame, isLoading } = api.public.getAwayGame.useQuery({ id: id });
  const { mutateAsync: createPayment } = api.eventPayment.requestSwishPayment.useMutation();
  const { mutateAsync: checkPaymentStatus } = api.eventPayment.checkPaymentStatus.useMutation();

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
    const payer = participants[0];

    if (!payer) {
      toast.error("Du måste ange en betalare");
      setModalOpen(false);
      return;
    }

    try {
      const paymentId = await createPayment({
        participants,
        eventId: id,
      });

      const payment = await pollPaymentStatus(paymentId, checkPaymentStatus);

      if (payment.success) {
        toast.success("Nu är du anmäld! Bekräftelse skickas till din mail.");
        setPassengers([{ index: 0 }]);
        formRef.current?.reset();
      }
    } catch (error) {
      toast.error("Något gick fel, försök igen!");
    }
    setModalOpen(false);
  }
  return (
    <>
      <SwishModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      <form onSubmit={handleSubmit} ref={formRef}>
        <div className="grid gap-8">
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
                setPassengers([...passengers, { index: passengers.length }])
              }}
              >
                Lägg till passagerare
              </Button>
            <Button type="submit">Anmäl</Button>
              <p className="text-center">Summa: {passengers.reduce((acc, { member, youth }) => {
                return acc + getPassengerPrice(!!member, !!youth, awayGame);
              }, 0)} kr</p>
          </div>
        </div>
    </form>
    </>
);
}