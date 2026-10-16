# Recording an app in motion

`ambar capture` has two outputs. `shots` are stills (one PNG per step). `recordings` film the real app frame by frame on a virtual clock, with scripted taps, typing, scrolls and drags, and give you `captures/<name>/0001.jpg…` plus `meta.json`. Use a recording whenever the app moves: sheets that slide in, loaders, transitions, typing with the app's own validation, lists that scroll. Use stills for screens you only point at.

## capture.json

```json
{
  "url": "app/index.html",
  "viewport": { "width": 390, "height": 844, "mobile": true },
  "scale": 3,
  "fps": 30,
  "now": "2026-03-14T10:00:00",
  "timezone": "America/Santiago",
  "storage": { "local": { "session": "demo-token", "onboarded": true } },
  "cookies": [{ "name": "locale", "value": "en" }],
  "redact": ["[data-private]", ".customer-name"],
  "network": {
    "hold": ["/api/slow"],
    "mock": [{ "url": "/api/me$", "method": "GET", "file": "mocks/me.json" }],
    "allowWrites": ["http://localhost:8141/"]
  },
  "reset": "http://localhost:8141/demo/reset",
  "recordings": [
    {
      "name": "signup",
      "seconds": 6,
      "settle": 1,
      "prepare": [{ "at": 0, "tap": "text=Get started" }],
      "actions": [
        { "at": 0.5, "tap": "#email" },
        { "at": 0.8, "type": "alex@harbor.example", "every": 2 },
        { "at": 2.5, "click": "text=Sign in" },
        { "at": 2.6, "mark": "loading", "boxes": { "spinner": ".spinner" } },
        { "at": 3, "scroll": { "to": 600, "duration": 1.2 } },
        { "at": 4.4, "release": "/api/slow" },
        { "at": 5, "mark": "done", "boxes": { "card": ".welcome" } }
      ]
    }
  ]
}
```

Top-level settings apply to every recording (and to `shots`); a recording can override `url`, `viewport`, `scale`, `fps`, `now`, `timezone`, `storage`, `cookies`, `settle`, `mode`, `caret`, `quality`, `safeArea`, `redact` (added) and `network` (merged).

| Setting | What it does |
|---|---|
| `viewport` | `width`, `height`, `mobile` (mobile emulation), `touch` (defaults to `mobile`). Phones: 390×844 or 412×896. |
| `scale` | Device pixel ratio of the frames. 2–3 for phones, so zooms stay sharp. 1 is enough for a desktop app shown at its own size. |
| `fps` | Frames per second (30). |
| `now` | The page's clock starts here (`Date`, `new Date()`), read in `timezone`. Set it, or dates and times change on every run. |
| `timezone` | IANA zone the page runs in. |
| `storage` | Seeded before the app's first script runs, once per recording: `{ "local": {…}, "session": {…} }` (a plain object means `local`). Non-strings are JSON. Use it to arrive signed in with a demo session. |
| `cookies` | Set before loading (`url` defaults to the app's). |
| `safeArea` | `{ "top": 47, "bottom": 34 }` by default when `mobile` is true, so the app leaves room for the status bar and the home indicator; `false` turns it off. |
| `settle` | Seconds of virtual time after loading (and after `prepare`) before frame 1. |
| `prepare` | Actions that bring the app to where the clip starts; run on the clock, not filmed. |
| `reset` | A URL that gets a POST before each recording, to put a demo server back in its demo state. |
| `mode` | `"virtual"` (default, deterministic) or `"realtime"` (fallback, see below). |
| `caret` | `"virtual"` (default: drawn on the virtual clock), `"hide"` or `"native"` (blinks on real time, not deterministic). |
| `quality` | JPEG quality (90). |

## Actions

Every action has `at`, in seconds from the start of the clip; it runs on frame `round(at × fps)`, before that frame is taken. Targets are a CSS selector, `text=Label` (the innermost visible element with that text, scrolled into view; also matches `aria-label`, `placeholder` and button values) or `[x, y]` in app px.

| Action | |
|---|---|
| `{ "tap": target }` | A touch tap on a touch viewport, a click otherwise. Logged in `taps`. Add `"dom": true` for elements that only answer a DOM click. |
| `{ "click": target }` | A mouse click at the centre. Logged in `taps`. |
| `{ "type": "text", "every": 2, "into": target }` | One character every `every` frames into the focused field (or `into`, focused first). |
| `{ "key": "Enter" }` | A key press. Logged in `keys`. |
| `{ "scroll": { "to": 600, "duration": 1.2, "axis": "y", "in": target } }` | Eased scroll of `in`, or of the largest scroller on that axis. `to` can be a number or `"end"`; `by` scrolls relative. Scroll snapping and smooth scrolling are turned off on it first. |
| `{ "drag": { "from": target, "to": target, "by": [dx, dy], "duration": 0.5 } }` | A finger (or mouse) drag, eased. `swipe` is the same. Logged in `drags`. |
| `{ "wheel": { "dy": 400, "dx": 0, "over": target, "duration": 0.5 } }` | Mouse wheel, spread over the duration. |
| `{ "hover": target }`, `{ "focus": target }`, `{ "goto": "path" }` | |
| `{ "release": "/api/slow" }` | Lets requests held by `network.hold` through (`true` releases all). |
| `{ "mark": "name", "boxes": { "key": target } }` | Notes the moment and measures those elements on that frame → `meta.boxes.name`. |

## Output

`captures/<name>/0001.jpg…` and `captures/<name>/meta.json`:

```json
{ "name": "signup", "mode": "virtual", "fps": 30, "frames": 180, "seconds": 6, "dir": "captures/signup",
  "viewport": { "width": 390, "height": 844, "mobile": true }, "scale": 3, "safeArea": { "top": 47, "bottom": 34 },
  "firstChange": 0.5, "taps": [[0.5, 195, 412]], "drags": [[t0, x0, y0, t1, x1, y1]], "keys": [[t, "Enter"]],
  "marks": [[2.6, "loading"]], "boxes": { "loading": { "t": 2.6, "boxes": { "spinner": { "x": 0, "y": 0, "w": 0, "h": 0 } } } },
  "blocked": ["POST /api/signup"], "mocked": [] }
```

`captures/clips.json` collects every clip (`{ viewport, scale, clips }`) for `loadClips()`. `firstChange` is the first second where the picture differs from frame 1: start the clip in the scene a little before it, not on a stretch of nothing.

## How the virtual clock works

The page's `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`, `performance.now` and `Date` are replaced before any of its scripts run. Time only moves when capture steps it: due timers fire in timestamp order (ties by id, intervals re-armed), animation frames run once, then CSS transitions, CSS animations and `element.animate()` are set to the same time (each is paused and its `currentTime` set from when it started; at its end `finish()` fires the usual events). Loading also runs on this clock, and every step waits for the network, so a response always lands on the next frame and the frame-1 state is the same on every run. Scrolls the browser animates itself (snap after a drag, fling) are waited out. Two recordings of the same flow give the same frames.

What still runs on real time: GIFs, `<canvas>` and WebGL driven by something other than the page's timers, Web Workers, and very large blurs on moving layers (they can differ by a few levels between runs). Videos are paused and stepped frame by frame.

**`"mode": "realtime"`** is the fallback for apps the clock cannot drive: the app runs normally, frames come from Chrome's screencast at the device resolution and are resampled to `fps` (a still screen sends no frames, so the last one is held). Actions are scheduled on the wall clock. Use it only when a virtual recording comes out wrong, and expect small differences between runs.

## Safety

- Only demo or staging systems with demo accounts. If the only environment is production, stop and ask.
- Writes never leave the browser: every request other than GET, HEAD and OPTIONS gets a mock or an empty `200 {}`, and is listed in `meta.blocked`. `network.allowWrites` lets writes through only to a local demo server (localhost URLs; anything else is refused).
- `network.mock` answers matching requests (`url` regex, optional `method`, `status`, `file` or `body`, `contentType`, `headers`) without touching any server.
- `network.hold` keeps matching requests waiting until a `release` action, to film a loader on cue; `network.ignore` lists URLs not to wait for (long polls).
- `redact` blurs every match before each frame is taken, in the browser. Check the frames: a missed selector means the data is in the image.
- No real passwords in `capture.json`. Prefer `storage` with a demo session over typing credentials.

## Check the frames

Read a handful of frames (`0001.jpg`, the frames at each `at`, the last one) before building the scene: the right screen, no spinners left over, nothing personal, the tap landed where it should. If a recording needs a fix, change `capture.json` and run `ambar capture` again; frames are rewritten.
