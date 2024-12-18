import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";

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
            <p>{member.activeMembership.type}</p>
            <p>{member.activeMembership.becameMemberAt.toDateString()}</p>
            {member.email && (
              <a href={`mailto:${member.email}`} className="underline">{member.email}</a>
            )}
            {member.phone && (
              <a href={`tel:${member.phone}`}>{member.phone}</a>
            )}
        </Card>        
      </div>
    </div>
  )
}