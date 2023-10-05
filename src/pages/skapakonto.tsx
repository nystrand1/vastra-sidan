import { signIn } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import Card from "~/components/atoms/CardLink/CardLink";
import { InputField } from "~/components/atoms/InputField/InputField";
import { api } from "~/utils/api";
import { signupSchema } from "~/utils/zodSchemas";




export const SignupPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const router = useRouter();
  const { mutateAsync: createUser } = api.user.createNewUser.useMutation();

  useEffect(() => {
    const loginError = router.query['error'];
    if (loginError === 'CredentialsSignin') {
      toast.error("Felaktig inloggning, försök igen!")
    }
  }, [router.query]);


  const handleSignup = async () => {
    const signUpPayload = {
      email,
      password,
      confirmPassword
    };

    const payload = signupSchema.safeParse(signUpPayload);

    if (!payload.success) {
      toast.error("Felaktig inloggning, försök igen!");
      return;
    }
    try {
      const res = await createUser(payload.data)
      await signIn('credentials', { username: email, password });
    } catch(error) {
      const err = error as { message: string }
      toast.error(err.message)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <Card 
        title="Logga in"
        className="w-full md:w-96"
      >
        <div className="space-y-4">
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
            onClick={handleSignup}
          >
            Skapa konto
          </Button>
        </div>
      </Card>
    </div>
  )
}


export default SignupPage;