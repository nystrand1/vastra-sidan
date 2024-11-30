import { Center, Text3D, useGLTF, useTexture } from '@react-three/drei'
import { extend, useFrame, useThree } from '@react-three/fiber'
import { BallCollider, CuboidCollider, type RapierRigidBody, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier'
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
import { type RefObject, useEffect, useRef, useState } from 'react'

import * as THREE from 'three'

import { type MaterialNode, type Object3DNode } from '@react-three/fiber'
import RoundedPlane from './RoundedPlane'

declare module '@react-three/fiber' {
  interface ThreeElements {
    meshLineGeometry: Object3DNode<MeshLineGeometry, typeof MeshLineGeometry>
    meshLineMaterial: MaterialNode<MeshLineMaterial, typeof MeshLineMaterial>
  }
}

extend({ MeshLineGeometry, MeshLineMaterial })
useGLTF.preload('https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/5huRVDzcoDwnbgrKUo1Lzs/53b6dd7d6b4ffcdbd338fa60265949e1/tag.glb')
useTexture.preload('/static/membercard_band.jpg');
useTexture.preload('/static/membercard_2021.jpg');

type ExtendedRigidBody = RapierRigidBody & { lerped?: THREE.Vector3 }

interface BandAndCardProps {
  maxSpeed?: number
  minSpeed?: number
  name?: string
  memberType?: string
}

export default function BandAndCard({ 
  maxSpeed = 50, 
  minSpeed = 10,
  name = "Filip Nystrand",
  memberType = "Familjemedlemskap"
} : BandAndCardProps) {
  const band = useRef() as RefObject<THREE.Mesh & { geometry: { setPoints: (points: THREE.Vector3[]) => void } }>;
  const fixed = useRef() as RefObject<ExtendedRigidBody>;
  const j1 = useRef() as RefObject<ExtendedRigidBody>;
  const j2 = useRef() as RefObject<ExtendedRigidBody>;
  const j3 = useRef() as RefObject<ExtendedRigidBody>;
  const card = useRef() as RefObject<ExtendedRigidBody>;
  const vec = new THREE.Vector3();
  const ang = new THREE.Vector3();
  const rot = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const segmentProps = { type: 'dynamic', canSleep: true, angularDamping: 2, linearDamping: 2 }
  const { nodes, materials } = useGLTF('https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/5huRVDzcoDwnbgrKUo1Lzs/53b6dd7d6b4ffcdbd338fa60265949e1/tag.glb')
  const texture = useTexture('/static/membercard_band.jpg');
  const cardTexture = useTexture('/static/membercard_2021.jpg');
  const { width, height } = useThree((state) => state.size)
  const [curve] = useState(() => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]))
  const [dragged, drag] = useState<boolean | THREE.Vector3>(false)
  const [hovered, hover] = useState(false)
  const repeat = new THREE.Vector2(-4, 1);
  const resolution = new THREE.Vector2(width, height);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1.2]) // prettier-ignore
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1.2]) // prettier-ignore
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1.2]) // prettier-ignore
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]]) // prettier-ignore

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab'
      return () => void (document.body.style.cursor = 'auto')
    }
  }, [hovered, dragged])

  useFrame((state, delta) => {
    if (typeof dragged === 'object') {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
        ;[card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp())
      card.current?.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z })
    }
    if (fixed.current) {
      // Fix most of the jitter when over pulling the card
      ;[j1, j2].forEach((ref) => {
        if (!ref.current?.lerped) ref.current!.lerped = new THREE.Vector3().copy(ref.current!.translation())
        const clampedDistance = Math.max(0.1, Math.min(1, ref.current!.lerped.distanceTo(ref.current!.translation())))
        ref.current!.lerped.lerp(ref.current!.translation(), delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed)))
      })
      // Calculate catmul curve
      curve.points[0]!.copy(j3.current!.translation())
      if (j2.current?.lerped) curve.points[1]!.copy(j2.current.lerped)
      if (j1.current?.lerped) curve.points[2]!.copy(j1.current.lerped)
      curve.points[3]!.copy(fixed.current.translation())
      band.current!.geometry.setPoints(curve.getPoints(32))
      // Tilt it back towards the screen
      ang.copy(card.current!.angvel())
      rot.copy(card.current!.rotation())
      card.current!.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z }, false)
    }
  })

  curve.curveType = 'chordal'
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping

  const planeWidth = name.length * 0.13
  const textXPos = -0.8/14 * name.length
  const cardXPos = 0.04 * (planeWidth);

  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps} type="dynamic">
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps} type="dynamic">
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps} type="dynamic">
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[2, 0, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={2.25}
            position={[0, -1.2, 0]}
            rotation={[0, 0, 0]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(e) => {
              const event = e.target as typeof e.target & { releasePointerCapture: (id: number) => void };
              event.releasePointerCapture(e.pointerId);
              drag(false);
            }}
            onPointerDown={(e) => {
              const event = e.target as typeof e.target & { setPointerCapture: (id: number) => void };
              event.setPointerCapture(e.pointerId);
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current!.translation())));
            }}>
              <Center left attach="material" bottom position={[cardXPos, 0.12, 0.007]} scale={0.2}>
                <Text3D
                  bevelEnabled={false}
                  bevelSize={0}
                  font="/static/Roboto_Regular.json"
                  height={0}
                  scale={0.1}                  
                  position={[textXPos, 0.2, 0.05]}
                  rotation={[0, 0, 0]}>
                  {name}
                </Text3D>
                  <Text3D
                  bevelEnabled={false}
                  bevelSize={0}
                  font="/static/Roboto_Regular.json"
                  height={0}
                  scale={0.08}                  
                  position={[textXPos, 0, 0.05]}
                  rotation={[0, 0, 0]}>
                  {memberType}
                  </Text3D>                 
                  <RoundedPlane 
                    width={planeWidth} 
                    height={0.55} 
                    radius={0.1} 
                    y={0.12}
                    x={0}
                  />                                    
              </Center>
            <group position={[0, 0.5, 0]}>
              <mesh rotation={[0, 0, 0]}>
                <planeGeometry args={[0.7, 1 / 1]} />
                <meshBasicMaterial map={cardTexture} side={THREE.FrontSide}  />
              </mesh>
              <mesh rotation={[0, 0, 0]}>
                <planeGeometry args={[0.7, 1 / 1]}  />
                <meshBasicMaterial map={cardTexture} side={THREE.BackSide}  />
              </mesh>
            </group>            
            <mesh geometry={'geometry' in nodes.clip! ? nodes.clip.geometry as THREE.BufferGeometry<THREE.NormalBufferAttributes> : undefined} material={materials.metal} material-roughness={0.3} />
            <mesh geometry={'geometry' in nodes.clamp! ? nodes.clamp.geometry as THREE.BufferGeometry<THREE.NormalBufferAttributes> : undefined} material={materials.metal} />
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial color="white" depthTest={false} resolution={resolution} useMap={1} map={texture} repeat={repeat} lineWidth={1} />
      </mesh>
    </>
  )
}