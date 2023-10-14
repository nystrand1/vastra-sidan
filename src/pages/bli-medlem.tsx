import { MembershipType } from "@prisma/client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import Card from "~/components/atoms/CardLink/CardLink";
import Checkbox from "~/components/atoms/Checkbox/Checkbox";
import { InputField } from "~/components/atoms/InputField/InputField";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { api } from "~/utils/api";
import { memberSignupSchema, signupSchema } from "~/utils/zodSchemas";

interface AdditionalMember {
  firstName: string;
  lastName: string;
  email: string;
  membershipType: MembershipType;
}

export const MemberPage = () => {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [membershipType, setMembershipType] = useState<MembershipType>(MembershipType.REGULAR);
  const [additionalMembers, setAdditionalMembers] = useState<AdditionalMember>();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { mutateAsync: createUser } = api.user.createNewUser.useMutation();
  const router = useRouter();

  const memberShipOptions = [
    {
      label: "Ordinarie",
      value: MembershipType.REGULAR
    },
    {
      label: "Ungdom (under 18)",
      value: MembershipType.YOUTH
    },
    {
      label: "Familj",
      value: MembershipType.FAMILY
    }
  ];

  useEffect(() => {
    console.log(membershipType);
  }, [membershipType])

  const handleSignup = async () => {
    const signUpPayload = {
      firstName,
      lastName,
      email,
      membershipType,
      acceptedTerms,
      additionalMembers
    };

    const payload = memberSignupSchema.safeParse(signUpPayload);
    console.log(payload)
    if (!payload.success) {
      payload.error.issues.map((x) => toast.error(x.message))
      return;
    }
    try {
      console.log("hello");
    } catch (error) {
      const err = error as { message: string }
      toast.error(err.message)
    }
  }

  return (
    <form className="flex flex-col items-center justify-center">
      <Card
        title="Bli medlem i Västra Sidan"
        className="w-full md:w-96"
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
          <SelectField 
            label="Medlemskap"
            name="membershipType"
            value={membershipType}
            options={memberShipOptions}
            onChange={(e) => setMembershipType(e.target.value as MembershipType)}
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
            onClick={handleSignup}
            disabled={!acceptedTerms}
          >
            Bli Medlem
          </Button>
        </div>
      </Card>
    </form>
  )
}

export default MemberPage;