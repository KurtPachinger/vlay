import * as THREE from 'three'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { mergeBufferGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { noise } from './noise.js'

const R = 10
const vlay = {
  v: {
    R: R,
    opt: { uid: true, seed: 0.5, iter: 5, view: 1 },
    csg: {}, // geo, neg, pos
    uid: {}
  },
  mat: {
    MAX: 128,
    box: new THREE.BoxGeometry(R, R, R, 2, 2, 2),
    img: new THREE.MeshBasicMaterial({
      name: 'img',
      side: THREE.DoubleSide, // ray intersects
      transparent: true,
      opacity: 0.5
    }),
    neg: new THREE.MeshPhongMaterial({
      name: 'neg',
      color: 0x2020c0,
      specular: 0x4040c0,
      side: THREE.DoubleSide, // CSG
      transparent: true,
      opacity: 0.75,
      shininess: 10
    }),
    pos: new THREE.MeshStandardMaterial({
      name: 'pos',
      //color: 0x101040,
      //specular: 0x201010,
      side: THREE.DoubleSide,
      shadowSide: THREE.BackSide,
      vertexColors: true,
      roughness: 1
    }),
    env: new THREE.MeshBasicMaterial({
      name: 'env',
      color: 0x4010c0,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.25
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
  init: function (state) {
    // r3f canvas created state
    vlay.v.state = state
    vlay.util.gui()
    vlay.util.minimap()

    // BOXMAP
    let pos = vlay.mat.box.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      let vtx = new THREE.Vector3()
      vtx.fromBufferAttribute(pos, i)
      let mult = (vlay.v.R * 4) / Math.sqrt(vtx.x * vtx.x + vtx.y * vtx.y + vtx.z * vtx.z)
      vtx.multiplyScalar(mult)
      pos.setXYZ(i, vtx.x, vtx.y, vtx.z)
    }
    vlay.mat.box.name = 'boxmap'

    // output
    vlay.gcut()
  },
  util: {
    num: function (num, o = {}) {
      o.pre = o.pre || (num < 0 ? '-' : '+')
      o.pad = o.pad >= 0 ? o.pad : 3
      o.fix = o.fix >= 0 ? o.fix : 3
      // format
      let n = Number(Math.abs(num))
      n = o.pre + String(n.toFixed(o.fix)).padStart(o.pad + o.fix + 1, '0')
      if (o.n) {
        n = parseFloat(n)
      }
      return n
    },
    gen: function (id, uei = 1) {
      // uid from seed (from last or root)
      let S = vlay.v.uid[id]
      S = S ? S ** 1.5 : ((Math.PI - 3) * 5e11) / vlay.v.opt.seed
      S = Number((S * uei).toFixed().slice(-8))
      // output
      vlay.v.uid[id] = S
      return S
    },
    reset: function (sel) {
      if (sel && sel.type === 'Group') {
        // three
        vlay.v.uid[sel.name] = null
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
        vlay.v.out.current.remove(sel)
      } else if (Array.isArray(sel)) {
        // texture array
        for (let i in sel) {
          sel[i] = null
        }
      } else if (typeof sel === 'string') {
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
    remap: function (files) {
      //console.log(files)
      if (files.length === 0 || (files.length !== 1 && files.length % 6 !== 0)) {
        return 'artboard(s)...?'
      }

      vlay.util.reset('boxmap')
      let xyz = vlay.mat.xyz.flat()
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
          for (let j = 0; j < crop; j++) {
            let xy = false
            let name
            if (crop === 6) {
              // coords percent
              let face = vlay.mat.xyz[j]
              xy = face[face.length - 1].split(',')
              xy = { x: xy[0], y: xy[1] }
              if (img.width < img.height) {
                xy.z = (-90 * Math.PI) / 180
              }
              name = 'img_' + vlay.mat.xyz[j][0]
            }

            // cubemap face from coords
            let canvas = vlay.util.refit(img, xy)

            if (crop === 6) {
              cm.push([j + '_' + name, canvas])
            } else {
              // cubemap face from filename
              name = file.name.toString().toLowerCase()
              for (let k = 0; k < xyz.length; k++) {
                let match = name.search(xyz[k])
                if (match > -1) {
                  let idx = Math.floor(vlay.mat.xyz.length * (k / xyz.length))
                  let face = vlay.mat.xyz[idx][0]
                  name = [idx, face, name].join('_')
                  cm.push([name, canvas])
                  break
                } else if (k === xyz.length) {
                  cm.push([name, canvas])
                }
              }
            }
            // image resize and crop

            canvas.title = canvas.id = name
            fragment.appendChild(canvas)
          }

          // await cubemap, sort, and proceed
          if (cm.length >= files.length) {
            document.getElementById('boxmap').appendChild(fragment)
            cm.sort()
            vlay.v.opt.uid = false
            vlay.gcut({ img: cm, uid: 'img' })
          }

          img = null
        }
        img.src = tex
      }
    },
    refit: function (img, crop) {
      const MAX = vlay.mat.MAX
      let width = img.width
      let height = img.height

      // square
      if (crop) {
        width = height = MAX
      }

      // fit dimensions
      if (width > height) {
        if (width > MAX) {
          height = height * (MAX / width)
          width = MAX
        }
      } else {
        if (height > MAX) {
          width = width * (MAX / height)
          height = MAX
        }
      }

      let canvas = document.createElement('canvas')
      let ctx = canvas.getContext('2d')
      canvas.width = width
      canvas.height = height

      if (!crop) {
        ctx.drawImage(img, 0, 0, width, height)
      } else {
        if (crop.z) {
          // orient boxmap
          let rotate = document.createElement('canvas')
          let ctx2 = rotate.getContext('2d')
          rotate.width = img.height
          rotate.height = img.width
          // rotate canvas
          let x = rotate.width / 2
          let y = rotate.height / 2
          ctx2.translate(x, y)
          ctx2.rotate(crop.z)
          ctx2.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height)
          ctx2.rotate(-crop.z)
          ctx2.translate(-x, -y)

          img = rotate
        }

        // assume aspect 1.33
        let face = img.width / 4

        ctx.drawImage(img, img.width * crop.x, img.height * crop.y, face, face, 0, 0, width, height)
      }

      return canvas
    },
    gui: function () {
      const gui = new GUI()

      gui.add(vlay.v.opt, 'uid').name('use seed').listen()
      gui
        .add(vlay.v.opt, 'seed', 0, 1)
        .step(0.05)
        .onFinishChange(function (n) {
          vlay.gcut({ s: n })
        })
      gui
        .add(vlay.v.opt, 'iter', 1, 10)
        .step(1)
        .onFinishChange(function (n) {
          vlay.gcut({ i: n })
        })
      let preset = gui
        .add(vlay.v.opt, 'view', 0, 4)
        .step(1)
        .listen()
        .onChange(function (n) {
          let onion = ['box', 'neg', 'env', 'pos', 'CSG', 'points']
          //let onion = ['box', 'pos', 'CSG', 'neg']
          vlay.v.out.current.children.forEach(function (obj) {
            let meshes = obj.type === 'Group' ? obj.children : [obj]
            for (let i = 0; i < meshes.length; i++) {
              let mesh = meshes[i]
              let view = onion.indexOf(mesh.name) >= n
              mesh.visible = view
            }
          })
          vlay.v.state.invalidate()
        })

      vlay.v.opt._preset = preset
    },
    minimap: function () {
      document.querySelector('details').addEventListener('click', function (e) {
        let target = e.target
        if (target.nodeName.toLowerCase() === 'canvas') {
          // camera angle
          const R = vlay.v.R * 8
          const view = [
            [R, 0, 0],
            [-R, 0, 0],
            [0, R, 0],
            [0, -R, 0],
            [0, 0, R],
            [0, 0, -R]
          ]
          // set camera
          target = target.id.split('_')[1]
          const xyz = vlay.mat.xyz
          for (let i = 0; i < xyz.length; i++) {
            if (xyz[i][0] === target) {
              vlay.v.state.camera.position.set(view[i][0], view[i][1], view[i][2])
              vlay.v.state.invalidate()
            }
          }
        }
      })
    }
  },
  gcut: async function (opt = {}) {
    console.log('gcut', opt.i)

    if (!opt.init) {
      //vlay.v.state.performance.regress()
      // INIT
      opt.init = true
      opt.i = opt.i || vlay.v.opt.iter
      opt.s = opt.s || vlay.v.opt.seed
      opt.uid = opt.uid || (vlay.v.opt.uid ? 'rnd' : 'img')
      //opt.uid = [opt.uid, opt.s, opt.p].join('_')

      // RESET
      //vlay.util.reset(vlay.v.out.current.getObjectByName(opt.uid))
      vlay.util.reset(vlay.v.out.current.getObjectByName('rnd'))
      vlay.util.reset(vlay.v.out.current.getObjectByName('img'))
      // GROUP
      opt.group = new THREE.Group()
      opt.group.name = opt.uid
      vlay.v.out.current.add(opt.group)

      // CUBEMAP
      if (opt.img || vlay.v.opt.uid) {
        vlay.mat.map = vlay.matgen(opt)
      }
      let box = new THREE.Mesh(vlay.mat.box, vlay.mat.map)
      box.name = 'box'
      box.renderOrder = 2
      opt.group.add(box)

      // MANTLE
      opt.group.userData.contour = {}
      opt.accumulate = {}
      opt.rgba = {}

      let geo = vlay.v.csg.geo.current.geometry
      geo.setAttribute('position', geo.userData.pos)
      opt.geo = geo
      // ENVIRONMENT
      opt.env = geo.clone()

      opt.env.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.array.length), 3))
    }

    if (opt.i > 0) {
      opt.geo = await vlay.morph(opt)
      //recurse
      opt.i--
      vlay.gcut(opt)
    } else {
      // OUTPUT
      console.log('accumulate', opt.accumulate)

      const pos = opt.env.getAttribute('position')
      const points = new Float32Array(pos.count * 3)
      // accumulate: length ~= ( positions - 1x circumference )
      for (let i = 0; i < pos.count; i += 3) {
        // triangle moment
        let m = { tri: new THREE.Triangle(), mid: new THREE.Vector3() }
        m.tri.setFromAttributeAndIndices(pos, i, i + 1, i + 2)
        m.tri.getMidpoint(m.mid)

        Object.keys(m.tri).forEach(function (corner, idx) {
          let v3 = m.tri[corner]
          if (isNaN(v3.length())) {
            // merged vertice (last)
            return
          }
          // lookup
          let xyz = v3.toArray().join('_')
          xyz = opt.accumulate[xyz] || [1]
          // transform accumulate
          let avg = xyz.reduce((a, b) => a + b)
          avg = avg / xyz.length

          v3.multiplyScalar(2 + avg)
          v3.lerp(new THREE.Vector3(0, 0, 0), 0.5)

          // ouput ( env, CSG... )
          pos.setXYZ(i + idx, v3.x, v3.y, v3.z)
          points.set([v3.x, v3.y, v3.z], i * 3 + 3 * idx)
        })
      }

      // env surface
      let env = new THREE.Mesh(opt.env, vlay.mat.pos)
      env.castShadow = env.receiveShadow = true
      env.name = 'env'
      opt.group.add(env)

      // env defects (pos/neg)
      opt.group = await vlay.segs(opt.group)

      // env backdrop
      const star = new THREE.BufferGeometry()
      star.setAttribute('position', new THREE.BufferAttribute(points, 3))
      const material = new THREE.PointsMaterial({ size: 4, emissive: 0x402040, color: 0x4020c0 })
      let stars = new THREE.Points(star, material)
      stars.scale.set(8, 8, 8)
      stars.name = 'points'
      opt.group.add(stars)

      // update r3f
      vlay.v.csg.geo.current.userData.update = true
      vlay.v.state.invalidate()

      vlay.v.opt._preset.setValue(vlay.v.opt.view)
    }
  },
  morph: function (opt) {
    //console.log('graphcut', opt)

    // CUBEMAP (PYR)
    let blurs = []
    let k = 1 - (opt.i - 1) / vlay.v.opt.iter
    let target = opt.group.getObjectByName('box')
    for (let i = 0; i < target.material.length; i++) {
      let material = target.material[i].map.source.data
      let blur = document.createElement('canvas')
      let ctx = blur.getContext('2d')
      blur.width = blur.height = Math.round((material.width * k) / 2)
      ctx.drawImage(material, 0, 0, blur.width, blur.height)
      blurs.push(blur)
    }

    function pyr(intersect) {
      // color from boxmap PYR uv
      let uv = intersect.uv
      let blur = blurs[intersect.face.materialIndex]
      let ctx = blur.getContext('2d')
      let rgba = ctx.getImageData(blur.width * uv.x, blur.height - blur.height * uv.y, 1, 1).data
      return rgba
    }

    // RAYCAST
    const ray = new THREE.Raycaster()
    const dir = new THREE.Vector3()
    // contour defects (from boxmap)
    opt.geo.computeBoundingSphere()
    const ctr = opt.geo.boundingSphere.center
    const pos = opt.geo.getAttribute('position')
    let contour = opt.group.userData.contour

    if (opt.i === 1) {
      // low-res PYR
      let v3 = new THREE.Vector3()
      const col = opt.env.getAttribute('color')
      // vertex color
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i)
        ray.set(ctr, dir.subVectors(v3, ctr).normalize())
        const intersects = ray.intersectObject(target, false)
        if (intersects.length) {
          let intersect = intersects[0]
          let rgba = pyr(intersect)
          col.setXYZ(i, rgba[0] / 255, rgba[1] / 255, rgba[2] / 255)
        }
      }
    }

    for (let i = 0; i < pos.count; i += 3) {
      // triangle moment
      let m = { tri: new THREE.Triangle(), mid: new THREE.Vector3() }
      m.tri.setFromAttributeAndIndices(pos, i, i + 1, i + 2)
      m.tri.getMidpoint(m.mid)
      // raycast boxmap

      ray.set(ctr, dir.subVectors(m.mid, ctr).normalize())
      // accumulate transformer
      const intersects = ray.intersectObject(target, false)
      if (intersects.length) {
        let intersect = intersects[0]
        // boxmap uv PYR
        let rgba = pyr(intersect)
        // rgba strength (grey is 1)
        m.d = (rgba[0] + rgba[1] + rgba[2]) / 3 / 127.5
        //m.d += 0.5

        // accumulate transformers
        accumulate()
        function accumulate(d) {
          Object.keys(m.tri).forEach(function (corner, idx) {
            if (rgba[3] === 0) {
              // no zero-alpha multiplier
              return
            }
            let v3 = m.tri[corner]
            // lookup
            let xyz = v3.toArray().join('_')
            let prev = opt.accumulate[xyz]
            if (!prev) {
              opt.accumulate[xyz] = []
            }

            // unique vertex or triangle moment
            if (!prev || isFinite(d)) {
              // todo: use index as key?
              opt.accumulate[xyz].push(d || m.d)
            } else {
              accumulate(m.d)
            }
          })
        }

        moment(m, intersect)
      }
    }

    function moment(m, intersect) {
      // BVH-CSG cavities, face-wise pos/neg
      let face = vlay.util.num(intersect.faceIndex, { fix: 0, pre: 'f' })
      let dist = vlay.util.num(m.d)
      //let iter = 'iter_' + opt.i
      let xyz = [vlay.util.num(m.mid.x), vlay.util.num(m.mid.y), vlay.util.num(m.mid.z)].join(',')
      // output meta
      let defect = [dist, xyz].join('|')

      // defect tolerance, local sample
      // ...not relative to layer(s) global distance
      if (contour[face] === undefined) {
        contour[face] = []
      }

      if (dist > 0.9) {
        contour[face].push(defect + '|pos')
      } else if (dist < 0.6) {
        contour[face].push(defect + '|neg')
      }
    }

    // cleanup
    vlay.util.reset(blurs)
    return opt.geo
  },
  segs: function (group) {
    // fit roi contour to landmark type
    let fit = {
      pos: false,
      neg: false,
      cluster: { c: 0, pos: 0, neg: 0 },
      contour: []
    }

    const maxSegs = 12
    Object.keys(group.userData.contour).forEach(function (face) {
      // de-dupe, minimum, sort distance
      let defects = [...new Set(group.userData.contour[face])]
      if (defects.length < 3) {
        return
      }
      defects.sort().reverse()
      // limit segments
      let delta = Math.ceil(defects.length / maxSegs)
      delta = Math.max(delta, 1)
      let segs = []
      for (let i = 0; i < defects.length; i += delta) {
        let defect = defects[i]
        segs.push(defect)
        // label cluster
        let label = defect.slice(defect.lastIndexOf('|') + 1)
        fit.cluster[label]++
        fit.cluster.c++
      }
      fit.contour.push(segs)
    })
    // weight rank
    fit.contour.sort().reverse()
    fit.cluster.c = Number((fit.cluster.pos / fit.cluster.c).toFixed(3))
    if (!isFinite(fit.cluster.c)) {
      // no contours
      fit.cluster.c = 0.5
    }

    // classification
    //console.log('contour', fit.contour)
    for (let i = 0; i < fit.contour.length; i++) {
      let defects = fit.contour[i]

      let c = { depth: [], point: [], label: 0, forms: 0 }
      for (let i = 0; i < defects.length; i++) {
        // 'dist|p|x,y,z|type'
        const defect = defects[i].split('|')

        // color
        let depth = vlay.util.num(defect[0], { n: true })
        c.depth.push(depth)
        c.forms += depth

        // position (path/geometry)
        let point = defect[1]
        point = point.split(',')
        point = new THREE.Vector3(
          vlay.util.num(point[0], { n: true }),
          vlay.util.num(point[1], { n: true }),
          vlay.util.num(point[2], { n: true })
        )
        c.point.push(point)

        // weight
        const label = defect[defect.length - 1]
        if (label === 'pos') {
          c.label++
        }
      }

      // weight rank
      let depth = c.forms / defects.length / (vlay.v.R / 4)
      let weight = c.label / defects.length
      weight = weight / fit.cluster.c || 0
      c.forms = vlay.util.num(depth + weight, { n: true })
      c.label = c.forms > 1.125 ? 'pos' : 'neg'

      // curve defects
      //console.log('c', c)
      profile(c)
    }

    function profile(c) {
      // feature
      let poi = c.forms > 4 || c.forms < 0.25
      // process
      let dif = c.depth[0] / c.depth[c.depth.length - 1]
      // classify connected geo-morph system
      let system = poi || (dif > 0.75 && dif < 1.25)

      // form-specific transforms
      for (let i = 0; i < c.point.length; i++) {
        const point = c.point[i]
        let range = 1 - (i + 1) / c.point.length

        if (c.label === 'neg') {
          if (system) {
            // tube (radial cave)
            point.multiplyScalar(0.25 + range * 2)
          } else {
            //c.label = 'pos'
            // box (central cave)
            point.multiplyScalar(1)
          }
        } else if (c.label === 'pos') {
          if (system) {
            // tube (surface crust)
            point.multiplyScalar(1 + range * 0.5)
          } else {
            // box (orbital cloud)
            point.multiplyScalar(2)
          }
        }
      }

      // geometry type
      c.system = system ? 1 : c.point.length

      topo(c)
    }

    function topo(c) {
      // face defects to mesh and CSG
      let geo = []
      c.idx = 0

      function unit(idx) {
        let d = c.forms / c.depth[idx]
        d *= c.label === 'neg' ? 2 : 0.25
        d *= (1 / c.system) * 1.33
        return d
      }

      // OUTPUT mesh (CSG)
      for (let i = 0; i < c.system; i++) {
        let buf
        let d = unit(i)
        if (c.system > 1) {
          // not connected
          if (c.label === 'neg') {
            d *= c.forms * 2
          }
          buf = new THREE.TetrahedronGeometry(d, 1)
          let pt = c.point[i]
          // params
          buf.translate(pt.x, pt.y, pt.z)
        } else {
          // connected
          const curve = new THREE.CatmullRomCurve3(c.point)
          // params
          const extrude = {
            steps: 24,
            bevelEnabled: false,
            extrudePath: curve
          }
          const pts = [],
            cnt = 3

          for (let i = 0; i < cnt; i++) {
            const a = ((2 * i) / cnt) * Math.PI
            pts.push(new THREE.Vector2(Math.cos(a) * d, Math.sin(a) * d))
          }
          const ellipsoid = new THREE.Shape(pts)
          buf = new THREE.ExtrudeGeometry(ellipsoid, extrude)
        }
        // output
        align(geo, buf, c)
      }

      // merge geometries with all previous
      let last = fit[c.label]
      let merge = last ? [last, geo].flat() : [geo].flat()
      merge = mergeBufferGeometries(merge, false)
      if (merge !== null) {
        // feedback
        if (!last) {
          merge.userData.count = c.system
        } else {
          merge.userData.count = last.userData.count + c.system
          merge.userData.mergedUserData = null
        }
        // output
        fit[c.label] = merge
      }
    }

    function align(geo, buf, c) {
      let hull = false
      if (c.idx >= 1) {
        // meta-balls
        let tolerance = c.label === 'neg' ? c.system * 1.5 : c.forms / 2
        hull = c.depth[c.idx - 1] / c.depth[c.idx] < tolerance
      }

      if (hull) {
        // convex hull
        const vertices = []
        const hulls = []
        hulls.push(buf)
        if (geo.length) {
          hulls.push(geo[geo.length - 1])
        }

        // consolidate
        hulls.forEach(function (geom) {
          let pos = geom.getAttribute('position')
          for (let i = 0; i < pos.count; i++) {
            const vertex = new THREE.Vector3()
            vertex.fromBufferAttribute(pos, i)
            vertices.push(vertex)
          }
        })
        // replace last

        buf = new ConvexGeometry(vertices)
      }

      // final pass
      buf = mergeVertices(buf)
      color(buf, c)

      // output
      if (hull) {
        geo[geo.length - 1] = buf
      } else {
        geo.push(buf)
      }

      // tracking usage of merge
      c.idx++
    }

    function color(geo, c) {
      // CSG and MergeBufferGeometries require same attributes
      let pos = geo.getAttribute('position')
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      let col = geo.getAttribute('color')
      // vertex color
      const MAX = vlay.v.R * 4
      for (let i = 0; i < pos.count; i++) {
        let v3 = new THREE.Vector3()
        v3.fromBufferAttribute(pos, i)
        let d = v3.clampLength(0, MAX).length() / MAX
        //d = vlay.util.num(d, { n: true })
        col.setXYZ(i, 1 - d, 0.125, d)
      }
    }

    console.log('segs', fit)
    let fitline = new THREE.PlaneGeometry(0, 0)
    let feats = ['neg', 'pos']
    feats.forEach(function (label) {
      // cavities buffer geometry to mesh

      let csg = new THREE.Mesh(fit[label] || fitline, vlay.mat[label])
      csg.name = csg.geometry.name = label

      if (label === 'pos') {
        csg.castShadow = csg.receiveShadow = true
      }
      group.add(csg)
      if (label === 'neg') {
        vlay.v.csg[label].current.geometry = csg.geometry
      }
    })

    // output
    group.userData = { fit: fit.cluster }
    return group
  },
  matgen: function (opt) {
    let img = opt.img || 0
    if (!img) {
      vlay.util.reset('genmap')
    }

    let cubemap = []
    let ts = Date.now()
    let fragment = new DocumentFragment()
    for (let i = 0; i < 6; i++) {
      let terrain
      if (!img) {
        let canvas = document.createElement('canvas')
        canvas.width = canvas.height = vlay.mat.MAX
        canvas.id = canvas.title = 'rnd_' + vlay.mat.xyz[i][0] + '_' + ts
        // average noise
        noise(canvas, vlay.v.opt.seed, opt.uid, vlay.v.uid)
        terrain = new THREE.CanvasTexture(canvas)
        fragment.appendChild(canvas)
      } else {
        terrain = new THREE.CanvasTexture(img[i][1])
      }
      terrain.minFilter = THREE.NearestFilter
      terrain.magFilter = THREE.NearestFilter

      let mat = vlay.mat.img.clone()
      mat.name = !img ? 'genmap' : 'boxmap'
      mat.map = terrain

      cubemap.push(mat)
    }
    document.getElementById('genmap').appendChild(fragment)

    return cubemap
  }
}

// DEBUG...
window.vlay = vlay

export default vlay
