import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { Progressbar } from "~/components/atoms/Progressbar/Progressbar";
import { api } from "~/utils/api";

export default function Admin() {
  const { data: sessionData } = useSession();
  const title = sessionData?.user?.role === Role.ADMIN ? `Admin - ${sessionData.user?.name || ''}` : "Logga in för att se adminsidan";

  const { data: events } = api.admin.getEvents.useQuery(
    undefined,
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN }
    );

  const { data: members } = api.admin.getActiveMembers.useQuery(
    undefined,
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN }
  );
  if (!events || !members) {
    return <p className="text-center">Laddar...</p>
  }
  const { upcomingEvents } = events;

  const seats = upcomingEvents.reduce((acc, event) => {
    const bookedSeats = event.buses.reduce((acc, bus) => {
      return acc + bus.passengers.length
    }, 0)
    const totalSeats = event.buses.reduce((acc, bus) => {
      return acc + bus.seats
    }, 0)
    return { bookedSeats: acc.bookedSeats + bookedSeats, totalSeats: acc.totalSeats + totalSeats }
  }, { bookedSeats: 0, totalSeats: 0 })
  return (
    <>
      <h1 className="text-center text-3xl mb-8 mt-10">
        {title}
      </h1>
      <div className="flex flex-col md:flex-row justify-center align-middle space-y-4">
        <Card 
          title="Antal medlemmar"
          link="/admin/event"
          className="w-full md:w-96 space-y-0 m-auto"
        >
          <p className="text-4xl">{members.length}</p>
          <ButtonLink href="/admin/members" className="w-full">Hantera medlemmar</ButtonLink>
        </Card>
        <Card 
          title="Kommande bussresor"
          link="/admin/event"
          className="w-full md:w-96 space-y-0 m-auto"
        >
          {seats.totalSeats > 0 && (
            <Progressbar 
              label="Total bokade platser"
              maxValue={seats.totalSeats}
              currentValue={seats.bookedSeats}
            />
          )}
          {seats.totalSeats === 0 && (
            <p className="text-center">Ingen resa planerad</p>
          )}
          <ButtonLink href="/admin/event" className="w-full">Se alla bussresor</ButtonLink>
        </Card>
      </div>
    </>
  )
}
