import vlay from './vlay.js'
import * as THREE from 'three'
//threejs.org/examples/?q=modifi#webgl_modifier_subdivision
//threejs.org/examples/?q=simp#webgl_modifier_simplifier
//three/examples/jsm/materials/MeshGouraudMaterial.js
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, MeshReflectorMaterial, AdaptiveDpr } from '@react-three/drei'
import { Brush, Subtraction } from '@react-three/csg'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export default function App() {
  // output, positive defects
  vlay.v.out = useRef()

  const R = vlay.v.R * 8
  return (
    <Canvas frameloop="demand" performance={{ min: 0.1 }} shadows camera={{ position: [0, R, R] }} onCreated={(state) => vlay.init(state)}>
      <fog attach="fog" args={['black', 0, 400]} />
      <OrbitControls makeDefault />
      <pointLight
        name="top"
        intensity={2}
        distance={R * 4}
        decay={2}
        position={[0, R * 2, R]}
        castShadow
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <pointLight name="mid" intensity={2} distance={R} decay={2} position={[0, vlay.v.R / 4, 0]} castShadow />
      <directionalLight name="low" intensity={0.125} position={[0, 0, -1]} />
      <gridHelper args={[R, 4]} position={0} />
      <axesHelper args={[R]} />
      <group name="out" ref={vlay.v.out}>
        <mesh name={'CSG'}>
          <CSG />
        </mesh>
      </group>
      <mesh name="sea" renderOrder={2} material={vlay.mat.neg}>
        <icosahedronGeometry args={[vlay.v.R * 2.5, 2]} />
      </mesh>
      <mesh name="mirror" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[R, R]} />
        <MeshReflectorMaterial
          blur={[512, 128]}
          resolution={1024}
          mixBlur={1.75}
          mixStrength={50}
          roughness={0.5}
          depthScale={0.25}
          color="#808080"
          metalness={0.75}
        />
      </mesh>
      <AdaptiveDpr pixelated />
    </Canvas>
  )
}

function CSG() {
  //docs.pmnd.rs/react-three-fiber/api/events
  useFrame((state) => {
    const geom = vlay.v.csg.geo.current
    if (geom && geom.userData.update) {
      console.log('r3f', state.gl.info)
      geom.userData.update = false
      // invalidate stale mutated
      geom.geometry.computeVertexNormals()
      geom.needsUpdate = true
    }
  })

  // ray-test CSG
  vlay.v.csg.neg = useRef()
  vlay.v.csg.geo = useRef()

  let neg = new THREE.PlaneGeometry(0, 0)
  let geo = new THREE.IcosahedronGeometry(vlay.v.R * 2, 5)
  geo = mergeVertices(geo)
  //
  geo.userData.pos = geo.getAttribute('position').clone()

  // boxmap max-resolution
  vlay.mat.MAX = Math.min(geo.index.count / (6 / 3), 512)

  return (
    <Subtraction useGroups>
      <Brush a ref={vlay.v.csg.geo} geometry={geo} material={vlay.mat.pos} />
      <Brush b ref={vlay.v.csg.neg} geometry={neg} material={vlay.mat.neg} />
    </Subtraction>
  )
}
