// The narration drives the timeline: each line starts after the previous one
// ends plus a gap, unless it sets its own `at`. Compositions and the mixer
// read the same cues, so picture and sound never drift apart.

/**
 * lines: [{ id, at?, pause? }], durations: { id: seconds }
 * → { cues: { id: { start, duration, end } }, end }
 */
export function layoutCues (lines, durations, { lead = 0.8, gap = 0.55 } = {}) {
  const cues = {}
  let cursor = lead
  for (const line of lines) {
    const duration = durations[line.id] ?? 0
    const start = typeof line.at === 'number' ? line.at : cursor + (line.pause ?? 0)
    cues[line.id] = { start: round(start), duration: round(duration), end: round(start + duration) }
    cursor = start + duration + gap
  }
  const end = Math.max(0, ...Object.values(cues).map((cue) => cue.end))
  return { cues, end: round(end) }
}

/**
 * Resolves a time written as a number of seconds or as "cue", "cue+0.4",
 * "cue-0.2", "cue.end" or "cue.end+0.3".
 */
export function resolveTime (value, cues = {}) {
  if (typeof value === 'number') return value
  const match = String(value).trim().match(/^([\w-]+?)(\.end)?\s*([+-]\s*[\d.]+)?$/)
  if (!match) throw new Error(`Cannot read the time "${value}"`)
  const [, id, endPart, offset] = match
  const cue = cues[id]
  if (!cue) throw new Error(`Unknown cue "${id}" in "${value}"`)
  const base = endPart ? cue.end : cue.start
  return round(base + (offset ? Number(offset.replace(/\s+/g, '')) : 0))
}

const round = (x) => Math.round(x * 1000) / 1000
