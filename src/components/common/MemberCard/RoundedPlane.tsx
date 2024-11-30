import { extend } from '@react-three/fiber';
import React from 'react';
import * as THREE from 'three';

interface RoundedPlaneProps {
  width: number;
  height: number;
  radius: number;
  x?: number;
  y?: number;
}

extend({ ShapeBufferGeometry: THREE.ShapeGeometry });

const RoundedPlane = ({
  width = 5,
  height = 3,
  radius = 0.5,
  x = 0,
  y = 0,
} : RoundedPlaneProps) => {
  // Create a shape with rounded corners
  const createRoundedRect = (w: number, h: number, r: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return shape;
  };

  const roundedRect = createRoundedRect(width, height, radius);

  return (
    <mesh position={[x, y, 0]}>
      <shapeBufferGeometry args={[roundedRect]} />
      <meshStandardMaterial color="#111827" />
    </mesh>
  );
};

export default RoundedPlane;