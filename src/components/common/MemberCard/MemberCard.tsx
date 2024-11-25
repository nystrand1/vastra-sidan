import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import Band from "./Band";
import { Environment, Lightformer } from "@react-three/drei";

export default function MemberCard() {
  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 25 }}>
      <ambientLight intensity={Math.PI} />
      <Physics interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
        <Band />
      </Physics>      
    </Canvas>
  )
}