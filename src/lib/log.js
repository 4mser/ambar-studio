// Small terminal output helpers. Amber accents, no dependencies.
const tty = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (text) => (tty ? `\x1b[${code}m${text}\x1b[0m` : String(text))

export const amber = paint('38;5;214')
export const dim = paint('2')
export const bold = paint('1')
export const red = paint('31')
export const green = paint('32')

export const step = (label, detail = '') => console.log(`${amber('◆')} ${bold(label)}${detail ? ` ${dim(detail)}` : ''}`)
export const done = (label, detail = '') => console.log(`${green('✓')} ${label}${detail ? ` ${dim(detail)}` : ''}`)
export const warn = (label) => console.log(`${amber('!')} ${label}`)
export const fail = (label) => console.error(`${red('✗')} ${label}`)

/** Single-line progress bar that redraws in place */
export function progress (label, total) {
  const width = 28
  let last = -1
  return (value) => {
    const pct = total ? Math.min(1, value / total) : 1
    const shown = Math.round(pct * 100)
    if (shown === last && value < total) return
    last = shown
    const filled = Math.round(pct * width)
    const bar = amber('█'.repeat(filled)) + dim('░'.repeat(width - filled))
    const line = `  ${bar} ${String(shown).padStart(3)}% ${dim(`${label} ${value}/${total}`)}`
    if (tty) process.stdout.write(`\r${line}${value >= total ? '\n' : ''}`)
    else if (value >= total) console.log(line)
  }
}

export const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`
