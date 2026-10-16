# Tutorials over real apps

A tutorial teaches one task in an app by showing it. Start by copying `examples/tutorial` (capture.json, ambar.json, index.html, scene.js) into a new folder.

## 1. Find out the task for real

- Ask which task to teach and for whom if it is not clear. One task per video; a course is several videos.
- Walk the task yourself before writing any narration: which screens, which fields, which buttons, what the app says back. If you have the app's source, read it to confirm labels, validations and what each button actually does. Never narrate a step you have not seen.
- Note which roles see what. If a step depends on permissions, say so in the narration.

## 2. Capture

`capture.json` next to `index.html`:

```json
{
  "url": "https://staging.example.com/login",
  "viewport": { "width": 1440, "height": 900, "scale": 2 },
  "redact": ["[data-private]", ".user-email", "td.customer-name"],
  "shots": [
    { "name": "login", "boxes": { "email": "#email", "password": "#password", "signin": "button[type=submit]", "card": ".card" } },
    { "name": "home", "actions": [
        { "type": "#email", "text": "demo@example.com" },
        { "type": "#password", "text": "demo-password" },
        { "click": "button[type=submit]" },
        { "waitFor": "#dashboard" }
      ], "boxes": { "menu": "nav", "new": "#new" } }
  ]
}
```

- `url` is a relative path (served from the project) or an http(s) address.
- Actions: `click`, `type` + `text`, `hover`, `scroll` (px), `wait` (ms), `waitFor` (selector, waits until visible), `goto` (path or URL). Add `"fullPage": true` to a shot for the whole page (scroll it with `sc.scroll`).
- `boxes` names every element the video will point at, type into or zoom on. Name them by meaning (`save`, `title`), not by selector.
- Run `ambar capture <dir>`, then Read every PNG in `captures/` and check: the right screen, nothing personal visible, no loading spinners, no error toasts.

### Recordings: the app in motion

When the step moves (a sheet slides in, a loader turns, a list scrolls, the app reacts to typing), record it instead of taking stills. Add `recordings` to the same `capture.json`; the full schema, the actions and how the virtual clock works are in `capture.md`.

```json
"now": "2026-03-14T10:00:00",
"timezone": "America/New_York",
"recordings": [
  { "name": "create", "seconds": 6, "settle": 1.5,
    "prepare": [{ "at": 0, "type": "alex@harbor.example", "into": "#email", "every": 1 }, { "at": 1, "click": "#signin" }],
    "actions": [
      { "at": 0.4, "click": "text=New task" },
      { "at": 0.9, "mark": "dialog", "boxes": { "title": "#title", "dialog": ".dialog" } },
      { "at": 1.0, "type": "Ship the new landing page", "every": 2 },
      { "at": 3.1, "click": "text=Save task" },
      { "at": 3.8, "mark": "saved", "boxes": { "task": ".task.new" } }
    ] }
]
```

- Phones: `"viewport": { "width": 390, "height": 844, "mobile": true }` and `"scale": 3` (2 at least): the frames are zoomed in the scene and must stay sharp. Status bar and home indicator space comes from the emulated safe area.
- Set `now` and `timezone`, seed the demo session with `storage`, and use `prepare` to reach the screen the clip starts on.
- Leave 0.4–0.6 s of the app at rest before the first action and after the last change, so the scene has room to cut.
- Each recording runs in a fresh browser: no state leaks between clips. Two runs of the same recording give the same frames.
- Read a few frames of every clip (`captures/<name>/0001.jpg`, the frames at each action, the last one) and `meta.json`: `taps` must sit on the buttons, `blocked` lists the writes that were stopped.

**Safety.** Use a demo or staging environment and demo accounts. Captures must not create, change or delete real records: `ambar capture` blocks every write (anything but GET, HEAD, OPTIONS) and answers it with an empty 200, or with a `network.mock`; only `network.allowWrites` to a localhost demo server goes through. If only production is available, stop and ask the user. Do not put real passwords in `capture.json`; use a demo password and remind the user if the file will be shared.

**Privacy.** Every personal or customer value goes in `redact`: names, emails, RUTs or tax IDs, phone numbers, addresses, amounts tied to a person, internal IDs. Check the PNGs: the blur happens in the browser before the screenshot, so a missed selector means the data is in the image.

## 3. Script

One narration line per step, said the way a colleague would: "Press New task, write a title, and save it." Name buttons exactly as the app labels them. Start with what the viewer will achieve; end with where the result shows up.

## 4. Scene

```js
const shots = await loadShots()
sc = screencast(stage, shots, { device: 'laptop', width: 1180, url: 'app.example.com' })
css(sc.root, { left: '640px', top: '128px' })
await Promise.all(Object.values(sc.images).map((img) => img.decode()))
```

In `render(t)`, from the cues:

- `sc.show` switches shots a little after the click that causes the change (≈0.2–0.4 s).
- `sc.camera` zooms to 1.3–1.6 on the area being used and back out to 1 between areas. Hold the zoom while the step happens; move the camera between steps, not during typing.
- `sc.cursor` moves to a target over 0.4–0.6 s and rests on it before clicking; pass the click times as the third argument and add a `tap` effect at the same times in `ambar.json`.
- `sc.type` types over empty fields of the capture; use `mask: true` for passwords; add `tick` effects with `every` = 1 / rate.
- `sc.spotlight` + `sc.callout` for one thing at a time, never two callouts at once. Callout text is 2–5 words.
- Steps list on the side (`examples/tutorial/index.html`) tells the viewer where they are.

### Playing a recording

```js
const shots = await loadShots()
const { clips } = await loadClips()
sc = screencast(stage, { ...shots, clips }, { device: 'phone', width: 400, status: '9:41' })
await sc.ready()

// render(t)
const at = step.start + 0.3                 // the scene second the clip starts at
const rate = 1.3
sc.show(t, [[0, 'login'], [at, 'create']])  // shots and clips cross-fade the same way
const c = sc.clip('create', t - at, { rate })  // clip time; holds the last frame
const scene = (c) => at + c / rate          // clip time → scene time, for cursor keys and sound
```

- `sc.clip(name, tc, { rate, from, hold, pingpong, taps, opacity })` shows frame `round(c × fps)` of the clip, where `c = from + tc × rate`, holds the last frame (`hold: false` hides it, `pingpong` plays it back) and draws the recorded taps (a finger presses, then a ring ripples out) and drags. With a cursor (laptop, browser) pass `taps: false` and build the cursor keys and clicks from `sc.clips.<name>.taps`, as `examples/tutorial/scene.js` does.
- Speed app clips to 1.25–1.35×: real apps feel slow on video. Start just before `firstChange` (`from: meta.firstChange - 0.2`) so the clip opens on movement, not on a still stretch.
- Boxes measured at a `mark` are refs with three parts: `'create.saved.task'` works in `camera`, `spotlight`, `callout`, `ring` and `popout`.
- `sc.frame(t, [[time, { ax, ay, s, dx, dy }]])` moves the whole device like a camera: it zooms toward the app point (ax, ay), which stays where it is. Framings are interpolated in a straight line. Keep `s` ≤ 1.3 (it is capped there) and never zoom the phone out of the frame.
- `sc.ring(t, { box, from, to, pad: 9 })` circles a measured element with 8–10 px of air.
- `sc.popout(t, { layer, box, at, until, x, y, width })` lifts an exact crop of the current frame out of the screen to (x, y) at `width` stage px, while the phone blurs and darkens a little, and puts it back at `until`. One at a time, for the number or card the narration is about.
- `sc.scroll(t, [[time, y]])` scrolls a full-page shot inside the screen.
- Every image that changes source while a frame is drawn is decoded before the frame is saved (`window.AMBAR_PENDING`); you do not need to preload frames.

## 5. Check

`ambar check <dir> --json`, then Read `out/check/sheet.png` and the frames at each click. Verify that the cursor lands on the element it names, that typed text sits inside its field, that zooms do not cut off the element being used, and that taps and cursor clicks of a clip happen on the frame where the app reacts.
