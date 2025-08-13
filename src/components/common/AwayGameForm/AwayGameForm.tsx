import { zodResolver } from "@hookform/resolvers/zod";
import { captureException } from "@sentry/nextjs";
import { Elements } from "@stripe/react-stripe-js";
import { TRPCClientError } from "@trpc/client";
import { useRouter } from "next/router";
import { useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { twMerge } from "tailwind-merge";
import { type z } from "zod";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import getStripe from "~/utils/stripePromise";
import { eventSignupSchema } from "~/utils/zodSchemas";
import { api } from "../../../utils/api";
import { StripeWidget } from "../StripeWidget/StripeWidget";
import { getParticipantPrice } from "~/utils/event/getParticipantPrice";
import { Textarea } from "~/components/ui/textarea";

const stripePromise = getStripe();


export const AwayGameForm = () => {
  const { query } = useRouter();
  const { id } = query as { id: string };
  const { data: awayGame, isLoading } = api.public.getAwayGame.useQuery({ id: id });
  const { mutateAsync: createPaymentIntent, data: clientSecret } = api.eventPayment.requestStripePayment.useMutation();

  const firstAvailableBus = awayGame?.buses.find((bus) => bus.availableSeats > 0);
  const form = useForm<z.infer<typeof eventSignupSchema>>({
    resolver: zodResolver(eventSignupSchema),
    defaultValues: {
      participants: [
        {
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          member: false,
          youth: false,
          busId: firstAvailableBus?.id ?? '',
          note: '',
          consent: false,
        }
      ],
    }
  });

  const passengers = useFieldArray({
    control: form.control,
    name: 'participants',
    rules: {
      minLength: 1,
    },
  });
  const [modalOpen, setModalOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!id) return null
  if (isLoading) return null;
  if (!awayGame) return null;

  const totalPrice = form.watch('participants').reduce((acc, { member, youth }) => {
    return acc + getParticipantPrice(!!member, !!youth, awayGame);
  }, 0);

  const handleSubmit = async ({ participants }: z.infer<typeof eventSignupSchema>) => {
    setModalOpen(true);

    const fullBusses = awayGame.buses.filter((bus) => {
      const participantsOnBus = participants.filter((p) => p.busId === bus.id);
      if (participantsOnBus.length === 0) return false;
      return bus.availableSeats < participantsOnBus.length;
    });

    if (fullBusses.length > 0) {
      const busNames = fullBusses.map((bus) => bus.name).join(", ");
      toast.error(`${busNames} har för få platser, vänligen välj en annan buss.`);
      setModalOpen(false);
      return;
    }

    try {
      await createPaymentIntent({
        participants,
        eventId: id,
      });
    } catch (error) {
      if (error instanceof TRPCClientError) {
        setModalOpen(false);
        if (error.message === 'BUS_FULL') {
          toast.error("Någon buss är fullbokad, vänligen välj en annan buss");
          return;
        }
        captureException(error);
        toast.error("Något gick fel, försök igen!");
      }
    }
  }

  return (
    <>
      {clientSecret && (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' }, locale: 'sv' }}>
          <StripeWidget
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            clientSecret={clientSecret}
            title={awayGame ? `${awayGame.name}: ${totalPrice} kr` : 'Betalning för bortaresa'}
            subTitle={`${passengers.fields.length} passagerare`}
          />
        </Elements>
      )}
      <Card>
        <CardContent className="pt-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} ref={formRef} className="space-y-4">
              {passengers.fields.map((_, index) => {
                return (
                  <div key={`passenger-${index}`} className={twMerge("space-y-2", index > 0 ? 'border-t pt-4' : '')}>
                    <div className='flex flex-row justify-between items-center'>
                      <h2 className="text-xl">Passagerare {index + 1}</h2>
                      {index > 0 && (
                        <Button variant="link" className='text-destructive w-fit' type="button" onClick={() => passengers.remove(index)}>Ta bort</Button>
                      )}
                    </div>
                    <FormField
                      control={form.control}
                      name={`participants.${index}.firstName`}
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
                      name={`participants.${index}.lastName`}
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
                      name={`participants.${index}.email`}
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
                      name={`participants.${index}.phone`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobilnumber</FormLabel>
                          <FormControl>
                            <Input placeholder="Mobil..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`participants.${index}.busId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Buss</FormLabel>
                          <Select defaultValue={firstAvailableBus?.id} onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Välj buss..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {awayGame.buses.map((bus) => (
                                <SelectItem key={bus.id} value={bus.id} disabled={bus.availableSeats <= 0}>
                                  {bus.name} {bus.availableSeats > 0 ? `(${bus.seats-bus.availableSeats}/${bus.seats})` : '(Fullbokad)'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField 
                      control={form.control}
                      name={`participants.${index}.note`}
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
                      name={`participants.${index}.member`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md py-2">
                          <FormControl>
                            <Checkbox onCheckedChange={field.onChange} checked={field.value} />
                          </FormControl>
                          <FormMessage />
                          <div>
                            <FormLabel>
                              Medlem
                            </FormLabel>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`participants.${index}.youth`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md py-2">
                          <FormControl>
                            <Checkbox onCheckedChange={field.onChange} checked={field.value} />
                          </FormControl>
                          <div>
                            <FormLabel>
                              Ungdom (upp till 20 år)
                            </FormLabel>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`participants.${index}.consent`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md py-2">
                          <FormControl>
                            <Checkbox onCheckedChange={field.onChange} checked={field.value} />
                          </FormControl>
                          <div>
                            <FormLabel>
                              Jag har läst & förstått reglerna kring bussresorna
                            </FormLabel>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                )
              })}
              <div className="flex flex-col space-y-4">
                <Button
                  type="button"
                  onClick={() => {
                    passengers.append({
                      firstName: '',
                      lastName: '',
                      email: '',
                      phone: '',
                      member: false,
                      youth: false,
                      busId: firstAvailableBus?.id ?? '',
                      consent: false,
                    });
                  }}
                >
                  Lägg till passagerare
                </Button>
                <Button disabled={form.formState.isSubmitting || modalOpen} type="submit">Anmäl</Button>
                {!!form.formState.errors?.participants?.length && (
                  <div className='text-destructive'>
                    Kolla att du fyllt i alla uppgifter korrekt
                  </div>
                )}
                <p className="text-center">Summa: {totalPrice} kr</p>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}