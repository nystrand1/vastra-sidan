import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useState } from "react";
import Card from "~/components/atoms/CardLink/CardLink";
import { InputField } from "~/components/atoms/InputField/InputField";
import { api } from "~/utils/api";
import Fuse from 'fuse.js';

const fuseOptions = {
	shouldSort: true,
	minMatchCharLength: 3,
	keys: [
		"name",
		"activeMembershipType",
    "id"
	]
};

export default function Admin() {
  const { data: sessionData } = useSession();
  const [search, setSearch] = useState("");
  const { data: members } = api.admin.getActiveMembers.useQuery(
    undefined,
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN }
  );

  if (!members) {
    return <p className="text-center">Laddar...</p>
  }

  const fuse = new Fuse(members, fuseOptions);

  const filteredMembers = search.length > 2 ? fuse.search(search).map((result) => result.item) : members;

  return (
    <div className="flex flex-col justify-center align-middle gap-4">
      <h2 className="text-center text-xl">Medlemmar 2023</h2>
      <div className="space-y-4 w-full md:w-96 m-auto">
        <InputField 
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          label="Sök"
        />
        <div className="h-96 space-y-4 overflow-auto">
          {filteredMembers?.map((member) => (
            <Card 
              title={member.name}
              key={member.id}
              link={`/admin/members/${member.id}`}
            >
              <p>{member.activeMembershipType}</p>
              <p>Blev medlem {member.datePaid}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
