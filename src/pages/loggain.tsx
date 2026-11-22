import Error from "next/error";
import Link from "next/link";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { EmailCodeSignIn } from "~/components/common/EmailCodeSignIn/EmailCodeSignIn";
import { toAppSession } from "~/utils/appSession";
import { authClient } from "~/utils/authClient";
import { featureFlags } from "~/utils/featureFlags";
import { isProfileComplete } from "~/utils/profile";

interface LoginPageProps {
  adminLogin?: boolean;
}

/** Only same-site paths, so a link can't send someone to another site after sign-in. */
const safeCallbackUrl = (value: string | string[] | undefined) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : null;

export const LoginPage = ({ adminLogin }: LoginPageProps) => {
  const router = useRouter();
  const isAdminLogin = adminLogin || router.query.admin !== undefined;

  if (!featureFlags.ENABLE_LOGIN && !isAdminLogin) {
    return <Error statusCode={404} />;
  }

  const onSignedIn = async () => {
    const { data } = await authClient.getSession();
    const user = toAppSession(data)?.user;
    if (!user || !isProfileComplete(user)) {
      await router.push("/profil");
      return;
    }
    // Embedded in another page (e.g. a guarded one): signing in re-renders it.
    if (router.pathname === "/loggain") {
      await router.push(safeCallbackUrl(router.query.callbackUrl) ?? "/profil");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <Card title="Logga in" className="w-full md:w-96">
        <EmailCodeSignIn
          intro="Logga in med din email. Vi skickar en kod."
          onSignedIn={onSignedIn}
        />
        {featureFlags.ENABLE_LOGIN && (
          <p className="mt-4 text-center text-sm">
            <Link className="underline" href="/skapakonto">
              Inget konto? Skapa konto
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
};

export default LoginPage;
