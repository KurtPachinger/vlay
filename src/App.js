import vlay from './vlay.js'
import * as THREE from 'three'
//threejs.org/examples/?q=modifi#webgl_modifier_subdivision
//threejs.org/examples/?q=simp#webgl_modifier_simplifier
//three/examples/jsm/materials/MeshGouraudMaterial.js
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, MeshReflectorMaterial, AdaptiveDpr } from '@react-three/drei'
import { Brush, Subtraction } from '@react-three/csg'

export default function App(props) {
  // output, positive defects
  vlay.v.out = useRef()

  const R = vlay.v.R * 4
  return (
    <Canvas frameloop="demand" performance={{ min: 0.1 }} shadows camera={{ position: [0, R, R] }} onCreated={(state) => vlay.init(state)}>
      <fog attach="fog" args={['black', 0, 300]} />
      <OrbitControls makeDefault />
      <pointLight name="top" intensity={6} position={[0, R, R * 2]} castShadow />
      <pointLight name="mid" intensity={3} position={[0, R / 4, 0]} castShadow />
      <directionalLight name="low" intensity={2} position={[0, 0, -1]} />
      <gridHelper args={[R * 2, 4]} position={0} />
      <axesHelper args={[R]} />
      <group name="out" ref={vlay.v.out}>
        <mesh name={'CSG'} castShadow material={vlay.mat.pos}>
          <CSG />
        </mesh>
      </group>
      <mesh name="mirror" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[R * 2, R * 2]} />
        <MeshReflectorMaterial
          blur={[512, 128]}
          resolution={512}
          mixBlur={1.5}
          mixStrength={50}
          roughness={0.5}
          depthScale={0.25}
          color="#202020"
          metalness={0.75}
        />
      </mesh>
      <AdaptiveDpr pixelated />
    </Canvas>
  )
}

function CSG(props) {
  //codesandbox.io/s/busy-swirles-eckvc1
  //docs.pmnd.rs/react-three-fiber/api/events

  // RAY-TEST LAYERS
  vlay.v.csg.neg = useRef()
  vlay.v.csg.geo = useRef()

  //vlay.v.csg.pos = useRef()

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

  let neg = new THREE.PlaneGeometry(0, 0)
  let geo = new THREE.IcosahedronGeometry(vlay.v.R * 2, 3)
  //geo = mergeVertices(geo)
  geo.userData.pos = geo.attributes.position.clone()

  return (
    <Subtraction>
      <Brush a ref={vlay.v.csg.geo} geometry={geo} {...props} />
      <Brush a>
        <Brush b ref={vlay.v.csg.neg} geometry={neg} material={vlay.v.csg.neg} />
        <icosahedronGeometry b args={[vlay.v.R, 2]} />
      </Brush>
    </Subtraction>
  )
}
