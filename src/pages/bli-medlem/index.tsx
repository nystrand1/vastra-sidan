import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { type z } from "zod";
import Accordion from "~/components/atoms/Accordion/Accordion";
import { memberPerks } from "~/components/atoms/Accordion/accordionContent";
import Card from "~/components/atoms/CardLink/CardLink";
import Checkbox from "~/components/atoms/Checkbox/Checkbox";
import { InputField } from "~/components/atoms/InputField/InputField";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { StripeWidget } from "~/components/common/StripeWidget/StripeWidget";
import { Button } from "~/components/ui/button";
import { env } from "~/env.mjs";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { featureFlags } from "~/utils/featureFlags";
import { memberSignupSchema } from "~/utils/zodSchemas";

type AdditionalMember = NonNullable<z.infer<typeof memberSignupSchema>["additionalMembers"]>[number];

const stripePromise = loadStripe(env.NEXT_PUBLIC_STRIPE_API_KEY);


export const MemberPage = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const session = useSession();
  const { user } = session.data ?? {};
  const [email, setEmail] = useState(user?.email ?? "");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [phone, setPhone] = useState("");
  const [additionalMembers, setAdditionalMembers] = useState<AdditionalMember[]>();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { data: memberships } = api.public.getAvailableMemberships.useQuery();
  const [membershipId, setMembershipId] = useState(memberships?.regular?.id);
  const [membershipType, setMembershipType] = useState(memberships?.regular?.type);
  const [disabled, setDisabled] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const { mutateAsync: createPaymentIntent, data } = api.memberPayment.requestPayment.useMutation();

  useEffect(() => {
    if (membershipType !== 'FAMILY') {
      setAdditionalMembers(undefined);
    }
  }, [membershipType])

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

  const selectedMembership = Object.values(memberships).find((x) => x?.id === membershipId);

  const handleSignup = async () => {
    setDisabled(true);
    const signUpPayload = {
      firstName,
      lastName,
      email,
      phone,
      membershipId,
      membershipType,
      acceptedTerms,
      additionalMembers
    };

    const payload = memberSignupSchema.safeParse(signUpPayload);
    if (!payload.success) {
      payload.error.issues.map((x) => toast.error(x.message))
      setDisabled(false);
      return;
    }
    try {
      setModalOpen(true);
      await createPaymentIntent(payload.data);
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
            isMemberSignup
          />
        </Elements>
      )}
      <div className="flex flex-col m-auto items-center justify-center w-full md:w-96">
        {selectedMembership?.name && (
          <h1 className="text-3xl mb-4">{selectedMembership.name}</h1>
        )}
        <Accordion items={[memberPerks]} className="mb-4 w-full"/>
        <form className="w-full flex flex-col items-center justify-center" ref={formRef}>
          <Card
            title="Bli medlem i Västra Sidan"
            className="w-full"
          >
            <div className="space-y-4">
              <InputField
                type="name"
                label="Förnamn"
                placeholder="Förnamn..."
                name="firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <InputField
                type="name"
                label="Efternamn"
                placeholder="Efternamn..."
                name="lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              <InputField
                type="email"
                label="Email"
                placeholder="Email..."
                name="emailLogin"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <InputField
                label="Mobilnummer"
                placeholder="Mobil..."
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <SelectField
                label="Medlemskap"
                name="membershipType"
                value={membershipId}
                options={memberShipOptions}
                onChange={(e) => {
                  setMembershipId(e.target.value);
                  const membership = memberShipOptions.find((x) => x.value === e.target.value);
                  setMembershipType(membership?.type);
                }}
              />
              {membershipType === 'FAMILY' && (
                <div className="space-y-4">
                {[...Array(4) as number[]].map((_, index) => (
                  <div key={index} className="space-y-2">
                    {additionalMembers?.[index] && (
                      <>
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-semibold">Familjemedlem {index + 1}</h3>
                          <button
                            type="button"
                            onClick={() => {
                              const newMembers = [...(additionalMembers ?? [])];
                              newMembers.splice(index, 1);
                              setAdditionalMembers(newMembers);
                            }}
                            className="text-red-500 hover:text-red-600"
                          >
                            Ta bort
                          </button>
                        </div>
                        <InputField
                          type="name"
                          label="Förnamn"
                          placeholder="Förnamn..."
                          value={additionalMembers[index].firstName}
                          onChange={(e) => {
                            const newMembers = [...(additionalMembers ?? [])];
                            newMembers[index] = { ...newMembers[index] as AdditionalMember, firstName: e.target.value };
                            setAdditionalMembers(newMembers);
                          }}
                          required
                        />
                        <InputField
                          type="name"
                          label="Efternamn"
                          placeholder="Efternamn..."
                          value={additionalMembers[index].lastName}
                          onChange={(e) => {
                            const newMembers = [...(additionalMembers ?? [])];
                            newMembers[index] = { ...newMembers[index] as AdditionalMember, lastName: e.target.value };
                            setAdditionalMembers(newMembers);
                          }}
                          required
                        />
                        <InputField
                          type="email"
                          label="Email"
                          placeholder="Email..."
                          value={additionalMembers[index].email}
                          onChange={(e) => {
                            const newMembers = [...(additionalMembers ?? [])];
                            newMembers[index] = { ...newMembers[index] as AdditionalMember, email: e.target.value };
                            setAdditionalMembers(newMembers);
                          }}
                          required
                        />
                        <InputField
                          type="tel"
                          label="Mobilnummer"
                          placeholder="Mobil..."
                          value={additionalMembers[index].phone}
                          onChange={(e) => {
                            const newMembers = [...(additionalMembers ?? [])];
                            newMembers[index] = { ...newMembers[index] as AdditionalMember, phone: e.target.value };
                            setAdditionalMembers(newMembers);
                          }}
                        />
                      </>
                    )}
                  </div>
                ))}                
              </div>
              )}
              <Checkbox
                id="terms"
                label="Jag godkänner villkoren"
                name="terms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />
              {membershipType === 'FAMILY' && (!additionalMembers || additionalMembers.length < 4) && (
                  <Button
                    onClick={() => {
                      const newMembers = [...(additionalMembers ?? [])];
                      newMembers.push({ firstName: '', lastName: '', email: '' });
                      setAdditionalMembers(newMembers);
                    }}
                    className="w-full"
                  >
                    Lägg till familjemedlem
                  </Button>
                )}
              <Button
                className="w-full"
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  void handleSignup();
                }}
                disabled={!acceptedTerms || disabled}
              >
                Bli Medlem
              </Button>
            </div>
          </Card>
        </form>
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