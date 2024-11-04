import { Role } from "@prisma/client";
import { type inferRouterOutputs } from "@trpc/server";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";

type AdminUser = NonNullable<inferRouterOutputs<AppRouter>['admin']['getMemberById']>

const Event = (event: AdminUser['upcomingEvents' | 'pastEvents'][number]) => {
  return (
    <div key={event.id} className="outline rounded-md outline-1 p-2">
      <p>{event?.name}</p>
      {event.payAmount && event.payedAt && (
        <>
          <p>{event.payAmount} kr</p>
          <p>Betalat: {event.payedAt}</p>
        </>
      )}
      {event.cancellationDate && (
        <p>Avbokat: {event.cancellationDate}</p>
      )}
    </div>
  )
}

export default function AdminMemberPage() {
  const { data: sessionData } = useSession();
  const { query } = useRouter();
  const { data: member } = api.admin.getMemberById.useQuery(
    { id: query.id as string },
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN && !!query.id }
  );

  if (!member) {
    return <p className="text-center">Laddar...</p>
  }

  return (
    <div className="flex flex-col justify-center align-middle">
      <div className="flex flex-row gap-4 justify-center flex-wrap">
        <Card title={member.name} className="w-96">
            <p>{member.activeMembershipType}</p>
            {member.email && (
              <a href={`mailto:${member.email}`} className="underline">{member.email}</a>
            )}
            {member.phone && (
              <a href={`tel:${member.phone}`}>{member.phone}</a>
            )}
        </Card>
        <Card title={`Kommande bussresor (${member.upcomingEvents.length})`} className="w-96">
          {member.upcomingEvents.length === 0 && (
            <p>Inga kommande bussresor</p>
          )}
          {member.upcomingEvents?.map((event) => (
            <Event key={event.id} {...event} />
          ))}
        </Card>
        <Card title={`Tidigare bussresor (${member.pastEvents.length})`} className="w-96">
          {member.pastEvents.length === 0 && (
            <p>Inga tidigare bussresor</p>
          )}
          {member.pastEvents?.map((event) => (
            <Event key={event.id} {...event} />
          ))}
        </Card>
      </div>
    </div>
  )
}