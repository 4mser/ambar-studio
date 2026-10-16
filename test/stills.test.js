import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SIZES, loadItems, metaOf, normalizeItems, resolveSize, resolveSizes, stillContext, stillUrl, stills } from '../src/commands/stills.js'
import { loadProject } from '../src/lib/project.js'
import { pngSize } from '../src/lib/image.js'

test('every named size is whole, has a usable safe zone and unique aliases', () => {
  const names = new Set(Object.keys(SIZES))
  const seen = new Set()
  for (const [name, s] of Object.entries(SIZES)) {
    assert.ok(Number.isInteger(s.width) && Number.isInteger(s.height) && s.width > 0 && s.height > 0, name)
    const { top, right, bottom, left } = s.safe
    assert.ok(s.width - left - right > s.width * 0.3 && s.height - top - bottom > s.height * 0.3, `${name} safe zone`)
    for (const alias of s.aliases) {
      assert.ok(!names.has(alias) && !seen.has(alias), `alias ${alias}`)
      seen.add(alias)
    }
  }
  assert.deepEqual([SIZES.post.width, SIZES.post.height], [1080, 1350])
  assert.deepEqual([SIZES.ios.width, SIZES.ios.height], [1320, 2868])
  assert.deepEqual([SIZES.ios65.width, SIZES.ios65.height], [1242, 2688])
  assert.deepEqual([SIZES.feature.width, SIZES.feature.height], [1024, 500])
  assert.deepEqual([SIZES.og.width, SIZES.og.height, SIZES.og.scale], [1200, 630, 2])
  assert.equal(SIZES.story.safe.top, 250)
  assert.ok(SIZES.story.safe.bottom >= 380 && SIZES.story.safe.bottom <= 400)
  assert.deepEqual([SIZES.fbcover.safe.left, SIZES.fbcover.width - SIZES.fbcover.safe.right], [265, 1375])
})

test('sizes resolve by name, alias or WIDTHxHEIGHT', () => {
  assert.equal(resolveSize('ig').name, 'post')
  assert.equal(resolveSize('AppStore').name, 'ios')
  assert.equal(resolveSize('ios').scale, 1)
  assert.equal(resolveSize('og').scale, 2)
  assert.deepEqual([resolveSize('1200x900').width, resolveSize('1200x900').height], [1200, 900])
  assert.throws(() => resolveSize('poster'), /Unknown size "poster"/)
  assert.deepEqual(resolveSizes('post, ig ,story').map((s) => s.name), ['post', 'story'])
})

test('items get ids, and data files are found in order', () => {
  assert.deepEqual(normalizeItems([{ title: 'a' }, { id: 7 }]), [{ title: 'a', id: '01' }, { id: '7' }])
  assert.deepEqual(normalizeItems({ items: [{ id: 'x' }] }), [{ id: 'x' }])
  assert.deepEqual(normalizeItems(null), [{ id: '01' }])
  assert.equal(metaOf('<meta name="ambar:sizes" content="ios,play">', 'sizes'), 'ios,play')
  const dir = mkdtempSync(join(tmpdir(), 'ambar-items-'))
  try {
    writeFileSync(join(dir, 'card.html'), '<meta name="ambar:data" content="cards.json">')
    assert.deepEqual(loadItems(loadProject(join(dir, 'card.html'))).items, [{ id: '01' }])
    writeFileSync(join(dir, 'items.json'), '[{"id":"i"}]')
    assert.equal(loadItems(loadProject(join(dir, 'card.html'))).items[0].id, 'i')
    writeFileSync(join(dir, 'card.json'), '[{"id":"c"}]')
    assert.equal(loadItems(loadProject(join(dir, 'card.html'))).items[0].id, 'c')
    writeFileSync(join(dir, 'cards.json'), '[{"id":"m"}]')
    assert.equal(loadItems(loadProject(join(dir, 'card.html'))).items[0].id, 'm')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const size = resolveSize('story')
  assert.equal(stillUrl('http://h', 't.html', { id: 'a b' }, size), 'http://h/t.html?item=a%20b&size=story')
  const ctx = stillContext([{ id: 'a' }, { id: 'b' }], 1, size, 2)
  assert.deepEqual({ ...ctx, items: undefined, safe: undefined }, { injected: true, item: { id: 'b' }, items: undefined, index: 1, count: 2, size: 'story', width: 1080, height: 1920, safe: undefined, scale: 2 })
})

const HEAD = '<!doctype html><link rel="stylesheet" href="/@ambar/runtime/ambar.css"><link rel="stylesheet" href="/@ambar/runtime/stills.css">'

test('stills: every item × size reaches the page, files are named and sized, overflow is an error', { timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-stills-'))
  try {
    writeFileSync(join(dir, 'items.json'), JSON.stringify([{ id: 'ok', text: 'Fits' }, { id: 'long one', text: 'One two three four five six seven eight nine ten eleven twelve', box: true }]))
    // the page checks that the query and the injected context agree, and throws otherwise
    writeFileSync(join(dir, 'card.html'), `${HEAD}
<div class="frame"><div id="t" style="font-size:40px; padding:40px"></div></div>
<script type="module">
  import { still } from '/@ambar/runtime/stills.js'
  still({ setup (ctx) {
    const q = new URLSearchParams(location.search)
    if (q.get('item') !== ctx.item.id || q.get('size') !== ctx.size) throw new Error('query and context differ')
    if (ctx.width !== innerWidth || ctx.height !== innerHeight || ctx.count !== 2 || ctx.items[ctx.index] .id !== ctx.item.id) throw new Error('bad context')
    if (getComputedStyle(document.documentElement).getPropertyValue('--w').trim() !== ctx.width + 'px') throw new Error('no --w')
    const t = document.getElementById('t')
    t.textContent = ctx.item.text
    if (ctx.item.box) Object.assign(t.style, { width: '200px', height: '60px', overflow: 'hidden' })
  } })
</script>`)
    const result = await stills(loadProject(join(dir, 'card.html')), { sizes: 'square,feature', sheet: true, quiet: true })
    assert.deepEqual(readdirSync(join(dir, 'out', 'card', 'square')).sort(), ['01-ok.png', '02-long-one.png'])
    assert.deepEqual(pngSize(join(dir, 'out', 'card', 'feature', '02-long-one.png')), { width: 1024, height: 500 })
    assert.ok(existsSync(join(dir, 'out', 'card', 'sheet-square.png')))
    assert.equal(result.ok, false)
    const errors = result.issues.filter((i) => i.level === 'error')
    assert.ok(errors.length >= 2)
    assert.ok(errors.every((i) => /long one/.test(i.where) && /does not fit its box|clips|leaves the frame/.test(i.message)), JSON.stringify(errors))

    const only = await stills(loadProject(join(dir, 'card.html')), { sizes: 'square', only: 'ok', scale: 0.5, format: 'jpg', quiet: true })
    assert.ok(only.ok)
    assert.deepEqual(only.files.map((f) => f.split('/').pop()), ['01-ok.jpg'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('stills: a panorama is one wide page sliced into its frames', { timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-pano-'))
  try {
    writeFileSync(join(dir, 'items.json'), JSON.stringify([{ id: 'a' }, { id: 'b' }, { id: 'c' }]))
    writeFileSync(join(dir, 'pano.html'), `${HEAD}
<div class="pan" data-bleed style="background: linear-gradient(90deg, #f2a324, #341805)"></div>
<script type="module">
  import { still } from '/@ambar/runtime/stills.js'
  still({ panorama: {}, setup (ctx) {
    document.querySelector('.pan').style.setProperty('--pan-count', ctx.frames)
    for (const item of ctx.items) document.body.insertAdjacentHTML('beforeend', '<section class="frame"><h1 style="padding:80px; font-size:80px; position:relative">' + item.id + '</h1></section>')
    // text across the seam between frames 1 and 2
    document.body.insertAdjacentHTML('beforeend', '<p style="position:absolute; left:' + (ctx.width - 100) + 'px; top:600px; font-size:40px; white-space:nowrap">Across the seam</p>')
  } })
</script>`)
    const result = await stills(loadProject(join(dir, 'pano.html')), { sizes: 'square', quiet: true })
    assert.equal(result.files.length, 3)
    for (const f of result.files) assert.deepEqual(pngSize(f), { width: 1080, height: 1080 })
    assert.deepEqual(result.files.map((f) => f.split('/').pop()), ['01-a.png', '02-b.png', '03-c.png'])
    assert.deepEqual(pngSize(join(dir, 'out', 'pano', 'panorama-square.png')), { width: 3240, height: 1080 })
    assert.ok(result.issues.some((i) => /"Across the seam" is cut between two frames/.test(i.message)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
