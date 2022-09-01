import * as THREE from 'three'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { mergeBufferGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
//threejs.org/examples/?q=modifi#webgl_modifier_subdivision
//threejs.org/examples/?q=simp#webgl_modifier_simplifier
//three/examples/jsm/materials/MeshGouraudMaterial.js
import { useRef, useState, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, MeshReflectorMaterial } from '@react-three/drei'
import { Brush, Subtraction, Addition } from '@react-three/csg'

const R = 10
const vlay = {
  R: R,
  raycast: new THREE.Raycaster(),
  pointer: new THREE.Vector3(),
  opt: { seed: 0.5, proc: 1, show: 0 },
  var: {
    uid: {}
  },
  csg: {
    /* geo, neg, pos*/
  },
  mat: {
    box: new THREE.BoxBufferGeometry(R, R, R, 2, 2, 2),
    img: new THREE.MeshBasicMaterial({
      name: 'img',
      side: THREE.DoubleSide, //ray intersects
      //map: terrain,
      transparent: true,
      opacity: 0.5,
      depthTest: false
    }),
    neg: new THREE.MeshPhongMaterial({
      name: 'neg',
      specular: 0x8080c0,
      vertexColors: true,
      //flatShading: true,
      transparent: true,
      shininess: 15,
      opacity: 0.9,
      side: THREE.FrontSide,
      shadowSide: THREE.FrontSide
    }),
    pos: new THREE.MeshPhongMaterial({
      name: 'pos',
      //color: 0x802020,
      specular: 0x804040,
      vertexColors: true,
      shininess: 2
    }),
    xyz: [
      ['px', 'posx', 'right', '.50,.33'],
      ['nx', 'negx', 'left', '0,.33'],
      ['py', 'posy', 'top', '.25,0'],
      ['ny', 'negy', 'bottom', '.25,.66'],
      ['pz', 'posz', 'front', '.25,.33'],
      ['nz', 'negz', 'back', '.75,.33']
    ]
  },
  init: function () {
    controls()

    //vlay.csg.geo = new THREE.IcosahedronGeometry(vlay.R, 6)

    // BOXMAP
    let pos = vlay.mat.box.getAttribute('position')
    let vtx = new THREE.Vector3()
    for (var i = 0; i < pos.count; i++) {
      vtx.fromBufferAttribute(pos, i)
      let mult = (vlay.R * 2) / Math.sqrt(vtx.x * vtx.x + vtx.y * vtx.y + vtx.z * vtx.z)
      vtx.multiplyScalar(mult)
      pos.setXYZ(i, vtx.x, vtx.y, vtx.z)
    }
    vlay.mat.box.name = 'boxmap'

    vlay.proc()
  },
  util: {
    clear: function (sel = []) {
      if (sel.type === 'Group') {
        // three
        vlay.var.uid[sel.name] = null
        let els = sel.children
        for (let i in els) {
          let el = els[i]
          if (el.name === 'box') {
            el.material.forEach(function (cubeface) {
              cubeface.map.dispose()
            })
          } else if (el.name === 'neg' || el.name === 'pos') {
            el.geometry.dispose()
          }
          sel.remove(el)
        }
        vlay.var.out.current.remove(sel)
      } else if (Array.isArray(sel)) {
        // texture array
        for (let i in sel) {
          sel[i] = null
        }
      } else {
        // DOM image
        sel = document.getElementById(sel)
        let els = sel ? sel.children : []
        for (let i = els.length - 1; i >= 0; i--) {
          let el = els[i]
          el = sel.removeChild(el)
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

      let flat = vlay.mat.xyz.flat()
      vlay.util.clear('boxmap')
      const cm = []

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
            let face = vlay.mat.xyz[i]
            let xy = face[face.length - 1].split(',')
            xy = crop > 1 ? { x: xy[0], y: xy[1] } : null
            // image resize and crop
            let canvas = vlay.util.refit(img, xy)
            let name = 'img_' + vlay.mat.xyz[i][0]
            canvas.title = canvas.id = name
            fragment.appendChild(canvas)

            // cubemap face from coords
            if (crop === 6) {
              cm.push([i + '_' + name, canvas])
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
                cm.push([name, canvas])
                break
              } else if (j === flat.length) {
                cm.push([name, canvas])
              }
            }
          }

          // await cubemap, sort, and proceed
          if (cm.length >= files.length) {
            document.getElementById('boxmap').appendChild(fragment)
            cm.sort()
            vlay.proc({ box: cm, id: 'box' })
          }

          img = null
        }
        img.src = tex
      }
    },
    refit: function (img, crop) {
      let MAX_ = vlay.opt.proc * 128
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
    }
  },
  proc: async function (opts = {}) {
    console.log('proc', opts.p)

    if (!opts.init) {
      // INIT
      opts.init = true
      opts.p = opts.p || vlay.opt.proc
      opts.s = opts.s || vlay.opt.seed
      opts.id = 'default'
      //opts.id = [opts.id || 'noise', opts.s, opts.p].join('_')

      // RESET
      vlay.util.clear(vlay.var.out.current.getObjectByName(opts.id))
      // GROUP
      opts.group = new THREE.Group()
      opts.group.name = opts.id
      vlay.var.out.current.add(opts.group)

      // CUBEMAP
      vlay.mat.map = vlay.cubemap(opts.box || 0, opts)
      let box = new THREE.Mesh(vlay.mat.box, vlay.mat.map)
      box.name = 'box'
      box.renderOrder = 2
      opts.group.add(box)

      // MANTLE
      opts.group.userData.mantle = {}

      let geo = vlay.csg.geo.current.geometry
      // *** to-do: memoize & reset position from userData ***
      geo.computeBoundingSphere()
      if (!geo.getAttribute('color')) {
        let pos = geo.getAttribute('position')
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      }
      opts.geo = geo
    }

    if (opts.p > 0) {
      opts.geo = await vlay.rays(opts)
      //recurse
      opts.p--
      vlay.proc(opts)
    } else {
      vlay.defects(opts.group)
    }
  },
  rays: function (opts) {
    let blurs = []
    //console.log('rays', opts)

    // cubemap PYR attenuate/convolute
    let k = vlay.opt.proc - opts.p + 1
    let target = opts.group.getObjectByName('box').material
    for (let i = 0; i < target.length; i++) {
      let material = target[i].map.source.data
      let blur = document.createElement('canvas')
      let ctx = blur.getContext('2d')
      blur.width = blur.height = k
      ctx.drawImage(material, 0, 0, blur.width, blur.height)
      blurs.push(blur)
    }

    // raycast at vertices (for elevation, color)
    const col = opts.geo.getAttribute('color')
    const pos = opts.geo.getAttribute('position')
    const ctr = opts.geo.boundingSphere.center
    const dir = new THREE.Vector3()
    // defects from boxmap (for surface features)
    let mantle = opts.group.userData.mantle

    for (let i = 0; i < pos.count; i++) {
      vlay.pointer.fromBufferAttribute(pos, i)
      const jitter = 1.001
      vlay.pointer.multiply(new THREE.Vector3(jitter, jitter, jitter))
      vlay.raycast.set(ctr, dir.subVectors(vlay.pointer, ctr).normalize())

      const intersects = vlay.raycast.intersectObjects(opts.group.children, false)
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
        disp.copy(vlay.pointer.multiplyScalar(1 - d * (1 / opts.p)))
        disp.lerp(relax, 0.25)
        pos.setXYZ(i, disp.x, disp.y, disp.z)
        // mantle (crust, core)
        // BVH-CSG cavities, extreme peak/valley
        let face = String(intersect.faceIndex).padStart(3, '0')
        let dist = vlay.pointer.distanceTo(intersect.point).toFixed(3)
        let xyz = disp.x.toFixed(3) + ',' + disp.y.toFixed(3) + ',' + disp.z.toFixed(3)
        let defect = [dist, opts.p, xyz, face].join('|')

        // defect tolerance
        if (mantle[face] === undefined) {
          mantle[face] = []
        }
        if (dist < vlay.R * 0.2) {
          mantle[face].push(defect + '|pos')
        } else if (dist < vlay.R * 0.4) {
          mantle[face].push(defect + '|neg')
        }
      }
    }

    // cleanup
    vlay.util.clear(blurs)
    return opts.geo
  },
  defects: function (group) {
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
      let f
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

        // dist for vertex color
        let dNorm = defect[0] / vlay.R
        depth.push({ d: dNorm, t: defect[defect.length - 1] })

        if (i === 0) {
          f = ft(feat, dNorm)
        }

        // path from center to outside
        if (feat === 'neg' && !f.neg) {
          point.multiplyScalar(i / (defects.length - 1) + 0.33)
        }

        // xyz for curve mesh
        coord.push(point)
      }

      cluster = cluster / defects.length
      let feat = cluster < fit.cluster.c ? 'pos' : 'neg'

      // curve defects geometry and color
      topo(coord, feat, depth)
    }

    function ft(feat, toBox, num) {
      // re-classify features
      let f = { neg: false, pos: false }
      if (feat === 'neg') {
        f.neg = toBox <= 0.25
      } else {
        f.pos = toBox >= 0.5
      }

      return f
    }

    // CSG tube/s
    function topo(coord, feat, depth) {
      let f = ft(feat, depth[0].d)
      let loop = feat === 'pos' && !f.pos ? coord.length : 1
      let geo

      if (feat === 'neg' || f.pos) {
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
        if (feat === 'pos' && !f.pos) {
          let pt = coord[i]
          let d = 1 + depth[i].d * 2
          geo = new THREE.BoxBufferGeometry(d, d, d)
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
      let pointer = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        // vertex distance
        pointer.fromBufferAttribute(pos, i)
        let d = pointer.distanceTo(new THREE.Vector3(0, 0, 0))
        d = vlay.R / d
        // curve data
        let pt = depth[Math.floor((i / pos.count) * depth.length)]
        let s = pt.t === 'core' ? 0.125 : 0.5

        col.setXYZ(i, 1 - d, s, s)
      }
    }

    console.log('fit', fit)
    let fitline = new THREE.PlaneBufferGeometry(1, 1)
    let feats = ['neg', 'pos']
    feats.forEach(function (feat) {
      // cavities buffer geometry to mesh
      let csg = new THREE.Mesh(fit[feat] || fitline, vlay.mat[feat])
      csg.name = csg.geometry.name = feat
      if (feat === 'pos') {
        csg.castShadow = csg.receiveShadow = true
      }
      group.add(csg)
      vlay.csg[feat].current.geometry = csg.geometry
    })

    // r3f
    vlay.csg.geo.current.userData.update = true
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
        buffer32[i] = Number('0x' + vlay.gen(opts.id))
        //buffer32[i] += 0x80000000;
      }

      ctx.putImageData(iData, 0, 0)
      let tex = new THREE.CanvasTexture(canvas)

      return tex
    }

    if (!num) {
      vlay.util.clear('genmap')
    }

    let cubemap = []
    let ts = Date.now()
    let fragment = new DocumentFragment()
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas')

      let terrain
      if (!num) {
        // random noise (...game of life?)
        canvas.id = canvas.title = 'rnd_' + vlay.mat.xyz[i][0] + '_' + ts
        canvas.width = canvas.height = 8
        terrain = noise(canvas)
        fragment.appendChild(canvas)
      } else {
        terrain = new THREE.CanvasTexture(num[i][1])
      }
      terrain.minFilter = THREE.NearestFilter
      terrain.magFilter = THREE.NearestFilter

      let mat = vlay.mat.img.clone()
      mat.name = !num ? 'genmap' : 'boxmap'
      mat.map = terrain

      cubemap.push(mat)
    }
    document.getElementById('genmap').appendChild(fragment)

    return cubemap
  },
  gen: function (id, uei = 1) {
    // uid from seed (from last or root)
    let S = vlay.var.uid[id]
    S = S ? S ** 1.5 : ((Math.PI - 3) * 1e5) / vlay.opt.seed
    S = Number((S * uei).toFixed().slice(-8))
    // output
    vlay.var.uid[id] = S
    return S
  }
}

const controls = () => {
  const gui = new GUI()
  gui
    .add(vlay.opt, 'seed', 0, 1)
    .step(0.01)
    .onChange(function (n) {
      vlay.proc({ s: n })
    })
  gui
    .add(vlay.opt, 'proc', 1, 10)
    .step(1)
    .onChange(function (n) {
      vlay.proc({ p: n })
    })
  gui
    .add(vlay.opt, 'show', 0, 3)
    .step(1)
    .onChange(function (n) {
      let onion = ['box', 'neg', 'pos']
      vlay.var.out.current.children.forEach(function (group) {
        let planet = group.children
        for (let i = 0; i < planet.length; i++) {
          let mesh = planet[i]
          let show = onion.indexOf(mesh.name) >= n
          mesh.visible = show
        }
      })
    })
}
// DEBUG...
window.vlay = vlay

export default function App(props) {
  // output, positive defects
  vlay.var.out = useRef()
  vlay.csg.pos = useRef()

  const R = vlay.R * 4
  return (
    // frameloop="demand" / invalidate
    <Canvas shadows camera={{ position: [0, R, R] }} onCreated={(state) => vlay.init()}>
      <OrbitControls makeDefault />
      <pointLight intensity={6} position={[0, R, R * 2]} castShadow />
      <pointLight intensity={2} position={[0, R / 4, 0]} castShadow />
      <gridHelper args={[R * 2, 4]} position={0} />
      <axesHelper args={[R / 2]} />
      <group ref={vlay.var.out} name="out" />
      <mesh ref={vlay.csg.pos} material={vlay.mat.pos} />
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
  vlay.csg.geo = useRef()
  vlay.csg.neg = useRef()

  useFrame((state) => {
    const geom = vlay.csg.geo.current
    if (geom && geom.userData.update) {
      console.log('r3f', state.gl.info)
      geom.userData.update = false
      //geom.geometry.computeBoundingSphere()
      geom.geometry.computeVertexNormals()
      geom.needsUpdate = true
    }
  })

  const geo = new THREE.IcosahedronBufferGeometry(vlay.R, 3)
  const neg = new THREE.BufferGeometry()
  return (
    <Subtraction useGroups>
      <Subtraction a useGroups>
        <Brush a ref={vlay.csg.geo} geometry={geo} material={vlay.mat.pos} {...props} />
        <Brush b ref={vlay.csg.neg} geometry={neg} material={vlay.mat.neg} />
      </Subtraction>
      <Brush b>
        <icosahedronBufferGeometry args={[vlay.R / 2, 1]} />
      </Brush>
    </Subtraction>
  )
}

function Mirror(props) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
      <planeGeometry args={[vlay.R * 8, vlay.R * 8]} />
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
