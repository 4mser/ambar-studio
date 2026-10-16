# AMBAR Studio

Deterministic video, slides and documents from HTML. Read `README.md` for the overview.

## Making content

Use the `ambar` skill (`.claude/skills/ambar/SKILL.md`) for any video, tutorial, deck or document, and follow its workflow and house rules. New pieces go in their own folder outside `examples/` unless the user asks for a new example. The `ambar-producer` agent (`.claude/agents/`) produces a whole piece from a brief; use one per piece to make several in parallel.

## Working on AMBAR itself

- Node 20+, ES modules, no build step, no dependencies besides Puppeteer. ffmpeg on PATH.
- `runtime/` runs in the browser and is imported by scenes from `/@ambar/runtime/…`. Everything above `video()` in `runtime/ambar.js` is DOM-free so it can be tested in Node.
- `src/commands/<name>.js` exports one function per CLI command; `bin/ambar.js` wires them.
- Style: two-space indent, no semicolons, single quotes, a short header comment per file explaining what it does.
- `npm test` must pass. `ambar check` must pass on every example (`for p in examples/hero examples/launch examples/tutorial examples/motion examples/family examples/deck/deck.html examples/report/report.html; do node bin/ambar.js check $p; done`).
- A feature is done when it has an example or a test, the skill references describe it (`.claude/skills/ambar/references/`), and both READMEs (`README.md`, `README.es.md`) cover it. `npm run readme-assets` re-renders README images.
- Secrets: only `AMBAR_GEMINI_API_KEY`, read from the environment. Never commit keys, voice caches or `out/`.
- Commits: conventional commits, no co-author trailer.
