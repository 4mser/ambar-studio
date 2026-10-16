# Runtime API

Scenes import from `/@ambar/runtime/ambar.js`. The local server publishes AMBAR at `/@ambar/`, so the same import works for any project folder.

## Composition

```js
import { video, cue } from '/@ambar/runtime/ambar.js'

video({
  width: 1920, height: 1080, fps: 30,   // defaults
  duration,                             // seconds; default: narration end + tail
  tail: 1.6,
  async setup ({ stage, width, height, cues, duration }) { /* build DOM once */ },
  render (t, { duration, cues, stage }) { /* draw frame t; depends on t only */ }
})
```

The page must contain `<div id="stage">` (created if missing) and load `/@ambar/runtime/ambar.css`.

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
| `ease.linear / in / out / inOut / outExpo / inOutSine / outBack / spring` | |

## Narration

`cue(id, fallbackStart, fallbackDuration)` → `{ start, duration, end }` of a line in `ambar.json`, after `ambar voice`. Fallbacks keep the scene usable before the voice exists.

## Text and DOM

| Function | Does |
|---|---|
| `$(sel)`, `$$(sel)` | querySelector, querySelectorAll as array |
| `css(el, styles)` | assigns inline styles |
| `words(el, 'Make it {count}')` | word spans; `{word}` gets `.hl` (amber) |
| `letters(el, text)` | letter spans |
| `rise(spans, t, a, b = ∞)` | spans rise in one by one from a, leave before b |
| `fadeUp(el, t, a, b = ∞)` | element fades up at a, away before b |
| `type(el, text, t, a, rate = 28)` | typewriter; sets `textContent`, so plain text only (style the element, not the string) |

CSS helpers in `ambar.css`: `.layer` (absolute, full stage), `.glass` (frosted amber card), `.grain`, `.hl`.

## ÁMBAR

`mascot()` is exported by `runtime/ambar.js`, and it draws with the script in `/@ambar/mascot/ambar.js`, so a scene needs both: the `<script src="/@ambar/mascot/ambar.js"></script>` tag before the module, and `import { mascot } from '/@ambar/runtime/ambar.js'`. Draw into an SVG group every frame:

```js
$('#m').innerHTML = mascot({
  x: 960, y: 540, R: 160, t,
  expr: 'feliz',          // normal | feliz | pensativa | sorprendida | enojada | triste | dormida
  pesos: { feliz: .6, sorprendida: .4 },   // optional blend instead of expr
  mira: [0.4, 0],         // gaze, -1..1
  habla: 0.5 + 0.5 * Math.sin(t * 17),     // mouth while a line plays
  parpadeo: 0..1,         // blink
  chispas: 0..1,          // sparkles
  op: 1                   // opacity
})
```

```html
<svg id="mascot" viewBox="0 0 1920 1080"><g id="m"></g></svg>
```

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
- Voices: `say` (macOS, offline; English `Samantha`, Spanish `Paulina` or `Mónica`) and `gemini` (needs `AMBAR_GEMINI_API_KEY` in the environment).
