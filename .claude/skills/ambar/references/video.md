# Videos

## Shape

- **Length.** Launch clip 15–30 s, explainer 45–90 s, lesson 1–3 min. If the brief says nothing, aim for the shortest that covers the goal.
- **Structure.** Hook (what this is about, in one line) → 2 to 5 beats, one idea each → close (the takeaway or the next step). Each beat is one narration line.
- **Lines.** 8 to 20 words. A line that needs a comma to breathe is two lines.
- **Budget.** Measured with `say`: Samantha (English) speaks about 3.3 words per second, Paulina (Spanish) about 2.7. Length ≈ `lead` + words ÷ rate + `gap` between lines + pauses + `tail`. A 25-second video is about 5 lines: 65 words in English, 55 in Spanish. After `ambar voice`, `voice/timings.json` has the real `end`; adjust the lines, not the speed.

## A Spanish ambar.json

```json
{
  "title": "Cómo cerrar el mes",
  "voice": { "provider": "say", "name": "Paulina" },
  "lines": [
    { "id": "intro", "text": "En dos minutos vas a cerrar el mes sin salir del panel." },
    { "id": "filtro", "text": "Primero eliges el período y revisas que no queden pendientes.", "pause": 0.4 },
    { "id": "cierre", "text": "Cuando todo está en verde, presionas Cerrar mes y listo." }
  ],
  "sfx": [{ "type": "whoosh", "at": "intro-0.3", "gain": 0.12 }]
}
```

Neutral Spanish with "tú": *eliges*, *presionas*, never *elegís*, *presionás*. Name buttons exactly as the app writes them.

## Build order

1. `ambar new <dir>`. Write `ambar.json` lines first, `id`s in kebab-case named after the idea (`intro`, `pricing`, `next-step`).
2. `ambar voice <dir>` early, so every scene is built against real timings.
3. In `render(t)` read each cue once at the top, then derive everything from `cue.start` and `cue.end`:

```js
render (t, { duration }) {
  const intro = cue('intro', 0.8, 3)
  const how = cue('how', 4.4, 4)

  rise(title, t, intro.start, how.start)        // title leaves as the next beat begins
  css($('#panel'), { opacity: span(t, how.start - 0.2, how.end + 0.6) })
  const [x, s] = keys(t, [[how.start, 0, 1], [how.start + 0.8, -240, 0.9]])
}
```

4. Visual changes land slightly before the words that name them (0.1–0.3 s early). Leave each beat on screen until the next starts or 0.6 s after its line ends.
5. Sound: a soft `whoosh` on scene changes (gain 0.1–0.15), `tap` on clicks, `riser` into a reveal, `impact` only for the one big moment. Fewer effects beat more.

## Layout

- Stage 1920×1080. Safe area: 96 px from left and right, 54 px from top and bottom.
- Big headline 96–140 px, secondary 44–64 px, labels 24–32 px. Body text never under 28 px.
- Keep text on calm areas: dark background or `.glass` cards. Never on top of the mascot or busy imagery.
- Use layers (`.layer`) per beat and fade whole layers in and out with `span`.

## Rendering

`ambar render` prints the output path, the video length and the time the render took. The MP4 length is the composition `duration`: narration end + `tail`, or the `duration` you pass to `video()`.

## Before render

`ambar check <dir> --json` → zero errors, then Read `out/check/sheet.png`. Look for: a frame where nothing is on screen, two things competing for attention, text crossing the safe area, the mascot covering content, a beat that still shows the previous beat's leftovers.

## On a web page

`ambar embed <dir> [--out folder]` exports the project as a static folder (project + `_ambar/` runtime + `audio.m4a` + `player.json`). `index.html?player` plays it live with a chapter bar, a sound button (starts muted), captions word by word with the mascot, keyboard and touch controls, and it pauses when scrolled away. Put it in an iframe:

```html
<iframe src="explicador/index.html?player" allow="autoplay; fullscreen" loading="lazy" style="aspect-ratio: 16/9; width: 100%; border: 0"></iframe>
```

In `ambar.json`: `"chapters": [{ "title": "La voz", "at": "voz" }]` (times as in `sfx.at`; without it, one segment per line, titled by each line's `chapter`), `"player": { "speaker": "ÁMBAR", "hint": "Activa el sonido" }`, and a line's `caption` replaces its text in the captions.

## Variants the user may ask for

- **Vertical (9:16)**: `video({ width: 1080, height: 1920 })`; stack instead of side by side, headlines 80–110 px.
- **Square (1:1)**: 1080×1080.
- **Silent loop for a site or README**: no lines, set `duration`, render with `--gif` or `--no-audio`.
