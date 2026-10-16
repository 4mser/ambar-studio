# The mascot

ÁMBAR is a translucent gel body with two capsule eyes. `/@ambar/mascot/ambar.js` draws it. ÁMBAR is the only mascot in AMBAR: do not invent other characters or recolour it into new ones.

```html
<script src="/@ambar/mascot/ambar.js"></script>   <!-- defines window.AmbarKit and window.mascotaAmbar -->
<svg class="cast" viewBox="0 0 1920 1080"><g id="cast"></g></svg>
```

```js
const { ambar, blinks, blinkAt, moods, dominant, gazeAt, arrive, trail, envelopeAt } = window.AmbarKit
$('#cast').innerHTML = ambar({ x: 960, y: 540, R: 140, t, expression: 'feliz' })
```

`mascot(options)` from the runtime is the same as `ambar(options)`. Every draw returns an SVG string for one frame; write it into a `<g>` every frame. Identical options give an identical string (ids are named after the content), so frames are deterministic.

## Rules

These come from production.

- **One material.** The colour darkens with depth toward the centre (the gradient does it). Never a black ball with a coloured rim, never a second fill on top.
- **One colour identity.** Never recolour ÁMBAR. Sadness tints toward blue by at most ×0.18 (the kit caps it), so ÁMBAR still reads as itself.
- **Limbs are silhouette lobes**, only during an action, never sticks or tubes.
- **Expressions are silhouettes** blended over about 0.55 s with weights. The kit sums weighted lobes; never average angles. Use `moods()` for the weights.
- **Negative states stay endearing.** Sad is blue-ish with a tear, angry gets a little steam. No harsh faces.
- **Talking follows the real voice.** Pass the voice envelope as `talk`: the interior brightens, three waves travel the rim and a small bulge swells as the mouth. Never `Math.sin(t * 15)`, never a whole-body tremble or a size pulse.
- **Exaggerate gaze ×2.4** or it does not read at video size (`gazeAt` does it). Look to camera about 0.9 s before speaking; whoever listens looks at the speaker.
- **Not everything moves at once**: let one thing move while the rest holds.
- **Give the halo room.** It reaches 2.2 R; leave about 2.3 R to the edge of the SVG, or pass `halo: false`, or it gets clipped square.
- **No bounce.** Motion is critically damped: `ease.out`, `ease.inOut`, or `1 - e^(-7k)(1 + 7k)`. Never `ease.outBack` or `ease.spring` on a mascot.

## Draw options

Spanish and English names are the same option.

| Option | Alias | Meaning |
|---|---|---|
| `x`, `y`, `R`, `t` | | centre, radius (px) and time (s). `R < 1` draws nothing |
| `expression` | `expr` | `normal`, `feliz`/`happy`, `pensativa`/`thinking`, `sorprendida`/`surprised`, `enojada`/`angry`, `triste`/`sad`, `dormida`/`sleepy`, `gota`/`drop` (flying) |
| `weights` | `pesos` | `{ normal: .4, feliz: .6 }` blends silhouettes; the eyes follow `expression`, or the largest weight if `expression` is missing |
| `gaze` | `mira` | `[dx, dy]`, about -2.4..2.4 after exaggeration |
| `blink` | `parpadeo` | 0..1 |
| `talk` | `habla` | 0..1.2, the voice level |
| `sparkle` | `chispas` | 0..1 |
| `stretch` | `estira` | squash and stretch from the floor, small values |
| `velocity` | `vel` | `[vx, vy]` px/s; a tail grows opposite the motion |
| `opacity` | `op` | 0..1 |
| `red` | `rojo` | 0..1, angry tint |
| `sad` | `triste` | 0..1, blue tint (×0.18); a `triste` weight adds it on its own |
| `turn` | `giro` | `[yaw, pitch]` in radians: the eyes slide around a sphere, narrow, and hide past the side |
| `halo` | `sinHalo: true` | `false` removes the halo (light backgrounds, small sizes) |
| `shadow` | | `false` removes the floor shadow |
| `eyes` | `sinOjos: true` | `false` hides the eyes |

`draw.outline(options)` returns the 72 outline points (tests, layout). `draw.figure(options)` returns a standalone `<svg>` (see Figures). `draw.prefix` is the id prefix and `draw.expressions` the expressions.

## Motion helpers

All pure: the same `t` gives the same result.

```js
// setup
const schedule = blinks(1, duration)                    // seed
const envelope = await (await fetch('voice/envelope.json')).json()

// render(t)
const line = cue('hello', 1, 3)
const weights = moods(t, [[0, 'normal'], [line.start - 0.3, 'feliz'], [line.end + 0.4, 'normal']])
const gaze = gazeAt(t, [[0, 0.8, 0], [line.start - 0.9, 0.8, 0], [line.start - 0.55, 0, 0]])   // to camera 0.9 s before
const path = (u) => arrive(u, [-200, 700], [480, 640], 0.3, 1.5)
const p = path(t)
$('#trail').innerHTML = trail(path, t, { from: 0.3, to: 1.8, color: '#FFE7B3' })
$('#cast').innerHTML = ambar({
  x: p.x, y: p.y, R: 100, t, velocity: p.velocity,
  weights, expression: dominant(weights), gaze, turn: [gaze[0] * 0.12, 0],
  blink: blinkAt(t, schedule), talk: envelopeAt(t, envelope, 'hello', line.start)
})
```

| Helper | Returns |
|---|---|
| `blinks(seed, duration)` | blink times: one every 2.1–3.7 s, sometimes a double (+0.22 s) |
| `blinkAt(t, schedule)` | 0..1; each blink closes and opens in 0.13 s |
| `moods(t, [[time, expression], …], fade = .55)` | weights that add up to 1 and cross-fade without jumps, even when a mood interrupts another |
| `dominant(weights)` | the expression with the largest weight |
| `gazeAt(t, [[time, dx, dy], …], { exaggerate = 2.4 })` | gaze eased along straight lines between keys, exaggerated; repeat a key to hold |
| `smoothPath(posFn, t)` | `posFn` averaged with a gaussian (σ 0.22 s over ±0.54 s): starts and stops like a fluid |
| `arrive(t, from, to, a, d = 1.2)` | `{ x, y, velocity, k }`: an eased, smoothed straight arrival; pass `velocity` to the draw |
| `trail(posFn, t, { from, to, count = 10, life = .9, color })` | `posFn` returns `[x, y]` or `{ x, y }`; SVG dots left along a path while it moves, fading in `life` s: arrivals and departures |
| `envelopeAt(t, envelope, id, start)` | the voice level of line `id` at t, smoothed over ±3 frames, 0 outside the line |

### Voice envelope

`voice/envelope.json` holds one level per frame for every line, loud speech around 1:

```json
{ "fps": 30, "lines": { "hello": [0, 0.42, 0.88, 1.02, 0.7, 0.1, 0] } }
```

Compute it from the line WAVs that `ambar voice` writes: the RMS of each 1/30 s window, divided by the 95th percentile over all lines, capped at 1.2, rounded to two decimals. Commit it next to `timings.json`.

## Figures

`draw.figure({ R: 28, t, expression, blink, talk })` returns a small standalone `<svg>` without halo or shadow, sized to fit ÁMBAR: put the speaker in a caption pill.

```js
$('#figure').innerHTML = ambar.figure({ R: 26, t, expression: 'feliz', talk })
```

## Layout

- A body reaches about 1.25 R from its centre; surprise lines reach 1.5 R up; the halo 2.2 R.
- In a 1080×1350 post use R 90–140. In 1920×1080 keep the mascot to one side of the content.
- Text never sits on a mascot. Captions go below, in a pill.
