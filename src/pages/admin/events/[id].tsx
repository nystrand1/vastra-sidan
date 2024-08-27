import { type Bus, type Participant, Role } from "@prisma/client";
import { type GetServerSidePropsContext } from "next";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import Card from "~/components/atoms/CardLink/CardLink";
import { OutlinedButton } from "~/components/atoms/OutlinedButton/OutlinedButton";
import { Progressbar } from "~/components/atoms/Progressbar/Progressbar";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { prisma } from "~/server/db";
import { api } from "~/utils/api";

const PassengerCard = ({ passenger, refetch } : { passenger: Participant, refetch: () => void }) => {
  const { data: updatedCheckIn, mutateAsync: toggleCheckIn } = api.admin.checkInParticipant.useMutation();

  const checkedIn = updatedCheckIn ?? passenger.checkedIn;

  const handleCheckIn = async () => {
    await toast.promise(toggleCheckIn({ id: passenger.id, checkedIn: !checkedIn }), {
      success: `${passenger.name} ${checkedIn ? 'utcheckad' : 'incheckad'}`,
      error: "Något gick fel, kontakta Filip",
      loading: checkedIn ? "Checkar ut..." : "Checkar in..."
    });
    refetch();
  }
  return (
    <Card>
      <div className="w-fill rounded-md flex flex-col space-y-2 md">
        <div className="grid grid-cols-12">
          <div className="col-span-12 md:col-span-6 flex flex-col">
            <p className="text-xl">{passenger.name}</p>
            <a className="underline text-md" href={`mailto:${passenger.email}`}>{passenger.email}</a>
            <a className="underline text-md" href={`tel:${passenger.phone}`}>{passenger.phone}</a>
          </div>
          <div className="col-span-12 md:col-span-6">
            {passenger.member && (
              <p className="text-md">Medlem</p>
            )}
            {passenger.youth && (
              <p className="text-md">Ungdom</p>
            )}
            {passenger.note && (
              <p className="text-md">Övrigt: {passenger.note}</p>
            )}
          </div>
        </div>
        {checkedIn && (
          <OutlinedButton className="text-white" onClick={handleCheckIn}>{checkedIn ? 'Checka Ut' : 'Checka In'}</OutlinedButton>
        )}
        {!checkedIn && (
          <Button onClick={handleCheckIn}>{checkedIn ? 'Checka Ut' : 'Checka In'}</Button>
        )}
      </div>
    </Card>
  )
}


export const AdminEventPage = () => {
  const { query } = useRouter();
  const { data: sessionData } = useSession();
  const { data: event, isLoading, refetch } = api.admin.getEvent.useQuery(
    { id: query.id as string },
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN && !!query.id }
  );

  const [selectedBus, setSelectedBus] = useState<Bus & { passengers: Participant[]} | null>(event?.buses[0] || null);

  useEffect(() => {
    setSelectedBus(event?.buses[0] || null);
  }, [event])

  const passengerAmount = selectedBus?.passengers.length || 0;
  const checkedInAmount = selectedBus?.passengers.filter((x) => x.checkedIn).length || 0;
  const amountAdult = selectedBus?.passengers.filter((x) => !x.youth).length || 0;
  const amountYouth = selectedBus?.passengers.filter((x) => x.youth).length || 0;

  if (!event && isLoading) {
    return <p className="text-center">Laddar event...</p>
  }

  return (
    <div className="flex flex-col space-y-2 md:w-5/12 m-auto">
      <h1 className="text-center text-3xl mb-8 mt-10">
        {event?.name}
      </h1>
      <Card>
        <SelectField
          label="Buss"
          options={event?.buses.map((bus) => ({ label: bus.name, value: bus.id })) || []}
          value={selectedBus?.id || ""}
          onChange={(e) => {
            const bus = event?.buses.find((bus) => bus.id === e.target.value);
            if (bus) {
              setSelectedBus(bus);
            }
          }}
        />
        <div className="flex justify-center gap-8">
          <div className="flex flex-col">
            <p>Antal vuxna</p>
            {amountAdult}
          </div>
          <div className="flex flex-col">
            <p>Antal ungdomar</p>
            {amountYouth}
          </div>
        </div>
        <Progressbar maxValue={passengerAmount} label="Incheckade" currentValue={checkedInAmount} />
      </Card>
      {selectedBus && selectedBus.passengers.length > 0 && (
        <div key={selectedBus.id} className="flex flex-col space-y-4">
        {selectedBus.passengers.map((passenger) => <PassengerCard key={passenger.id} passenger={passenger} refetch={refetch} />)}
      </div>
      )}
      {selectedBus && selectedBus.passengers.length === 0 && (
        <p>Inga passagerare på denna buss</p>
      )}
    </div>
  )
};


export default AdminEventPage;


export async function getServerSideProps({ query } : GetServerSidePropsContext) {
  const { id } = query;
  if (!id) {
    return {
      notFound: true
    }
  }

  const event = await prisma.vastraEvent.findFirst({
    where: {
      id: id as string
    }
  })

  if (!event) {
    return {
      notFound: true
    }
  }

  return {
    props: {}
  }
}
