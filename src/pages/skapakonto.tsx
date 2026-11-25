import Error from "next/error";
import Link from "next/link";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { EmailCodeSignIn } from "~/components/common/EmailCodeSignIn/EmailCodeSignIn";
import { featureFlags } from "~/utils/featureFlags";

export const SignupPage = () => {
  const router = useRouter();

  if (!featureFlags.ENABLE_LOGIN) {
    return <Error statusCode={404} />;
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <Card title="Skapa konto" className="w-full md:w-96">
        <EmailCodeSignIn
          intro="Skapa konto med din email. Vi skickar en kod."
          onSignedIn={async () => {
            await router.push("/profil");
          }}
        />
        <p className="mt-4 text-center text-sm">
          <Link className="underline" href="/loggain">
            Har du redan ett konto? Logga in
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default SignupPage;
