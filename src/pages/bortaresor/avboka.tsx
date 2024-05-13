import { type inferRouterOutputs } from "@trpc/server";
import { type GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import Card from "~/components/atoms/CardLink/CardLink";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { pollRefundStatus } from "~/utils/payment";


type Participant = inferRouterOutputs<AppRouter>['eventPayment']['getManagableBooking']['participants'][number];

export const ParticipantInfo = ({ name, email, payAmount, note }: Participant ) => {
  return (
    <div>
      <p>Namn: {name}</p>
      <p>Email: {email}</p>
      <p>Pris: {payAmount} kr</p>
      {note && (
        <p>Övrigt: {note}</p>
      )}
    </div>
  )
}

export const CancelPage = () => {
  const query = useRouter().query;
  const { data, isLoading, refetch: refetchParticipant } = api.eventPayment.getManagableBooking.useQuery({ token: query.token as string});

  const { mutateAsync: cancelBooking, isLoading: isCancelling } = api.eventPayment.cancelBooking.useMutation();

  const { mutateAsync: checkRefundStatus } = api.eventPayment.checkRefundStatus.useMutation();

  if (!data || isLoading) return null;

  const { participants, departureTime, eventName } = data;

  const handleCancel = async (participant: typeof participants[number]) => {
    if (!participant.cancellationToken) return null;
    // Get the refund ID from cancel booking
    // Use the refund ID to poll the refund status
    const originalPaymentId = await cancelBooking({ token: participant.cancellationToken })

    try {
      await toast.promise(pollRefundStatus(originalPaymentId, checkRefundStatus), {
        success: "Avbokning slutförd",
        error: "Något gick fel, kontakta styrelsen",
        loading: "Avbokar..."
      })
      await refetchParticipant();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <Card title={eventName} titleClassName="!text-3xl" className="w-full md:w-96 m-auto">
        <div className="divide-y divide-gray-100 space-y-4">
          <div>
            <p className="font-bold">Avgångstid: {departureTime}</p>
            <p>
              Avbokning kan endast ske senast 48 timmar innan avresa annars debiteras du fullt pris.
            </p>
          </div>
          {participants.map((participant) => (
            <div key={participant.cancellationToken} className="space-y-2 pt-2">
              <ParticipantInfo {...participant} /> 
              {!participant.cancellationDisabled && !participant.hasCancelled && (
                <Button className="w-full" disabled={isCancelling} onClick={() => handleCancel(participant)}>Avboka</Button>
              )}
              {participant.hasCancelled && (
                <p className="rounded-md border p-2 text-center">Avbokad!</p>
              )}
              {participant.cancellationDisabled && !participant.hasCancelled && (
                <p>Du kan inte avboka inom 48h från avgång</p>
              )}
            </div>
          ))}
        </div>
    </Card>
  )
}

export default CancelPage;

export async function getServerSideProps({ query } : GetServerSidePropsContext) {
  const { token } = query;

  if (!token) {
    return {
      notFound: true
    }
  }

  const ssr = await createSSRHelper();

  await ssr.eventPayment.getManagableBooking.prefetch({ token: token as string });

  return {
    props: {
      dehydratedState: ssr.dehydrate(),
    }
  }
}