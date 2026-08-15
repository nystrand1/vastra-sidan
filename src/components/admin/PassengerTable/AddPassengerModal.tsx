import { zodResolver } from "@hookform/resolvers/zod";
import { captureException } from "@sentry/nextjs";
import { TRPCClientError } from "@trpc/client";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { type z } from "zod";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/utils/api";
import { adminAddParticipantSchema } from "~/utils/zodSchemas";

type Bus = { id: string; name: string; seats: number; passengers: number };

const defaultValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  note: "",
  busId: "",
  member: false,
  youth: false
};

export const AddPassengerModal = ({
  eventId,
  buses
}: {
  eventId: string;
  buses: Bus[];
}) => {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const { mutateAsync: addParticipant } = api.admin.addParticipant.useMutation();

  const form = useForm<z.infer<typeof adminAddParticipantSchema>>({
    resolver: zodResolver(adminAddParticipantSchema),
    defaultValues: { ...defaultValues, eventId }
  });

  const handleSubmit = async (
    values: z.infer<typeof adminAddParticipantSchema>
  ) => {
    try {
      await addParticipant(values);
      await utils.admin.getEvent.invalidate({ id: eventId });
      toast.success("Passagerare tillagd");
      form.reset({ ...defaultValues, eventId });
      setOpen(false);
    } catch (error) {
      if (error instanceof TRPCClientError) {
        if (error.message === "Bus is full") {
          toast.error("Bussen är fullbokad, välj en annan buss.");
          return;
        }
      }
      captureException(error);
      toast.error("Något gick fel, försök igen!");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset({ ...defaultValues, eventId });
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-fit">
          <UserPlusIcon className="w-4 h-4" />
          Lägg till passagerare
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lägg till passagerare</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-2"
          >
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Förnamn</FormLabel>
                  <FormControl>
                    <Input placeholder="Förnamn..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Efternamn</FormLabel>
                  <FormControl>
                    <Input placeholder="Efternamn..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="Email..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobilnummer</FormLabel>
                  <FormControl>
                    <Input placeholder="Mobil..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="busId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Buss</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Välj buss..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {buses.map((bus) => {
                        const availableSeats = bus.seats - bus.passengers;
                        return (
                          <SelectItem
                            key={bus.id}
                            value={bus.id}
                            disabled={availableSeats <= 0}
                          >
                            {bus.name}{" "}
                            {availableSeats > 0
                              ? `(${bus.passengers}/${bus.seats})`
                              : "(Fullbokad)"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Övrigt</FormLabel>
                  <FormControl>
                    <Textarea placeholder="T.ex endast hem..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="member"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md py-2">
                  <FormControl>
                    <Checkbox
                      onCheckedChange={field.onChange}
                      checked={field.value}
                    />
                  </FormControl>
                  <FormLabel>Medlem</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="youth"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md py-2">
                  <FormControl>
                    <Checkbox
                      onCheckedChange={field.onChange}
                      checked={field.value}
                    />
                  </FormControl>
                  <FormLabel>Ungdom (upp till 20 år)</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              disabled={form.formState.isSubmitting}
              type="submit"
              className="w-full"
            >
              Lägg till
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
