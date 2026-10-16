# Motion

The motion language of AMBAR, distilled from about seventy finished pieces, and which helper to reach for. The rules are not taste notes: they are what makes a piece read as calm and expensive instead of busy. Exports are listed in `api.md`; `examples/motion` uses most of them in one 4:5 post.

```js
import { ease, revealLines, scramble, counter } from '/@ambar/runtime/ambar.js'
import { camera, breathe, punch, smoothPath, sim, beats } from '/@ambar/runtime/motion.js'
import { appear, scenes, lightSweep, morph, sample, dust } from '/@ambar/runtime/fx.js'
import { line, bars, ring } from '/@ambar/runtime/charts.js'
import { planCaptions, captions, talk, loadEnvelope } from '/@ambar/runtime/captions.js'
```

## House rules

- **No bounce.** No overshoot, no spring wobble, no elastic. `ease.outBack` and `ease.spring` exist only for old scenes; never use them. Use `ease.out` (cubic) for entrances, `ease.inOut` between keys, `ease.outQuart` for mask reveals, `ease.settle` when something should arrive fast and then rest.
- **Timings.** Entrances 200–260 ms with `ease.out`. Stagger 40–60 ms between items (never more than 60). Fills (bars, rings, lines, counters) about 650 ms. Exits shorter than entrances and quieter.
- **Few things at once.** One focal move per moment. If two things move, one of them is small.
- **Camera: one move per shot.** Between two cuts the camera does one thing: push in, pull out or pan. Moves are straight lines between final framings, with zero direction reversals on any axis. Zoom stays at 1.3 or less, and only when the narration names the detail.
- **Transitions: clean crossfades.** No blur, zoom or spin between scenes. The one approved effect is `appear()`: blur 28 → 0 with scale 1.12 → 1, "appear from nothing", for a single hero element.
- **No gradient text.** Color highlights a word; gradients do not.
- **Build once, move per frame.** SVG and DOM are created in `setup` (or on the first call, as the helpers do) and only attributes and styles change in `render(t)`. Never rebuild a chart or a particle field every frame.
- **Seeded randomness only.** `hash(seed)`, `seeded(seed)` and `noise1(t, seed)`. Never `Math.random`.

## Which helper for what

| You want | Use | Notes |
|---|---|---|
| A title to come in | `revealLines(el, lines, t, a)` | mask reveal, quartic out, 90 ms between lines |
| Words to come in | `rise(spans, t, a, b, .05, 28, { duration: .26 })` | from `words()` |
| A label that decodes | `scramble(el, text, t, a, d)` | kickers, codes, ids; not for sentences |
| Typing with a caret | `type(el, text, t, a, rate, { cursor: true })` | |
| A number that counts | `counter(t, a, .65, from, to, { prefix, suffix, decimals })` | es-CL formatting by default |
| A hero element to appear | `appear(el, t, a)` | the one approved blur entrance |
| Scenes to replace each other | `scenes(t, [[el, start], …], .5, { mode })` | `over` for opaque scenes, `through` for transparent layers |
| A cut to feel bright | `lightSweep(overlay, t, cuts)` | keep `alpha` low (0.15–0.25) |
| A reveal from a point | `circleReveal(el, t, a, .65, { x, y })` | |
| A moment of impact | `punch(t, hits, .04)` + `flash(el, t, at)` | decays, never rings; once per piece |
| Going into a node | `zoomThrough(el, t, a, b, { origin })` | ends the scene |
| A still shot to stay alive | `breathe(t, amount)` on the background | never on text |
| A camera move | `camera(t, keys, { width, height, root })` | see below |
| A move that starts like a fluid | `smoothPath(fn, t)` | wraps any keyframed position |
| Footage-like drift | `handheld(t, seed, amount)` | sparingly; a layer zoomed ≥ 1.02 |
| Air in the light | `dust(i, t, { w, h, seed })` | 15–30 particles, faint |
| A burst, rings, confetti | `burst`, `rings`, `confetti`, `fountain` | celebrations only |
| A trail behind a moving dot | `trail(pathFn, t, 10, .04, { end })` | exits: about 10 faint dots fading in 0.9 s |
| Particles into a new shape | `morph(from, to, t, a, d, seed)` with `sample.*` | the approved "fly to the new shape" |
| Physics or growth | `sim({ reset, step, draw })` | replays itself, any frame in any order |
| Cutting to music | `beats({ bpm, downbeat })`, `acts(grid, …)` | `pulse(t)` for hits |
| Slow motion or a speed ramp | `remap(t, [[real, design], …])` | |
| Charts | `line`, `bars`, `ring`, `sparkline`, `heat` | flat, one accent hue |
| Subtitles | `planCaptions(cues)` + `captions(el, t, plan)` | words light up as spoken |
| A mouth that talks | `talk(t, envelope, cues, speaker)` | `loadEnvelope()` in setup |

## Camera

```js
const shot = camera(t, [
  [push.start, 1, 960, 540],              // [time, scale, cx, cy]: the whole frame
  [push.start + 2.4, $('#total'), 1.25]   // [time, element or {x,y,w,h}, maxScale]: fit the detail
], { width: 1920, height: 1080 })
css($('#world'), { transform: shot.transform })   // #world: a full-stage layer, default transform-origin
```

- Every key is first converted to its final framing, clamped so the edge of the layer never shows (scale ≥ 1). The camera then moves in a straight line between neighbouring framings with `ease.inOut`. That is why a move between two keys never reverses and never reveals the edge mid-way.
- Hold a framing by repeating it: `[a, …], [b, same…]`. One move per pair of keys, and one move per shot.
- When the camera moves a sub-layer (a window, a card), pass its size as `width`/`height` and the layer as `root` so element keys are measured inside it.
- QA: sample a move and run `reversals(samples.map((s) => [s.scale, s.x, s.y]))`; every axis should be 0.

## Captions

`voice/timings.json` cues can carry `words: [[word, start, end], …]` in absolute seconds and an optional `speaker`. Without words, the cue's text is spread over the cue by length.

```js
setup ({ cues }) { S.plan = planCaptions(cues, { maxChars: 36 }) }   // 36 for 4:5, ~42 for 16:9
render (t, { safe }) {
  css($('#caps'), { top: `${safe.zones.captions.top}px`, height: `${safe.zones.captions.bottom - safe.zones.captions.top}px` })
  captions($('#caps'), t, S.plan, { figure: (speaker, t) => svgOrNull, colors: { ambar: '#f2a324' } })
}
```

Blocks hold at most two lines; a block more than 45% full ends at punctuation. A block appears 0.15 s before its first word and fades 0.2 s; blocks that nearly touch swap text without fading. Each word goes from 0.3 to 1 opacity over 0.1 s when spoken.

## Formats

`video({ format: 'post' })` sets the size; `ctx.safe` holds the insets and zones. Lay titles, content and captions in `safe.zones.title`, `safe.zones.content` and `safe.zones.captions`.

| Format | Size | Keep free / zones |
|---|---|---|
| `landscape` | 1920×1080 | 54 px top and bottom, 96 px sides |
| `post` | 1080×1350 | title at y ≈ 200, content 400–1150, captions at y ≈ 1280 |
| `reel` | 1080×1920 | titles from y ≈ 270, nothing important below 1700 |
| `story` | 1080×1920 | top 250 px and bottom 400 px free |
| `square` | 1080×1080 | 60 px all round |
| `card` | 1200×630 | 40 px top and bottom, 60 px sides |
