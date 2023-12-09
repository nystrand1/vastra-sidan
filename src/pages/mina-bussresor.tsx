import { format } from "date-fns";
import { useSession } from "next-auth/react";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
import LoginPage from "./loggain";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";

export const AwayGamesProfilePage = () => {
  const session = useSession();
  const { data } = api.user.getProfile.useQuery(undefined, { enabled: !!session.data?.user });
  if (!session.data?.user) {
    return <LoginPage />
  }

  if (!data) {
    return <p className="text-center">Laddar...</p>
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <Card
        title="Mina bussresor"
        titleClassName="text-center !text-3xl"
        className="w-full md:w-96 space-y-0"
      >
        <div className="">
          <div className="divide-y divide-gray-100 space-y-4">
            {data.upcomingEvents && data.upcomingEvents?.length > 0 && (
              <p className="text-xl font-semibold">Kommande</p>
            )}
            {data.upcomingEvents && data.upcomingEvents.map((event) => {
              return (
                <div className="flex flex-col pt-2" key={event.id}>
                  <p className="text-lg">{event.name}</p>
                  {event.payedAt && (
                    <p>Betalat: {format(event.payedAt, 'yyyy-MM-dd HH:mm')}</p>
                  )}
                  {event.payAmount && (
                    <p>Pris: {event.payAmount} kr</p>
                  )}
                  {event.isCancelable && event.cancellationToken && !event.hasCancelled && (
                    <ButtonLink className="mt-2" href={`/bortaresor/avboka?token=${event.cancellationToken}`}>Avboka</ButtonLink>
                  )}
                  {event.hasCancelled && (
                    <p className="mt-2 rounded-md border p-2 text-center">Avbokad: {event.cancellationDate}</p>
                  )}
                </div>
              )
            })}
          </div>
          <div className="divide-y divide-gray-100 space-y-4 pt-2">
            {data.pastEvents && data.pastEvents?.length > 0 && (
              <p className="text-xl font-semibold">Tidigare</p>
            )}
            {data.pastEvents && data.pastEvents.map((event) => {
              return (
                <div className="flex flex-col pt-2" key={event.id}>
                  <p className="text-lg">{event.name}</p>
                  {event.payedAt && (
                    <p>Betalat: {format(event.payedAt, 'yyyy-MM-dd HH:mm')}</p>
                  )}
                  {event.payAmount && (
                    <p>Pris: {event.payAmount} kr</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        {!(data.pastEvents?.length || data.upcomingEvents?.length) && (
          <p className="text-center">Kunde inte hitta någon resa</p>
        )}
      </Card>
    </div>
  )
}


export default AwayGamesProfilePage;