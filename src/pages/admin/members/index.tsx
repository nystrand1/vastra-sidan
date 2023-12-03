import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";

export default function Admin() {
  const { data: sessionData } = useSession();

  const { data: members } = api.admin.getActiveMembers.useQuery(
    undefined,
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN }
  );
  if (!members) {
    return <p className="text-center">Laddar...</p>
  }

  return (
    <div className="flex flex-col md:flex-row justify-center align-middle gap-4">
      <Card 
        title="Antal medlemmar"
        link="/admin/event"
        className="w-full md:w-96 space-y-0 m-auto"
      >
        <p className="text-4xl">{members.length}</p>
        <ButtonLink href="/admin/members" className="w-full">Hantera medlemmar</ButtonLink>
      </Card>
    </div>
  )
}
