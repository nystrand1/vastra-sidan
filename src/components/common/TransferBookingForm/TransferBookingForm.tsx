import { zodResolver } from "@hookform/resolvers/zod";
import { captureException } from "@sentry/nextjs";
import { TRPCClientError } from "@trpc/client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { type z } from "zod";
import DialogDrawer from "~/components/common/DialogDrawer/DialogDrawer";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { transferBookingFormSchema } from "~/utils/zodSchemas";

type TransferBookingFormValues = z.infer<typeof transferBookingFormSchema>;

interface TransferBookingFormProps {
  /** The traveller's own cancellation token. */
  token: string;
  /** The seat was bought at the member or youth price. */
  boughtAtReducedPrice: boolean;
  onTransferred: () => Promise<void>;
}

const defaultValues: TransferBookingFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  consent: false
};

export const TransferBookingForm = ({
  token,
  boughtAtReducedPrice,
  onTransferred
}: TransferBookingFormProps) => {
  const [open, setOpen] = useState(false);
  const { mutateAsync: transferBooking } = api.eventPayment.transferBooking.useMutation();

  const form = useForm<TransferBookingFormValues>({
    resolver: zodResolver(transferBookingFormSchema),
    defaultValues
  });

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (!next) form.reset(defaultValues);
  };

  const handleSubmit = async (values: TransferBookingFormValues) => {
    const toastId = toast.loading("Överlåter plats...");

    try {
      await transferBooking({ ...values, token });
      toast.success("Platsen har överlåtits", { id: toastId });
      handleOpen(false);
      await onTransferred();
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
    }
  };

  const content = (
    // Scrolls inside the dialog/drawer on short screens. The drawer itself can't scroll: vaul
    // extends it below the screen. The padding keeps the inputs' focus rings from being clipped.
    <div className="-mx-1 max-h-[70vh] space-y-4 overflow-y-auto px-1 pb-1 text-left">
      <div className="space-y-2 rounded-md border p-2">
        <p>
          Platsen kan inte avbokas eller återbetalas efter överlåtelsen. Vid frågor, kontakta
          info@vastrasidan.se.
        </p>
        <p>Du förlorar tillgången till bokningen. Den nya resenären får en egen länk via mejl.</p>
        {boughtAtReducedPrice && (
          <p>
            Platsen är köpt till medlems-/ungdomspris. Den nya resenären måste uppfylla villkoren,
            och bussvärdarna kan kontrollera det.
          </p>
        )}
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-2" noValidate>
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Förnamn</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
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
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="text-[0.8rem] text-muted-foreground">
            Ange namnet på personen som ska åka
          </p>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="off" {...field} />
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
                <FormLabel>Telefon</FormLabel>
                <FormControl>
                  <Input type="tel" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="consent"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                <FormControl>
                  <Checkbox
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    checked={field.value}
                  />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel className="leading-5">
                    Jag förstår att platsen inte kan avbokas efter överlåtelsen
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            Överlåt plats
          </Button>
        </form>
      </Form>
    </div>
  );

  return (
    <DialogDrawer
      title="Överlåt plats"
      trigger={<Button className="w-full">Överlåt plats</Button>}
      content={content}
      open={open}
      setOpen={handleOpen}
    />
  );
};
