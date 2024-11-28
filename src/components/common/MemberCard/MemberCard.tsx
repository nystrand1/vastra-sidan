import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import Band from "./Band";

export default function MemberCard() {
  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 25 }} className="touch-none">
      <ambientLight intensity={Math.PI} />
      <Physics interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
        <Band />
      </Physics>      
    </Canvas>
  )
}