import { SwishRefundStatus } from "@prisma/client";
import { type GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { delay } from "~/utils/helpers";


export const ParticipantInfo = () => {
  const query = useRouter().query;
  const { data, isLoading } = api.payment.getCancellableParticipant.useQuery({ token: query.token as string});
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
  const { data, isLoading, refetch: refetchParticipant } = api.payment.getCancellableParticipant.useQuery({ token: query.token as string});

  const { mutateAsync: cancelBooking, isLoading: isCancelling } = api.payment.cancelBooking.useMutation();

  const { mutateAsync: checkRefundStatus } = api.payment.checkRefundStatus.useMutation();

  if (!data || isLoading) return null;

  const { participant, cancellationDisabled, hasCancelled } = data;


  const pollRefundStatus = async (refundId: string, attempt = 0): Promise<{ success : boolean }> => {
    if (attempt > 30) {
      throw new Error("Could not poll refund status");
    }
    
    const refund = await checkRefundStatus({ refundId });

    if (refund.status === SwishRefundStatus.PAID) {
      return {
        success: true,
      }
    }
    await delay(1000);
    return pollRefundStatus(refundId, attempt + 1);
  }


  const handleCancel = async () => {
    if (!participant.cancellationToken) return null;
    // Get the refund ID from cancel booking
    // Use the refund ID to poll the refund status
    const refundId = await cancelBooking({ token: participant.cancellationToken })


    await toast.promise(pollRefundStatus(refundId), {
      success: "Avbokning slutförd",
      error: "Något gick fel, kontakta styrelsen",
      loading: "Avbokar..."
    })
    await refetchParticipant();
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

  await ssr.payment.getCancellableParticipant.prefetch({ token: token as string });

  return {
    props: {
      dehydratedState: ssr.dehydrate(),
    }
  }
}