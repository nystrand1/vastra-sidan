import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
import { featureFlags } from "~/utils/featureFlags";

export default function Admin() {
  const { data: sessionData } = useSession();

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
  const today = new Date();
  const upcomingEvents = events.filter((event) => new Date(event.date) > today)

  return (
    <div className="flex flex-col md:flex-row justify-center align-middle gap-4">
      {featureFlags.ENABLE_MEMBERSHIPS && (
        <Card 
          title="Antal medlemmar"
          className="w-full md:w-96 space-y-0 md:h-52"
          contentClassName="flex flex-col justify-between"
        >
          <p className="text-4xl">{members.length}</p>
          <ButtonLink href="/admin/members" className="w-full">Hantera medlemmar</ButtonLink>
        </Card>
      )}
      <Card 
        title="Kommande bussresor"
        className="w-full md:w-96 space-y-0 md:h-52"
        contentClassName="flex flex-col justify-between"
      >
        <p className="text-4xl">{upcomingEvents.length}</p>
        <ButtonLink href="/admin/events" className="w-full">Se alla bussresor</ButtonLink>
      </Card>
    </div>
  )
}
