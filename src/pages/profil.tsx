import { useSession } from "next-auth/react";
import Image from "next/image";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
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
      {data.memberShips && data.memberShips?.length > 0 && (
        <Card 
          title="Mina medlemskap"
          className="w-full md:w-96"
        >
          <div className="h-0.5 border-t-0 bg-neutral-100" />
          {data.memberShips.map((membership) => {
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
        </Card>
      )}
    </div>
  )
}


export default ProfilePage;