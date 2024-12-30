import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { columns } from "~/components/admin/EventTable/Columns";
import { EventTable } from "~/components/admin/EventTable/EventTable";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { api } from "~/utils/api";

export default function AdminEvent() {
  const { data: sessionData } = useSession();
  const router = useRouter();

  const { data: events } = api.admin.getEvents.useQuery(
    undefined,
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN }
    );

  if (!events) {
    return <p className="text-center">Laddar...</p>
  }

  return (
    <div className="flex flex-col justify-center align-middle gap-4">
      <Card>
        <CardHeader>
          <p className="text-3xl">Bortaresor</p>
        </CardHeader>
        <CardContent>
          <EventTable data={events} columns={columns} onRowClick={(id) => router.push(`/admin/events/${id}`)} />
        </CardContent>
      </Card>
    </div>
  )
}
