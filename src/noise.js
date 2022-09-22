const seedmap = function (seed, size = 64, qty = 1) {
  // params
  let k = {
    map: [],
    max: size / 4,
    min: Math.max(4, size / 128),
    dat: { pos: 0, neg: 0 }
  }

  function gen(seed, uei = 1) {
    // uid from seed (last or root)
    let S = k.seed
    S = S ? S ** 1.5 : ((Math.PI - 3) * 5e11) / seed
    S = Number((S * uei).toFixed().slice(-8))
    // output
    k.seed = S
    return S
  }

  function quad(pair, inc, major) {
    const spec = pair.major.getContext('2d')
    const base = pair.minor.getContext('2d')

    for (let x = 0; x < size; x += inc) {
      for (let y = 0; y < size; y += inc) {
        // TO-DO: instead of linear continuous col/row,
        // ...project to a cube face and iterate for a while
        // ...i.e. scale, difference, position
        // TO-DO: helper transforms matrix from one map face to another
        // ... pos, heading, etc.

        // quad
        const color = gen(seed)
        const label = color > '55555555' ? 'pos' : 'neg'
        let fill = String(color)
        let dst

        if (major) {
          dst = spec
          // absolute
          let cell = color % 2 === 0
          if (cell) {
            if (label === 'pos') {
              fill = '80ff8080'
            } else {
              fill = '10104080'
            }
          } else {
            continue
          }
        } else {
          dst = base
          // relative
          let RGB = label === 'pos' ? fill.substring(2, 4) : fill.substring(4, 6)
          fill = fill.replace(RGB, '80')
          let A = label === 'pos' ? '40' : '20'
          fill = fill.replace(fill.substring(6, 8), A)
        }
        k.dat[label]++

        // draw
        dst.fillStyle = '#' + fill
        dst.fillRect(x, y, inc, inc)
      }
    }

    // iterate
    if (!major && inc > k.min) {
      inc /= 2
      quad(pair, inc)
    }
  }

  // tiles increment detail from seed until size
  for (let i = 0; i < qty; i++) {
    // special
    let major = document.createElement('canvas')
    major.width = major.height = size
    // generic
    let minor = document.createElement('canvas')
    minor.width = minor.height = size
    // generic base color
    let base = minor.getContext('2d')
    base.fillStyle = '#000000'
    base.fillRect(0, 0, size, size)

    // major: while seed origin
    k.map[i] = { major: major, minor: minor }
    quad(k.map[i], k.max, true)
  }

  for (let i = 0; i < qty; i++) {
    // minor: until size
    quad(k.map[i], k.max)
  }

  // output
  // TO-DO: re-order from (px,nx,py,ny,pz,nz) => (py,pz,ny,nz,nx,px)...?
  for (let i = 0; i < k.map.length; i++) {
    let pair = k.map[i]
    let base = pair.minor.getContext('2d')
    base.drawImage(pair.major, 0, 0, size, size)
    k.map[i] = pair.minor
  }
  console.log('noise', k)
  return k
}

export { seedmap }
