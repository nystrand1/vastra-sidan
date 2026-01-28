import { captureException } from "@sentry/nextjs";
import { MailIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import CardLink from "~/components/atoms/CardLink/CardLink";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { TextArea } from "~/components/atoms/TextArea/TextArea";
import { Button } from "~/components/ui/button";
import { api } from "~/utils/api";


export const AdminParticipantPage = () => {
  const { query } = useRouter();
  const [selectedBus, setSelectedBus] = useState<string | undefined>(undefined);

  const participantId = query.participant as string;

  const { data: participant, isLoading, refetch: refetchParticipant } = api.admin.getEventParticipantById.useQuery(
    { id: participantId },
    { enabled: !!participantId }
  );

  const { mutateAsync: sendConfirmationEmail } = api.admin.sendParticipantEmail.useMutation();
  const { mutateAsync: changeBus, isPending: isChangingBus } = api.admin.changeBus.useMutation();

  const hasChangedBus = participant?.bus?.id !== selectedBus;

  useEffect(() => {
    if (participant?.bus?.id) {
      setSelectedBus(participant.bus.id);
    }
  }, [participant?.bus?.id])



  if (isLoading) {
    return <p className="text-center">Laddar deltagare...</p>
  }

  if (!participant) {
    return <p className="text-center">Deltagare hittades inte.</p>
  }

  const busOptions = participant.event.buses.map((bus) => {
    const fullyBooked = bus.availableSeats <= 0;
    return {
      value: bus.id,
      label: `${bus.name} - (${bus._count.passengers}/${bus.seats})` + (fullyBooked ? " - Fullbokad" : ""),
      disabled: fullyBooked
    }
  })


  const handleSendConfirmationEmail = async () => {
    await toast.promise(sendConfirmationEmail({ id: participant.id }), {
      loading: 'Skickar bekräftelsemail...',
      success: 'Bekräftelsemail skickat!',
      error: 'Något gick fel, försök igen senare.'
    })
  }

  const handleChangeBus = async () => {
    if (!participantId || !selectedBus) return null;

    const toastId = toast.loading("Byter buss...")

    try {
      await changeBus({ participantId, busId: selectedBus });
      toast.success("Bussbyte klart!", {
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
    <div className="flex flex-col justify-center align-middle">
      <div className="flex flex-row gap-4 justify-center flex-wrap">
        <CardLink title={participant.name} className="w-96 h-fit">
          <p className="mb-2"><span className="font-medium">Email:</span> {participant.email}</p>
          <p className="mb-2"><span className="font-medium">Telefon:</span> {participant.phone}</p>
          <p className="mb-2"><span className="font-medium">Medlem:</span> {participant.member ? 'Ja' : 'Nej'}</p>
          <p className="mb-2"><span className="font-medium">Ungdom:</span> {participant.youth ? 'Ja' : 'Nej'}</p>
          <p className="mb-2"><span className="font-medium">Buss:</span> {participant.bus?.name}</p>
          {participant.note && (
            <TextArea label="Övrigt">
              {participant.note}
            </TextArea>
          )}
          <div className="space-y-4 pt-2">
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
          <Button onClick={handleSendConfirmationEmail} disabled={!participant.email}>
            <MailIcon />
            Skicka bekräftelsemail
          </Button>
        </CardLink>
      </div>
    </div>
  )
}

export default AdminParticipantPage;