import { type VastraEvent } from "@prisma/client";
import { type inferRouterOutputs } from "@trpc/server";
import Checkbox from "~/components/atoms/Checkbox/Checkbox";
import { InputField } from "~/components/atoms/InputField/InputField";
import { OutlinedButton } from "~/components/atoms/OutlinedButton/OutlinedButton";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { TextArea } from "~/components/atoms/TextArea/TextArea";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";

export interface IPassenger {
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

export type PassengerWithIndex = Partial<IPassenger> & { index: number };

export interface PassengerFormProps {
  passenger: PassengerWithIndex;
  onRemove: (index: number) => void;
  onChange: (passenger: Partial<IPassenger>) => void;
  buses: inferRouterOutputs<AppRouter>['public']['getAwayGame']['buses'];
  eventId: string;
}

export const getPassengerPrice = (member: boolean, youth: boolean, event: VastraEvent) => {
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

export const PassengerForm = ({ passenger, onRemove, onChange, buses, eventId } : PassengerFormProps) => {
  const { data: event } = api.public.getAwayGame.useQuery({ id: eventId });
  const { index, member, youth } = passenger;
  if (!event) return null;
  const busOptions = buses.map((bus) => {
    const fullyBooked = bus.availableSeats <= 0;
    return {
      value: bus.id,
      label: `${bus.name} - (${bus._count.passengers}/${bus.seats})` + (fullyBooked ? " - Fullbokad" : "") ,
      disabled: fullyBooked
    }
  })

  return (
    <div className="flex flex-col space-y-2 p-4 bg-slate-800 rounded-lg">
      <InputField
        label="Förnamn"
        placeholder="Förnamn..."
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
        placeholder="Efternamn..."
        id={`lastName_${index}`}
        name={`lastName_${index}`}
        value={passenger.lastName}
        onChange={(e) => { onChange({ lastName: e.target.value }) }}
        required
      />
       <InputField
        label="Mobilnummer"
        placeholder="Mobil..."
        id={`phone_${index}`}
        name={`phone_${index}`}
        type="tel"
        value={passenger.phone}
        onChange={(e) => { onChange({ phone: e.target.value }) }}
        required
      />
      <InputField
        label="Email"
        placeholder="Email..."
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
        value={passenger.busId}
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
        checked={member}
        onChange={(e) => { 
          onChange({ member: e.target.checked });
        }}
      />
      <Checkbox
        label="Ungdom (upp till 20 år)"
        id={`youth_${index}`}
        name={`youth_${index}`}
        checked={youth}
        onChange={(e) => { 
          onChange({ youth: e.target.checked }) 
        }}
      />
      <Checkbox
        label="Jag har läst & förstått reglerna kring bussresorna"
        id={`consent_${index}`}
        name={`consent_${index}`}
        checked={passenger.consent}
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