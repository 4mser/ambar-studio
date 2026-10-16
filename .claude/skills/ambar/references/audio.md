# Audio: voices, music and sound

Everything a viewer hears. The narration drives the timeline (`voice/timings.json`), so get the voice right before tuning scenes.

## Voices

```json
{
  "voice": { "provider": "gemini", "name": "Sulafat", "language": "es-US", "mode": "take",
             "style": "A warm product presenter, confident and close", "maxPause": 0.32 },
  "voices": {
    "ambar": { "name": "Leda", "style": "A cheerful little mascot, bright and playful" }
  },
  "lines": [
    { "id": "intro", "text": "Te presento a NGINX.", "say": "Te presento a Engine X." },
    { "id": "hola", "speaker": "ambar", "text": "¡Hola! Yo te acompaño.", "tone": "an excited, happy greeting" },
    { "id": "cierre", "text": "Pruébalo hoy.", "caption": "Pruébalo hoy →" }
  ]
}
```

| Field | What it does |
|---|---|
| `voice` | The narrator. `provider` `say` (offline drafts) or `gemini`; `name`; `model` (a list falls back in order); `language` (`es-US` keeps Latin American Spanish from drifting into Spain's accent); `style`; `tempo` (≤ 1.15); `maxPause` (seconds; `false` keeps every pause). |
| `voices` | One entry per character, merged over `voice`. A line picks one with `speaker`. |
| `say` | What the voice reads, when it differs from what the screen shows: brand names spelled the way they sound, numbers in words. Subtitles keep `text`. |
| `caption` | What the captions show, when it differs from `text`. |
| `tone` | How this one line is said ("whispering", "a happy greeting"). Line mode only. |

### Rules that came from real productions

- **One take per character** (`"mode": "take"`). Lines recorded one by one sound like different people. The take is cut at its longest pauses, and `ambar voice --recut` cuts it again without spending a request.
- **Same model and the same prompt for a recurring character, always.** The same voice name on another model is another person.
- **Pace**: the prompt asks for "a natural, relaxed conversational pace, never slow or robotic". Never ask for "emotional", "calm", "documentary" or "epic": they come out slow and artificial. Fix a slow take with `maxPause` and `tempo` ≤ 1.15, not by switching model.
- **Gemini 3.x TTS models read instructions aloud**: AMBAR sends them the text alone.
- **No "…"** in a line: it can hang the model or return silence. AMBAR reads it as a period and warns.
- **Write for the ear**: avoid two identical vowels across a word boundary ("todo a la mano" → "toda la mano"); scripted lines end as statements, not questions; name a screen at the end of the sentence.
- **Verify every line**: `ambar voice --verify` transcribes each file literally (repetitions and stutters kept) and lists missing or extra words and lines that are too slow. A correct duration proves nothing. Then have a person listen to every regenerated line before calling it done.
- **Free quotas** are small (about 10 requests a day per model): take mode is one request per character, voices are cached by text, and `model` can list fallbacks.
- **Gender and pronouns** of each character are fixed in the brief; check every line and title against them.
- For a human voice actor deliver a silent video, a guide video with a solid timing panel under it, an AI reference, and the script as PDF and text; ask for WAV 48 kHz / 24-bit mono, one file per line.

## What `ambar voice` writes

- `voice/<id>.wav`: trimmed, long pauses capped, 8 ms fade in and 60 ms fade out (some takes stop dead after the last word).
- `voice/timings.json`: every cue with `start`, `duration`, `end`, `text`, `speaker` and `words` (`[[word, start, end]]`, estimated over the voiced time).
- `voice/envelope.json`: `{ fps, lines: { id: [0..1.2] } }`, how loud each line is frame by frame. Mascots talk with it; never animate talking with `sin(t*15)`.

## Music

```json
"music": { "file": "music/track.mp3", "gain": 0.6, "hit": 15.25, "at": "reveal", "stop": { "at": "climax", "style": "tape" } }
```

- **Every video gets a music bed** unless the brief says none. AMBAR ships a small library you may commit and publish with credit: `"file": "@ambar/music/inspired.mp3"` (bright, explainers), `chill-wave.mp3` (tutorials), `deliberate-thought.mp3` (reports). Credits in `music/README.md`: put the credit line in the description, the site footer or an end card. Other sources and their licenses: `references/resources.md`.
- **Real produced tracks only.** Synthesized music sounds like a toy. No vocals or vocal chops under narration ("hey" chants included). Mood: cool, not cute, corporate or funky.
- **Line the track up with the story**: `hit` (a second of the track) lands on `at` (a time or cue). Music starts at frame 0; if the hit forces a later start, AMBAR says so.
- **Build on a beat grid** when the piece is cut to music: measure the BPM and a downbeat, place scenes in whole bars, and extend scenes by bars, not seconds.
- **Ducking**: an envelope follower on the voice (35 ms attack, 400 ms release) lowers the music by `duck` (0.55 ≈ −7 dB). Raise it for dense narration.
- `stop` cuts the music dead (30 ms, no click) or stops it like tape (`"style": "tape"`), for a punchline or a shock.
- One continuous bed per piece. Never splice chunks of another mix.

## Sound effects

```json
"sfx": [
  { "type": "whoosh", "at": "intro-0.3", "gain": 0.12 },
  { "type": "heartbeat", "at": "tension", "beats": 4 },
  { "file": "sfx/stamp.wav", "at": "approved", "gain": 0.3 }
]
```

- Synthesized: `whoosh`, `tap`, `tick`, `click`, `pop`, `impact`, `kick`, `riser`, `heartbeat`, `drone`, `applause`, `glitch`. All non-tonal or low thumps: bells, pings and glockenspiels read as cheap.
- A `file` effect lands on its loudest point (`align: "peak"`), so the transient falls exactly on the event. Use `align: "start"` for ambiences.
- Tie every effect to its animation event by cue (`"at": "reveal+0.4"`); when a scene moves, its sound moves with it.
- Fewer effects beat more: a soft whoosh on scene changes, a tap on clicks, a riser into a reveal, one impact for the one big moment.

## Master and delivery

- The master is soft-clipped and normalized to `loudness` (−14 LUFS by default, what Meta and most feeds target).
- `ambar render --cover 3.2` also writes `<name>-cover.mp4` with the frame at 3.2 s first: feeds use frame 0 as the thumbnail, which is usually an empty background. Pick a frame where the hook has settled.
- Claude cannot listen. Check audio through `--verify`, the timings and a person's ears; never call a mix done from durations alone.
