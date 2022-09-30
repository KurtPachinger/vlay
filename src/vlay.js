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
    num: function (num, opt = {}) {
      opt.pre = opt.pre || (num < 0 ? '-' : '+')
      opt.pad = opt.pad >= 0 ? opt.pad : 3
      opt.fix = opt.fix >= 0 ? opt.fix : 8
      //opt.n = opt.n || true
      // format
      let n = Number(Math.abs(num))
      n = opt.pre + String(n.toFixed(opt.fix)).padStart(opt.pad + opt.fix + 1, '0')
      if (!opt.s) {
        n = parseFloat(n)
      }
      return n
    },
    reset: function (sel) {
      if (sel && sel.type === 'Group') {
        // three
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
      if (files.length !== 1 && files.length !== 6) {
        console.log('artboards...?')
        return false
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
              name = file.name.toString().toLowerCase()
              // cubemap face from filename
              for (let k = 0; k < xyz.length; k++) {
                let match = name.search(xyz[k]) > -1
                let searchEnd = k === xyz.length - 1
                if (match || searchEnd) {
                  let idx, face
                  if (match) {
                    idx = Math.floor(vlay.mat.xyz.length * (k / xyz.length))
                    face = vlay.mat.xyz[idx][0]
                  } else {
                    idx = cm.length
                    face = vlay.mat.xyz[idx][0]
                  }
                  name = [idx, face, name].join('_')
                  cm.push([name, canvas])
                  break
                }
              }
            }
            // image resize and crop

            canvas.title = canvas.id = name
            fragment.appendChild(canvas)
          }

          // await cubemap, sort, and proceed
          cm.sort()
          if (cm.length >= files.length) {
            document.getElementById('boxmap').appendChild(fragment)
            vlay.v.opt.uid = false
            let seed = files[0].name
            seed = [files.length, seed.slice(0, seed.lastIndexOf('.'))].join('_')
            vlay.gcut({ img: cm, uid: 'img', s: seed })
          } else {
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
      gui
        .add(vlay.v.opt, 'view', 0, 3)
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

      vlay.v.gui = gui

      // DEMO MODE
      gui.add(vlay.v.opt, 'demo').onChange(function (n) {
        vlay.v.state.frameloop = n ? 'always' : 'demand'
        vlay.v.state.invalidate()

        if (!n) {
          // pause demo
          vlay.v.state.gl.setAnimationLoop(null)
          vlay.v.next = null
        } else {
          // play demo (use seed)
          vlay.v.opt.uid = true
          vlay.v.state.gl.setAnimationLoop((timestamp) => {
            // tick
            if (!vlay.v.next || vlay.v.next < timestamp) {
              vlay.v.next = timestamp + 15_000
              console.log('demo')
              // random values
              let controllers = vlay.v.gui.controllers
              Object.values(controllers).forEach(function (controller) {
                if (controller._hasSlider) {
                  let value = ((controller._max - 1) * Math.random() + 1).toFixed(0.1 / controller._step)
                  value = vlay.util.num(value, { fix: 2 })
                  vlay.v.opt[controller.name] = value
                  controller.setValue(value)
                }
              })

              vlay.gcut()
            }

            // ANIMATE...
            const R = vlay.v.R * 8
            let origin = new THREE.Vector3(0, 0, 0)

            // camera
            let camera = vlay.v.state.camera
            const time = -performance.now() * 0.0003
            camera.position.x = R * Math.cos(time)
            camera.position.z = R * Math.sin(time)
            camera.lookAt(origin)

            // dynamic
            if (vlay.v.emit) {
              const positions = vlay.v.emit.geometry.attributes.position.array
              for (let i = 0; i < positions.length; i += 3) {
                let pos = new THREE.Vector3(positions[i + 0], positions[i + 1], positions[i + 2])
                if (pos.distanceTo(origin) > R * 2) {
                  positions[i + 0] /= 2
                  positions[i + 1] /= 2
                  positions[i + 2] /= 2
                } else {
                  positions[i + 0] *= 1.001
                  positions[i + 1] *= 1.001
                  positions[i + 2] *= 1.001
                }
              }
              vlay.v.emit.geometry.attributes.position.needsUpdate = true
            }
          })
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
  gcut: function (opt = {}) {
    console.log('gcut')

    if (!opt.init) {
      // OPTIONS
      opt.init = true
      opt.s = opt.s || vlay.v.opt.seed
      opt.i = opt.i || vlay.v.opt.iter
      let images = !vlay.v.opt.uid && (opt.img || vlay.mat.map.name === 'img')
      opt.uid = opt.uid || (images ? 'img' : 'rnd')
      // uei is the variant of uid instance, with initial seed
      opt.uei = [opt.s, opt.i].join('_')
      if (vlay.v.uid[opt.uid] === opt.uei) {
        console.log('abort, uei same')
        return
      }
      vlay.v.uid[opt.uid] = opt.uei

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
      setTimeout(function () {
        if (vlay.v.uid[opt.uid] === opt.uei) {
          opt.geo = vlay.morph(opt)
          //recurse
          opt.i--
          vlay.gcut(opt)
        } else {
          console.log('abort, uei change')
          vlay.v.state.performance.regress()
        }
      }, 0)
    } else {
      // OUTPUT
      const pos = opt.env.getAttribute('position')
      for (let i = 0; i < opt.accum.length; i++) {
        // transform mesh surface from accumulate
        // length ~= ( positions - 1x circumference )
        let v3 = new THREE.Vector3()
        v3.fromBufferAttribute(pos, i)

        let range = opt.accum[i]
        if (range) {
          // average
          v3.lerp(range.point, range.scale)
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
      let view = vlay.v.gui.controllers.find((prop) => prop.property === 'view')
      view && view.setValue(vlay.v.opt.view)
    }
  },
  morph: function (opt) {
    //console.log('morph', opt)
    // targets
    let target = opt.group.getObjectByName('box')
    if (!target) {
      return
    }
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
    let cubeTexture = target.material
    for (let i = 0; i < cubeTexture.length; i++) {
      let material = cubeTexture[i].map.source.data
      let blur = document.createElement('canvas')
      let ctx = blur.getContext('2d', { willReadFrequently: true })
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
        const ctx = blur.getContext('2d', { willReadFrequently: true })
        const rgba = ctx.getImageData(blur.width * uv.x, blur.height - blur.height * uv.y, 1, 1).data

        if (rgba[3] !== 0) {
          if (m.attr) {
            // set color
            m.attr.setXYZ(m.idx, rgba[0] / 255, rgba[1] / 255, rgba[2] / 255)
          } else {
            // accumulate defects (50% grey = 1)
            m.scale = (rgba[0] + rgba[1] + rgba[2]) / 3 / 127.5
            scale(m, intersect.point)
            if (m.moment) {
              moment(m, intersect.faceIndex)
            }
          }
        }
      }
    }

    function avg(n, val, avg) {
      // moving average
      if (typeof val !== 'number') {
        Object.keys(val).forEach(function (axis) {
          avg[axis] = avg[axis] + (val[axis] - avg[axis]) / (n + 1)
        })
      } else {
        avg = avg + (val - avg) / (n + 1)
      }
      return avg
    }
    function scale(m, point) {
      // accumulate for mesh transform
      Object.keys(m.tri).forEach(function (corner) {
        let cornerIndex = m.idx[corner]
        let accum = opt.accum[cornerIndex]
        if (!accum) {
          accum = opt.accum[cornerIndex] = { n: 0, scale: m.scale, point: point }
        }

        accum.scale = avg(accum.n, m.scale, accum.scale)
        accum.point = avg(accum.n, point, accum.point)
        accum.n++
      })
    }

    function moment(m, faceIndex) {
      // positive or negative segments
      let center = [vlay.util.num(m.mid.x), vlay.util.num(m.mid.y), vlay.util.num(m.mid.z)].join(',')
      // bias median (1) of range (2-0) towards geo surface
      let label = 'med'
      if (m.scale > 0.66) {
        label = 'pos'
      } else if (m.scale < 0.33) {
        label = 'neg'
      }
      let scaleSort = vlay.util.num(m.scale, { s: true, pad: 1 })
      let defect = [scaleSort, center, label].join('|')

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
      // accumulate range and moment
      let m = { idx: { a: idx[i], b: idx[i + 1], c: idx[i + 2] }, tri: new THREE.Triangle(), mid: new THREE.Vector3() }
      m.tri.setFromAttributeAndIndices(pos, m.idx.a, m.idx.b, m.idx.c)
      m.tri.getMidpoint(m.mid)

      // from normal
      m.tri.getNormal(dir)
      sample(m, m.mid, dir)
      // from midpoint
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
      count: { range: 0, pos: 0, neg: 0, med: 0 },
      contour: [],
      buff: { pos: [], neg: [] },
      emit: { static: [], dynamic: [] }
    }

    const maxSegs = 8
    Object.keys(opt.contour).forEach(function (face) {
      // de-dupe, minimum, sort range
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
        // preliminary poll
        let label = defect.slice(defect.lastIndexOf('|') + 1)
        if (seg.count[label] === undefined) {
          seg.count[label] = 0
        }
        seg.count[label]++
      }

      seg.count.range++
      seg.contour.push(segs)
    })
    seg.contour.sort().reverse()
    // overall weight/rank
    const set = seg.count.pos + seg.count.neg || seg.count.med
    seg.count.range = set === 0 ? 0.5 : seg.count.pos / set

    // classification
    //console.log('contour', seg.contour)
    for (let i = 0; i < seg.contour.length; i++) {
      let defects = seg.contour[i]

      let c = { range: [], point: [], label: 'med', scale: 0 }
      let count = { pos: 0, neg: 0, med: 0 }
      for (let j = 0; j < defects.length; j++) {
        // 'range|p|x,y,z|type'
        const defect = defects[j].split('|')

        // weight/rank
        let range = vlay.util.num(defect[0])
        c.range.push(range)
        c.scale += Math.abs(1 - range)

        // position (path/geometry)
        let point = defect[1]
        point = point.split(',')
        point = new THREE.Vector3(point[0], point[1], point[2])
        c.point.push(point)

        // adjusted weight/rank
        const label = defect[defect.length - 1]

        count[label]++
      }

      // weight rank (like d3 range/domain/scale) for segment/type
      const set = count.pos + count.neg || count.med
      const scale = c.scale / defects.length // 1-0, (high #fff > low #000), incl median
      const bias = set === 0 ? 0.5 : Math.abs(set / 2 - count.pos) / (set / 2) // 1-0, deviance from median range
      c.scale = vlay.util.num(scale + bias) // 2-0 ()
      let drift = set === 0 ? 0.5 : count.pos / set // 1-0, (pos > mixed)
      drift = Math.abs(drift - seg.count.range) // 1-0, (adjusted)
      if (drift >= 1 / 64 && drift !== seg.count.range) {
        c.label = count.pos >= count.neg ? 'pos' : 'neg'
      }

      //console.log('-', c, c.scale, drift)
      profile(c)
    }

    function profile(c) {
      // feature (2-0)
      let poi = c.scale > 1.33 // 2-0
      // process ()
      let dif = c.range[0] / c.range[c.range.length - 1]
      dif = dif > 3
      // connected geo-morph system
      let system = poi && dif

      // tertiary surface point clouds (weather, constellations)
      if (c.label === 'med') {
        // if no stars, sort is off
        let cloud = !system ? 'static' : 'dynamic'
        seg.emit[cloud].push(c.point)
        return
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
        //k += c.range[idx] // rgba range
        //k += c.scale / 2 // domain-weighted scale
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
        // can hull be c.scale, tube or not, pos/neg or not?
        let tolerance = c.label === 'neg' ? c.system * 1.5 : c.scale * 1.5
        hull = c.range[c.idx - 1] / c.range[c.idx] < tolerance
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
    }

    function wrap(geo, c) {
      // make attributes conform (post-align)
      let pos = geo.getAttribute('position')
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      let col = geo.getAttribute('color')
      // vertex color from range
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

    Object.keys(seg.emit).forEach(function (label) {
      // parse points: static, dynamic (from medium)
      let segments = seg.emit[label].flat()
      const points = new Float32Array(segments.length * 3)
      for (let i = 0; i < segments.length; i++) {
        let v3 = segments[i]
        points.set([v3.x, v3.y, v3.z], i * 3)
      }
      // geometry
      const particles = new THREE.BufferGeometry()
      particles.setAttribute('position', new THREE.BufferAttribute(points, 3))
      let emitter = new THREE.Points(particles, vlay.mat.emit)
      emitter.name = label
      // parameters
      let scale = label === 'static' ? 8 : 6
      emitter.scale.multiplyScalar(scale)

      opt.group.add(emitter)

      if (label === 'dynamic') {
        vlay.v.emit = emitter
      }
    })

    // output
    opt.group.userData = { seg: seg.count }
    // update r3f
    vlay.v.csg.update = true
    vlay.v.state?.invalidate()
  },
  matgen: function (opt) {
    let cubeTexture = []
    let fragment = new DocumentFragment()
    let ts = Date.now()

    let rnd
    if (!opt.img) {
      vlay.util.reset('genmap')
      // adaptive resolution
      let iter = Math.pow(2, Math.round(opt.i / 2)) * 8
      let exp = Math.min(iter, vlay.mat.MAX)
      rnd = seedmap(vlay.v.opt.seed, exp, 6)
      //opt.s = rnd.seed
    }

    for (let i = 0; i < 6; i++) {
      let canvas = opt.img ? opt.img[i][1] : rnd.map[i]
      if (!opt.img) {
        canvas.id = canvas.title = 'rnd_' + vlay.mat.xyz[i][0] + '_' + ts
        fragment.appendChild(canvas)
      }

      let texture = new THREE.CanvasTexture(canvas)
      texture.minFilter = THREE.NearestFilter
      texture.magFilter = THREE.NearestFilter

      let mat = vlay.mat.img.clone()
      mat.name = opt.img ? 'boxmap' : 'genmap'
      mat.map = texture

      cubeTexture.push(mat)
    }
    document.getElementById('genmap').appendChild(fragment)

    return cubeTexture
  }
}

// DEBUG...
window.vlay = vlay

export default vlay
