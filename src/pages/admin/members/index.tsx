import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { columns } from "~/components/admin/MemberTable/Columns";
import { DownloadMemberListButton } from "~/components/admin/MemberTable/DownloadMemberListButton";
import { MemberTable } from "~/components/admin/MemberTable/MemberTable";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { api } from "~/utils/api";

export default function Admin() {
  const { data: sessionData } = useSession();
  const router = useRouter();
  const { data: members } = api.admin.getActiveMembers.useQuery(undefined, {
    enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN
  });

  if (!members) {
    return <p className="text-center">Laddar...</p>;
  }

  const families = members.filter(
    (member) =>
      member.activeMembership.type === "Familjemedlemskap" &&
      member.activeMembership.familyMembershipOwner
  );

  const familyMembers = members.filter(
    (member) => member.activeMembership.type === "Familjemedlemskap"
  );
  const youthMembers = members.filter(
    (member) => member.activeMembership.type === "Ungdomsmedlemskap"
  );
  const regularMembers = members.filter(
    (member) => member.activeMembership.type === "Ordinarie medlemskap"
  );
  const honaryMembers = members.filter(
    (member) => member.activeMembership.type === "Hedersmedlemskap"
  );

  return (
    <div className="flex flex-col justify-center gap-4 align-middle">
      <Card>
        <CardHeader className="flex gap-8 md:flex-row md:justify-start">
          <div className="space-y-4">
            <p className="text-3xl">Medlemsregister</p>
            <DownloadMemberListButton members={members} />
          </div>
          <div>
            <p>
              Familjemedlemskap: {familyMembers.length} ({families.length}{" "}
              familjer) <br />
              Ungdomsmedlemskap: {youthMembers.length} <br />
              Ordinarie medlemskap: {regularMembers.length} <br />
              Hedersmedlemskap: {honaryMembers.length}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <MemberTable
            data={members}
            columns={columns}
            onRowClick={(id) => router.push(`/admin/members/${id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
