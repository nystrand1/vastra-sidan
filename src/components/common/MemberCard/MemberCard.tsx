import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";

import { type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "~/server/api/root";
import BandAndCard from "./BandAndCard";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { captureException } from "@sentry/nextjs";

type ActiveMembership = NonNullable<inferRouterOutputs<AppRouter>['member']['getMember']>['activeMemberships'][number]


interface MemberCardProps extends ActiveMembership {
  flipped: boolean
  memberName: string
}

export default function MemberCard({ flipped, memberName, name, textureUrl }: MemberCardProps) {
  if (!textureUrl) {
    captureException(new Error("No textureUrl provided"))
    return "No textureUrl provided"
  }

  useGLTF.preload(`/api/proxy?url=${encodeURIComponent(textureUrl)}`);

  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 25 }} className="touch-none lg:touch-auto">
      <ambientLight intensity={Math.PI} />
      <Physics interpolate gravity={[0, -30, 0]} timeStep={1 / 120}>
        <BandAndCard name={memberName} memberType={name} flipped={flipped} textureUrl={`/api/proxy?url=${encodeURIComponent(textureUrl)}`} />
      </Physics>      
      <Environment>
        <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
      </Environment>
    </Canvas>
  )
}