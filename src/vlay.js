import * as THREE from 'three'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { mergeBufferGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { seedmap } from './seedmap.js'

const R = 10
const vlay = {
  v: {
    R: R,
    opt: { uid: true, seed: 0.5, iter: 5, view: 1, demo: false },
    csg: {}, // geo, neg, pos
    uid: {}
  },
  mat: {
    MAX: 256,
    box: new THREE.BoxGeometry(R, R, R, 2, 2, 2),
    img: new THREE.MeshBasicMaterial({
      name: 'img',
      side: THREE.DoubleSide, // ray intersects
      transparent: true,
      opacity: 0.5
    }),
    neg: new THREE.MeshPhongMaterial({
      name: 'neg',
      color: 0x102080,
      specular: 0x002010,
      side: THREE.DoubleSide,
      shadowSide: THREE.FrontSide,
      transparent: true,
      opacity: 0.8,
      shininess: 20
    }),
    pos: new THREE.MeshPhongMaterial({
      name: 'pos',
      specular: 0x201010,
      side: THREE.DoubleSide,
      shadowSide: THREE.BackSide,
      vertexColors: true,
      shininess: 60
    }),
    emit: new THREE.PointsMaterial({
      size: 2,
      color: 0xffffff,
      opacity: 0.33,
      transparent: true
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
    state.gl.physicallyCorrectLights = true

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
          if (el.material) {
            if (el.material.length) {
              el.material.forEach((cube) => cube.map.dispose())
            } else {
              el.material.dispose()
            }
          }
          if (el.geometry) {
            el.geometry.dispose()
          }
          if (el.children && el.children.length) {
            el.children.forEach(function (child) {
              child.geometry.dispose()
              child.material.dispose()
            })
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
            cm.sort()
            document.getElementById('boxmap').appendChild(fragment)
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
        .listen()
        .onFinishChange(function (n) {
          vlay.gcut({ s: n })
        })
      gui
        .add(vlay.v.opt, 'iter', 1, 10)
        .step(1)
        .listen()
        .onFinishChange(function (n) {
          vlay.gcut({ i: n })
        })
      let preset = gui
        .add(vlay.v.opt, 'view', 0, 4)
        .step(1)
        .onChange(function (n) {
          let onion = ['box', 'env', 'neg', 'pos', 'CSG', 'points']
          //let onion = ['box', 'pos', 'CSG', 'neg']
          vlay.v.out.current.children.forEach(function (obj) {
            let meshes = obj.type === 'Group' ? obj.children : [obj]
            for (let i = 0; i < meshes.length; i++) {
              let mesh = meshes[i]
              let view = onion.indexOf(mesh.name)
              if (view > -1) {
                mesh.visible = view >= n
              }
            }
          })
          vlay.v.state.invalidate()
        })

      vlay.v.opt._preset = preset

      // DEMO MODE
      gui.add(vlay.v.opt, 'demo').onChange(function (n) {
        //window.cancelAnimationFrame(vlay.v.step)
        vlay.v.state.frameloop = n ? 'always' : 'demand'
        vlay.v.state.invalidate()
        if (n) {
          vlay.v.step = function (timestamp) {
            // settings
            const R = vlay.v.R * 8
            function rand(value) {
              let rand = (value * Math.random()).toFixed(3)
              return Number(rand)
            }

            let limit = 15_000
            if (!vlay.v.demoS || vlay.v.demoS < timestamp) {
              vlay.v.demoS = timestamp + limit
              console.log('demo')
              // presets
              vlay.v.opt.uid = true
              // view
              vlay.v.opt.seed = rand(1) + 0.001
              vlay.v.opt.iter = Math.round(rand(9)) + 1
              vlay.v.opt.view = Math.round(rand(3))
              vlay.gcut()
              // r3f
              //vlay.v.state.invalidate()
            }

            // camera
            let camera = vlay.v.state.camera
            const time = -performance.now() * 0.0003
            camera.position.x = R * Math.cos(time)
            camera.position.z = R * Math.sin(time)
            camera.lookAt(new THREE.Vector3(0, 0, 0))

            // dynamic
            if (vlay.v.particles) {
              const positions = vlay.v.particles.geometry.attributes.position.array
              let origin = new THREE.Vector3(0, 0, 0)
              for (let i = 0; i < positions.length; i += 3) {
                let pos = new THREE.Vector3(positions[i + 0], positions[i + 1], positions[i + 2])
                if (pos.distanceTo(origin) < vlay.v.R * 2) {
                  positions[i + 0] *= 2
                  positions[i + 1] *= 2
                  positions[i + 2] *= 2
                } else {
                  positions[i + 0] *= 0.99
                  positions[i + 1] *= 0.99
                  positions[i + 2] *= 0.99
                }
              }

              vlay.v.particles.geometry.attributes.position.needsUpdate = true
            }

            if (vlay.v.opt.demo) {
              window.requestAnimationFrame(vlay.v.step)
            } else {
              window.cancelAnimationFrame(vlay.v.step)
            }
          }

          window.requestAnimationFrame(vlay.v.step)
          //
        }
      })
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
    console.log('gcut')

    if (!opt.init) {
      //let test = await vlay.v.state.performance.regress()
      // OPTIONS
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

      // GEOMETRY
      opt.geo = vlay.v.csg.geo.current.geometry
      opt.geo.setAttribute('position', opt.geo.userData.pos)
      opt.env = opt.geo.clone()
      opt.env.setAttribute('color', new THREE.BufferAttribute(new Float32Array(opt.geo.attributes.position.array.length), 3))

      // ACCUMULATE
      opt.accum = []
      opt.contour = {}
    }

    if (opt.i > 0) {
      opt.geo = await vlay.morph(opt)
      //recurse
      opt.i--
      vlay.gcut(opt)
    } else {
      // OUTPUT
      //console.log('accum', opt.accum)
      const pos = opt.env.getAttribute('position')
      // surface accumulate: length ~= ( positions - 1x circumference )
      for (let i = 0; i < opt.accum.length; i++) {
        let v3 = new THREE.Vector3()
        v3.fromBufferAttribute(pos, i)

        // lookup
        let index = opt.accum[i]
        if (index) {
          // transform accumulate
          //v3.multiplyScalar(2 + index.dist)
          //v3.lerp(new THREE.Vector3(0, 0, 0), 0.5)

          v3.lerp(index.point, index.dist)

          // ouput ( env, CSG... )
          pos.setXYZ(i, v3.x, v3.y, v3.z)
        } else {
          console.log('no geo index')
        }
      }
      opt.env.computeVertexNormals()

      // env surface
      let env = new THREE.Mesh(opt.env, vlay.mat.pos)
      env.castShadow = env.receiveShadow = true
      env.name = 'env'
      opt.group.add(env)

      // env defects (pos/neg)
      vlay.segs(opt)
      vlay.v.opt._preset?.setValue(vlay.v.opt.view)
    }
  },
  morph: function (opt) {
    //console.log('morph', opt)
    // targets
    opt.geo.computeBoundingSphere()
    const ctr = opt.geo.boundingSphere.center
    const ray = new THREE.Raycaster()
    const dir = new THREE.Vector3()
    // positions
    const idx = opt.geo.index.array
    const pos = opt.geo.getAttribute('position')

    // CUBEMAP PYR
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

    function sample(m, origin, direction) {
      // raycast cubemap
      ray.set(origin, direction)
      let intersects = ray.intersectObject(target, false)
      if (intersects.length) {
        let intersect = intersects[0]
        // cubemap sample
        const uv = intersect.uv
        const blur = blurs[intersect.face.materialIndex]
        const ctx = blur.getContext('2d')
        const rgba = ctx.getImageData(blur.width * uv.x, blur.height - blur.height * uv.y, 1, 1).data

        if (rgba[3] !== 0) {
          if (m.attr) {
            // set color
            m.attr.setXYZ(m.idx, rgba[0] / 255, rgba[1] / 255, rgba[2] / 255)
          } else {
            // accumulate depth (50% grey = 1)
            m.dist = (rgba[0] + rgba[1] + rgba[2]) / 3 / 127.5

            // original geometry
            depth(m, intersect.point)
            if (m.moment) {
              // positive or negative segments
              moment(m, intersect.faceIndex)
            }
          }
        }
      }
    }

    function movingAverage(n, val, avg) {
      if (typeof val !== 'number') {
        Object.keys(val).forEach(function (axis) {
          avg[axis] = avg[axis] + (val[axis] - avg[axis]) / (n + 1)
        })
      } else {
        avg = avg + (val - avg) / (n + 1)
      }
      return avg
    }
    function depth(m, point) {
      // vertex depth (moving average)
      Object.keys(m.tri).forEach(function (corner) {
        let index = m.idx[corner]
        let accum = opt.accum[index]
        if (!accum) {
          accum = opt.accum[index] = { n: 0, dist: 0, point: point }
        }

        // distance
        accum.dist = movingAverage(accum.n, m.dist, accum.dist)
        // location
        accum.point = movingAverage(accum.n, point, accum.point)
        // index
        accum.n++
      })
    }

    function moment(m, faceIndex) {
      m.dist = vlay.util.num(m.dist, { n: true })
      // face defects
      let center = [vlay.util.num(m.mid.x), vlay.util.num(m.mid.y), vlay.util.num(m.mid.z)].join(',')
      let label = m.dist >= 0.75 ? 'pos' : 'neg'
      let defect = [m.dist, center, label].join('|')

      if (opt.contour[faceIndex] === undefined) {
        opt.contour[faceIndex] = []
      }
      opt.contour[faceIndex].push(defect)
    }

    // VERTEX COLOR
    if (opt.i === Math.ceil(vlay.v.opt.iter / 2)) {
      // from half-res
      let m = { idx: 0, attr: opt.env.getAttribute('color') }
      let v3 = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i)
        m.idx = i
        sample(m, ctr, dir.subVectors(v3, ctr).normalize())
      }
    }

    // TRIANGLE SAMPLE
    for (let i = 0; i < idx.length; i += 3) {
      // accumulate depth and moment
      let m = { idx: { a: idx[i], b: idx[i + 1], c: idx[i + 2] }, tri: new THREE.Triangle(), mid: new THREE.Vector3() }
      m.tri.setFromAttributeAndIndices(pos, m.idx.a, m.idx.b, m.idx.c)
      m.tri.getMidpoint(m.mid)

      // from normal
      m.tri.getNormal(dir)
      sample(m, m.mid, dir)
      // from center
      m.moment = true
      sample(m, ctr, dir.subVectors(m.mid, ctr).normalize())
    }

    // cleanup
    vlay.util.reset(blurs)
    return opt.geo
  },
  segs: function (opt) {
    // fit roi contour to landmark type
    let seg = {
      cluster: { c: 0, pos: 0, neg: 0 },
      contour: [],
      buff: { pos: [], neg: [] },
      emit: { static: [], dynamic: [] }
    }

    const maxSegs = 8
    Object.keys(opt.contour).forEach(function (face) {
      // de-dupe, minimum, sort distance
      let defects = [...new Set(opt.contour[face])]
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
        seg.cluster[label]++
        seg.cluster.c++
      }
      seg.contour.push(segs)
    })
    // weight rank
    seg.contour.sort().reverse()
    seg.cluster.c = Number((seg.cluster.pos / seg.cluster.c).toFixed(3))
    if (!isFinite(seg.cluster.c)) {
      // no contours
      seg.cluster.c = 0.5
    }

    // classification
    //console.log('contour', seg.contour)
    for (let i = 0; i < seg.contour.length; i++) {
      let defects = seg.contour[i]

      let c = { depth: [], point: [], label: 0, forms: 0 }
      for (let j = 0; j < defects.length; j++) {
        // 'dist|p|x,y,z|type'
        const defect = defects[j].split('|')

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

      // weight rank (like d3 range/domain/scale)
      let depth = c.forms / defects.length
      let weight = c.label / defects.length
      weight = weight / seg.cluster.c || 0.5
      c.forms = vlay.util.num(Math.abs(1 - depth) + weight, { n: true })
      c.label = c.forms >= 1.5 ? 'pos' : 'neg'

      //console.log('c', c)
      profile(c)
    }

    function profile(c) {
      // feature
      let poi = c.forms > 3 || c.forms < 0.25 // 4-1-0
      // process
      let dif = c.depth[0] / c.depth[c.depth.length - 1]
      // connected geo-morph system
      let system = poi || (dif > 0.75 && dif < 1.25)

      // tertiary surface point clouds (weather, constellations)
      if (c.label === 'pos') {
        let cloud = system ? 'static' : 'dynamic'
        seg.emit[cloud].push(c.point)
      }

      // class-specific path transform
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
        const d = vlay.v.R / 4 // constant
        let k = 0
        //k += c.depth[idx] // rgba range
        //k += c.forms / 2 // domain-weighted scale
        //k += c.system / 2 // domain extent
        //k += c.label === 'neg' ? 3 : 0.33 // category
        return d + k
      }

      // OUTPUT mesh (CSG)
      for (let i = 0; i < c.system; i++) {
        let buf
        let d = unit(i)
        if (c.system > 1) {
          // not connected
          buf = new THREE.TetrahedronGeometry(d, 1)
          let pt = c.point[i]
          buf.translate(pt.x, pt.y, pt.z)
        } else {
          // connected
          let closed = c.label === 'pos'
          const curve = new THREE.CatmullRomCurve3(c.point, closed, 'chordal')
          buf = new THREE.TubeGeometry(curve, vlay.v.LOD * 8, vlay.v.R / 4, 5, closed)
        }
        // hull and sanitize
        align(geo, buf, c)
      }
      // defects to merge
      seg.buff[c.label].push(geo)
    }

    function align(geo, buf, c) {
      // hull...?
      let hull = false
      if (c.idx >= 1) {
        // TO-DO: after updates corrected "normal" values,
        // can hull be c.forms, tube or not, pos/neg or not?
        let tolerance = c.label === 'neg' ? c.system * 1.5 : c.forms
        hull = c.depth[c.idx - 1] / c.depth[c.idx] < tolerance
      }

      if (hull) {
        // set
        const vertices = []
        const hulls = []
        hulls.push(buf)
        if (geo.length) {
          hulls.push(geo[geo.length - 1])
        }
        // join
        hulls.forEach(function (geom) {
          let pos = geom.getAttribute('position')
          for (let i = 0; i < pos.count; i++) {
            const vertex = new THREE.Vector3()
            vertex.fromBufferAttribute(pos, i)
            vertices.push(vertex)
          }
        })
        // replace
        buf = new ConvexGeometry(vertices)
      }

      // sanitize
      buf = mergeVertices(buf)
      delete buf.attributes.uv
      delete buf.attributes.normal

      // output
      if (hull) {
        geo[geo.length - 1] = buf
      } else {
        geo.push(buf)
      }

      // merge index
      c.idx++
      return buf
    }

    function wrap(geo, c) {
      // make attributes conform (post-align)
      let pos = geo.getAttribute('position')
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      let col = geo.getAttribute('color')
      // vertex color from depth
      const range = vlay.v.R * 4
      for (let i = 0; i < pos.count; i++) {
        let v3 = new THREE.Vector3()
        v3.fromBufferAttribute(pos, i)
        let d = v3.clampLength(0, range).length() / range
        //d = vlay.util.num(d, { n: true })
        col.setXYZ(i, 1 - d, 0.25, d)
      }
      // CSG needs uv
      geo.computeVertexNormals()
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
    }

    // output
    console.log('segs', seg)
    let fitline = new THREE.PlaneGeometry(0, 0)
    Object.entries(seg.buff).forEach(function ([label, geo]) {
      // mesh (...LOD, etc.)
      let merge = geo.length ? mergeBufferGeometries(geo.flat()) : fitline
      let feat = new THREE.Mesh(merge || fitline, vlay.mat[label])

      // attributes
      wrap(feat.geometry)
      feat.geometry.userData = { segs: geo.length }
      feat.name = feat.geometry.name = label

      if (label === 'neg') {
        vlay.v.csg[label].current.geometry = feat.geometry
      } else {
        feat.castShadow = feat.receiveShadow = true
      }

      opt.group.add(feat)
    })

    Object.keys(seg.emit).forEach(function (cloud) {
      // parse points: static, dynamic
      let clouds = seg.emit[cloud].flat()
      const points = new Float32Array(clouds.length * 3)
      for (let i = 0; i < clouds.length; i++) {
        let v3 = clouds[i]
        points.set([v3.x, v3.y, v3.z], i * 3)
      }
      // geometry
      const pointCloud = new THREE.BufferGeometry()
      pointCloud.setAttribute('position', new THREE.BufferAttribute(points, 3))
      let particles = new THREE.Points(pointCloud, vlay.mat.emit)
      particles.name = cloud
      // parameters
      let scale = cloud === 'static' ? 8 : 1
      particles.scale.multiplyScalar(scale)

      opt.group.add(particles)

      if (cloud === 'dynamic') {
        vlay.v.particles = particles
      }
    })

    // output
    opt.group.userData = { seg: seg.cluster }
    // update r3f
    vlay.v.csg.update = true
    vlay.v.state?.invalidate()
  },
  matgen: function (opt) {
    let cubemap = []
    let fragment = new DocumentFragment()
    let ts = Date.now()

    let rnd
    if (!opt.img) {
      vlay.util.reset('genmap')
      // adaptive resolution
      let iter = Math.pow(2, Math.round(opt.i / 2)) * 8
      let exp = Math.min(iter, vlay.mat.MAX)
      rnd = seedmap(vlay.v.opt.seed, exp, 6)
      vlay.v.uid[opt.uid] = rnd.seed
    }

    for (let i = 0; i < 6; i++) {
      let tex = opt.img ? opt.img[i][1] : rnd.map[i]
      let terrain
      if (!opt.img) {
        tex.id = tex.title = 'rnd_' + vlay.mat.xyz[i][0] + '_' + ts
        fragment.appendChild(tex)
      }

      terrain = new THREE.CanvasTexture(tex)
      terrain.minFilter = THREE.NearestFilter
      terrain.magFilter = THREE.NearestFilter

      let mat = vlay.mat.img.clone()
      mat.name = opt.img ? 'boxmap' : 'genmap'
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
