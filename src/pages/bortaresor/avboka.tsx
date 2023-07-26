import { type GetServerSidePropsContext, type InferGetServerSidePropsType } from "next";
import { prisma } from "~/server/db";
import { isWithinInterval, subDays } from "date-fns";
import { Button } from "~/components/atoms/Button/Button";
import { api } from "~/utils/api";
import { toast } from "react-hot-toast";


export const ParticipantInfo = (props: InferGetServerSidePropsType<typeof getServerSideProps>['participant']) => {
  if (!props) {
    return null;
  }
  const { name, email, eventName } = props;

  return (
    <div>
      <h2>Resenär</h2>
      <p>Namn: {name}</p>
      <p>Email: {email}</p>
      <p>Resa: {eventName}</p>
      <p>
        Avbokning kan endast ske senast 48 timmar innan avresa annars debiteras du fullt pris.
      </p>
    </div>
  )
}

export const CancelPage = (props: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { error, participant } = props;

  const { mutateAsync: cancelBooking } = api.payment.cancelBooking.useMutation();

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
      {error && <p>{error}</p>}
      {participant && <ParticipantInfo {...participant} />}
      {participant && <Button className="w-full md:w-56" onClick={handleCancel}>Avboka</Button>}
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
      event: true
    }
  });

  if (!participant || !participant.cancellationToken) {
    return {
      notFound: true
    }
  }

  // You can't cancel within 48 hours of the departure
  const dayBeforeYesterday = subDays(new Date(), 2);
  const today = new Date();
  const isWithin48Hours = isWithinInterval(today, {
    start: dayBeforeYesterday,
    end: participant.event.date
  })

  if (isWithin48Hours) {
    return {
      props: {
        error: "Du kan inte avboka inom 48 timmar från avresa"
      }
    }
  }

  return {
    props: {
      participant: {
        name: participant.name,
        email: participant.email,
        cancellationToken: participant.cancellationToken,
        eventName: participant.event.name,
      }
    }
  }
}