import { Role } from "@prisma/client";
import { type GetServerSidePropsContext } from "next";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { columns } from "~/components/admin/PassengerTable/Columns";
import { PassengerTable } from "~/components/admin/PassengerTable/PassengerTable";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { prisma } from "~/server/db";
import { api } from "~/utils/api";


export const AdminEventPage = () => {
  const { query } = useRouter();
  const { data: sessionData } = useSession();
  const { data: event, isLoading } = api.admin.getEvent.useQuery(
    { id: query.id as string },
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN && !!query.id }
  );

  if (!event || isLoading) {
    return <p className="text-center">Laddar event...</p>
  }

  const amountYouthMembers = event.participants.filter((participant) => participant.member && participant.youth).length;
  const amountYouthNonMembers = event.participants.filter((participant) => !participant.member && participant.youth).length;
  const amountAdultMembers = event.participants.filter((participant) => participant.member && !participant.youth).length;
  const amountAdultNonMembers = event.participants.filter((participant) => !participant.member && !participant.youth).length;

  const allOption = [{ label: "Alla", value: "" }];
  const busOptions = event?.buses.map((bus) => ({
    label: bus.name,
    value: bus.name
  }));

  const allOptions = allOption.concat(busOptions ?? []);

  return (
    <div className="flex flex-col justify-center align-middle gap-4">
      <Card>
        <CardHeader>
          <p className="text-3xl">{event.title}</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row gap-4 mb-2">
            <div>
              <p className="text-lg font-medium">Vuxna:</p>
              <p>Medlemmar: {amountAdultMembers}</p>
              <p>Icke-medlemmar: {amountAdultNonMembers}</p>
            </div>
            <div>
              <p className="text-lg font-medium">Ungdomar:</p>
              <p>Medlemmar: {amountYouthMembers}</p>
              <p>Icke-medlemmar: {amountYouthNonMembers}</p>
            </div>
          </div>
          <PassengerTable busOptions={allOptions} data={event?.participants ?? []} columns={columns} />
        </CardContent>
      </Card>
    </div>
  )
};


export default AdminEventPage;


export async function getServerSideProps({ query } : GetServerSidePropsContext) {
  const { id } = query;
  if (!id) {
    return {
      notFound: true
    }
  }

  const event = await prisma.vastraEvent.findFirst({
    where: {
      id: id as string
    }
  })

  if (!event) {
    return {
      notFound: true
    }
  }

  return {
    props: {}
  }
}
