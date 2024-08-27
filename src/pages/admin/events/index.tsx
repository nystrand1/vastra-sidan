import { Role } from "@prisma/client";
import { type inferRouterOutputs } from "@trpc/server";
import { useSession } from "next-auth/react";
import Card from "~/components/atoms/CardLink/CardLink";
import { Progressbar } from "~/components/atoms/Progressbar/Progressbar";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";

type Events = inferRouterOutputs<AppRouter>['admin']['getEvents']['pastEvents' | 'upcomingEvents']

export const EventGrid = ({ events }: { events: Events }) => {
  return events && events.map((event) => (
    <div key={event.id} className="col-span-12 md:col-span-4">
      <Card link={`/admin/events/${event.id}`} title={event.name}>
        {event.buses && event.buses.map((bus) => (
          <Progressbar
            key={bus.id}
            label={bus.name}
            maxValue={bus.seats}
            currentValue={bus.passengers.length || 0}
          />
        ))}
        <div className="flex justify-start gap-12">
          <div className="flex flex-col">
            <p className="text-lg">Vuxna</p>
            <p><span>Medlem: </span>{event.amountAdultMember}</p>
            <p><span>Ej medlem: </span>{event.amountAdultNonMember}</p>
          </div>
          <div className="flex flex-col">
            <p className="text-lg">Ungdomar</p>
            <p><span>Medlem: </span>{event.amountYouthMember}</p>
            <p><span>Ej medlem: </span>{event.amountYouthNonMember}</p>
          </div>
        </div>
      </Card>
    </div>
  ))
};


export default function AdminEvent() {
  const { data: sessionData } = useSession();

  const { data: events } = api.admin.getEvents.useQuery(
    undefined,
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN }
    );

  if (!events) {
    return <p className="text-center">Laddar...</p>
  }

  const { upcomingEvents, pastEvents } = events;
  return (
    <div className="space-y-4">
      <h2 className="text-center text-2xl">
        Kommande bussresor
      </h2>
      <div className="grid grid-cols-12 gap-4 md:gap-8 text-black max-h-[60vh] md:max-h-[100%] overflow-auto">
        <EventGrid events={upcomingEvents} />
      </div>
      <h2 className="text-center text-2xl">
        Tidigare bussresor
      </h2>
      <div className="grid grid-cols-12 gap-4 md:gap-8 text-black max-h-[60vh] md:max-h-[100%] overflow-auto">
        <EventGrid events={pastEvents} />
      </div>
    </div>
  )
}
