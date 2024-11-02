import { type MembershipType } from "@prisma/client";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import Accordion from "~/components/atoms/Accordion/Accordion";
import { memberPerks } from "~/components/atoms/Accordion/accordionContent";
import { Button } from "~/components/atoms/Button/Button";
import Card from "~/components/atoms/CardLink/CardLink";
import Checkbox from "~/components/atoms/Checkbox/Checkbox";
import { InputField } from "~/components/atoms/InputField/InputField";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { StripeModal } from "~/components/common/StripeModal/StripeModal";
import { env } from "~/env.mjs";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { featureFlags } from "~/utils/featureFlags";
import { memberSignupSchema } from "~/utils/zodSchemas";

interface AdditionalMember {
  firstName: string;
  lastName: string;
  email: string;
  membershipType: MembershipType;
}

const stripePromise = loadStripe(env.NEXT_PUBLIC_STRIPE_API_KEY);


export const MemberPage = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const session = useSession();
  const { user } = session.data ?? {};
  const [email, setEmail] = useState(user?.email ?? "");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [phone, setPhone] = useState("");
  const [additionalMembers] = useState<AdditionalMember>();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { data: memberships } = api.public.getAvailableMemberships.useQuery();
  const [membershipId, setMembershipId] = useState(memberships?.regular?.id);
  const [membershipType, setMembershipType] = useState(memberships?.regular?.type);

  const [modalOpen, setModalOpen] = useState(false);

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

  const selectedMembership = Object.values(memberships).find((x) => x?.id === membershipId);

  const handleSignup = async () => {
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
      return;
    }
    try {
      setModalOpen(true);
      const res = await createPaymentIntent(payload.data);
      console.log('res', res);
      console.log('clientId', data?.clientId);
      // if (res?.success) {
      //   formRef.current?.reset();
      //   setFirstName("");
      //   setLastName("");
      //   setEmail("");
      //   setPhone("");
      //   setAcceptedTerms(false);
      //   setAdditionalMembers(undefined);
      //   await session.update({ isMember: true });
      //   await router.push("/");
      // }
    } catch (error) {
      console.log(error);
    }
  }

  return (
    <>
      {data?.clientId && (
      <Elements stripe={stripePromise} options={{ clientSecret: data.clientId, appearance: { theme: 'night' }, locale: 'sv' }}>
        <StripeModal
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)} 
          clientSecret={data.clientId} 
          isMemberSignup
        />
      </Elements>
      )}
      <div className="flex flex-col m-auto items-center justify-center w-full md:w-96">
        {selectedMembership?.imageUrl && (
          <div className="flex flex-col items-center mb-4">
            <div className="w-32 h-48 md:w-32 md:h-66 relative">
              <Image src={selectedMembership.imageUrl} fill style={{ objectFit: 'cover' }} alt="medlemskapskort" />
            </div>
          </div>
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
              <Checkbox
                id="terms"
                label="Jag godkänner villkoren"
                name="terms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />
              <Button
                className="w-full"
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  void handleSignup();
                }}
                disabled={!acceptedTerms}
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