import { zodResolver } from '@hookform/resolvers/zod';
import { Elements } from "@stripe/react-stripe-js";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { type z } from "zod";
import Accordion from "~/components/atoms/Accordion/Accordion";
import { memberPerks } from "~/components/atoms/Accordion/accordionContent";
import Card from "~/components/atoms/CardLink/CardLink";
import { StripeWidget } from "~/components/common/StripeWidget/StripeWidget";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel } from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { friendlyMembershipNames } from "~/server/utils/membership";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { featureFlags } from "~/utils/featureFlags";
import getStripe from "~/utils/stripePromise";
import { memberSignupSchema } from "~/utils/zodSchemas";

type AdditionalMember = NonNullable<z.infer<typeof memberSignupSchema>["additionalMembers"]>[number];

const stripePromise = getStripe();


export const MemberPage = () => {
  const { data: memberships } = api.public.getAvailableMemberships.useQuery();
  const [disabled, setDisabled] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const form = useForm<z.infer<typeof memberSignupSchema>>({
    resolver: zodResolver(memberSignupSchema),
  });

  const additionalMembers = useFieldArray({
    control: form.control,
    name: 'additionalMembers',
    rules: {
      maxLength: 4,
    }
  });

  const defaultFamilyMember: AdditionalMember = {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
  }

  const { mutateAsync: createPaymentIntent, data } = api.memberPayment.requestPayment.useMutation();

  if (!memberships || !memberships.regular || !memberships.family || !memberships.youth) {
    return <p className="text-center text-xl">Finns inga medlemskap för tillfället!</p>
  }

  const memberShipOptions = [
    {
      label: `Ordinarie (${memberships.regular?.price / 100} kr)`,
      value: memberships.regular?.id,
      type: memberships.regular?.type
    },
    {
      label: `Ungdom (under 18) (${memberships.youth?.price / 100} kr)`,
      value: memberships.youth?.id,
      type: memberships.youth?.type
    },
    {
      label: `Familj (${memberships.family.price / 100} kr)`,
      value: memberships.family?.id,
      type: memberships.family?.type
    }
  ];


  const membershipId = form.watch('membershipId');
  const selectedMembership = Object.values(memberships).find((x) => x?.id === membershipId);

  const membershipType = selectedMembership?.type ?? 'REGULAR';

  form.setValue('membershipType', membershipType);

  if (membershipType !== 'FAMILY') {
    form.setValue('additionalMembers', undefined);
  }


  const handleSignup = async (data: z.infer<typeof memberSignupSchema>) => {
    setDisabled(true);
    try {
      setModalOpen(true);
      await createPaymentIntent(data);
    } catch (error) {
      console.log(error);
      const err = error as Error;
      toast.error(err.message)
      setDisabled(false);
    }
  }

  return (
    <>
      {data?.clientId && modalOpen && (
        <Elements stripe={stripePromise} options={{ clientSecret: data.clientId, appearance: { theme: 'night' }, locale: 'sv' }}>
          <StripeWidget
            isOpen={modalOpen}
            onClose={() => {
              setModalOpen(false);
              setDisabled(false);
            }}
            clientSecret={data.clientId}
            title={selectedMembership ? `${friendlyMembershipNames[selectedMembership.type]} - ${selectedMembership?.price / 100} kr` : 'Medlemskap'}
            isMemberSignup
          />
        </Elements>
      )}
      <div className="flex flex-col m-auto items-center justify-center w-full md:w-96">
        {selectedMembership?.name && (
          <h1 className="text-3xl mb-4">{selectedMembership.name}</h1>
        )}
        <Accordion items={[memberPerks]} className="mb-4 w-full" />
        <Form {...form}>
          <Card
            title="Bli medlem i Västra Sidan"
            className="w-full"
          >
            <form onSubmit={form.handleSubmit(handleSignup)} className='space-y-2'>
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Förnamn</FormLabel>
                    <FormControl>
                      <Input placeholder="Förnamn..." {...field} />
                    </FormControl>
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
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobilnummber</FormLabel>
                    <FormControl>
                      <Input placeholder="Mobil..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="membershipId"
                render={({ field }) => (
                  <FormItem className='w-full'>
                    <FormLabel>Medlemskap</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Välj medlemskap" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {memberShipOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormControl>
                    </FormControl>
                  </FormItem>
                )}
              />
              {membershipType === 'FAMILY' && (
                <div className="space-y-4">
                  {additionalMembers.fields.map((member, index) => (
                    <div key={member.id} className="space-y-4 border-t mt-4 pt-2">
                      <div className='flex flex-row justify-between items-center'>
                        <h2 className="text-xl">Familjemedlem {index + 1}</h2>
                        <Button variant="link" className='text-destructive w-fit' type="button" onClick={() => additionalMembers.remove(index)}>Ta bort</Button>
                      </div>
                      <FormField
                        control={form.control}
                        name={`additionalMembers.${index}.firstName`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Förnamn</FormLabel>
                            <FormControl>
                              <Input placeholder="Förnamn..." {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`additionalMembers.${index}.lastName`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Efternamn</FormLabel>
                            <FormControl>
                              <Input placeholder="Efternamn..." {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`additionalMembers.${index}.email`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="Email..." {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`additionalMembers.${index}.phone`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mobilnummber</FormLabel>
                            <FormControl>
                              <Input placeholder="Mobil..." {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>
              )}
              <FormField
                control={form.control}
                name="acceptedTerms"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md py-4 shadow">
                    <FormControl>
                      <Checkbox onCheckedChange={field.onChange} checked={field.value} />
                    </FormControl>
                    <FormLabel>Jag godkänner villkoren</FormLabel>
                  </FormItem>
                )}
              />
              <div className='space-y-4'>
                {membershipType === 'FAMILY' && (
                  <Button className='w-full' type="button" onClick={() => additionalMembers.append(defaultFamilyMember)}>Lägg till familjemedlem</Button>
                )}
                <Button
                  onClick={form.handleSubmit(handleSignup)}
                  disabled={!form.formState.isValid || disabled}
                  className='w-full'
                >
                  Bli medlem
                </Button>
              </div>
            </form>
          </Card>
        </Form>
      </div>
    </>
  )
}

export default MemberPage;


export const getStaticProps = async () => {
  const ssrHelper = await createSSRHelper();
  if (!featureFlags.ENABLE_MEMBERSHIPS) {
    return {
      notFound: true,
    }
  }
  await ssrHelper.public.getAvailableMemberships.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 60,
  };
}