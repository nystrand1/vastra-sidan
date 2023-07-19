import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useState } from "react";
import { api } from "../../../utils/api";
import { Button } from "../../atoms/Button/Button";
import { InputField } from "../../atoms/InputField/InputField";
import { OutlinedButton } from "../../atoms/OutlinedButton/OutlinedButton";
import { toast } from "react-hot-toast";
import Checkbox from "~/components/atoms/Checkbox/Checkbox";


interface IPassenger {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  member: boolean;
  youth: boolean;
  consent: boolean;
}

const PassengerForm = ({ index, passenger, onRemove } : { index: number, passenger?: Partial<IPassenger>, onRemove: (index: number) => void }) => {
  return (
    <div className="flex flex-col space-y-2 p-4 bg-gray-700 rounded-md">
      <InputField
        label="Förnamn"
        placeholder="förnamn..."
        id={`firstName_${index}`}
        name={`firstName_${index}`}
        defaultValue={passenger?.firstName || ""}
        required
      />
       <InputField
        label="Efternamn"
        placeholder="efternamn..."
        id={`lastName_${index}`}
        name={`lastName_${index}`}
        defaultValue={passenger?.lastName || ""}
        required
      />
       <InputField
        label="Mobilnummer"
        placeholder="mobil..."
        id={`phoneNumber_${index}`}
        name={`phoneNumber_${index}`}
        defaultValue={passenger?.phoneNumber || ""}
        type="tel"
        required
      />
      <InputField
        label="Email"
        placeholder="email..."
        id={`email_${index}`}
        name={`email_${index}`}
        defaultValue={passenger?.email || ""}
        required
      />
      <Checkbox
        label="Jag har läst & förstått reglerna kring bussresorna"
        id={`email_${index}`}
        name={`email_${index}`}
        isChecked={false}
        required
      />
      {index > 0 && (
        <OutlinedButton type="button" onClick={() => onRemove(index)}>Ta bort</OutlinedButton>
      )}
    </div>
  )
}


export const AwayGameForm = () => {
  const { query } = useRouter();
  const { id } = query;
  const session = useSession();
  const [passengers, setPassengers] = useState([{ index: 0 }]);
  if (!id) return null
  if (Array.isArray(id)) return null;
  const { data: awayGame, isLoading } = api.wordpress.getAwayGame.useQuery({ id: id });
  const { mutateAsync: submitForm } = api.payment.submitEventForm.useMutation();
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
      return acc;
    }, {} as Record<string, any>);
    await toast.promise(submitForm({formattedValues}), {
      loading: 'Skickar anmälan...',
      success: 'Anmälan skickad!',
      error: 'Något gick fel, försök igen senare.',
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-8">
        {passengers.map(({ index }) => {
          let passenger;
          if (index === 0 && session.data) {
            passenger = {
              firstName: session.data.user?.name || "",
              lastName: "",
              phoneNumber: "",
              email: session.data.user?.email || "",
              member: false,
              youth: false,
            } as IPassenger
          }
          return (
            <div key={index}>
              <PassengerForm index={index} passenger={passenger} onRemove={(x: number) => {
                setPassengers(passengers.filter((p) => p.index !== x));
              }} />
            </div>
          )
        })}
        <div className="flex flex-col space-y-2">
          <Button
            type="button"
            onClick={() => {
              setPassengers([...passengers, { index: passengers.length + 1 }])
            }}
            >
              Lägg till passagerare
            </Button>
          <Button type="submit">Anmäl</Button>
        </div>
      </div>
  </form>
);
}