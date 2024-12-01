import { useSession } from "next-auth/react";
import Image from "next/image";
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
          {data.memberShips && data.memberShips.map((membership) => {
            return (
              <div className="flex flex-col space-y-2" key={membership.id}>
                <p>{membership.name}</p>
                <p>{membership.type}</p>
                <div className="h-56 relative">
                  <Image src={membership.imageUrl} fill alt={membership.name} style={{ objectFit: 'contain' }} />
                </div>
              </div>
            )
          })}
          {!data.memberShips?.length && (
            <p className="text-center">Du har inget medlemskap</p>
          )}
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
    revalidate: 60,
  };
}