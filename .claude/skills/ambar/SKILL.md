---
name: ambar
description: Make videos, product tutorials, slide decks and documents with AMBAR Studio (HTML rendered to MP4, PDF and PNG, with narration, sound and the ÁMBAR mascot). Use whenever the user asks for a video, explainer, launch clip, screencast or tutorial of an app, presentation, deck, report, one-pager or any visual piece AMBAR can render, or mentions ambar, ÁMBAR or AMBAR Studio.
---

# AMBAR Studio

AMBAR turns HTML into finished media. A video is a page whose picture is a pure function of time; a deck is a page of `<section class="slide">`; a document is a page of A4 `<section class="page">`. You write the HTML, AMBAR records the narration, renders, mixes and exports.

Your job is to deliver a piece the user can publish without fixing it: correct, readable, on brand and checked. Follow the workflow and the house rules below. They are what makes the output good, not optional polish.

## Find AMBAR

- `ambar` on PATH: use it.
- Otherwise the repo is wherever this skill lives: `readlink -f ~/.claude/skills/ambar` ends in `<repo>/.claude/skills/ambar`. Run `node <repo>/bin/ambar.js …`.
- Needs Node 20+ and ffmpeg. `ambar help` lists every command.

## Workflow

1. **Brief.** Look for `AMBAR.md` in the project folder (or its parents). It holds the project's own rules: audience, goal, language, voice, tone, length, brand, words to use and avoid. Its rules override the defaults here. `ambar new` writes one with `<placeholders>`: fill each one in from what the user said and delete the lines that do not apply. With no `AMBAR.md` at all, copy `templates/brief/AMBAR.md` from the repo and do the same. Ask only for what you cannot infer and would change the result: usually audience, goal and length. Never invent facts about a product, a company or numbers.
2. **Plan before HTML.** Write the narration lines (video) or the outline (deck, document) first, in the brief's language. One idea per beat. Show the plan to the user when the piece is long or the brief was thin; for short pieces go straight on.
3. **Scaffold.** `ambar new <dir>` (video), `--deck`, `--doc`. For an app tutorial start from `examples/tutorial` and read `references/tutorial.md`.
4. **Build.** Read the reference for the format before writing code:
   - video → `references/video.md`
   - tutorial over a real app → `references/tutorial.md`
   - deck → `references/deck.md`
   - document → `references/doc.md`
   - runtime API → `references/api.md`
   - writing on screen and in narration → `references/writing.md`
5. **Voice.** `ambar voice <project>` records the lines and writes `voice/timings.json`. Scenes hang from those cues.
6. **Check.** `ambar check <project | deck.html | doc.html> --json`. Fix every error. Fix warnings unless you can say why one is fine. The check measures what a machine can (errors, text off-frame, clipped, overlapping or too small, content too small or bunched at one edge, cues, determinism); taste is still yours. **Open `out/check/sheet.png` with the Read tool and look at it**: hierarchy, contrast, empty or crowded frames, text on top of busy areas, things that look unfinished. Open single frames from `out/check/` when something needs a closer look. Repeat until the check passes and the sheet looks right.
7. **Render.** `ambar render <project>` (MP4), `ambar slides deck.html`, `ambar doc doc.html`. For quick looks use `--frames` or `--gif`.
8. **Deliver.** Give the user the output paths, the duration or page count, the check result and anything you could not verify. Do not commit, push, upload or publish anything unless the user asked for it.

## House rules

**Time**
- `render(t)` depends on `t` only. No `setTimeout`, `setInterval`, `Date`, `Math.random`, CSS transitions or CSS animations. Use `hash(seed)` for randomness and `keys`, `progress`, `span` for motion. `ambar check` catches violations.
- Narration drives the timeline. Every scene starts from a `cue('id')` of a line in `ambar.json`; give each `cue()` a sensible fallback so the scene works before the voice exists. Do not hardcode times that should follow the voice.
- Let things breathe: an element is on screen long enough to be read twice. Motion eases (`ease.out` in, `ease.inOut` between keys); nothing pops in or out on a single frame.

**Picture**
- Use the palette tokens in `runtime/ambar.css` (`--amber`, `--honey`, `--cream`, `--night`…) unless `AMBAR.md` defines another brand.
- Text stays inside the 5% safe area of the frame. Minimum sizes: 1080p video 15px (body text 28px or more), slides 18px (body 32px or more), A4 documents 9px.
- One focal point per moment. Highlight with color (`{word}` in `words()`), not with several effects at once.
- ÁMBAR, the mascot, appears when it helps: as guide, reaction or sign-off. Match its expression to the moment (`feliz` for a win, `pensativa` for a question, `sorprendida` for a reveal). It never covers content.

**Words** (details in `references/writing.md`)
- Write in the brief's language. In Spanish use neutral Spanish with "tú", never "vos".
- Plain and specific. No hype, no filler, no "not X, it's Y" constructions, no "Let's dive in", "seamless", "unlock", "game-changer", "in today's fast-paced world".
- On-screen text is shorter than the narration and never repeats it word for word.

**Truth and privacy**
- Tutorials show what the app really does. Capture every step you narrate with `ambar capture`; do not describe a screen you have not seen.
- Blur anything personal with `redact` in `capture.json` (names, emails, IDs, phone numbers, addresses, amounts tied to a person). Use demo accounts and invented sample values.
- Never point `ambar capture` at a production system that writes data, and never record real passwords. If the only available environment is production, stop and ask.
- Secrets come only from environment variables (`AMBAR_GEMINI_API_KEY`). Never write a key into a file, a config or a command line.

## Commands

| Command | Use |
|---|---|
| `ambar new <dir> [--deck \| --doc]` | Start from a template |
| `ambar voice <project>` | Record narration, write cues |
| `ambar capture <project>` | Screenshots + element boxes of an app (`capture.json`) |
| `ambar check <target> [--json] [--at 1,4.5]` | Machine review + contact sheet |
| `ambar render <project>` | MP4 with narration, music and effects |
| `ambar render <project> --frames 1,4.5` | PNG stills |
| `ambar render <project> --gif out.gif` | Looping GIF |
| `ambar embed <project> [--out dir]` | Live web player for a site (see video.md) |
| `ambar studio <project>` | Timeline in the browser, for the user |
| `ambar slides <deck.html>` | PDF + PNG per slide |
| `ambar doc <doc.html> [--png]` | A4 PDF |

`ambar studio` opens a browser and keeps running; start it only when the user wants to scrub the timeline.
