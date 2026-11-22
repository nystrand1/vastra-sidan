import { type inferRouterOutputs } from "@trpc/server";
import Error from "next/error";
import Card from "~/components/atoms/CardLink/CardLink";
import { ParticipantInfo } from "~/components/common/ParticipantInfo/ParticipantInfo";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { useAppSession } from "~/utils/authClient";
import { featureFlags } from "~/utils/featureFlags";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { getTransportLabels } from "~/utils/transport";
import LoginPage from "./loggain";

type MyTrip = inferRouterOutputs<AppRouter>["user"]["getMyBookings"]["upcoming"][number];
type MySeat = MyTrip["seats"][number];

const seatStatus = (seat: MySeat) => {
  if (seat.hasCancelled) return "Avbokad";
  if (seat.refundPending) return "Återbetalning behandlas";
  if (seat.transferredAway) return "Överlåten";
  return null;
};

/** A seat the signed-in user can see but not manage: past trips and seats they gave away. */
const ReadOnlySeat = ({ seat, busName }: { seat: MySeat; busName?: string }) => {
  const status = seatStatus(seat);
  return (
    <div className="pt-2">
      <p>Namn: {seat.name}</p>
      <p>Email: {seat.email}</p>
      {busName && <p>Plats: {busName}</p>}
      {seat.payAmount !== null && <p>Pris: {seat.payAmount} kr</p>}
      {status && <p className="mt-2 rounded-md border p-2 text-center">{status}</p>}
    </div>
  );
};

const TripCard = ({ trip, onChanged }: { trip: MyTrip; onChanged: () => Promise<unknown> }) => {
  const transport = getTransportLabels(trip.isTrain);
  const busOptions = trip.buses.map((bus) => {
    const fullyBooked = bus.availableSeats <= 0;
    return {
      value: bus.id,
      label: `${bus.name} - (${bus._count.passengers}/${bus.seats})` + (fullyBooked ? " - Fullbokad" : ""),
      disabled: fullyBooked
    };
  });

  return (
    <Card title={trip.eventName} className="w-full md:w-96">
      <div className="divide-y divide-gray-100 space-y-4">
        <div>
          <p className="font-bold">Datum: {formatSwedishTime(trip.date, "yyyy-MM-dd")}</p>
          <p className="font-bold">Avgångstid: {trip.departureTime}</p>
        </div>
        {trip.seats.map((seat, i) =>
          seat.cancellationToken ? (
            <ParticipantInfo
              key={seat.cancellationToken}
              {...seat}
              busOptions={busOptions}
              transport={transport}
              onChanged={onChanged}
            />
          ) : (
            <ReadOnlySeat
              key={`${seat.email}-${i}`}
              seat={seat}
              busName={trip.buses.find((bus) => bus.id === seat.busId)?.name}
            />
          )
        )}
      </div>
    </Card>
  );
};

const TripSection = ({
  title,
  empty,
  trips,
  onChanged
}: {
  title: string;
  empty: string;
  trips: MyTrip[];
  onChanged: () => Promise<unknown>;
}) => (
  <section className="flex w-full flex-col items-center gap-4">
    <h2 className="text-2xl font-semibold">{title}</h2>
    {trips.length === 0 ? (
      <p>{empty}</p>
    ) : (
      trips.map((trip) => <TripCard key={trip.eventId} trip={trip} onChanged={onChanged} />)
    )}
  </section>
);

export const AwayGamesProfilePage = () => {
  const { user, isPending } = useAppSession();
  const { data, refetch } = api.user.getMyBookings.useQuery(undefined, {
    enabled: featureFlags.ENABLE_LOGIN && !!user
  });

  if (!featureFlags.ENABLE_LOGIN) {
    return <Error statusCode={404} />;
  }

  if (isPending) {
    return <p className="text-center">Laddar...</p>;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!data) {
    return <p className="text-center">Laddar...</p>;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <TripSection
        title="Kommande resor"
        empty="Du har inga kommande resor."
        trips={data.upcoming}
        onChanged={refetch}
      />
      <TripSection title="Tidigare resor" empty="Inga tidigare resor." trips={data.past} onChanged={refetch} />
    </div>
  );
};

export default AwayGamesProfilePage;
