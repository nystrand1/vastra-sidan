import { useSession } from "next-auth/react";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
import { featureFlags } from "~/utils/featureFlags";
import LoginPage from "./loggain";


export const ProfilePage = () => {
  const session = useSession();
  const { data } = api.user.getProfile.useQuery(undefined, { enabled: !!session.data?.user });

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


export const getStaticProps = () => {
  if (!featureFlags.ENABLE_MEMBERSHIPS) {
    return {
      notFound: true,
    }
  }

  return {
    props: {},
    revalidate: 60,
  };
}