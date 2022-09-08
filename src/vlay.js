import * as THREE from 'three'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { mergeBufferGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const R = 10
const vlay = {
  v: {
    R: R,
    opt: { iter: 1, seed: 0.5, view: 0 },
    csg: {
      /* geo, neg, pos */
    },
    uid: {}
  },
  mat: {
    box: new THREE.BoxGeometry(R, R, R, 2, 2, 2),
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
      side: THREE.DoubleSide,
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
  init: function (state) {
    // r3f canvas created state
    vlay.v.state = state
    vlay.util.gui = vlay.util.gui()

    // BOXMAP
    let pos = vlay.mat.box.getAttribute('position')
    let vtx = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
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
      //console.log(files);
      if (files.length !== 1 && files.length !== 6) {
        return
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
            vlay.gcut({ box: cm, id: 'box' })
          }

          img = null
        }
        img.src = tex
      }
    },
    refit: function (img, crop) {
      let MAX_ = vlay.v.opt.iter * 128
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
      gui
        .add(vlay.v.opt, 'seed', 0, 1)
        .step(0.01)
        .onFinishChange(function (n) {
          vlay.gcut({ s: n })
        })
      gui
        .add(vlay.v.opt, 'iter', 1, 10)
        .step(1)
        .onFinishChange(function (n) {
          vlay.gcut({ i: n })
        })
      let view = gui
        .add(vlay.v.opt, 'view', 0, 3)
        .step(1)
        .listen()
        .onChange(function (n) {
          let onion = ['box', 'neg', 'CSG', 'pos']
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

      return view
    },
    gen: function (id, uei = 1) {
      // uid from seed (from last or root)
      let S = vlay.v.uid[id]
      S = S ? S ** 1.5 : ((Math.PI - 3) * 1e5) / vlay.v.opt.seed
      S = Number((S * uei).toFixed().slice(-8))
      // output
      vlay.v.uid[id] = S
      return S
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
      opt.id = 'default'
      //opt.id = [opt.id || 'noise', opt.s, opt.p].join('_')

      // RESET
      opt.view = vlay.util.gui.save()
      vlay.util.reset(vlay.v.out.current.getObjectByName(opt.id))
      // GROUP
      opt.group = new THREE.Group()
      opt.group.name = opt.id
      vlay.v.out.current.add(opt.group)

      // CUBEMAP
      vlay.mat.map = vlay.matgen(opt.box || 0, opt)
      let box = new THREE.Mesh(vlay.mat.box, vlay.mat.map)
      box.name = 'box'
      box.renderOrder = 2
      opt.group.add(box)

      // MANTLE
      opt.group.userData.contour = {}

      let geo = vlay.v.csg.geo.current.geometry
      geo.attributes.position.copy(geo.userData.pos)
      geo.attributes.position.needsUpdate = true
      // *** to-do: memoize & reset position from userData ***
      geo.computeBoundingSphere()
      if (!geo.getAttribute('color')) {
        let pos = geo.getAttribute('position')
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      }
      opt.geo = geo
    }

    if (opt.i > 0) {
      opt.geo = await vlay.morph(opt)
      //recurse
      opt.i--
      vlay.gcut(opt)
    } else {
      // output
      opt.group = await vlay.segs(opt.group)
      vlay.util.gui.load(opt.view)
      // update r3f
      vlay.v.csg.geo.current.userData.update = true
      vlay.v.state.invalidate()
    }
  },
  morph: function (opt) {
    //console.log('graphcut', opt)

    // cubemap PYR attenuate/convolute
    let blurs = []
    let k = vlay.v.opt.iter - opt.i + 1
    let target = opt.group.getObjectByName('box')
    for (let i = 0; i < target.material.length; i++) {
      let material = target.material[i].map.source.data
      let blur = document.createElement('canvas')
      let ctx = blur.getContext('2d')
      blur.width = blur.height = k
      ctx.drawImage(material, 0, 0, blur.width, blur.height)
      blurs.push(blur)
    }

    // raycast at vertices (for elevation, color)
    const col = opt.geo.getAttribute('color')
    const pos = opt.geo.getAttribute('position')
    const ctr = opt.geo.boundingSphere.center
    const dir = new THREE.Vector3()
    // defects from boxmap (for surface features)
    let contour = opt.group.userData.contour
    const v_raycast = new THREE.Raycaster()
    const v_pointer = new THREE.Vector3()

    for (let i = 0; i < pos.count; i++) {
      v_pointer.fromBufferAttribute(pos, i)
      const jitter = 1.001
      v_pointer.multiply(new THREE.Vector3(jitter, jitter, jitter))
      v_raycast.set(ctr, dir.subVectors(v_pointer, ctr).normalize())

      const intersects = v_raycast.intersectObject(target, false)
      if (intersects.length) {
        // cubemap sample (rgba, distance)
        let intersect = intersects[0]
        let relax = intersect.point.multiplyScalar(0.5)

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
        d /= opt.i
        // displace elevation
        let disp = new THREE.Vector3()
        disp.copy(v_pointer.multiplyScalar(1 - d * (1 / opt.i)))
        disp.lerp(relax, 0.5)
        pos.setXYZ(i, disp.x, disp.y, disp.z)
        // mantle (crust, core)
        // BVH-CSG cavities, extreme peak/valley
        let face = String(intersect.faceIndex).padStart(3, '0')
        let dist = v_pointer.distanceTo(intersect.point).toFixed(3)
        let xyz = disp.x.toFixed(3) + ',' + disp.y.toFixed(3) + ',' + disp.z.toFixed(3)
        let defect = [dist, opt.i, xyz, face].join('|')

        // defect tolerance
        if (contour[face] === undefined) {
          contour[face] = []
        }
        if (dist < vlay.v.R * 0.2) {
          contour[face].push(defect + '|pos')
        } else if (dist < vlay.v.R * 0.4) {
          contour[face].push(defect + '|neg')
        }
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

    const maxSegs = 6
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
        let depth = Number((defect[0] / vlay.v.R).toFixed(3))
        c.depth.push(depth)

        // position (path/geometry)
        let point = defect[2]
        point = point.split(',')
        point = new THREE.Vector3(+point[0], +point[1], +point[2])
        c.point.push(point)

        // weight
        const label = defect[defect.length - 1]
        if (label === 'pos') {
          c.label++
        }
      }

      // weight rank
      let weight = c.label / defects.length
      c.forms = Number((weight / fit.cluster.c).toFixed(3)) || 0
      c.label = c.forms >= 1 ? 'pos' : 'neg'

      // curve defects
      //console.log('c', c)
      profile(c)
    }

    function profile(c) {
      // feature
      let poi = c.forms > 1.2 || c.forms < 0.8
      // process
      let dif = c.depth[0] / c.depth[c.depth.length - 1]
      // classify connected geo-morph system
      let system = poi || dif < 15

      // form-specific transforms
      let mult = c.label === 'neg' ? 0.25 : 1 + c.forms
      let dilate = new THREE.Vector3(mult, mult, mult)
      for (let i = 0; i < c.point.length; i++) {
        const point = c.point[i]
        let prc = (i + 1) / c.point.length

        if (c.label === 'neg') {
          if (system) {
            // tube (radial cave)
            point.multiplyScalar(prc + 0.25)
          } else {
            c.label = 'pos'
            // box (central cave)
            point.multiply(dilate)
            //point.multiplyScalar(prc)
          }
        } else if (c.label === 'pos') {
          if (system) {
            // tube (surface crust)
          } else {
            // box (orbital cloud)
            point.multiply(dilate)
          }
        }
        //
      }

      c.system = system ? 1 : c.point.length

      topo(c)
    }

    function topo(c) {
      // face defects to mesh and CSG
      let geo = []

      // OUTPUT mesh (CSG)
      for (let i = 0; i < c.system; i++) {
        let buf
        let hull = false
        if (c.system > 1) {
          // not connected
          let pt = c.point[i]
          let d = (1 + c.depth[i]) * (vlay.v.R / 2)
          buf = new THREE.TetrahedronGeometry(d, 1)
          // params
          buf.scale(c.forms, c.forms, c.forms)
          buf.rotateX(c.depth[i] * 2)
          buf.rotateY(1 - c.depth[i] * 4)
          buf.rotateZ(c.depth[i] * 8)
          buf.translate(pt.x, pt.y, pt.z)
          // merge attributes same
          //buf = buf.toNonIndexed()
          //buf.index = null

          // metaballs or marching cube
          hull = c.depth[i] / c.depth[i - 1] < 0.75
        } else {
          // connected
          const curve = new THREE.CatmullRomCurve3(c.point)
          const extrude = {
            steps: 8,
            bevelEnabled: false,
            extrudePath: curve
          }
          // params
          const pts = [],
            cnt = 5
          for (let i = 0; i < cnt; i++) {
            const l = (vlay.v.R * c.forms) / 4
            const a = ((2 * i) / cnt) * Math.PI
            pts.push(new THREE.Vector2(Math.cos(a) * l, Math.sin(a) * l))
          }
          const ellipsoid = new THREE.Shape(pts)
          buf = new THREE.ExtrudeGeometry(ellipsoid, extrude)
          // ...maybe SimplifyModifier on turned edges
          hull = c.forms < 1
        }
        align(geo, buf, hull, c.label)
      }

      // merge geometries with all previous
      let last = fit[c.label]
      let merge = last ? [last, geo].flat() : [geo].flat()
      merge = mergeBufferGeometries(merge, false)
      // feedback
      if (!last) {
        merge.userData.count = c.system
      } else {
        merge.userData.count = last.userData.count + c.system
        merge.userData.mergedUserData = null
      }

      fit[c.label] = merge
    }

    function align(geo, buf, hull, c) {
      if (hull) {
        // convex hull
        const vertices = []
        const hulls = []
        hulls.push(buf)
        if (geo.length > 0) {
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
      color(buf, c.label)

      // output
      if (hull && c.system > 1) {
        geo[geo.length - 1] = buf
      } else {
        geo.push(buf)
      }
    }

    function color(geo, label) {
      // CSG and MergeBufferGeometries require same attributes
      if (label === 'neg') {
        // not visible
        return
      }
      // colors
      let pos = geo.getAttribute('position')
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
      let col = geo.getAttribute('color')
      // vertex color
      let v_pointer = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        // vertex distance
        v_pointer.fromBufferAttribute(pos, i)
        let d = v_pointer.distanceTo(new THREE.Vector3(0, 0, 0))
        d = d / (vlay.v.R * 4)

        // curve data (i.e. cluster)
        let s = label === 'neg' ? 0.125 : 0.5
        col.setXYZ(i, 1 - d, s, s)
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
  matgen: function (num, opt) {
    function noise(canvas) {
      let m = (canvas.width = canvas.height = 8)
      let ctx = canvas.getContext('2d')

      for (let x = 0; x < m; x++) {
        for (let y = 0; y < m; y++) {
          ctx.fillStyle = '#' + vlay.util.gen(opt.id)
          ctx.fillRect(x, y, 1, 1)
        }
      }

      let tex = new THREE.CanvasTexture(canvas)
      return tex
    }

    if (!num) {
      vlay.util.reset('genmap')
    }

    let cubemap = []
    let ts = Date.now()
    let fragment = new DocumentFragment()
    for (let i = 0; i < 6; i++) {
      let terrain
      if (!num) {
        const canvas = document.createElement('canvas')
        // random noise (...game of life?)
        canvas.id = canvas.title = 'rnd_' + vlay.mat.xyz[i][0] + '_' + ts
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
  }
}

// DEBUG...
window.vlay = vlay

export default vlay
