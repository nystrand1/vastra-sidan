import Error from "next/error";
import Card from "~/components/atoms/CardLink/CardLink";
import { featureFlags } from "~/utils/featureFlags";

interface LoginPageProps {
  adminLogin?: boolean;
}

export const LoginPage = ({ adminLogin }: LoginPageProps) => {
  if (!featureFlags.ENABLE_LOGIN && !adminLogin) {
    return <Error statusCode={404} />;
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <Card title="Logga in" className="w-full md:w-96">
        <p>Inloggning öppnar snart.</p>
      </Card>
    </div>
  );
};

export default LoginPage;
