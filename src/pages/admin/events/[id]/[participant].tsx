import { zodResolver } from "@hookform/resolvers/zod";
import { captureException } from "@sentry/nextjs";
import { MailIcon, SaveIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { type z } from "zod";
import CardLink from "~/components/atoms/CardLink/CardLink";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { TextArea } from "~/components/atoms/TextArea/TextArea";
import { Button } from "~/components/ui/button";
import { Form, FormField } from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { api } from "~/utils/api";
import { updateParticipantSchema } from "~/utils/zodSchemas";

export const AdminParticipantPage = () => {
  const { query } = useRouter();
  const [selectedBus, setSelectedBus] = useState<string | undefined>(undefined);

  const participantId = query.participant as string;

  const {
    data: participant,
    isLoading,
    refetch: refetchParticipant
  } = api.admin.getEventParticipantById.useQuery(
    { id: participantId },
    { enabled: !!participantId }
  );

  const { mutateAsync: sendConfirmationEmail } =
    api.admin.sendParticipantEmail.useMutation();
  const { mutateAsync: changeBus, isPending: isChangingBus } =
    api.admin.changeBus.useMutation();
  const { mutateAsync: updateParticipant, isPending: isUpdatingParticipant } =
    api.admin.updateEventParticipant.useMutation();

  const form = useForm<z.infer<typeof updateParticipantSchema>>({
    resolver: zodResolver(updateParticipantSchema),
    defaultValues: {
      email: participant?.email,
      phone: participant?.phone
    }
  });

  const hasChangedBus = participant?.bus?.id !== selectedBus;

  useEffect(() => {
    if (participant?.bus?.id) {
      setSelectedBus(participant.bus.id);
    }
  }, [participant?.bus?.id]);

  useEffect(() => {
    form.reset({
      id: participant?.id,
      email: participant?.email,
      phone: participant?.phone
    });
  }, [participant]);

  if (isLoading) {
    return <p className="text-center">Laddar deltagare...</p>;
  }

  if (!participant) {
    return <p className="text-center">Deltagare hittades inte.</p>;
  }

  const busOptions = participant.event.buses.map((bus) => {
    const fullyBooked = bus.availableSeats <= 0;
    return {
      value: bus.id,
      label:
        `${bus.name} - (${bus._count.passengers}/${bus.seats})` +
        (fullyBooked ? " - Fullbokad" : ""),
      disabled: fullyBooked
    };
  });

  const handleUpdateParticipant = async (
    data: z.infer<typeof updateParticipantSchema>
  ) => {
    try {
      await toast.promise(
        updateParticipant({
          id: participant.id,
          email: data.email,
          phone: data.phone
        }),
        {
          loading: "Uppdaterar deltagare...",
          success: "Deltagare uppdaterad!",
          error: "Något gick fel, försök igen senare."
        }
      );
      await refetchParticipant();
    } catch (e) {
      captureException(e);
      console.error(e);
    }
  };

  const handleSendConfirmationEmail = async () => {
    await toast.promise(sendConfirmationEmail({ id: participant.id }), {
      loading: "Skickar bekräftelsemail...",
      success: "Bekräftelsemail skickat!",
      error: "Något gick fel, försök igen senare."
    });
  };

  const handleChangeBus = async () => {
    if (!participantId || !selectedBus) return null;

    const toastId = toast.loading("Byter buss...");

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
  };

  return (
    <div className="flex flex-col justify-center align-middle">
      <div className="flex flex-row flex-wrap justify-center gap-4">
        <CardLink title={participant.name} className="h-fit w-96">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleUpdateParticipant)}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-row items-center gap-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <Input {...field} className="w-full" />
                  )}
                />
                <Button
                  disabled={!form.formState.isDirty || isUpdatingParticipant}
                  type="submit"
                  className="w-fit"
                  variant="ghost"
                >
                  <SaveIcon />
                </Button>
              </div>
              <div className="flex flex-row items-center gap-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <Input {...field} className="w-full" />
                  )}
                />
                <Button
                  disabled={!form.formState.isDirty || isUpdatingParticipant}
                  type="submit"
                  className="w-fit"
                  variant="ghost"
                >
                  <SaveIcon />
                </Button>
              </div>
            </form>
          </Form>
          <p className="mb-2">
            <span className="font-medium">Medlem:</span>{" "}
            {participant.member ? "Ja" : "Nej"}
          </p>
          <p className="mb-2">
            <span className="font-medium">Ungdom:</span>{" "}
            {participant.youth ? "Ja" : "Nej"}
          </p>
          <p className="mb-2">
            <span className="font-medium">Buss:</span> {participant.bus?.name}
          </p>
          {participant.note && (
            <TextArea label="Övrigt">{participant.note}</TextArea>
          )}
          <div className="space-y-4 pt-2">
            <SelectField
              label="Buss"
              id="busId"
              name="busId"
              value={selectedBus ?? ""}
              options={busOptions}
              onChange={(e) => setSelectedBus(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={!hasChangedBus || isChangingBus}
              onClick={() => handleChangeBus()}
            >
              Byt buss
            </Button>
          </div>
          <Button
            onClick={handleSendConfirmationEmail}
            disabled={!participant.email}
          >
            <MailIcon />
            Skicka bekräftelsemail
          </Button>
        </CardLink>
      </div>
    </div>
  );
};

export default AdminParticipantPage;
