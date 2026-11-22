import Error from "next/error";
import Card from "~/components/atoms/CardLink/CardLink";
import { featureFlags } from "~/utils/featureFlags";
import { useAppSession } from "~/utils/authClient";
import LoginPage from "./loggain";

export const AwayGamesProfilePage = () => {
  const { user, isPending } = useAppSession();

  if (!featureFlags.ENABLE_LOGIN) {
    return <Error statusCode={404} />;
  }

  if (isPending) {
    return <p className="text-center">Laddar...</p>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <Card title="Mina bussresor" className="w-full md:w-96">
        <p>Kommer snart.</p>
      </Card>
    </div>
  );
};

export default AwayGamesProfilePage;
