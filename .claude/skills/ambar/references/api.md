# Runtime API

Scenes import from `/@ambar/runtime/ambar.js`. The local server publishes AMBAR at `/@ambar/`, so the same import works for any project folder.

## Composition

```js
import { video, cue } from '/@ambar/runtime/ambar.js'

video({
  format: 'landscape',                  // or 'post' | 'reel' | 'story' | 'square' | 'card'
  width: 1920, height: 1080, fps: 30,   // width/height override format; defaults shown
  duration,                             // seconds; default: narration end + tail
  tail: 1.6,
  async setup ({ stage, width, height, format, safe, cues, duration }) { /* build DOM once */ },
  render (t, { duration, cues, stage, safe }) { /* draw frame t; depends on t only */ }
})
```

The page must contain `<div id="stage">` (created if missing) and load `/@ambar/runtime/ambar.css`.

| Export | Does |
|---|---|
| `FORMATS` | `{ landscape: 1920×1080, post: 1080×1350, reel: 1080×1920, story: 1080×1920, square: 1080×1080, card: 1200×630 }` as `{ width, height }` |
| `safeArea(format)` | `{ top, right, bottom, left, zones: { title, content, captions } }` in px; also `ctx.safe`. A `{ width, height }` gets 5% insets |
| `formatOf(width, height)` | the format name of a size, or `'custom'`; also `ctx.format` |

The motion language (house rules, timings, which helper for what) is in `motion.md`.

## Time

| Function | Returns |
|---|---|
| `progress(t, a, d)` | 0 → 1 while t goes from a to a+d, clamped and linear; ease it yourself: `ease.out(progress(t, a, d))` |
| `span(t, a, b, fadeIn = .45, fadeOut = .45)` | visibility: in at a, out before b |
| `keys(t, [[time, ...values], …], easing = ease.inOut)` | eased values between keyframes |
| `count(t, a, d, from, to)` | animated number (`ease.outExpo`) |
| `stagger(start, i, step = .07)` | start of the i-th item |
| `clamp(x, a = 0, b = 1)`, `lerp(a, b, k)` | |
| `hash(seed)` | deterministic pseudo-random in [0, 1) |
| `seeded(seed)` | a seeded PRNG (mulberry32): `const rng = seeded(7); rng()` → same sequence every time; strings work as seeds |
| `noise1(t, seed = 0)` | smooth 1D value noise in [-1, 1], one new value per unit of t |
| `remap(t, [[tReal, tDesign], …])` | piecewise linear time remap (slow motion, speed ramps); normal speed outside the pairs |
| `ease.linear / in / out / inOut / outQuart / outExpo / inOutSine / settle` | all end at exactly 1; `settle` is a critically damped spring with no overshoot |
| `ease.outBack / spring` | legacy, they overshoot: never in new scenes (house style has no bounce) |

## Narration

`cue(id, fallbackStart, fallbackDuration)` → `{ start, duration, end }` of a line in `ambar.json`, after `ambar voice`. Fallbacks keep the scene usable before the voice exists.

## Text and DOM

| Function | Does |
|---|---|
| `$(sel)`, `$$(sel)` | querySelector, querySelectorAll as array |
| `css(el, styles)` | assigns inline styles |
| `words(el, 'Make it {count}')` | word spans; `{word}` gets `.hl` (amber) |
| `letters(el, text)` | letter spans |
| `rise(spans, t, a, b = ∞, step = .07, distance = 28, { duration = .6, blur = 8, exit = .4, exitStep = 0 })` | spans rise in one by one from a, leave before b |
| `fadeUp(el, t, a, b = ∞)` | element fades up at a, away before b |
| `revealLines(el, ['Line one', 'Line two'], t, a, step = .09, { duration = .6, until })` | mask reveal: each line slides up from 112% with a quartic ease-out; builds the masks once |
| `scramble(el, text, t, a, d = .8, glyphs)` | left-to-right decode; `scrambleText(text, t, a, d)` is the pure version |
| `type(el, text, t, a, rate = 28, { cursor, blink = .53 })` | typewriter; `cursor: true` (or a character) adds a caret that blinks when done; sets `textContent`, so plain text only |
| `formatNumber(n, { locale = 'es-CL', decimals = 0, prefix, suffix })` | `1234.5` → `'1.235'`; `{ decimals: 1 }` → `'1.234,5'` |
| `counter(t, a, d, from, to, { easing, ...formatNumber options })` | `count()` as formatted text |

CSS helpers in `ambar.css`: `.layer` (absolute, full stage), `.glass` (frosted amber card), `.grain`, `.hl`.

## Motion · `/@ambar/runtime/motion.js`

| Function | Does |
|---|---|
| `sim({ reset(rng), step(dt, state, rng), draw?(state, t), dt = 1/60, fps = 30, warmup = 0, seed })` | returns `at(t)`: a stateful simulation stepped at a fixed dt up to the frame for t; replays from reset when t goes back, so any frame renders the same in any order |
| `beats({ bpm, downbeat = 0, perBar = 4 })` | beat grid: `at(n)`, `bar(n)`, `index(t)`, `barIndex(t)`, `phase(t)`, `nearest(t)`, `pulse(t, decay = .12)` (exponential hit on each beat) |
| `acts(grid, [['intro', 2], ['body', 4]], startBar = 0)` | acts measured in bars → `{ intro: { start, end, from, to, bars } }` |
| `camera(t, keys, { width, height, clamp = true, fill = .8, root })` | keys `[time, scale, cx, cy]` or `[time, element or {x,y,w,h}, maxScale = 1.3]`; straight moves between final clamped framings → `{ scale, x, y, cx, cy, transform }` for a layer with the default transform-origin |
| `framing(key, options)` | one key's final framing `{ scale, x, y }` |
| `boxOf(el, root)` | layout box `{ x, y, w, h }` relative to root (the stage by default), unaffected by transforms |
| `breathe(t, amount = 1, { cover = true })` | slow push and drift for still shots → `{ scale, x, y, transform }`; never shows the edge |
| `punch(t, hits, strength = .05, { attack = .06, decay = .28 })` | impact zoom factor: rises fast, decays exponentially, never oscillates |
| `handheld(t, seed, amount = 1)` | noise drift `{ x, y, rotate, transform }` |
| `reversals(samples, eps)` | direction reversals per axis, for QA (numbers, arrays or objects) |
| `smoothPath(fn, t, { sigma = .22, span = .54, step = .09 })` | gaussian-averages a keyframed position (number, array or object) so moves start and stop like a fluid |

`remap`, `seeded` and `noise1` are re-exported here too.

## Effects · `/@ambar/runtime/fx.js`

Particles are pure functions of the index `i` and `t`: loop `i` over persistent SVG circles built once.

| Function | Does |
|---|---|
| `dust(i, t, { w, h, speed, seed, size })` | `{ x, y, r, alpha }` floating up, wrapping |
| `burst(i, t, { at, count, radius, seed, duration = .9, x, y })` | quint-out burst with fade |
| `confetti(i, t, { at, x, y, seed, speed, spread, gravity, life })` | ballistic flight with a flip → `{ x, y, rotate, flip, alpha, hue }` |
| `fountain(i, t, { from, to, x, y, … })` | continuous ballistic emission, same fields |
| `rings(t, at, { count = 3, gap, duration, radius })` | `[{ r, alpha, width }]` expanding rings |
| `trail(pathFn, t, n = 10, dt = .04, { radius, alpha, end, fade = .9 })` | delayed samples, shrinking and fading; fades out after `end` |
| `morph(from, to, t, a, d, seed, { arc, stagger })` | particles flying between point sets on quadratic Béziers → `[{ x, y, p }]` |
| `sample.polyline / line / circle / rect / grid / disc / text` | point sets `[[x, y], …]`; `text` uses a canvas (browser only) |
| `appear(el, t, a, { duration = .5, blur = 28, scale = 1.12, until })` | the approved "appear from nothing" |
| `scenes(t, [[el, start], …], fade = .5, { mode: 'over' \| 'through' })` | clean crossfades between scenes; `crossfade(t, at, d)` → `[out, in]` opacities |
| `lightSweep(overlay, t, cuts, { duration = 1, alpha })` | a skewed soft band crossing the frame on each cut, opacity sin(pπ) |
| `circleReveal(el, t, a, d = .65, { x, y })` | clip-path circle reveal |
| `flash(el, t, at, { width = .08, alpha = .6 })` | gaussian flash |
| `zoomThrough(el, t, a, b, { origin, scale = 5 })` | scale into a node and fade |
| `grain(el, t, { fps = 24 })` | moves a `.grain` layer to a hashed offset each frame |
| `motionBlur(el, vx, vy)` | directional SVG blur preset by speed in px per frame (filters injected once) |

## Charts · `/@ambar/runtime/charts.js`

Flat SVG in one accent hue (`color`, default amber). Each builds its shapes once inside the `<svg>` (keyed by `id`, rebuilt only if the data change) and moves attributes per frame. The drawing box is the svg's viewBox minus `pad`, or `x, y, width, height`.

| Function | Does |
|---|---|
| `line(svg, data, t, a, d = 1.2, { area, dot, min, max, strokeWidth })` | draws itself left to right with a faint area and a head dot |
| `sparkline(svg, data, t, a, d)` | thin line, no area |
| `bars(svg, data, t, a, d = .65, { stagger = .05, highlight: 'peak' \| i, label })` | staggered growth; the highlighted bar takes the accent and gets a label |
| `ring(svg, value, t, a, d = .65, { cx, cy, r, width, comet })` | progress ring by dash offset, optional dot riding the head |
| `heat(svg, rows, t, a, d = 1, { gap, radius })` | cells (0..1) fill diagonally from the top left |
| `scalePoints`, `pathOf`, `lengthOf`, `pointAt` | pure geometry helpers |

## Captions · `/@ambar/runtime/captions.js`

| Function | Does |
|---|---|
| `planCaptions(cues, { maxChars = 36, maxLines = 2, breakAt = .45, lead = .15, fade = .2 })` | blocks of ≤ 2 lines from cues with `words: [[word, start, end], …]` (or plain text spread over the cue), breaking at punctuation once 45% full |
| `captions(el, t, plan, { figure(speaker, t), colors, names })` | draws the active block as a pill with an optional speaker figure and name; words go 0.3 → 1 as spoken |
| `activeCaption(plan, t)`, `captionOpacity(block, t)`, `wordOpacity(word, t)` | the pure parts |
| `loadEnvelope(url = 'voice/envelope.json')` | `{ fps, lines: { id: [values] } }`, or null if missing |
| `talk(t, envelope, cues, speaker?)` | smoothed loudness 0..1 at t (7-tap triangular window, ×0.9), only during that speaker's lines; feed it to the mascot's `habla` |

## ÁMBAR

`mascot()` is exported by `runtime/ambar.js`, and it draws with the script in `/@ambar/mascot/ambar.js`, so a scene needs both: the `<script src="/@ambar/mascot/ambar.js"></script>` tag before the module, and `import { mascot } from '/@ambar/runtime/ambar.js'`. Draw into an SVG group every frame:

```js
$('#m').innerHTML = mascot({
  x: 960, y: 540, R: 160, t,
  expr: 'feliz',          // normal | feliz | pensativa | sorprendida | enojada | triste | dormida
  pesos: { feliz: .6, sorprendida: .4 },   // optional blend instead of expr
  mira: [1, 0],           // gaze; exaggerate to about ±2.4 so it reads (gazeAt does it)
  habla: AmbarKit.envelopeAt(t, envelope, 'intro', intro.start),   // voice level while a line plays, 0..1.2
  parpadeo: 0..1,         // blink
  chispas: 0..1,          // sparkles
  op: 1                   // opacity
})
```

```html
<svg id="mascot" viewBox="0 0 1920 1080"><g id="m"></g></svg>
```

Every option has an English name too: `expression`, `weights`, `gaze`, `talk`, `blink`, `sparkle`, `stretch`, `velocity`, `opacity`. Drive `talk` with the voice envelope, never with a sine; the house rules and the rest of the options (`turn`, `halo: false`, `sad`…) are in `mascots.md`.

The same script defines `window.AmbarKit`: `ambar.figure()` draws a small ÁMBAR for a caption, and pure helpers drive it from time: `blinks`/`blinkAt`, `moods`/`dominant`, `gazeAt`, `smoothPath`, `arrive`, `trail`, `envelopeAt`. See `mascots.md`.

## Screencasts

`/@ambar/runtime/screen.js` + `/@ambar/runtime/screen.css`. See `tutorial.md`.

```js
const sc = screencast(stage, await loadShots(), { device: 'laptop' | 'browser' | 'phone' | 'none', width: 1180, url: 'app.example.com' })
sc.root                                  // position it with css()
sc.images                                // { shotName: <img> }, await img.decode() in setup
sc.show(t, [[time, 'shot'], …], fade = .35)
sc.camera(t, [[time, zoom, target], …])  // target: 'shot.box' or [x, y] in app px
sc.cursor(t, [[time, target], …], clickTimes)
sc.type(t, { box, text, at, rate = 16, until, mask })
sc.clear()                               // call once per frame before spotlights
sc.spotlight(t, { box, from, to, pad = 10, radius = 14 })
sc.callout(t, { box, text, from, to, side: 'right' | 'left' | 'top' | 'bottom' })
```

## ambar.json

```json
{
  "title": "…",
  "voice": { "provider": "say", "name": "Samantha", "speed": 1 },
  "lead": 0.8, "gap": 0.55, "tail": 1.6,
  "lines": [{ "id": "intro", "text": "…", "pause": 0.4, "at": 12 }],
  "music": { "file": "music.mp3", "gain": 0.6, "start": 0, "fadeIn": 1.2, "fadeOut": 2.5 },
  "duck": 0.55,
  "sfx": [{ "type": "whoosh", "at": "intro-0.3", "gain": 0.15 }],
  "output": "out/{name}.mp4"
}
```

- `pause` adds silence before a line; `at` pins it to an absolute time.
- `sfx.at` takes seconds or a cue expression: `intro`, `intro+0.5`, `intro.end-0.2`.
- Effects: `whoosh` (`from`, `to`, `duration`), `tap` (`pitch`), `tick` (`pitch`, `duration`), `impact`, `riser`; all take `gain`, `repeat`, `every`.
- Gemini key: `AMBAR_GEMINI_API_KEY`, or on macOS the Keychain item `ambar-gemini` (`security add-generic-password -a "$USER" -s ambar-gemini -w`, run by the user in their own terminal). Never ask the user to paste a key into the chat.
- Voices: `say` (macOS, offline; English `Samantha`, Spanish `Paulina` or `Mónica`) and `gemini` (needs `AMBAR_GEMINI_API_KEY` in the environment).
