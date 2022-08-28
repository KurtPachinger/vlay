import './styles.scss'
import * as THREE from 'three'
import { mergeBufferGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useRef, useState, useLayoutEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Reflector } from '@react-three/drei'
import { useControls } from 'leva'
import { Brush, Subtraction, Addition } from '@react-three/csg'
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
    ],
    raycast: new THREE.Raycaster(),
    pointer: new THREE.Vector3(),
    group: new THREE.Group(),
    m: {
      vertex: new THREE.MeshStandardMaterial({
        name: 'vertex',
        color: 0xc08080,
        vertexColors: true,
        metalness: 0.33,
        roughness: 0.66
      }),
      cavity: new THREE.MeshPhongMaterial({
        name: 'cavity',
        color: 0x8080c0,
        vertexColors: true,
        flatShading: true,
        transparent: true,
        opacity: 0.9,
        side: THREE.FrontSide,
        shadowSide: THREE.FrontSide
      })
    }
  },
  set: { seed: 0.5, proc: 1 },

  proc: async function (opts = { p: vlay.set.proc, id: 'noise', seed: vlay.set.seed }) {
    let promise = new Promise((resolve, reject) => {
      console.log('proc', opts.p)
      const v = vlay.var

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
        // MANTLE
        opts.group.userData.mantle = {}
        v.group.add(opts.group)

        // CUBEMAP
        let map = vlay.set.cubemap && opts.cubemap ? opts.cubemap : 0
        opts.cubemap = vlay.cubemap(map, opts)
        let cubemap = new THREE.Mesh(v.boxsphere, opts.cubemap)
        cubemap.name = 'cubemap'
        opts.group.add(cubemap)
        v.m.cubemap = opts.cubemap

        // ELEVATE, max subdivide
        opts.elevate = vlay.var.elevate = new THREE.IcosahedronGeometry(v.R, 6)
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
        let elevate = new THREE.Mesh(opts.elevate, v.m.vertex)
        elevate.name = 'elevate'
        //elevate.castShadow = true
        //elevate.receiveShadow = true
        //opts.group.add(elevate)
        //for CSG
        //v.elevate = elevate

        // MANTLE DEFECTS
        vlay.defects(opts.group)

        resolve('done!')
      }
    })

    let result = await promise
  },
  rays: function (opts) {
    let blurs = []
    const v = vlay.var
    //console.log('rays', opts)

    // cubemap PYR attenuate/convolute
    let target = opts.group.getObjectByName('cubemap').material

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
      const jitter = 1.001
      v.pointer.multiply(new THREE.Vector3(jitter, jitter, jitter))
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
        let face = String(intersect.faceIndex).padStart(3, '0')
        let dist = v.pointer.distanceTo(intersect.point).toFixed(3)
        let xyz = disp.x.toFixed(3) + ',' + disp.y.toFixed(3) + ',' + disp.z.toFixed(3)
        let defect = [dist, opts.p, xyz, face].join('|')

        // defect tolerance
        if (mantle[face] === undefined) {
          mantle[face] = []
        }
        if (dist < v.R * 0.2) {
          mantle[face].push(defect + '|pos')
        } else if (dist < v.R * 0.4) {
          mantle[face].push(defect + '|neg')
        }
      }
    }

    // cleanup
    vlay.clear(blurs)
  },
  defects: function (group) {
    const v = vlay.var
    // face defects to mesh and CSG

    const userData = group.userData
    // fit roi contour to landmark type
    let fit = {
      pos: 0,
      neg: 0,
      cluster: { c: 0 }
    }

    Object.keys(userData.mantle).forEach(function (face) {
      // sort face distance and de-dupe
      let defects = userData.mantle[face].sort().reverse()
      defects = [...new Set(defects)]
      // limit segments
      let delta = Math.ceil(defects.length / 6)
      delta = Math.max(delta, 1)
      let seg = []
      for (let i = 0; i < defects.length; i += delta) {
        seg.push(defects[i])
        // feature type ratio
        let feat = defects[i].slice(-3)
        fit[feat]++
      }
      userData.mantle[face] = seg
      // minimum defects
      if (defects.length < 3) {
        delete userData.mantle[face]
      }
    })
    // sort overall distance
    userData.mantle = Object.values(userData.mantle).sort().reverse()
    fit.cluster.c = fit.neg / (fit.neg + fit.pos).toFixed(3)
    fit.pos = fit.neg = false

    console.log('defects', userData.mantle)
    for (var face of Object.keys(userData.mantle)) {
      let defects = userData.mantle[face]

      // parse defect
      let cluster = 0

      // === 'core' ? 'pos' : 'neg'
      let coord = []
      let depth = []
      for (let i = 0; i < defects.length; i++) {
        // 'dist|p|x,y,z|type'
        let defect = defects[i].split('|')

        let feat = defect[defect.length - 1]

        if (feat === 'neg') {
          cluster++
        }

        let point = defect[2]
        point = point.split(',')
        point = new THREE.Vector3(+point[0], +point[1], +point[2])

        // path from center to outside
        point.multiplyScalar(i / (defects.length - 1) + 0.33)

        // xyz for curve mesh
        coord.push(point)
        // dist for vertex color
        depth.push({ d: defect[0] / v.R, t: defect[defect.length - 1] })
      }

      cluster = cluster / defects.length
      let feat = cluster < fit.cluster.c ? 'pos' : 'neg'

      // curve defects geometry and color
      topo(coord, feat, depth)
    }

    // cavities buffer geometry to mesh
    //fitline = mergeVertices(fitline, 0.5)
    //let fitline = new THREE.PlaneGeometry(v.R * 2, v.R * 2)
    let fitline = new THREE.BufferGeometry()

    let neg = new THREE.Mesh(fit.neg || fitline, v.m.cavity)
    neg.name = 'neg'
    let pos = new THREE.Mesh(fit.pos || fitline, v.m.vertex)
    pos.name = 'pos'
    pos.castShadow = true
    pos.receiveShadow = true

    // CSG tube/s
    function topo(coord, feat, depth) {
      let loop = feat === 'pos' ? coord.length : 1
      let geo

      if (feat === 'neg') {
        const curve = new THREE.CatmullRomCurve3(coord)
        const extrude = {
          steps: 8,
          bevelEnabled: false,
          extrudePath: curve
        }

        const pts1 = [],
          count = 5
        for (let i = 0; i < count; i++) {
          const l = 1 * loop
          const a = ((2 * i) / count) * Math.PI
          pts1.push(new THREE.Vector2(Math.cos(a) * l, Math.sin(a) * l))
        }

        const ellipsoid = new THREE.Shape(pts1)
        geo = new THREE.ExtrudeGeometry(ellipsoid, extrude)
      }

      // OUTPUT

      for (let i = 0; i < loop; i++) {
        if (feat === 'pos') {
          let pt = coord[i]
          let d = 1 + depth[i].d * 2
          geo = new THREE.BoxGeometry(d, d, d)
          geo.translate(pt.x, pt.y, pt.z)
        }

        //
        colors(geo, depth)

        // merge geometry with previous
        let merge = fit[feat] ? fit[feat] : geo
        if (fit[feat]) {
          merge = mergeBufferGeometries([fit[feat], geo], false)
          fit.cluster[feat]++
        } else {
          fit.cluster[feat] = 1
        }
        fit[feat] = merge
      }
    }

    function colors(geo, depth) {
      // colors
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
    }
    //
    console.log('fit', fit)
    // OUTPUT
    group.add(pos, neg)
    v.neg = neg.geometry
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
        buffer32[i] = Number('0x' + vlay.seed(opts.seed, opts.id))
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
        canvas.id = canvas.title = 'rnd_' + vlay.var.ref[i][0] + '_' + ts
        canvas.width = canvas.height = 8
        terrain = noise(canvas)
        fragment.appendChild(canvas)
      } else {
        terrain = new THREE.CanvasTexture(num[i][1])
      }
      terrain.minFilter = THREE.NearestFilter
      terrain.magFilter = THREE.NearestFilter

      let mat = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide, //ray intersects
        map: terrain,
        transparent: true,
        opacity: 0.5,
        //blending: THREE.MultiplyBlending,
        depthWrite: false
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
  seed: function (seed, gen, uei = 1) {
    // pseudo-random number (from last or root)
    let S = vlay.var.seed[gen]
    S = S ? S ** 1.5 : ((Math.PI - 3) * 1e5) / seed
    S = Number((S * uei).toFixed().slice(-8))
    //recursive
    vlay.var.seed[gen] = S
    return S
  },
  clear: function (id, proc) {
    if (proc) {
      // three cleanup
      vlay.var.seed[id] = null
      let group = vlay.var.group
      for (let i = 0; group && i < group.children.length; i++) {
        let child = group.children[i]
        if (child.name === 'cubemap') {
          child.material.forEach(function (cubeface) {
            cubeface.map.dispose()
          })
        }
        group.remove(child)
      }
      vlay.var.group.remove(group)
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

    let flat = vlay.var.ref.flat()
    vlay.clear('cubemap')
    vlay.var.cm = []

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
          vlay.proc({ p: vlay.set.proc, seed: vlay.set.seed, id: 'image', cubemap: v.cm })
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
  const v = vlay.var
  v.group.name = 'voxels'

  GUI(vlay.set, v, v.group)

  return (
    <Canvas shadows frameloop="demand" camera={{ position: [0, v.R * 4, v.R * 4] }}>
      <Scened>
        <pointLight intensity={6} position={[0, v.R * 8, v.R * 8]} castShadow />
        <pointLight intensity={4} decay={v.R * 16} position={[0, v.R / 2, 0]} castShadow />
        <axesHelper args={[v.R * 2]} />
        <gridHelper args={[v.R * 8, 4]} position={[0, -0.001, 0]} />
        <primitive object={v.group} {...props} />
        <mesh name={'CSG'} castShadow>
          <Subtraction useGroups>
            <Subtraction a useGroups>
              <Brush a geometry={v.elevate} material={v.m.vertex} />
              <Brush b geometry={v.neg} material={v.m.cavity} />
            </Subtraction>
            <Brush b position={[0, 0, 0]}>
              <icosahedronGeometry args={[v.R / 2, 1]} />
            </Brush>
          </Subtraction>
        </mesh>
        <Ground />
        <OrbitControls makeDefault />
      </Scened>
    </Canvas>
  )
}

function Ground(v, ...props) {
  return (
    <Reflector resolution={256} args={[v.R * 8, v.R * 8]} {...props}>
      {(Material, props) => <Material color="#f0f0f0" transparent opacity={0.66} {...props} />}
    </Reflector>
  )
}

function GUI(set, v, group) {
  //const ref = useRef()
  //const [hovered, setHover] = useState(false)
  //useFrame((state) => {

  return useControls({
    seed: {
      value: 0.5,
      min: 0,
      max: 1,
      onChange: (n) => {
        set.seed = n
        vlay.proc()
      }
      //transient: false
    },
    proc: {
      value: 1,
      min: 1,
      max: 10,
      step: 1,
      onChange: (n) => {
        set.proc = n
        vlay.proc()
      }
      //transient: false
    },
    show: {
      value: 0,
      min: 0,
      max: 2,
      step: 1,
      onChange: (n) => {
        let onion = ['cubemap', 'neg', 'pos']
        group.children.forEach(function (group) {
          let planet = group.children || []
          for (let i = 0; i < planet.length; i++) {
            let mesh = planet[i]
            let show = onion.indexOf(mesh.name) >= n
            mesh.visible = show ? true : false
          }
        })
      }
      //transient: false
    }
  })
}

function Scened(props) {
  console.log('ini')

  // INIT SCENE, FIRST-RUN
  let scene = new THREE.Scene()

  // MAP BOX-SPHERE FOR TARGET
  const R = vlay.var.R * 2
  vlay.var.boxsphere = new THREE.BoxGeometry(R, R, R, 2, 2, 2)
  let pos = vlay.var.boxsphere.getAttribute('position')
  let vtx = new THREE.Vector3()
  for (var i = 0; i < pos.count; i++) {
    vtx.fromBufferAttribute(pos, i)
    let mult = R / Math.sqrt(vtx.x * vtx.x + vtx.y * vtx.y + vtx.z * vtx.z)
    vtx.multiplyScalar(mult)
    pos.setXYZ(i, vtx.x, vtx.y, vtx.z)
  }

  // PROC-GEN
  vlay.proc()

  const sRef = useRef(scene)
  vlay.var.scene = sRef

  return <scene ref={sRef} {...props} />
}
