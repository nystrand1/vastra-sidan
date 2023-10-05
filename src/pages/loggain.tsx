import { signIn } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { InputField } from "~/components/atoms/InputField/InputField";




export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  useEffect(() => {
    const loginError = router.query['error'];
    if (loginError === 'CredentialsSignin') {
      toast.error("Felaktig inloggning, försök igen!")
    }
  }, [router.query]);

  const handleLogin = async () => {
    await signIn('credentials', { username: email, password, callbackUrl: "/" })
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
          <Button 
            className="w-full"
            onClick={handleLogin}
          >
            Logga In
          </Button>
          <Button 
            className="w-full"
            onClick={() => router.push("/skapakonto")}
          >
            Skapa konto
          </Button>
        </div>
      </Card>
    </div>
  )
}


export default LoginPage;