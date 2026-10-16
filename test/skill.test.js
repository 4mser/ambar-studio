import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { skill } from '../src/commands/skill.js'

test('skill links the skill and the agent into a Claude home, and removes them', () => {
  const home = mkdtempSync(join(tmpdir(), 'ambar-home-'))
  try {
    skill({ home })
    skill({ home }) // twice is fine
    const skillDir = join(home, 'skills', 'ambar')
    assert.ok(lstatSync(skillDir).isSymbolicLink())
    assert.match(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'), /^---\nname: ambar\n/)
    assert.match(readFileSync(join(home, 'agents', 'ambar-producer.md'), 'utf8'), /^---\nname: ambar-producer\n/)
    skill({ home, remove: true })
    assert.equal(existsSync(skillDir), false)
    assert.equal(existsSync(join(home, 'agents', 'ambar-producer.md')), false)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('every reference the skill points to exists', () => {
  const root = new URL('../.claude/skills/ambar/', import.meta.url)
  const text = readFileSync(new URL('SKILL.md', root), 'utf8')
  for (const [, ref] of text.matchAll(/`(references\/[\w-]+\.md)`/g)) assert.ok(existsSync(new URL(ref, root)), ref)
  assert.ok(existsSync(new URL('../templates/brief/AMBAR.md', import.meta.url)))
})
