<p align="center">
  <img src="docs/assets/hero.gif" width="100%" alt="ÁMBAR, an amber gel mascot, next to the AMBAR title and a timeline playhead">
</p>

<p align="center">
  <b>Video</b> &nbsp;·&nbsp; <b>Slides</b> &nbsp;·&nbsp; <b>Documents</b> &nbsp;·&nbsp; from HTML
  <br><br>
  <a href="README.es.md">Leer en español</a>
</p>

AMBAR Studio turns web pages into finished media. You write a scene in HTML, CSS and JavaScript; AMBAR renders it frame by frame in headless Chrome and encodes it with ffmpeg, with narration, music and sound effects mixed in. The same pages become slide decks and print-ready documents.

It rests on one rule: **every frame is a function of time.** A scene exposes `render(t)` and depends on nothing else, so any moment can be rendered exactly the same, in any order, as many times as you want. That's what makes the output repeatable, reviewable in git, and easy to change after a copy edit.

Everything in this README was rendered by AMBAR itself.

### `// 01` What you get

| | |
|---|---|
| **Deterministic video** | `render(t)` stepped by Chrome and piped to ffmpeg. 1080p at 30 fps by default, any size or frame rate you set. |
| **Narration that drives the timeline** | Each line of narration is a cue. Scenes hang from cues, so editing a line moves its scene with it. |
| **A real mix** | Voice on its cues, music that ducks under the voice, and synthesized sound effects. No samples, no licenses. |
| **A studio** | A timeline in the browser with cue markers, frame stepping, safe areas and the mix in sync. |
| **Slides and documents** | Decks with a browser presenter and a PDF per deck; A4 documents exported print-exact. |
| **ÁMBAR** | The mascot, drawn as SVG on every frame, with expressions, gaze, blinking and sparkles. |

### `// 02` Quick start

Requires Node 20+ and `ffmpeg` (`brew install ffmpeg` on macOS).

```bash
git clone https://github.com/4mser/ambar-studio.git
cd ambar-studio
npm install
npm link                      # makes the `ambar` command available

ambar studio examples/launch  # open the launch video in the studio
ambar render examples/launch  # → examples/launch/out/launch.mp4
```

Start your own:

```bash
ambar new my-video            # or: ambar new my-deck --deck · ambar new my-doc --doc
ambar studio my-video
```

### `// 03` A scene

A composition is a folder with an `index.html`. This is the whole contract:

```html
<link rel="stylesheet" href="/@ambar/runtime/ambar.css">
<div id="stage"><h1 id="title"></h1></div>

<script type="module">
  import { video, cue, words, rise } from '/@ambar/runtime/ambar.js'

  let title

  video({
    setup () {
      title = words(document.getElementById('title'), 'Hello, {world}.')
    },
    render (t) {
      rise(title, t, cue('hello', 0.8).start)   // words rise in when the narration says "hello"
    }
  })
</script>
```

The runtime ships the pieces that make motion feel right: easings (`out`, `inOut`, `outBack`, `spring`, …), `span` for things that ease in, hold and ease out, `keys` for keyframes, `rise` and `fadeUp` for text, `type` for typing, `count` for numbers and `hash` for deterministic particles.

<p align="center">
  <img src="docs/assets/launch-scenes.png" width="100%" alt="Four scenes of the launch video: the AMBAR title, code typing itself, three feature cards and three output formats">
</p>

### `// 04` Narration and sound

`ambar.json` sits next to the scene. Lines become cues, and effects can be placed in seconds or relative to a cue:

```json
{
  "voice": { "provider": "say", "name": "Samantha" },
  "lines": [
    { "id": "hello", "text": "Meet Ambar." },
    { "id": "time",  "text": "Every frame is a pure function of time.", "pause": 1.4 }
  ],
  "music": { "file": "music.mp3", "gain": 0.6 },
  "sfx": [
    { "type": "impact", "at": 0.35, "gain": 0.45 },
    { "type": "whoosh", "at": "time-0.5", "gain": 0.14 },
    { "type": "tap",    "at": "time+0.6", "repeat": 12, "every": 0.11 }
  ]
}
```

| Voice provider | Notes |
|---|---|
| `say` | macOS voices, offline, no key. Good for drafts. |
| `gemini` | Gemini text-to-speech. Reads `AMBAR_GEMINI_API_KEY` and nothing else. |

Recordings are cached by text and voice, so only changed lines are recorded again. Effects are `whoosh`, `tap`, `tick`, `impact` and `riser`, synthesized from noise and sine waves with a fixed seed: the same config always sounds the same. The final mix is loudness-normalized to −16 LUFS.

### `// 05` The studio

`ambar studio <project>` opens the composition in a local studio: scrub the timeline, step frame by frame, jump to any narration cue, toggle safe areas and play the mix in sync.

<p align="center">
  <img src="docs/assets/studio.png" width="100%" alt="AMBAR Studio with the launch video, safe areas on and five narration cues on the timeline">
</p>

### `// 06` Slides and documents

Every `<section class="slide">` is a slide. Open the HTML to present it (arrows, space, `F` for fullscreen), or export it:

```bash
ambar slides examples/deck/deck.html   # → out/deck.pdf + one PNG per slide
ambar doc examples/report/report.html  # → out/report.pdf (A4)
```

<p align="center">
  <img src="docs/assets/deck.png" width="100%" alt="Six slides of the sample deck in amber tones">
</p>

<p align="center">
  <img src="docs/assets/report.png" width="78%" alt="Two A4 pages of the sample report: a dark cover with ÁMBAR and a light page with a commands table">
</p>

### `// 07` Commands

| Command | What it does |
|---|---|
| `ambar studio <project>` | Timeline studio in the browser |
| `ambar render <project>` | Narration, mix, frames and encode → `out/<name>.mp4` |
| `ambar render <project> --frames 0,1.5,3` | PNG stills at those seconds |
| `ambar render <project> --gif out.gif` | A looping GIF (`--from`, `--to`, `--gif-fps`, `--width`) |
| `ambar voice <project>` | Records the narration and writes the cues |
| `ambar mix <project>` | Narration, music and effects → `out/mix.wav` |
| `ambar slides <deck.html>` | PDF and PNGs of a deck |
| `ambar doc <doc.html>` | A4 PDF of a document |
| `ambar new <dir>` | A new video, `--deck` or `--doc` from a template |

### `// 08` How it works

```
bin/ambar.js            CLI
src/commands/           studio · render · voice · mix · slides · doc · new
src/lib/                local server, headless Chrome, ffmpeg, timeline, synthesized effects, WAV
runtime/                what scenes import: ambar.js (time, easing, text) · slides · doc styles
studio/                 the timeline studio
mascot/ambar.js         ÁMBAR, an SVG per frame
examples/               launch video · hero · deck · report
```

A local server publishes the project at `/` and AMBAR at `/@ambar/`, so a scene imports the runtime the same way wherever it lives. `ambar render` records the narration, opens the scene in headless Chrome, calls `render(f / fps)` for every frame, streams the screenshots into ffmpeg (H.264, CRF 17), mixes the audio and muxes both.

Measured on an Apple M5 Pro: the 24-second 1080p launch video, with five narration lines and twelve effects, renders in 28.7 seconds.

### `// 09` ÁMBAR

ÁMBAR is the mascot: amber gel with a dark honey core and capsule eyes. `mascot()` draws it as SVG for the current frame, so it moves with the scene and renders like everything else.

```js
mascot({ x: 960, y: 520, R: 180, t, expr: 'feliz', mira: [0.4, 0], chispas: 0.8 })
```

Expressions: `normal`, `feliz`, `pensativa`, `sorprendida`, `enojada`, `triste`, `dormida`, or a blend of them with `pesos`.

### `// 10` Development

```bash
npm test                # runtime math, timeline, effects and WAV
npm run readme-assets   # re-renders every image in this README
```
