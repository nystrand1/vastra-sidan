import { captureException } from "@sentry/nextjs";
import { useIsMutating } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { type inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "~/components/ui/button";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { TransferBookingForm } from "~/components/common/TransferBookingForm/TransferBookingForm";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { pollRefundStatus } from "~/utils/payment";
import { type TransportLabels } from "~/utils/transport";

type Participant = inferRouterOutputs<AppRouter>['eventPayment']['getManagableBooking']['participants'][number] & {

  busOptions: { value: string, label: string, disabled: boolean }[]
  transport: TransportLabels
  /** Called after a change (cancel, bus change, transfer) so the page reloads its data. */
  onChanged: () => Promise<unknown>
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
    transport,
    member,
    youth,
    transferred,
    transferDisabled,
    onChanged
  }: Participant ) => {
  const { mutateAsync: cancelBooking } = api.eventPayment.cancelBooking.useMutation();
  const { mutateAsync: changeBus, isPending: isChangingBus } = api.eventPayment.changeBus.useMutation();
  const { mutateAsync: checkRefundStatus } = api.eventPayment.checkRefundStatus.useMutation();
  // Any mutation on the page (a transfer, a bus change, another traveller's cancellation)
  const isMutating = useIsMutating() > 0;
  // Covers the whole cancellation, including the pauses between refund status checks
  const [isCancelling, setIsCancelling] = useState(false);
  // Avboka and Överlåt plats both wait, so a seat can't be cancelled and transferred at once
  const isBusy = isCancelling || isMutating;

  const [selectedBus, setSelectedBus] = useState(busId);

  const hasChangedBus = busId !== selectedBus;


  const handleCancel = async () => {
    if (!cancellationToken || isBusy) return null;

    setIsCancelling(true);
    const toastId = toast.loading("Avbokar...")

    try {
      await cancelBooking({ token: cancellationToken })
      // Wait for Stripe to confirm this traveller's own refund
      const { success } = await pollRefundStatus(cancellationToken, checkRefundStatus);
      toast.success(success ? "Avbokning slutförd" : "Avbokad, återbetalningen behandlas", {
        id: toastId
      });
      await onChanged();
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
      await onChanged();
    } finally {
      setIsCancelling(false);
    }
  }

  const handleChangeBus = async () => {
    if (!cancellationToken || !selectedBus) return null;

    const toastId = toast.loading(transport.changing)

    try {
      await changeBus({ token: cancellationToken, busId: selectedBus });
      toast.success(transport.changed, {
        id: toastId
      });
      await onChanged();
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
                label={transport.label}
                id="busId"
                name="busId"
                value={selectedBus ?? ''}
                options={busOptions}
                onChange={((e) => setSelectedBus(e.target.value))}
              />
              <Button className="w-full" disabled={!hasChangedBus || isChangingBus} onClick={() => handleChangeBus()}>{transport.change}</Button>
            </div>
            {transferred && (
              // A transferred seat can't be cancelled, whatever the cancellation window says
              <p className="rounded-md border p-2 text-center">Överlåten plats. Den kan inte avbokas, kontakta info@vastrasidan.se</p>
            )}
            {/* Side by side to keep the page short; a lone button takes the full width */}
            <div className="grid grid-flow-col auto-cols-fr gap-2 empty:hidden">
              {!transferred && refundable && !cancellationDisabled && (
                <Button className="w-full" disabled={isBusy} onClick={() => handleCancel()}>Avboka</Button>
              )}
              {cancellationToken && !transferDisabled && (
                <TransferBookingForm
                  token={cancellationToken}
                  boughtAtReducedPrice={member || youth}
                  disabled={isBusy}
                  onTransferred={async () => {
                    await onChanged();
                  }}
                />
              )}
            </div>
          </>
        )}
        {hasCancelled && cancellationDate && (
          <p className="rounded-md border p-2 text-center">{`Avbokad! (${cancellationDate})`}</p>
        )}
        {refundPending && (
          <p className="rounded-md border p-2 text-center">Avbokad, återbetalningen behandlas</p>
        )}
        {transferDisabled && !hasCancelled && !refundPending && (
          <p>
            {refundable && !transferred
              ? "Du kan inte avboka eller överlåta platsen inom 36h från avgång"
              : "Du kan inte överlåta platsen inom 36h från avgång"}
          </p>
        )}
      </div>
    </div>
  )
}
