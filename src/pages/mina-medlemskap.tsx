import { useSession } from "next-auth/react";
import Error from "next/error";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
import { featureFlags } from "~/utils/featureFlags";
import LoginPage from "./loggain";


const isEnabled = featureFlags.ENABLE_LOGIN && featureFlags.ENABLE_MEMBERSHIPS;

export const ProfilePage = () => {
  const session = useSession();
  const { data } = api.user.getProfile.useQuery(undefined, { enabled: isEnabled && !!session.data?.user });

  if (!isEnabled) {
    return <Error statusCode={404} />
  }

  if (!session.data?.user) {
    return <LoginPage />
  }

  if (!data) {
    return <p className="text-center">Laddar...</p>
  }

  return (
    <div className="flex flex-col items-center justify-center">
        <Card 
          title="Mina medlemskap"
          className="w-full md:w-96"
        >
          <div className="h-0.5 border-t-0 bg-neutral-100" />          
        </Card>
    </div>
  )
}


export default ProfilePage;
