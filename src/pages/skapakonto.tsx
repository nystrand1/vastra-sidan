import { signIn } from "next-auth/react";
import Error from "next/error";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "~/components/ui/button";
import Card from "~/components/atoms/CardLink/CardLink";
import { InputField } from "~/components/atoms/InputField/InputField";
import { api } from "~/utils/api";
import { featureFlags } from "~/utils/featureFlags";
import { signupSchema } from "~/utils/zodSchemas";

export const SignupPage = () => {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const { mutateAsync: createUser } = api.user.createNewUser.useMutation();

  if (!featureFlags.ENABLE_LOGIN) {
    return <Error statusCode={404} />
  }

  const handleSignup = async () => {
    const signUpPayload = {
      firstName,
      lastName,
      phone,
      email,
      password,
      confirmPassword
    };

    const payload = signupSchema.safeParse(signUpPayload);

    if (!payload.success) {
      payload.error.issues.map((x) => toast.error(x.message))
      return;
    }
    try {
      await createUser(payload.data)
      await signIn('credentials', { username: email, password, callbackUrl: "/" });
    } catch(error) {
      const err = error as { message: string }
      toast.error(err.message)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <Card 
        title="Skapa konto"
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
            name="email_login" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
           <InputField
            type="tel"
            label="Mobilnummer"
            placeholder="Nummer..."
            name="phone_login" 
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <InputField 
            label="Lösenord" 
            placeholder="Lösenord..."
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          /> 
          <InputField 
            label="Upprepa lösenord" 
            placeholder="Lösenord..."
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          /> 
          <Button 
            className="w-full"
            type="submit"
            onClick={(e) => {
              e.preventDefault();
              void handleSignup();
            }}
          >
            Skapa konto
          </Button>
        </div>
      </Card>
    </div>
  )
}


export default SignupPage;