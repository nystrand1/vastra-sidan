import Error from "next/error";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Card from "~/components/atoms/CardLink/CardLink";
import { EmailCodeSignIn } from "~/components/common/EmailCodeSignIn/EmailCodeSignIn";
import { toAppSession } from "~/utils/appSession";
import { authClient } from "~/utils/authClient";
import { featureFlags } from "~/utils/featureFlags";
import { isProfileComplete } from "~/utils/profile";
import { safeCallbackUrl } from "~/utils/safeCallbackUrl";
import { readSignInLink } from "~/utils/signInLink";

interface LoginPageProps {
  adminLogin?: boolean;
}

export const LoginPage = ({ adminLogin }: LoginPageProps) => {
  const router = useRouter();
  // Whether the address is the login link from the email. The code is in the fragment, which
  // only the browser sees, so this is known once mounted. Read once: the link is then removed.
  const [isLoginLink, setIsLoginLink] = useState<boolean | null>(null);
  useEffect(() => {
    setIsLoginLink(readSignInLink(window.location.hash) !== null);
  }, []);
  // While login is off only admins get codes, so the link is an admin's.
  const isAdminLogin = adminLogin || router.query.admin !== undefined || isLoginLink === true;

  // The page is prerendered, so the query is empty until the router is ready.
  if (!featureFlags.ENABLE_LOGIN && (!router.isReady || isLoginLink === null)) {
    return <p className="text-center">Laddar...</p>;
  }

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
      await router.push(safeCallbackUrl(router.query.callbackUrl, window.location.origin) ?? "/profil");
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
