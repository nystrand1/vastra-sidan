import { type GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { NonRefundableNotice } from "~/components/atoms/NonRefundableNotice/NonRefundableNotice";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { ParticipantInfo } from "~/components/common/ParticipantInfo/ParticipantInfo";
import { getTransportLabels } from "~/utils/transport";
export const CancelPage = () => {
  const query = useRouter().query;
  const { data, isLoading, refetch } = api.eventPayment.getManagableBooking.useQuery({ token: query.token as string});

  if (!data || isLoading) return null;

  const { participants, departureTime, eventName, refundable, isTrain } = data;
  const transport = getTransportLabels(isTrain);
  // Transferred seats can't be cancelled, so the refund terms only apply while some listed seat
  // isn't transferred. True for an empty list too (the old link of a one-person booking).
  const noCancellableSeats = participants.every((p) => p.transferred);

  const busOptions = data.buses.map((bus) => {
    const fullyBooked = bus.availableSeats <= 0;
    return {
      value: bus.id,
      label: `${bus.name} - (${bus._count.passengers}/${bus.seats})` + (fullyBooked ? " - Fullbokad" : "") ,
      disabled: fullyBooked
    }
  })

  return (
    // The margin keeps the card clear of the fixed navigation bar when the page scrolls
    <Card title={eventName} titleClassName="!text-3xl" className="w-full md:w-96 m-auto mt-4 md:mt-8">
        <div className="divide-y divide-gray-100 space-y-4">
          <div>
            <p className="font-bold">Avgångstid: {departureTime}</p>
            {!refundable ? (
              <NonRefundableNotice />
            ) : !noCancellableSeats && (
              <>
                <p>
                  Avbokning kan endast ske senast 36 timmar innan avresa annars debiteras du fullt pris.
                </p>
                <p>
                  Du blir återbetald hela summan minus serviceavgift från Stripe. Läs mer om Stripe&apos;s avgifter <a href="https://stripe.com/pricing">här</a>
                </p>
              </>
            )}
          </div>
          {data.transferredAway && (
            // Wrapped so the parent's divide-y doesn't strip the box's bottom border
            <div className="pt-4">
              <p className="rounded-md border p-2 text-center">Den här platsen har överlåtits till en annan person</p>
            </div>
          )}
          {participants.map((participant) => (
            <ParticipantInfo key={participant.cancellationToken} {...participant} busOptions={busOptions} transport={transport} onChanged={refetch} />               
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

  const ssr = createSSRHelper();

  await ssr.eventPayment.getManagableBooking.prefetch({ token: token as string });

  return {
    props: {
      trpcState: ssr.dehydrate(),
    }
  }
}