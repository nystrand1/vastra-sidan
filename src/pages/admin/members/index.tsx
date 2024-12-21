import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { columns } from "~/components/admin/MemberTable/Columns";
import { DataTable } from "~/components/common/DataTable/DataTable";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { api } from "~/utils/api";


export default function Admin() {
  const { data: sessionData } = useSession();
  const router = useRouter();
  const { data: members } = api.admin.getActiveMembers.useQuery(
    undefined,
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN }
  );

  if (!members) {
    return <p className="text-center">Laddar...</p>

  }
  
  return (
    <div className="flex flex-col justify-center align-middle gap-4">
      <Card>
        <CardHeader>
          <p className="text-3xl">Medlemsregister</p>
        </CardHeader>
        <CardContent>
          <DataTable data={members} columns={columns} onRowClick={(id) => router.push(`/admin/members/${id}`)} />
        </CardContent>
      </Card>
    </div>
  )
}
