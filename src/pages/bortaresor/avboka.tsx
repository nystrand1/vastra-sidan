import { SwishRefundStatus } from "@prisma/client";
import { isBefore, subDays } from "date-fns";
import { type GetServerSidePropsContext, type InferGetServerSidePropsType } from "next";
import { toast } from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import { prisma } from "~/server/db";
import { api } from "~/utils/api";


export const ParticipantInfo = (props: InferGetServerSidePropsType<typeof getServerSideProps>['participant']) => {
  if (!props) {
    return null;
  }
  const { name, email, eventName, payAmount, note } = props;

  return (
    <div>
      <h2>Resenär</h2>
      <p>Namn: {name}</p>
      <p>Email: {email}</p>
      <p>Resa: {eventName}</p>
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

export const CancelPage = (props: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { participant, cancellationDisabled, hasCancelled } = props;

  const { mutateAsync: cancelBooking, isLoading: isCancelling } = api.payment.cancelBooking.useMutation();
  const handleCancel = async () => {
    if (!participant) return null;
    await toast.promise(cancelBooking({
      token: participant.cancellationToken
    }), {
      success: "Avbokning slutförd",
      error: "Något gick fel, kontakta styrelsen",
      loading: "Avbokar..."
    })
  }

  return (
    <div className="flex flex-col space-y-4">
      <h1 className="text-3xl">Avbokning</h1>
      {participant && <ParticipantInfo {...participant} />}
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

  const participant = await prisma.participant.findFirst({
    where: {
      cancellationToken: token as string
    },
    include: {
      event: true,
      swishRefunds: true
    }
  });

  if (!participant || !participant.cancellationToken) {
    return {
      notFound: true
    }
  }

  // You can't cancel within 48 hours of the departure
  const twoDaysBeforeDeparture = subDays(participant.event.date, 2);
  const today = new Date();

  if (isBefore(participant.event.date, today)) {
    return {
      notFound: true
    }
  }

  const isBefore48Hours = isBefore(today, twoDaysBeforeDeparture);

  const hasCancelled = participant.swishRefunds.some((x) => x.status === SwishRefundStatus.PAID);

  return {
    props: {
      participant: {
        name: participant.name,
        email: participant.email,
        cancellationToken: participant.cancellationToken,
        eventName: participant.event.name,
        payAmount: participant.payAmount,
        note: participant.note,
      },
      hasCancelled,
      cancellationDisabled: !isBefore48Hours,
    }
  }
}