import vlay from './vlay.js'
import * as THREE from 'three'
//threejs.org/examples/?q=modifi#webgl_modifier_subdivision
//threejs.org/examples/?q=simp#webgl_modifier_simplifier
//three/examples/jsm/materials/MeshGouraudMaterial.js
import { useRef, useState, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, MeshReflectorMaterial } from '@react-three/drei'
import { Brush, Subtraction, Addition } from '@react-three/csg'

export default function App(props) {
  // output, positive defects
  vlay.v.out = useRef()
  vlay.v.csg.pos = useRef()

  const R = vlay.v.R * 4
  return (
    // frameloop="demand" / invalidate
    <Canvas shadows camera={{ position: [0, R, R] }} onCreated={(state) => vlay.init()}>
      <OrbitControls makeDefault />
      <pointLight intensity={6} position={[0, R, R * 2]} castShadow />
      <pointLight intensity={2} position={[0, R / 4, 0]} castShadow />
      <gridHelper args={[R * 2, 4]} position={0} />
      <axesHelper args={[R / 2]} />
      <group ref={vlay.v.out} name="out" />
      <mesh ref={vlay.v.csg.pos} material={vlay.mat.pos} />
      <mesh name={'CSG'} castShadow>
        <CSG />
      </mesh>
      <Mirror />
    </Canvas>
  )
}

function CSG(props) {
  //https://codesandbox.io/s/busy-swirles-eckvc1
  //docs.pmnd.rs/react-three-fiber/api/events

  // RAY-TEST LAYERS
  vlay.v.csg.geo = useRef()
  vlay.v.csg.neg = useRef()

  useFrame((state) => {
    const geom = vlay.v.csg.geo.current
    if (geom && geom.userData.update) {
      console.log('r3f', state.gl.info)
      geom.userData.update = false
      //geom.geometry.computeBoundingSphere()
      geom.geometry.computeVertexNormals()
      geom.needsUpdate = true
    }
  })

  const geo = new THREE.IcosahedronBufferGeometry(vlay.v.R, 3)
  const neg = new THREE.PlaneBufferGeometry(0, 0)
  return (
    <Subtraction useGroups>
      <Subtraction a useGroups>
        <Brush a ref={vlay.v.csg.geo} geometry={geo} material={vlay.mat.pos} {...props} />
        <Brush b ref={vlay.v.csg.neg} geometry={neg} material={vlay.mat.neg} />
      </Subtraction>
      <Brush b>
        <icosahedronBufferGeometry args={[vlay.v.R / 2, 1]} />
      </Brush>
    </Subtraction>
  )
}

function Mirror(props) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
      <planeGeometry args={[vlay.v.R * 8, vlay.v.R * 8]} />
      <MeshReflectorMaterial
        blur={[256, 128]}
        resolution={1024}
        mixBlur={1}
        mixStrength={30}
        roughness={1}
        depthScale={0.3}
        color="#202020"
        metalness={0.6}
      />
    </mesh>
  )
}
