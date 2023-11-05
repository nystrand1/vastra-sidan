import { signIn } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "~/components/atoms/Button/Button";
import Card from "~/components/atoms/CardLink/CardLink";
import { InputField } from "~/components/atoms/InputField/InputField";
import { loginSchema } from "~/utils/zodSchemas";




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
    const loginPayload = loginSchema.safeParse({ email, password });
    if (!loginPayload.success) {
      loginPayload.error.issues.map((x) => toast.error(x.message))
      return;
    }
    const res = await signIn('credentials', { username: email, password, redirect: false, callbackUrl: "/" });
    if (res?.status === 401) {
      toast.error("Felaktig inloggning, försök igen")
    }
    if (res?.ok) {
      await router.push("/");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <Card 
        title="Logga in"
        className="w-full md:w-96"
      >
        <form className="space-y-4">
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
            type="submit"
            onClick={async (e) => {
              e.preventDefault();
              await handleLogin();
            }}
          >
            Logga In
          </Button>
          <Button 
            className="w-full"
            onClick={() => router.push("/skapakonto")}
          >
            Skapa konto
          </Button>
        </form>
      </Card>
    </div>
  )
}


export default LoginPage;