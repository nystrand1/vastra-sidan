import { Role } from "@prisma/client";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "~/components/atoms/Button/Button";
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

  return (
    <>
      <h1 className="text-center text-3xl mb-8 mt-10">
        {title}
      </h1>
      <div className="grid grid-cols-12 gap-4 md:gap-8 text-black max-h-[60vh] md:max-h-[100%] overflow-auto">
        {events && events.map((event) => (
          <div key={event.id} className="col-span-12 md:col-span-4">
            <Card link={`/admin/event/${event.id}`} title={event.name}>
              {event.buses && event.buses.map((bus) => (
                <Progressbar
                  key={bus.id}
                  label={bus.name}
                  maxValue={bus.seats}
                  currentValue={bus.passengers.length || 0}
                />
              ))}
            </Card>
          </div>
        ))}
      </div>
      <Auth />
    </>
  )
}


function Auth() {
  const { data: sessionData } = useSession();

  return (
    <div className="flex flex-col items-center justify-center absolute bottom-8 left-0 right-0 m-auto">
      <Button onClick={sessionData ? () => void signOut() : () => void signIn()}>
        <p>{sessionData ? "Logga ut" : "Logga in"}</p>
      </Button>
    </div>
  );
}