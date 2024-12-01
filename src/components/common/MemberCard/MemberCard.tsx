import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";

import { type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "~/server/api/root";
import { useTexture } from "@react-three/drei";
import dynamic from "next/dynamic";

type ActiveMembership = NonNullable<inferRouterOutputs<AppRouter>['member']['getMember']>['activeMemberships'][number]

const BandAndCard = dynamic(() => import('~/components/common/MemberCard/BandAndCard'), {
  ssr: false,
  loading: () => <div className="flex justify-center">Laddar...</div>
});

interface MemberCardProps extends ActiveMembership {
  flipped: boolean
  memberName: string
}

export default function MemberCard({ flipped, memberName, name, imageUrl }: MemberCardProps) {
  useTexture.preload(imageUrl);

  return (
    <>
      <Canvas camera={{ position: [0, 0, 13], fov: 25 }} className="touch-none">
        <ambientLight intensity={Math.PI} />
        <Physics interpolate gravity={[0, -30, 0]} timeStep={1 / 120}>
          <BandAndCard name={memberName} memberType={name} flipped={flipped} />
        </Physics>      
      </Canvas>
    </>
  )
}