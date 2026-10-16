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
- Actions: `click`, `type` + `text`, `hover`, `scroll` (px), `wait` (ms), `waitFor` (selector), `goto` (path or URL).
- `boxes` names every element the video will point at, type into or zoom on. Name them by meaning (`save`, `title`), not by selector.
- Run `ambar capture <dir>`, then Read every PNG in `captures/` and check: the right screen, nothing personal visible, no loading spinners, no error toasts.

**Safety.** Use a demo or staging environment and demo accounts. Captures must not create, change or delete real records: if a step saves something, it must be in a test environment. If only production is available, stop and ask the user. Do not put real passwords in `capture.json`; use a demo password and remind the user if the file will be shared.

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

## 5. Check

`ambar check <dir> --json`, then Read `out/check/sheet.png` and the frames at each click. Verify that the cursor lands on the element it names, that typed text sits inside its field, and that zooms do not cut off the element being used.
