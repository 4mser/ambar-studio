/* ÁMBAR, the mascot.

   ÁMBAR is one translucent gel body with two capsule eyes. Its outline is a base radius plus a
   sum of soft lobes, so an expression is a silhouette, and blending expressions means summing their
   lobes scaled by weight (never averaging lobe angles: that jumped ~40 px between opposite lobes).
   character(spec) turns a palette into a draw function (options) => SVG string; ÁMBAR is
   character(AMBAR) and is window.mascotaAmbar.

   The helpers below the mascot are pure functions of time: blink schedules, mood crossfades,
   gaze keys, gaussian path smoothing, arrivals, departure trails and voice envelopes.

   Classic script with no build step: <script src="/@ambar/mascot/ambar.js"> defines
   window.AmbarKit and window.mascotaAmbar. Node imports the file for that side effect. */
(() => {
  // ── math ────────────────────────────────────────────────────────────────

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, k) => a + (b - a) * k
  const progress = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d))
  const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
  const SQRT_TAU = Math.sqrt(Math.PI * 2)

  /** Deterministic pseudo-random in [0, 1), the same as the runtime's hash() */
  function hash (seed) {
    const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return v - Math.floor(v)
  }

  /** FNV-1a of a string, base 36: names SVG ids after their content */
  function fnv (text) {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(36)
  }

  // ── colour ──────────────────────────────────────────────────────────────

  function hex (c, what) {
    if (typeof c !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) throw new Error(`${what} must be a #rrggbb colour, got ${c}`)
    return c.length === 4 ? '#' + [...c.slice(1)].map((d) => d + d).join('') : c
  }

  function mix (a, b, k) {
    const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const A = parse(a)
    const B = parse(b)
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')
  }

  // State tints shared by the whole family: angry leans red, sad leans blue
  const RED = { edge: '#FF4A3A', mid: '#C8102A', deep: '#6A0712', core: '#2A0406', eye: '#FF6A5A', halo: '#E0142E', light: '#FFB0A0', accent: '#FF6A3A' }
  const BLUE = { edge: '#6FA8FF', mid: '#3B6FE0', deep: '#1E2F7A', core: '#0C1230', eye: '#A8CCFF', halo: '#3B7BFF', light: '#BFD8FF', accent: '#7FB0FF' }
  const TINTED = ['edge', 'mid', 'deep', 'core', 'eye', 'halo', 'light', 'accent']

  // ── silhouettes ─────────────────────────────────────────────────────────

  // Every expression is { base, lob: [[angle°, length, width], …] } in units of R.
  // Angles: 0 right, 90 down, -90 up.
  const SHAPES = {
    gota: { base: 0.78, lob: [[-90, 0.36, 0.28], [-55, 0.05, 0.5], [-125, 0.05, 0.5], [40, 0.1, 0.6], [140, 0.1, 0.6]] },
    normal: { base: 0.72, lob: [[-48, 0.5, 0.3], [192, 0.36, 0.4], [36, 0.32, 0.45], [118, 0.2, 0.5], [-128, 0.14, 0.45]] },
    feliz: { base: 0.72, lob: [[-58, 0.48, 0.19], [-122, 0.48, 0.19], [15, 0.24, 0.45], [165, 0.24, 0.45], [92, 0.12, 0.6]] },
    pensativa: { base: 0.74, lob: [[-122, 0.5, 0.28], [14, 0.28, 0.45], [172, 0.24, 0.45], [80, 0.18, 0.5], [-38, 0.14, 0.4]] },
    sorprendida: { base: 0.7, lob: [[-90, 0.36, 0.38], [-4, 0.34, 0.32], [184, 0.34, 0.32], [58, 0.14, 0.5], [122, 0.14, 0.5]] },
    enojada: { base: 0.7, lob: [[-62, 0.44, 0.19], [-118, 0.44, 0.19], [8, 0.32, 0.24], [172, 0.32, 0.24], [90, 0.16, 0.4]] },
    triste: { base: 0.72, lob: [[112, 0.34, 0.34], [68, 0.34, 0.34], [180, 0.2, 0.42], [0, 0.2, 0.42], [-90, 0.08, 0.5]] },
    dormida: { base: 0.66, lob: [[0, 0.42, 0.5], [180, 0.42, 0.5], [-90, 0.06, 0.5], [60, 0.1, 0.5], [120, 0.1, 0.5]] }
  }

  // English names for the built-in expressions
  const ALIASES = { drop: 'gota', happy: 'feliz', thinking: 'pensativa', surprised: 'sorprendida', angry: 'enojada', sad: 'triste', sleepy: 'dormida', asleep: 'dormida' }
  const canon = (name) => ALIASES[name] ?? name

  // Eye styles: every expression draws its eyes in one of these
  const LOOKS = ['normal', 'feliz', 'pensativa', 'sorprendida', 'enojada', 'triste', 'dormida']

  /** Base and lobes for a weighted mix of expressions, plus a tail opposite the velocity */
  function blend (shapes, weights, t, vel) {
    const E = Object.entries(weights).filter(([, w]) => w > 0)
    let W = 0
    for (const [, w] of E) W += w
    if (!W) return blend(shapes, { normal: 1 }, t, vel)
    let base = 0
    const L = []
    for (const [k, w] of E) {
      const s = shapes[k]
      base += s.base * w
      // the fourth number is the lobe's index in its own shape: it sets the lobe's drift, so a
      // lobe keeps its motion whatever else is in the blend (no jump when a weight reaches 0)
      s.lob.forEach(([ang, l, sg], i) => L.push([ang * Math.PI / 180 + Math.sin(t * 0.6 + i * 1.9) * 0.08, l * w / W * (1 + 0.08 * Math.sin(t * 0.9 + i * 1.7)), sg, i]))
    }
    const v = Math.hypot(vel[0], vel[1])
    if (v > 1) L.push([Math.atan2(-vel[1], -vel[0]), Math.min(0.3, v / 1500), 0.42, 5])
    return { base: base / W, L }
  }

  /** 72 points of the outline; the lower half is a little flatter, like gel resting */
  function outlinePoints (cx, cy, R, F) {
    const P = []
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2
      let r = F.base
      for (const [la, ll, ls] of F.L) {
        const d = Math.atan2(Math.sin(a - la), Math.cos(a - la))
        r += ll * Math.exp(-d * d / (2 * ls * ls))
      }
      const yy = Math.sin(a) * r * R
      P.push([cx + Math.cos(a) * r * R, cy + (yy > 0 ? yy * 0.86 : yy)])
    }
    return P
  }

  /** Smooth closed path through points (Catmull-Rom as cubic Béziers) */
  function closed (P) {
    let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`
    const n = P.length
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n]
      const p1 = P[i]
      const p2 = P[(i + 1) % n]
      const p3 = P[(i + 2) % n]
      d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
    }
    return d + 'Z'
  }

  // How far the mascot reaches, in R, for figures and layout: side, top, bottom
  const EXTENT = [1.5, 1.6, 1.2]

  // ── the mascot ──────────────────────────────────────────────────────────

  const prefixes = new Set()

  function prefixFor (name) {
    const base = String(name).normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase().slice(0, 8) || 'm'
    let p = base
    for (let i = 2; prefixes.has(p); i++) p = base + i
    prefixes.add(p)
    return p
  }

  const pick = (o, a, b) => (o[a] !== undefined ? o[a] : o[b])

  /** The largest weight's expression */
  function dominant (weights) {
    let best = 'normal'
    let max = -Infinity
    for (const [k, w] of Object.entries(weights)) {
      if (w > max) {
        max = w
        best = k
      }
    }
    return canon(best)
  }

  /**
   * The mascot's draw function.
   *   name       used for the SVG id prefix
   *   palette    { edge, mid, deep, core, eye, halo, light, accent?, sparkle?, tear? }
   *              edge is the bright rim, mid the body, deep and core the depth toward the centre
   *   shapes     { expression: { base, lob: [[deg, length, width], …] } } added or replacing
   *   looks      { expression: eyeStyle } for new expressions (default 'normal')
   *   sadTint    how far sadness tints toward blue, at most 0.18 (default 0.18)
   *   fluid      how much the lobes drift on their own (default 1)
   */
  function character (spec = {}) {
    if (!spec.palette) throw new Error('character() needs a palette: { edge, mid, deep, core, eye, halo, light }')
    const palette = {}
    for (const key of ['edge', 'mid', 'deep', 'core', 'eye', 'halo', 'light']) palette[key] = hex(spec.palette[key], `palette.${key}`)
    palette.accent = hex(spec.palette.accent ?? spec.palette.light, 'palette.accent')
    palette.sparkle = hex(spec.palette.sparkle ?? spec.palette.light, 'palette.sparkle')
    palette.tear = hex(spec.palette.tear ?? '#CFE3FF', 'palette.tear')

    const shapes = { ...SHAPES }
    for (const [k, s] of Object.entries(spec.shapes ?? {})) {
      if (!Array.isArray(s.lob) || typeof s.base !== 'number') throw new Error(`shapes.${k} must be { base, lob: [[deg, length, width], …] }`)
      shapes[canon(k)] = s
    }
    const looks = {}
    for (const k of Object.keys(shapes)) looks[k] = LOOKS.includes(k) ? k : 'normal'
    for (const [k, v] of Object.entries(spec.looks ?? {})) {
      if (!LOOKS.includes(canon(v))) throw new Error(`looks.${k}: unknown eye style "${v}" (use ${LOOKS.join(', ')})`)
      looks[canon(k)] = canon(v)
    }

    const sheet = Object.freeze({
      name: spec.name ?? 'mascot',
      palette: Object.freeze(palette),
      shapes,
      looks,
      sadTint: Math.min(0.18, spec.sadTint ?? 0.18),
      fluid: spec.fluid ?? 1
    })
    const prefix = prefixFor(sheet.name)

    /** Reads options, Spanish or English names alike */
    function read (o) {
      const { x, y, R } = o
      if (![x, y, R].every(Number.isFinite)) throw new Error(`${sheet.name}: x, y and R must be numbers`)
      const given = pick(o, 'weights', 'pesos')
      const weights = {}
      if (given) {
        for (const [k, w] of Object.entries(given)) {
          const c = canon(k)
          if (!shapes[c]) throw new Error(`${sheet.name}: unknown expression "${k}"`)
          weights[c] = (weights[c] ?? 0) + w
        }
      }
      let expression = canon(pick(o, 'expression', 'expr') ?? (given ? dominant(weights) : 'normal'))
      if (!shapes[expression]) throw new Error(`${sheet.name}: unknown expression "${expression}"`)
      const halo = o.halo !== undefined ? o.halo !== false : !o.sinHalo
      return {
        x, y, R,
        t: o.t ?? 0,
        expression,
        weights: given ? weights : { [expression]: 1 },
        gaze: pick(o, 'gaze', 'mira') ?? [0, 0],
        blink: pick(o, 'blink', 'parpadeo') ?? 0,
        talk: clamp(pick(o, 'talk', 'habla') ?? 0, 0, 1.2),
        sparkle: pick(o, 'sparkle', 'chispas') ?? 0,
        stretch: pick(o, 'stretch', 'estira') ?? 0,
        velocity: pick(o, 'velocity', 'vel') ?? [0, 0],
        opacity: pick(o, 'opacity', 'op') ?? 1,
        red: pick(o, 'red', 'rojo') ?? 0,
        sad: pick(o, 'sad', 'triste') ?? 0,
        turn: pick(o, 'turn', 'giro'),
        halo,
        shadow: o.shadow !== false,
        eyes: o.eyes !== false && !o.sinOjos
      }
    }

    /** Outline lobes for these options: expression blend, drift, voice */
    function shapeOf (s) {
      const { t, talk, turn } = s
      const F = blend(shapes, s.weights, t, s.velocity)
      const f = sheet.fluid
      F.L = F.L.map(([a, l, sg, i]) => [a + 0.06 * f * Math.sin(t * 0.43 + i * 2.3), l * (1 + 0.08 * f * Math.sin(t * 0.71 + i * 1.7)), sg])
      const yaw = turn ? turn[0] : 0
      if (talk > 0.01) {
        // three soft waves travel along the rim and the mouth swells below the eyes;
        // the base gives back what they add, so the body never grows with the voice
        const added = []
        for (let j = 0; j < 3; j++) added.push([t * (0.9 + j * 0.35) + j * 2.1, talk * 0.05, 0.22])
        added.push([Math.PI / 2 + 0.15 * Math.sin(t * 0.8) - (turn ? Math.sin(yaw) * 0.6 : 0), talk * 0.1, 0.42])
        for (const [, l, sg] of added) F.base -= l * sg / SQRT_TAU
        F.L.push(...added)
      }
      return F
    }

    function eyesOf (s, C, ex, ey, sides) {
      const { R } = s
      const look = looks[s.expression]
      const sep = R * 0.17
      const w = R * 0.105
      const hgt = R * 0.3 * (1 - s.blink * 0.9)
      const pill = (cx, alto) => `<rect x="${cx - w / 2}" y="${ey - alto / 2}" width="${w}" height="${alto}" rx="${w / 2}"/>`
      let eyes = ''
      if (look === 'feliz') eyes = sides.map((v) => `<path d="M${ex + v * sep - w * 1.1} ${ey + R * 0.03} Q${ex + v * sep} ${ey - R * 0.12} ${ex + v * sep + w * 1.1} ${ey + R * 0.03}" fill="none" stroke="currentColor" stroke-width="${w * 0.8}" stroke-linecap="round"/>`).join('')
      else if (look === 'dormida') eyes = sides.map((v) => `<path d="M${ex + v * sep - w} ${ey} Q${ex + v * sep} ${ey + R * 0.07} ${ex + v * sep + w} ${ey}" fill="none" stroke="currentColor" stroke-width="${w * 0.6}" stroke-linecap="round"/>`).join('')
      else if (look === 'enojada') {
        // capsules with the top edge slanting down toward the centre
        eyes = sides.map((v) => {
          const cx = ex + v * sep
          const top = ey - hgt / 2
          const bot = ey + hgt / 2
          const yIn = top + hgt * 0.38 * 1.4
          const xi = cx - v * w / 2
          const xo = cx + v * w / 2
          return `<path d="M${xo} ${top + w * 0.3} L${xo} ${bot - w / 2} Q${xo} ${bot} ${cx} ${bot} Q${xi} ${bot} ${xi} ${bot - w / 2} L${xi} ${yIn} Z" stroke-linejoin="round"/>`
        }).join('')
      } else if (look === 'triste') {
        eyes = sides.map((v) => {
          const cx = ex + v * sep
          const top = ey - hgt / 2 + hgt * 0.1
          const bot = ey + hgt / 2
          const yOut = top + hgt * 0.38 * 1.3
          const xi = cx - v * w / 2
          const xo = cx + v * w / 2
          return `<path d="M${xi} ${top + w * 0.3} L${xi} ${bot - w / 2} Q${xi} ${bot} ${cx} ${bot} Q${xo} ${bot} ${xo} ${bot - w / 2} L${xo} ${yOut} Z" stroke-linejoin="round"/>`
        }).join('')
      } else if (look === 'sorprendida') eyes = sides.map((v) => pill(ex + v * sep, hgt * 1.15)).join('')
      else if (look === 'pensativa') eyes = sides.map((v) => pill(ex + v * sep, v < 0 ? hgt * 0.85 : hgt)).join('')
      else eyes = sides.map((v) => pill(ex + v * sep, hgt)).join('')
      return { eyes, lashes: sides.map((v) => lashesOf(R, look, ex + v * sep, ey, w, hgt, v)).join('') }
    }

    // two fine strokes on the outer edge of an eye
    function lashesOf (R, look, cx, ey, w, hgt, v) {
      const top = look === 'feliz' ? ey - R * 0.045 : look === 'dormida' ? ey + R * 0.02 : ey - hgt / 2 + w * 0.45
      return [0, 1].map((k) => {
        const bx = cx + v * w * 0.5
        const by = top + k * R * 0.04
        const ang = (38 - k * 26) * Math.PI / 180
        const L = R * (0.06 - k * 0.01)
        const dx = v * Math.cos(ang) * L
        const dy = -Math.sin(ang) * L
        return `<path d="M${bx} ${by} q${dx * 0.55} ${dy * 0.1} ${dx} ${dy}" fill="none" stroke="currentColor" stroke-width="${R * 0.016}" stroke-linecap="round"/>`
      }).join('')
    }

    function body (s, id) {
      const { x, y, R, t, talk, stretch, velocity: vel, gaze, turn } = s
      const share = s.weights.triste ? s.weights.triste / Object.values(s.weights).reduce((a, b) => a + Math.max(0, b), 0) : 0
      const sad = clamp(Math.max(s.sad, share)) * sheet.sadTint
      const C = {}
      for (const k of TINTED) C[k] = mix(mix(sheet.palette[k], RED[k], s.red), BLUE[k], sad)
      const vv = Math.min(0.3, Math.hypot(vel[0], vel[1]) / 1500)
      const dy = Math.sin(t * 1.6) * R * 0.03
      const cy = y + dy
      const yaw = turn ? turn[0] : 0
      const pitch = turn ? turn[1] : 0
      const F = shapeOf(s)
      const G = closed(outlinePoints(x, cy, R, F))

      let h = `<defs><radialGradient id="${id}h"><stop offset="0" stop-color="${C.halo}" stop-opacity=".5"/><stop offset="1" stop-color="${C.halo}" stop-opacity="0"/></radialGradient>`
      h += `<filter id="${id}b" filterUnits="userSpaceOnUse" x="${x - R * 3}" y="${y - R * 3}" width="${R * 6}" height="${R * 6}"><feGaussianBlur stdDeviation="${R * 0.06}"/></filter>`
      h += `<filter id="${id}e" filterUnits="userSpaceOnUse" x="${x - R * 2}" y="${y - R * 2}" width="${R * 4}" height="${R * 4}"><feGaussianBlur stdDeviation="${R * 0.07}"/></filter>`
      h += `</defs><g opacity="${s.opacity}" transform="translate(${x} ${y + R}) scale(${1 + stretch * 0.1} ${1 - stretch * 0.1}) translate(${-x} ${-y - R})">`
      if (s.halo) h += `<ellipse data-glow cx="${x}" cy="${y + dy}" rx="${R * 2.2}" ry="${R * 2.05}" fill="url(#${id}h)"/>`
      if (s.shadow) h += `<ellipse cx="${x}" cy="${y + R * 0.98}" rx="${R * 0.7}" ry="${R * 0.11}" fill="${C.halo}" opacity=".3" filter="url(#${id}b)"/>`

      // one material: the colour darkens with depth toward a core that follows the gaze
      const nx = x + gaze[0] * R * 0.06 + (turn ? Math.sin(yaw) * R * 0.1 : 0)
      const ny = y + dy + R * 0.08 + gaze[1] * R * 0.05
      // the voice lights the gel from inside (the halo stays put: a pulsing halo reads as a size pulse)
      const glow = talk > 0.01 ? (0.22 + 0.16 * talk).toFixed(3) : '.22'
      const rim = talk > 0.01 ? (0.35 + 0.12 * talk).toFixed(3) : '.35'
      h += `<radialGradient id="${id}v" cx="${nx}" cy="${ny}" r="${R * (1.12 + vv * 1.6)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.core}"/><stop offset=".42" stop-color="${C.deep}"/><stop offset=".72" stop-color="${C.mid}"/><stop offset=".95" stop-color="${C.edge}"/><stop offset="1" stop-color="${C.edge}"/></radialGradient>`
      h += `<path d="${G}" fill="url(#${id}v)"/>`
      h += `<clipPath id="${id}c"><path d="${G}"/></clipPath><g clip-path="url(#${id}c)">`
      h += `<ellipse cx="${x + R * 0.55}" cy="${y + dy + R * 0.55}" rx="${R * 0.55}" ry="${R * 0.42}" fill="${C.accent}" opacity="${glow}" filter="url(#${id}b)"/>`
      h += `<path d="${G}" fill="none" stroke="${C.light}" stroke-width="${R * 0.16}" opacity="${rim}" filter="url(#${id}b)"/></g>`

      // light: a sheen that circles the rim, a soft reflection and a sharp one up left
      const a = t * 0.9
      const bx = x + Math.cos(a) * R * 0.62
      const by = y + dy + Math.sin(a) * R * 0.55
      h += `<ellipse cx="${bx}" cy="${by}" rx="${R * 0.28}" ry="${R * 0.12}" transform="rotate(${a * 57.3 + 90} ${bx} ${by})" fill="#fff" opacity=".18" filter="url(#${id}b)"/>`
      h += `<ellipse cx="${x - R * 0.34}" cy="${y + dy - R * 0.52}" rx="${R * 0.36}" ry="${R * 0.15}" transform="rotate(-28 ${x - R * 0.34} ${y + dy - R * 0.52})" fill="#fff" opacity=".32" filter="url(#${id}b)"/>`
      h += `<ellipse cx="${x - R * 0.4}" cy="${y + dy - R * 0.56}" rx="${R * 0.14}" ry="${R * 0.045}" transform="rotate(-30 ${x - R * 0.4} ${y + dy - R * 0.56})" fill="#fff" opacity=".8"/>`
      h += `<path d="${G}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="${R * 0.02}"/>`

      // eyes: capsules on the front of a sphere; a head turn slides and narrows them
      const ex = x + gaze[0] * R * 0.1
      const ey = y + dy - R * 0.08 + gaze[1] * R * 0.07
      const sep = R * 0.17
      const cpz = Math.cos(pitch)
      const dyp = -Math.sin(pitch) * R * 0.42
      const eyeX = (v) => (turn ? ex + Math.sin(yaw + v * 0.36) * R * 0.47 : ex + v * sep)
      let eyes = ''
      if (!turn) {
        const e = eyesOf(s, C, ex, ey, [-1, 1])
        eyes = e.eyes + e.lashes
      } else {
        for (const v of [-1, 1]) {
          const c = Math.cos(yaw + v * 0.36) * cpz
          if (c < 0.08) continue
          const e = eyesOf(s, C, ex, ey, [v])
          eyes += `<g transform="translate(${eyeX(v)} ${ey + dyp}) scale(${c} ${Math.max(0.15, cpz)}) translate(${-(ex + v * sep)} ${-ey})">${e.eyes}${e.lashes}</g>`
        }
      }
      if (s.eyes) h += `<g color="${C.eye}" fill="${C.eye}" filter="url(#${id}e)" opacity=".9">${eyes}</g><g color="#fff" fill="#fff">${eyes}</g>`

      const look = looks[s.expression]
      if (look === 'sorprendida') {
        for (const v of [-1, 0, 1]) {
          const a = -Math.PI / 2 + v * 0.45
          const r0 = R * 1.25
          const r1 = R * 1.45
          h += `<line x1="${x + Math.cos(a) * r0}" y1="${y + Math.sin(a) * r0}" x2="${x + Math.cos(a) * r1}" y2="${y + Math.sin(a) * r1}" stroke="${C.edge}" stroke-width="${R * 0.05}" stroke-linecap="round"/>`
        }
      }
      if (look === 'triste') {
        // a tear that falls slowly: sad stays endearing
        const u = (t * 0.7) % 1
        const lx = eyeX(1) + R * 0.105 * 0.9
        const ly = ey + R * 0.12 + u * R * 0.45
        h += `<path d="M${lx} ${ly - R * 0.07} Q${lx + R * 0.045} ${ly} ${lx} ${ly + R * 0.035} Q${lx - R * 0.045} ${ly} ${lx} ${ly - R * 0.07}Z" fill="${sheet.palette.tear}" opacity="${0.9 * Math.sin(u * Math.PI)}"/>`
      }
      if (look === 'enojada') {
        for (let j = 0; j < 3; j++) {
          const u = ((t * 0.8) + j / 3) % 1
          h += `<circle cx="${x + R * (0.9 + j * 0.08)}" cy="${y - R * (0.8 + u * 0.7)}" r="${R * (0.06 + u * 0.05)}" fill="${C.mid}" opacity="${0.6 * (1 - u)}"/>`
        }
      }
      if (s.sparkle > 0) {
        for (let j = 0; j < 4; j++) {
          const a = j * 1.57 + t * 0.6
          const rr = R * (1.35 + 0.1 * Math.sin(t * 2 + j))
          const sx = x + Math.cos(a) * rr
          const sy = y + Math.sin(a) * rr * 0.85
          const z = R * 0.12 * s.sparkle * (0.7 + 0.3 * Math.sin(t * 5 + j * 2))
          h += `<path d="M${sx} ${sy - z} Q${sx} ${sy} ${sx + z} ${sy} Q${sx} ${sy} ${sx} ${sy + z} Q${sx} ${sy} ${sx - z} ${sy} Q${sx} ${sy} ${sx} ${sy - z}Z" fill="${sheet.palette.sparkle}" opacity="${s.sparkle}"/>`
        }
      }
      return h + '</g>'
    }

    // The id names the SVG content, so identical options give identical output and two
    // different frames never share an id
    const TOKEN = '\u0001'

    function draw (options = {}) {
      if (!(options.R >= 1)) return ''
      const svg = body(read(options), TOKEN)
      return svg.split(TOKEN).join(`${prefix}_${fnv(svg)}_`)
    }

    draw.spec = sheet
    draw.prefix = prefix
    draw.expressions = Object.keys(shapes)
    /** The outline as 72 [x, y] points, for tests and layout */
    draw.outline = (options) => {
      const s = read(options)
      return outlinePoints(s.x, s.y + Math.sin(s.t * 1.6) * s.R * 0.03, s.R, shapeOf(s))
    }
    draw.figure = (options) => figure(draw, options)
    return draw
  }

  /**
   * A small standalone <svg> of the mascot, for a caption pill or a list: no halo, no
   * shadow. Options are the draw options; R defaults to 28.
   */
  function figure (draw, o = {}) {
    const R = o.R ?? 28
    const halo = o.halo ?? (o.sinHalo === false)
    const [side, top, bottom] = EXTENT
    const sx = side * (halo ? 1.5 : 1)
    const st = top * (halo ? 1.4 : 1)
    const sb = bottom * (halo ? 1.8 : 1)
    const w = 2 * sx * R
    const h = (st + sb) * R
    const inner = draw({ t: 0, sparkle: 0, ...o, x: sx * R, y: st * R, R, halo, shadow: o.shadow ?? false })
    return `<svg class="figure" xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" overflow="visible">${inner}</svg>`
  }

  // ── helpers: pure functions of time ─────────────────────────────────────

  /**
   * An irregular blink schedule: one blink every 2.1–3.7 s, sometimes a double (+0.22 s).
   * Same seed, same schedule.
   */
  function blinks (seed = 1, duration = 60, { start = 0.8 } = {}) {
    const list = []
    let s = start + hash(seed * 7.31) * 0.6
    while (s < duration) {
      list.push(s)
      if (hash(s * 3 + seed) > 0.75 && s + 0.22 < duration) list.push(s + 0.22)
      s += 2.1 + hash(s + seed * 13.7) * 1.6
    }
    return list
  }

  /** How closed the eyes are at t (0..1): each blink closes and opens in 0.13 s */
  function blinkAt (t, schedule, length = 0.13) {
    let v = 0
    for (const a of schedule) if (t > a && t < a + length) v = Math.max(v, Math.sin((t - a) / length * Math.PI))
    return v
  }

  /**
   * Expression weights at t from mood keys [[time, expression], …]: each new mood takes over
   * in `fade` seconds from wherever the blend was. No state: the same t gives the same weights,
   * they always add up to 1 and never jump.
   */
  function moods (t, list, fade = 0.55) {
    if (!list.length) return { normal: 1 }
    const keys = [...list].sort((a, b) => a[0] - b[0])
    const toward = (from, expression, k) => {
      const out = {}
      for (const [e, w] of Object.entries(from)) out[e] = w * (1 - k)
      out[expression] = (out[expression] ?? 0) + k
      return out
    }
    let from = { [canon(keys[0][1])]: 1 }
    let i = 0
    while (i + 1 < keys.length && keys[i + 1][0] <= t) {
      from = toward(from, canon(keys[i][1]), inOut(progress(keys[i + 1][0], keys[i][0], fade)))
      i++
    }
    const out = toward(from, canon(keys[i][1]), inOut(progress(t, keys[i][0], fade)))
    // drop the dust of finished fades and keep the sum at exactly 1
    let sum = 0
    for (const e of Object.keys(out)) {
      if (out[e] < 1e-6) delete out[e]
      else sum += out[e]
    }
    for (const e of Object.keys(out)) out[e] /= sum
    return out
  }

  /**
   * Gaze at t from keys [[time, dx, dy], …] in -1..1, eased along straight lines and
   * exaggerated (×2.4 by default) so it reads at video size.
   */
  function gazeAt (t, list, { exaggerate = 2.4 } = {}) {
    if (!list.length) return [0, 0]
    const keys = [...list].sort((a, b) => a[0] - b[0])
    let v
    if (t <= keys[0][0]) v = keys[0]
    else if (t >= keys[keys.length - 1][0]) v = keys[keys.length - 1]
    else {
      let i = 0
      while (t > keys[i + 1][0]) i++
      const k = inOut(progress(t, keys[i][0], keys[i + 1][0] - keys[i][0]))
      v = [t, lerp(keys[i][1], keys[i + 1][1], k), lerp(keys[i][2], keys[i + 1][2], k)]
    }
    return [v[1] * exaggerate, v[2] * exaggerate]
  }

  /**
   * A path averaged with a gaussian (σ 0.22 s over ±0.54 s): starts and stops like a fluid,
   * never at a corner. posFn(t) returns [x, y, …] or { x, y, … }; the result has its shape.
   */
  function smoothPath (posFn, t, { sigma = 0.22, reach = 0.54, step = 0.09 } = {}) {
    const n = Math.round(reach / step)
    let acc = null
    let W = 0
    for (let j = -n; j <= n; j++) {
      const d = j * step
      const w = Math.exp(-d * d / (2 * sigma * sigma))
      const q = posFn(t + d)
      if (!acc) acc = Array.isArray(q) ? q.map(() => 0) : {}
      for (const k in q) if (typeof q[k] === 'number') acc[k] = (acc[k] ?? 0) + q[k] * w
      W += w
    }
    for (const k in acc) acc[k] /= W
    return acc
  }

  /**
   * Arrival from `from` to `to` ([x, y]) starting at a and lasting d: an eased straight line,
   * gaussian-smoothed. Returns { x, y, velocity, k } — pass velocity to the mascot so it stretches.
   */
  function arrive (t, from, to, a, d = 1.2) {
    const path = (u) => {
      const k = inOut(progress(u, a, d))
      return [lerp(from[0], to[0], k), lerp(from[1], to[1], k)]
    }
    const p = smoothPath(path, t)
    const p0 = smoothPath(path, t - 1 / 30)
    return { x: p[0], y: p[1], velocity: [(p[0] - p0[0]) * 30, (p[1] - p0[1]) * 30], k: progress(t, a, d) }
  }

  /**
   * A faint trail left along a path: about ten dots that drift and fade within `life` seconds.
   * Only moments between `from` and `to` leave dots. Returns SVG circles.
   */
  function trail (posFn, t, { from = -Infinity, to = Infinity, count = 10, step = 0.09, life = 0.9, color = '#ffffff', size = 3, opacity = 0.35, spread = 26, drift = [0, 18], seed = 1 } = {}) {
    let h = ''
    for (let s = 0; s < count; s++) {
      const ts = Math.floor(t / step) * step - s * step
      const age = t - ts
      if (ts < from || ts > to || age > life) continue
      const q = posFn(ts)
      const px = Array.isArray(q) ? q[0] : q.x
      const py = Array.isArray(q) ? q[1] : q.y
      const n = Math.round(ts / step)
      const x = px + (hash(n * 7.1 + seed) - 0.5) * spread + drift[0] * age
      const y = py + (hash(n * 3.3 + seed * 5) - 0.5) * spread + drift[1] * age
      const a = Math.max(0, 1 - age / life) * opacity
      if (a > 0.005) h += `<circle data-glow cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size * (0.6 + 0.6 * hash(n + seed))).toFixed(2)}" fill="${color}" opacity="${a.toFixed(3)}"/>`
    }
    return h
  }

  /**
   * The voice level of line `id` at t, from an envelope { fps, lines: { id: [levels…] } }
   * whose line starts at `start` (its cue). Smoothed over ±3 frames; 0 outside the line.
   * Pass it as `talk`.
   */
  function envelopeAt (t, envelope, id, start = 0) {
    const list = envelope?.lines?.[id]
    if (!list || t < start) return 0
    const f = (t - start) * (envelope.fps ?? 30)
    if (f > list.length + 3) return 0
    const at = (i) => {
      const a = Math.floor(i)
      return lerp(list[a] ?? 0, list[a + 1] ?? 0, i - a)
    }
    let s = 0
    let n = 0
    for (let j = -3; j <= 3; j++) {
      const z = 1 - Math.abs(j) / 4
      s += at(f + j) * z
      n += z
    }
    return clamp(s / n, 0, 1.2)
  }

  // ── ÁMBAR ───────────────────────────────────────────────────────────────

  const AMBAR = Object.freeze({
    name: 'ambar',
    palette: Object.freeze({ edge: '#FFD27A', mid: '#F2A324', deep: '#8A4A0C', core: '#341805', eye: '#FFE0A0', halo: '#F59E0B', light: '#FFE7B3', accent: '#FFB347', sparkle: '#FFE7B3' })
  })
  const ambar = character(AMBAR)

  globalThis.AmbarKit = {
    figure, ambar, AMBAR, SHAPES, ALIASES,
    blinks, blinkAt, moods, dominant, gazeAt, smoothPath, arrive, trail, envelopeAt
  }
  globalThis.mascotaAmbar = ambar
})()
