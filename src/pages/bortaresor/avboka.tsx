import { captureException } from "@sentry/nextjs";
import { TRPCClientError } from "@trpc/client";
import { type inferRouterOutputs } from "@trpc/server";
import { type GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "~/components/ui/button";
import Card from "~/components/atoms/CardLink/CardLink";
import { NonRefundableNotice } from "~/components/atoms/NonRefundableNotice/NonRefundableNotice";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { pollRefundStatus } from "~/utils/payment";


type Participant = inferRouterOutputs<AppRouter>['eventPayment']['getManagableBooking']['participants'][number] & {
  busOptions: { value: string, label: string, disabled: boolean }[]
};

export const ParticipantInfo = ({
    name,
    email,
    payAmount,
    note,
    cancellationDisabled,
    refundable,
    cancellationToken,
    hasCancelled,
    refundPending,
    busId,
    busOptions,
    cancellationDate,
  }: Participant ) => {
  const query = useRouter().query;
  const { refetch: refetchParticipant } = api.eventPayment.getManagableBooking.useQuery({ token: query.token as string});
  const { mutateAsync: cancelBooking, isPending: isCancelling } = api.eventPayment.cancelBooking.useMutation();
  const { mutateAsync: changeBus, isPending: isChangingBus } = api.eventPayment.changeBus.useMutation();
  const { mutateAsync: checkRefundStatus } = api.eventPayment.checkRefundStatus.useMutation();

  const [selectedBus, setSelectedBus] = useState(busId);

  const hasChangedBus = busId !== selectedBus;


  const handleCancel = async () => {
    if (!cancellationToken) return null;

    const toastId = toast.loading("Avbokar...")

    try {
      await cancelBooking({ token: cancellationToken })
      // Wait for Stripe to confirm this traveller's own refund
      const { success } = await pollRefundStatus(cancellationToken, checkRefundStatus);
      toast.success(success ? "Avbokning slutförd" : "Avbokad, återbetalningen behandlas", {
        id: toastId
      });
      await refetchParticipant();
    } catch (e) {
      const isRejected =
        e instanceof TRPCClientError &&
        (e as TRPCClientError<AppRouter>).data?.code === "BAD_REQUEST";
      if (!isRejected) {
        captureException(e);
      }
      toast.error(isRejected ? e.message : "Något gick fel, kontakta styrelsen", {
        id: toastId
      });
      console.error(e);
      await refetchParticipant();
    }
  }

  const handleChangeBus = async () => {
    if (!cancellationToken || !selectedBus) return null;

    const toastId = toast.loading("Byter buss...")

    try {
      await changeBus({ token: cancellationToken, busId: selectedBus });
      toast.success("Bussbyte slutfört", {
        id: toastId
      });
      await refetchParticipant();
    } catch (e) {
      captureException(e);
      toast.error("Något gick fel, kontakta styrelsen", {
        id: toastId
      });
      console.error(e);
    }
  }

  return (
    <div className="pt-2">
      <p>Namn: {name}</p>
      <p>Email: {email}</p>
      <p>Pris: {payAmount} kr</p>
      {note && (
        <p>Övrigt: {note}</p>
      )}
      <div className="space-y-6">
        {!hasCancelled && !refundPending && (
          <>
            <div className="space-y-2 pt-2">
              <SelectField
                label="Buss"
                id="busId"
                name="busId"
                value={selectedBus ?? ''}
                options={busOptions}
                onChange={((e) => setSelectedBus(e.target.value))}
              />
              <Button className="w-full" disabled={!hasChangedBus || isChangingBus} onClick={() => handleChangeBus()}>Byt buss</Button>
            </div>
            {refundable && !cancellationDisabled && (
              <Button className="w-full" disabled={isCancelling} onClick={() => handleCancel()}>Avboka</Button>
            )}
          </>
        )}
        {hasCancelled && cancellationDate && (
          <p className="rounded-md border p-2 text-center">{`Avbokad! (${cancellationDate})`}</p>
        )}
        {refundPending && (
          <p className="rounded-md border p-2 text-center">Avbokad, återbetalningen behandlas</p>
        )}
        {refundable && cancellationDisabled && !hasCancelled && !refundPending && (
          <p>Du kan inte avboka inom 36h från avgång</p>
        )}
      </div>
    </div>
  )
}

export const CancelPage = () => {
  const query = useRouter().query;
  const { data, isLoading } = api.eventPayment.getManagableBooking.useQuery({ token: query.token as string});

  if (!data || isLoading) return null;

  const { participants, departureTime, eventName, refundable } = data;

  const busOptions = data.buses.map((bus) => {
    const fullyBooked = bus.availableSeats <= 0;
    return {
      value: bus.id,
      label: `${bus.name} - (${bus._count.passengers}/${bus.seats})` + (fullyBooked ? " - Fullbokad" : "") ,
      disabled: fullyBooked
    }
  })

  return (
    <Card title={eventName} titleClassName="!text-3xl" className="w-full md:w-96 m-auto">
        <div className="divide-y divide-gray-100 space-y-4">
          <div>
            <p className="font-bold">Avgångstid: {departureTime}</p>
            {refundable ? (
              <>
                <p>
                  Avbokning kan endast ske senast 36 timmar innan avresa annars debiteras du fullt pris.
                </p>
                <p>
                  Du blir återbetald hela summan minus serviceavgift från Stripe. Läs mer om Stripe&apos;s avgifter <a href="https://stripe.com/pricing">här</a>
                </p>
              </>
            ) : (
              <NonRefundableNotice />
            )}
          </div>
          {participants.map((participant) => (
            <ParticipantInfo key={participant.cancellationToken} {...participant} busOptions={busOptions} />               
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