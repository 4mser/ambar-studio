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
| **Product tutorials** | Captures of a real app with private data blurred, then camera, cursor, typing and callouts pointed at elements by name. |
| **Made for Claude** | A Claude Code skill, an agent and a self-review command, so an AI can make a piece end to end and check it. |
| **ÁMBAR** | The mascot, drawn as SVG on every frame, with expressions, gaze, blinking and sparkles. |

### `// 02` Made for Claude

AMBAR is built to be driven by an AI agent. The repo ships a Claude Code skill and an agent that know the workflow and the house rules, and a check command that lets the agent review its own work before it says it is done.

```bash
ambar skill    # links the skill and the agent into ~/.claude
```

Then ask Claude Code for what you need, from any folder: *"a 30-second launch video for this feature"*, *"a tutorial of the sign-up flow on staging"*, *"a 10-slide deck from this report"*.

| Piece | What it does |
|---|---|
| **`ambar` skill** | The workflow (brief → plan → build → voice → check → render) and the rules: timing from narration, safe areas and minimum sizes, plain writing without hype, nothing invented, private data blurred, never capturing production. One reference per format. |
| **`AMBAR.md` brief** | Each project's own rules: audience, goal, language, voice, tone, brand, words to use and avoid, sources, what to blur. `ambar new` creates it; the skill reads it before anything else and follows it over the defaults. |
| **`ambar check`** | The machine review: page errors and missing files, text off the frame, clipped or overlapping, text too small to read, content too small or bunched at one edge, cues without narration, and whether `render(t)` depends on `t` alone. Writes a contact sheet the agent then looks at. `--json` for agents. |
| **`ambar-producer` agent** | Produces a whole piece from a brief, end to end. One per piece to make several in parallel. |

<p align="center">
  <img src="docs/assets/check.png" width="100%" alt="Contact sheet written by ambar check for the Harbor tutorial: six sampled frames with their times">
</p>

### `// 03` Quick start

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

### `// 04` A scene

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

### `// 05` Narration and sound

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

### `// 06` The studio

`ambar studio <project>` opens the composition in a local studio: scrub the timeline, step frame by frame, jump to any narration cue, toggle safe areas and play the mix in sync.

<p align="center">
  <img src="docs/assets/studio.png" width="100%" alt="AMBAR Studio with the launch video, safe areas on and five narration cues on the timeline">
</p>

### `// 07` Tutorials over real apps

`ambar capture` walks through a web app with headless Chrome, following the steps in `capture.json`, and saves a screenshot per step plus the position of every element you name. Anything matching `redact` is blurred in the browser before the screenshot, so private data never reaches a PNG.

```json
{
  "url": "app/index.html",
  "redact": ["[data-private]"],
  "shots": [
    { "name": "login", "boxes": { "email": "#email", "signin": "#signin" } },
    { "name": "board", "actions": [{ "type": "#email", "text": "alex@harbor.example" }, { "click": "#signin" }, { "waitFor": "#list" }],
      "boxes": { "list": "#list", "user": "[data-private]" } }
  ]
}
```

`runtime/screen.js` turns those captures into a screencast inside a laptop, browser or phone frame. Camera, cursor, typing, spotlights and callouts are functions of time like everything else, and they point at elements by name (`'login.email'`), not by pixel.

```js
const sc = screencast(stage, await loadShots(), { device: 'laptop' })
sc.show(t, [[0, 'login'], [signin.start + 4.6, 'board']])
sc.camera(t, [[signin.start, 1, [720, 450]], [signin.start + 0.6, 1.55, 'login.card']])
sc.cursor(t, [[signin.start + 0.85, 'login.email'], [signin.start + 4.35, 'login.signin']], clicks)
sc.type(t, { box: 'login.email', text: 'alex@harbor.example', at: signin.start + 1.1 })
sc.callout(t, { box: 'board.user', text: 'Private data is blurred', from: board.start + 3.2 })
```

<p align="center">
  <img src="docs/assets/tutorial.png" width="100%" alt="Four moments of the Harbor tutorial: typing the email, the board with the blurred address, the new task dialog and the saved task">
</p>

### `// 08` Slides and documents

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

### `// 09` Commands

| Command | What it does |
|---|---|
| `ambar studio <project>` | Timeline studio in the browser |
| `ambar render <project>` | Narration, mix, frames and encode → `out/<name>.mp4` |
| `ambar render <project> --frames 0,1.5,3` | PNG stills at those seconds |
| `ambar render <project> --gif out.gif` | A looping GIF (`--from`, `--to`, `--gif-fps`, `--width`) |
| `ambar voice <project>` | Records the narration and writes the cues |
| `ambar mix <project>` | Narration, music and effects → `out/mix.wav` |
| `ambar capture <project>` | Screenshots and element boxes of an app, from `capture.json` |
| `ambar check <target>` | Machine review and contact sheet (`--json`, `--at`) → `out/check/` |
| `ambar slides <deck.html>` | PDF and PNGs of a deck |
| `ambar doc <doc.html>` | A4 PDF of a document |
| `ambar new <dir>` | A new video, `--deck` or `--doc` from a template |
| `ambar skill` | Links the Claude Code skill and agent into `~/.claude` (`--remove`) |

### `// 10` How it works

```
bin/ambar.js            CLI
src/commands/           studio · render · voice · mix · capture · check · slides · doc · new · skill
src/lib/                local server, headless Chrome, ffmpeg, timeline, synthesized effects, WAV
runtime/                what scenes import: ambar.js (time, easing, text) · screen.js (screencasts) · slides · doc styles
studio/                 the timeline studio
mascot/ambar.js         ÁMBAR, an SVG per frame
.claude/               the ambar skill (SKILL.md + references) and the ambar-producer agent
examples/               launch video · hero · tutorial · deck · report
```

A local server publishes the project at `/` and AMBAR at `/@ambar/`, so a scene imports the runtime the same way wherever it lives. `ambar render` records the narration, opens the scene in headless Chrome, calls `render(f / fps)` for every frame, streams the screenshots into ffmpeg (H.264, CRF 17), mixes the audio and muxes both.

Measured on an Apple M5 Pro: the 24-second 1080p launch video, with five narration lines and twelve effects, renders in 28.7 seconds.

### `// 11` ÁMBAR

ÁMBAR is the mascot: amber gel with a dark honey core and capsule eyes. `mascot()` draws it as SVG for the current frame, so it moves with the scene and renders like everything else.

```js
mascot({ x: 960, y: 520, R: 180, t, expr: 'feliz', mira: [0.4, 0], chispas: 0.8 })
```

Expressions: `normal`, `feliz`, `pensativa`, `sorprendida`, `enojada`, `triste`, `dormida`, or a blend of them with `pesos`.

### `// 12` Development

```bash
npm test                # runtime math, timeline, effects, WAV, capture, check and skill
npm run readme-assets   # re-renders every image in this README
```
