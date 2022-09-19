const noise = function (canvas, seed, uid, hist) {
  // source
  const MAX = canvas.width
  let context = canvas.getContext('2d')
  context.fillStyle = '#000000'
  context.fillRect(0, 0, canvas.width, canvas.height)

  function gen(uid, uei = 1) {
    // uid from seed (from last or root)
    let S = hist[uid]
    S = S ? S ** 1.5 : ((Math.PI - 3) * 5e11) / seed
    S = Number((S * uei).toFixed().slice(-8))
    // output
    hist[uid] = S
    return S
  }

  // params
  let k = {
    d: MAX / 2,
    pos: 0,
    neg: 0
  }

  function quad(k) {
    let d = MAX / k.d
    let cell = false

    for (let x = 0; x < canvas.width; x += d) {
      for (let y = 0; y < canvas.height; y += d) {
        // quad
        k.gen = gen(uid)
        k.label = k.gen > '55555555' ? 'pos' : 'neg'

        if (d === MAX / 4 && cell) {
          // major
          let detail = String(k.gen)
          if (k.label === 'pos') {
            detail = '80ff8080'
          } else {
            detail = '10104080'
          }
          k.fill = detail
        } else {
          //minor
          let base = String(k.gen)
          let RGB = k.label === 'pos' ? base.substring(2, 4) : base.substring(4, 6)
          base = base.replace(RGB, '80')
          let A = k.label === 'pos' ? '40' : '20'
          base = base.replace(base.substring(6, 8), A)
          // out
          k.fill = base
        }
        k[k.label]++

        // output
        context.fillStyle = '#' + k.fill
        context.fillRect(x, y, d, d)
        cell = k.gen % 2 === 0
      }
    }

    // iterate
    if (k.d > 4) {
      k.d /= 2
      quad(k)
    } else {
      console.log(k)
    }
  }
  quad(k)
}

export { noise }
