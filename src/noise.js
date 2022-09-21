const noise = function (POW, qty, seed, uid, hist) {
  // params
  const min = 4
  let k = {
    inc: min,
    pos: 0,
    neg: 0,
    arr: []
  }

  function gen(uid, uei = 1) {
    // uid from seed (last or root)
    let S = hist[uid]
    S = S ? S ** 1.5 : ((Math.PI - 3) * 5e11) / seed
    S = Number((S * uei).toFixed().slice(-8))
    // output
    hist[uid] = S
    return S
  }

  function quad(pair, incr, major) {
    const inc = POW / incr
    const spec = pair.major.getContext('2d')
    const base = pair.minor.getContext('2d')

    for (let x = 0; x < POW; x += inc) {
      for (let y = 0; y < POW; y += inc) {
        // quad
        const color = gen(uid)
        k.label = color > '55555555' ? 'pos' : 'neg'
        let fill = String(color)
        let dst

        if (major) {
          dst = spec
          // absolute
          let cell = color % 2 === 0
          if (cell) {
            if (k.label === 'pos') {
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
          let RGB = k.label === 'pos' ? fill.substring(2, 4) : fill.substring(4, 6)
          fill = fill.replace(RGB, '80')
          let A = k.label === 'pos' ? '40' : '20'
          fill = fill.replace(fill.substring(6, 8), A)
        }
        k[k.label]++

        // draw
        dst.fillStyle = '#' + fill
        dst.fillRect(x, y, inc, inc)
      }
    }

    // iterate
    if (!major && incr < POW / 2) {
      incr *= 2
      quad(pair, incr)
    }
  }

  // tiles increment detail from seed until POW
  for (let i = 0; i < qty; i++) {
    // special
    let major = document.createElement('canvas')
    major.width = major.height = POW
    // generic
    let minor = document.createElement('canvas')
    minor.width = minor.height = POW
    // generic base color
    let base = minor.getContext('2d')
    base.fillStyle = '#000000'
    base.fillRect(0, 0, POW, POW)

    // major: while seed origin
    k.arr[i] = { major: major, minor: minor }
    quad(k.arr[i], k.inc, true)
  }

  for (let i = 0; i < qty; i++) {
    // minor: until POW
    quad(k.arr[i], k.inc)
  }

  // output
  console.log('noise', k)
  let composite = []
  for (let i = 0; i < k.arr.length; i++) {
    let pair = k.arr[i]
    let base = pair.minor.getContext('2d')
    base.drawImage(pair.major, 0, 0, POW, POW)
    composite.push(pair.minor)
  }
  return composite
}

export { noise }
