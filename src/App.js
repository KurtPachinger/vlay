import * as THREE from 'three'
import { mergeBufferGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useState, useLayoutEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Reflector } from '@react-three/drei'
import { useControls } from 'leva'
import { Subtraction, Brush } from '@react-three/csg'
//

let v
let vlay = {
  var: {
    R: 10,
    seed: {},
    ref: [
      ['px', 'posx', 'right', '.50,.33'],
      ['nx', 'negx', 'left', '0,.33'],
      ['py', 'posy', 'top', '.25,0'],
      ['ny', 'negy', 'bottom', '.25,.66'],
      ['pz', 'posz', 'front', '.25,.33'],
      ['nz', 'negz', 'back', '.75,.33']
    ]
  },
  set: { seed: 0.5, proc: 1 },
  ini: function () {
    console.log('ini')
    v = vlay.var
    const R = v.R * 2

    // INIT SCENE, FIRST-RUN
    v.scene = new THREE.Scene()

    // MAP BOX-SPHERE FOR TARGET
    v.boxsphere = new THREE.BoxGeometry(R, R, R, 2, 2, 2)
    let pos = v.boxsphere.getAttribute('position')
    let vtx = new THREE.Vector3()
    for (var i = 0; i < pos.count; i++) {
      vtx.fromBufferAttribute(pos, i)
      let mult = R / Math.sqrt(vtx.x * vtx.x + vtx.y * vtx.y + vtx.z * vtx.z)
      vtx.multiplyScalar(mult)
      pos.setXYZ(i, vtx.x, vtx.y, vtx.z)
    }

    // MAP PROC-GEN ELEVATION
    v.m_terrain = new THREE.MeshStandardMaterial({
      color: 0x80c0ff,
      //flatShading: true,
      vertexColors: true,
      metalness: 0.25,
      roughness: 0.5
    })
    v.m_terrain.name = 'terrain'
    v.m_vertex = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.5,
      blending: THREE.MultiplyBlending
    })
    v.m_vertex.name = 'vertex'

    // RAY-TEST LAYERS
    v.raycast = new THREE.Raycaster()
    v.pointer = new THREE.Vector3()
    v.group = new THREE.Group()
    v.group.name = 'voxels'
    v.scene.add(v.group)

    // PROC-GEN
    vlay.proc()

    return v.scene
  },
  proc: function (opts = { p: vlay.set.proc, id: 'noise' }) {
    console.log('proc', opts.p)

    if (!opts.r) {
      // RESET
      opts.r = true
      vlay.clear(opts.id, true)
      // id and cubemap
      // if not, hide cubemap
      v.group.children.forEach(function (group) {
        if (group.name !== opts.id) {
          group.visible = false
        }
      })

      // GROUP
      opts.group = new THREE.Group()
      opts.group.name = opts.id
      v.group.add(opts.group)
      // MANTLE
      opts.group.userData.mantle = {}

      // CUBEMAP
      let map = vlay.set.cubemap && opts.cubemap ? opts.cubemap : 0
      opts.cubemap = vlay.cubemap(map, opts)
      let cubemap = new THREE.Mesh(v.boxsphere, opts.cubemap)
      cubemap.name = 'cubemap'
      opts.group.add(cubemap)
      v.m_cubemap = opts.cubemap

      // ELEVATE, max subdivide
      opts.elevate = new THREE.IcosahedronGeometry(v.R, 6)
      opts.max = opts.elevate.attributes.position.count * 8
    }

    if (opts.p > 0) {
      // MESH SUBDIVIDE
      //opts.elevate.computeBoundingSphere()
      //let BS = opts.elevate.boundingSphere.radius
      //const subdivide = new TessellateModifier(BS / 3, 2)
      //opts.elevate = subdivide.modify(opts.elevate)

      // displace
      vlay.rays(opts)

      if (opts.p > 1) {
        // MESH SIMPLIFY
        // overwrites geometry uv/color attributes
        //const simplify = new SimplifyModifier()
        //let count = opts.elevate.attributes.position.count
        //if (count > opts.max) {
        //  count = count - opts.max
        //  opts.elevate = simplify.modify(opts.elevate, count * 0.975)
        //}
      }

      // recursion
      opts.p--
      vlay.proc(opts)
    } else {
      console.log('PROC DONE')
      // ELEVATE
      let elevate = new THREE.Mesh(opts.elevate, v.m_terrain)
      elevate.name = 'elevate'
      elevate.castShadow = true
      elevate.receiveShadow = true
      opts.group.add(elevate)
      //for CSG
      vlay.var.elevate = elevate

      // MANTLE DEFECTS
      vlay.defects(opts.group)
    }
  },
  rays: function (opts) {
    //console.log('rays', opts)

    // cubemap PYR attenuate/convolute
    let target = opts.group.getObjectByName('cubemap').material
    let blurs = []
    let k = vlay.set.proc - opts.p + 1
    for (let i = 0; i < target.length; i++) {
      let material = target[i].map.source.data
      let blur = document.createElement('canvas')
      let ctx = blur.getContext('2d')
      blur.width = blur.height = k
      ctx.drawImage(material, 0, 0, blur.width, blur.height)
      blurs.push(blur)
    }

    // raycast
    let geo = opts.elevate
    geo.computeBoundingSphere()
    let ctr = geo.boundingSphere.center
    let dir = new THREE.Vector3()
    // elevation, color
    let pos = geo.getAttribute('position')
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
    let col = geo.getAttribute('color')
    // mantle (cavities)
    let mantle = opts.group.userData.mantle
    // raycast at cubemap through vertices
    for (let i = 0; i < pos.count; i++) {
      v.pointer.fromBufferAttribute(pos, i)
      // jitter fractional amount
      v.pointer.multiply(new THREE.Vector3(1.001, 1, 1))
      v.raycast.set(ctr, dir.subVectors(v.pointer, ctr).normalize())

      const intersects = v.raycast.intersectObjects(opts.group.children, false)
      if (intersects.length) {
        // cubemap sample (rgba, distance)
        let intersect = intersects[0]
        let relax = intersect.point.multiplyScalar(0.75)

        // rgba from uv PYR
        let uv = intersect.uv
        let blur = blurs[intersect.face.materialIndex]
        let ctx = blur.getContext('2d')
        let rgba = ctx.getImageData(blur.width * uv.x, blur.height - blur.height * uv.y, 1, 1).data

        // vertex color
        col.setXYZ(i, rgba[0] / 255, rgba[1] / 255, rgba[2] / 255)

        // sample strength
        let d = (rgba[0] + rgba[1] + rgba[2]) / 765 //765
        d -= rgba[3] / 255
        d /= opts.p
        // displace elevation
        let disp = new THREE.Vector3()
        disp.copy(v.pointer.multiplyScalar(1 - d * (1 / opts.p)))
        disp.lerp(relax, 0.25)
        pos.setXYZ(i, disp.x, disp.y, disp.z)
        // mantle (crust, core)
        // BVH-CSG cavities, extreme peak/valley
        let face = String(intersect.faceIndex).padStart(5, '0')
        let dist = v.pointer.distanceTo(intersect.point)
        let xyz = disp.x + ',' + disp.y + ',' + disp.z
        let defect = [dist, opts.p, xyz].join('|')

        if (mantle[face] === undefined) {
          mantle[face] = []
        }
        if (dist < v.R * 0.125) {
          mantle[face].push(defect + '|crust')
        } else if (dist > v.R * 0.33) {
          mantle[face].push(defect + '|core')
        }
      }
    }

    // cleanup
    vlay.clear(blurs)
  },
  defects: function (group) {
    // face defects to mesh for CSG
    // cavity, roi, contour, landmark
    const mantle = group.userData.mantle

    let features = false
    for (var faces of Object.keys(mantle)) {
      // sort distance and de-dupe
      let defects = mantle[faces].sort()
      defects = mantle[faces] = [...new Set(defects)]
      if (defects.length < 4) {
        // minimum points
        continue
      }

      // limit segments
      let delta = Math.floor(defects.length / 6)
      delta = Math.max(delta, 1)
      // parse defect
      let coord = []
      let depth = []
      for (let i = 0; i < defects.length; i = i + delta) {
        // 'dist|p|x,y,z|type'
        let defect = defects[i].split('|')
        let point = defect[2]
        point = point.split(',')
        point = new THREE.Vector3(+point[0], +point[1], +point[2])

        if (i === 0 || i === defects.length - 1) {
          // exaggerate furthest point for CSG clearance
          point.multiplyScalar(1.5)
        } else if (i === Math.round(defects.length / 2)) {
          // halfway point to origin
          //point.multiplyScalar(0.5)
        }
        // output
        coord.push(point)
        // normal distance from feature to hull
        depth.push({ d: defect[0] / v.R, t: defect[defect.length - 1] })
      }
      //console.log('curve',curve)

      // geometry from face defects
      const curve = new THREE.CatmullRomCurve3(coord)
      const geo = new THREE.TubeGeometry(curve, 16, 2, 6, false)

      // colors
      /*
      let pos = geo.getAttribute('position')
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      let col = geo.getAttribute('color')
      // vertex color
      for (let i = 0; i < pos.count; i++) {
        // vertex distance
        v.pointer.fromBufferAttribute(pos, i)
        let d = v.pointer.distanceTo(new THREE.Vector3(0, 0, 0))
        d = v.R / d
        // curve data
        let pt = depth[Math.floor((i / pos.count) * depth.length)]
        let s = pt.t === 'core' ? 0.125 : 0.5

        col.setXYZ(i, 1 - d, s, s)
      }
      */

      // merge geometry with previous
      let merge = features ? features : geo
      if (features) {
        merge = mergeBufferGeometries([features, geo], false)
        //merge = mergeVertices(merge, 0.001)
      }
      features = merge
    }

    const mat = new THREE.MeshPhongMaterial({
      side: THREE.DoubleSide,
      color: 0xc080ff,
      //vertexColors: true,
      flatShading: true
    })
    // cavities buffer geometry to mesh
    let cavity = new THREE.Mesh(features, mat)
    cavity.castShadow = true

    // CSG tube/s
    //const closedSpline = new THREE.CatmullRomCurve3(curve)
    //closedSpline.curveType = 'catmullrom'
    //closedSpline.closed = true
    //const extrude = {
    //  steps: 128,
    //  bevelEnabled: false,
    //  extrudePath: closedSpline
    //}

    const pts1 = [],
      count = 6
    for (let i = 0; i < count; i++) {
      const l = 2
      const a = ((2 * i) / count) * Math.PI
      pts1.push(new THREE.Vector2(Math.cos(a) * l, Math.sin(a) * l))
    }

    //const ellipsoid = new THREE.Shape(pts1)
    //const geo = new THREE.ExtrudeGeometry(ellipsoid, extrude)
    //const mat = new THREE.MeshLambertMaterial({
    //  color: 0xc00000,
    //  emissive: 0x400000,
    //  wireframe: false,
    //  side: THREE.DoubleSide,
    //  flatShading: true
    //})

    //let cavities = new THREE.Mesh(geo, mat)
    //cavities.castShadow = true

    //

    // OUTPUT
    console.log('mantle', mantle)

    let csg = new THREE.Group()
    csg.name = 'csg'
    csg.add(cavity)
    group.add(csg)
    vlay.var.csg = cavity
  },
  cubemap: function (num, opts) {
    function noise(canvas) {
      let ctx = canvas.getContext('2d')
      const w = ctx.canvas.width,
        h = ctx.canvas.height,
        iData = ctx.createImageData(w, h),
        buffer32 = new Uint32Array(iData.data.buffer),
        len = buffer32.length
      let i = 0

      for (; i < len; i++) {
        // argb (elevation)
        buffer32[i] = Number('0x' + vlay.seed(opts.id))
        //buffer32[i] += 0x80000000;
      }

      ctx.putImageData(iData, 0, 0)
      let tex = new THREE.CanvasTexture(canvas)

      return tex
    }

    if (!num) {
      vlay.clear('texels')
    }

    let cubemap = []
    let ts = Date.now()
    let fragment = new DocumentFragment()
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas')

      let terrain
      if (!num) {
        // random noise (...game of life?)
        canvas.id = canvas.title = 'rnd_' + v.ref[i][0] + '_' + ts
        canvas.width = canvas.height = 8
        terrain = noise(canvas)
        fragment.appendChild(canvas) //should be documentFragment
      } else {
        terrain = new THREE.CanvasTexture(num[i][1])
      }
      terrain.minFilter = THREE.NearestFilter
      terrain.magFilter = THREE.NearestFilter

      let mat = new THREE.MeshBasicMaterial({
        //color: 0x00ffff,
        side: THREE.DoubleSide, //ray intersects
        map: terrain,
        transparent: true,
        opacity: 0.5
      })

      cubemap.push(mat)
    }
    document.getElementById('texels').appendChild(fragment)

    return cubemap
  },
  fileMax: function (img, crop) {
    let MAX_ = vlay.set.proc * 128
    let width = img.width
    let height = img.height

    // square
    if (crop) {
      width = height = MAX_
    }

    // fit dimensions
    if (width > height) {
      if (width > MAX_) {
        height = height * (MAX_ / width)
        width = MAX_
      }
    } else {
      if (height > MAX_) {
        width = width * (MAX_ / height)
        height = MAX_
      }
    }

    let canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    let ctx = canvas.getContext('2d')
    if (!crop) {
      ctx.drawImage(img, 0, 0, width, height)
    } else {
      // assume aspect 1.33
      let face = img.width / 4
      ctx.drawImage(img, img.width * crop.x, img.height * crop.y, face, face, 0, 0, width, height)
    }

    return canvas
  },
  seed: function (gen, uei = 1) {
    // pseudo-random number (from last or root)
    let S = v.seed[gen]
    S = S ? S ** 1.5 : ((Math.PI - 3) * 1e5) / vlay.set.seed
    S = Number((S * uei).toFixed().slice(-8))
    //recursive
    v.seed[gen] = S
    return S
  },
  clear: function (id, proc) {
    let v = vlay.var
    if (proc) {
      // three cleanup
      v.seed[id] = null
      let group = v.group.getObjectByName(id)
      for (let i = 0; group && i < group.children.length; i++) {
        let child = group.children[i]
        if (child.name === 'cubemap') {
          child.material.forEach(function (cubeface) {
            cubeface.map.dispose()
          })
        }
        group.remove(child)
      }
      v.group.remove(group)
    } else if (Array.isArray(id)) {
      for (var i in id) {
        id[i] = null
      }
    } else {
      // DOM cleanup
      id = document.getElementById(id)
      while (id.lastChild) {
        let el = id.removeChild(id.lastChild)
        el = null
      }
    }
  },

  click: function (e) {
    let files = e.target.files
    //console.log(files);
    if (files.length !== 1 && files.length !== 6) {
      return
    }

    let flat = v.ref.flat()
    vlay.clear('cubemap')
    v.cm = []

    let fragment = new DocumentFragment()
    for (let i = 0; i < files.length; i++) {
      let file = files[i]

      // load image
      let tex = URL.createObjectURL(file)
      let img = new Image()
      img.onload = function () {
        URL.revokeObjectURL(this.src)

        // extract cube faces if single image
        let crop = files.length === 1 ? 6 : 1
        for (let i = 0; i < crop; i++) {
          // coords percent
          let face = v.ref[i]
          let xy = face[face.length - 1].split(',')
          xy = crop > 1 ? { x: xy[0], y: xy[1] } : null
          // image resize and crop
          let canvas = vlay.fileMax(img, xy)
          let name = 'img_' + v.ref[i][0]
          canvas.title = canvas.id = name
          fragment.appendChild(canvas)

          // cubemap face from coords
          if (crop === 6) {
            v.cm.push([i + '_' + name, canvas])
            continue
          }

          // cubemap face from filename
          name = file.name.toString().toLowerCase()
          for (let j = 0; j < flat.length; j++) {
            let match = name.search(flat[j])
            console.log(match)
            //console.log("match", j, name, match);
            if (match > -1) {
              name = Math.floor(j / 3) + '_' + name
              v.cm.push([name, canvas])
              break
            } else if (j === flat.length) {
              v.cm.push([name, canvas])
            }
          }
        }

        // await cubemap, sort, and proceed
        if (v.cm.length >= files.length) {
          document.getElementById('cubemap').appendChild(fragment)
          v.cm.sort()
          vlay.proc({ p: vlay.set.proc, id: 'image', cubemap: v.cm })
        }

        img = null
      }
      img.src = tex
    }
  }
}

//
// BEGIN
//vlay.ini()
document.getElementById('pics').addEventListener('change', vlay.click)
//debug...
window.vlay = vlay
//

export default function App(props) {
  const [scene] = useState(() => vlay.ini())

  useLayoutEffect(() => {
    return () => void scene.dispose()
  }, [scene])
  vlay.set = GUI()
  let v = vlay.var
  return (
    <Canvas shadows frameloop="demand" camera={{ position: [0, v.R * 4, v.R * 4] }}>
      <OrbitControls makeDefault />
      <pointLight intensity={10} position={[0, v.R * 8, v.R * 8]} castShadow />
      <pointLight intensity={20} decay={4} position={[0, v.R / 4, 0]} castShadow />
      <gridHelper args={[v.R * 8, 8]} position={[0, -0.1, 0]} />
      <Ground receiveShadow mirror={1} blur={[256, 256]} mixBlur={4} mixStrength={0.25} rotation={[-Math.PI / 2, 0, Math.PI / 2]} />
      <mesh name={'CSG'} castShadow receiveShadow>
        <Subtraction useGroups>
          <Subtraction a useGroups>
            <Brush a geometry={vlay.var.elevate.geometry} material={vlay.var.m_cubemap} />
            <Brush b geometry={vlay.var.csg.geometry} material={vlay.var.csg.material} />
          </Subtraction>
          <Brush b position={[0, 0, 0]}>
            <icosahedronGeometry args={[v.R * 0.75, 1]} />
            <meshStandardMaterial color="red" />
          </Brush>
        </Subtraction>
      </mesh>
      <primitive object={scene} {...props} />
    </Canvas>
  )
}

function Ground(props) {
  return (
    <Reflector resolution={256} args={[v.R * 8, v.R * 8]} {...props}>
      {(Material, props) => <Material color="#f0f0f0" transparent opacity={0.66} {...props} />}
    </Reflector>
  )
}

const GUI = () => {
  return useControls({
    seed: {
      value: 0.5,
      min: 0,
      max: 1,
      onChange: (v) => {
        vlay.set.seed = v
        vlay.proc()
      },
      transient: false
    },
    proc: {
      value: 1,
      min: 1,
      max: 10,
      step: 1,
      onChange: (v) => {
        vlay.set.proc = v
        vlay.proc()
      },
      transient: false
    },
    show: {
      value: 0,
      min: 0,
      max: 3,
      step: 1,
      onChange: (v) => {
        vlay.set.proc = v
        let onion = ['cubemap', 'elevate', 'csg']
        vlay.var.group.children.forEach(function (group) {
          let planet = group.children
          for (let i = 0; i < planet.length; i++) {
            let mesh = planet[i]
            let show = onion.indexOf(mesh.name) >= v
            mesh.visible = show ? true : false
          }
        })
      },
      transient: false
    },
    mode: {
      value: 'linear',
      options: ['point', 'linear', 'connected']
    }
  })
}
