import { type GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { pollRefundStatus } from "~/utils/payment";


export const ParticipantInfo = () => {
  const query = useRouter().query;
  const { data, isLoading } = api.eventPayment.getCancellableParticipant.useQuery({ token: query.token as string});
  if (!data || isLoading) return null;
  const { name, email, eventName, departureTime, payAmount, note } = data.participant;
  return (
    <div>
      <h2>Resenär</h2>
      <p>Namn: {name}</p>
      <p>Email: {email}</p>
      <p>Resa: {eventName}</p>
      <p>Avgångstid: {departureTime}</p>
      <p>Pris: {payAmount} kr</p>
      {note && (
        <p>Övrigt: {note}</p>
      )}
      <p>
        Avbokning kan endast ske senast 48 timmar innan avresa annars debiteras du fullt pris.
      </p>
    </div>
  )
}

export const CancelPage = () => {
  const query = useRouter().query;
  const { data, isLoading, refetch: refetchParticipant } = api.eventPayment.getCancellableParticipant.useQuery({ token: query.token as string});

  const { mutateAsync: cancelBooking, isLoading: isCancelling } = api.eventPayment.cancelBooking.useMutation();

  const { mutateAsync: checkRefundStatus } = api.eventPayment.checkRefundStatus.useMutation();

  if (!data || isLoading) return null;

  const { participant, cancellationDisabled, hasCancelled } = data;

  const handleCancel = async () => {
    if (!participant.cancellationToken) return null;
    // Get the refund ID from cancel booking
    // Use the refund ID to poll the refund status
    const refundId = await cancelBooking({ token: participant.cancellationToken })

    try {
      await toast.promise(pollRefundStatus(refundId, checkRefundStatus), {
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
    <div className="flex flex-col space-y-4">
      <h1 className="text-3xl">Avbokning</h1>
      {participant && <ParticipantInfo />}
      {participant && !cancellationDisabled && !hasCancelled && (
        <Button className="w-full md:w-56" disabled={isCancelling} onClick={handleCancel}>Avboka</Button>
      )}
      {hasCancelled && (
        <p className="rounded-md border p-4 text-lg md:w-fit">Du har redan avbokat denna resa</p>
      )}
      {cancellationDisabled && !hasCancelled && (
        <p>Du kan inte avboka inom 48h från avgång</p>
      )}
    </div>
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

  await ssr.eventPayment.getCancellableParticipant.prefetch({ token: token as string });

  return {
    props: {
      dehydratedState: ssr.dehydrate(),
    }
  }
}