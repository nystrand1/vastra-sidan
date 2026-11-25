import { Role } from "~/generated/prisma/browser";
import { useAppSession } from "~/utils/authClient";
import { useRouter } from "next/router";
import { columns } from "~/components/admin/EventTable/Columns";
import { EventTable } from "~/components/admin/EventTable/EventTable";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { api } from "~/utils/api";

export default function AdminEvent() {
  const { user } = useAppSession();
  const router = useRouter();

  const { data: events } = api.admin.getEvents.useQuery(
    undefined,
    { enabled: !!user && user.role === Role.ADMIN, staleTime: 0 }
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
