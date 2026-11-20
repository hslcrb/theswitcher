import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { detectFont, inspectFont, convertFont, parseSfnt, LIMITS } from '../src/font.ts'

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)
function sfnt(flavor = 0x00010000, tags = ['head','glyf','loca','name']) {
  const b = new Uint8Array(12 + tags.length * 72), d = view(b)
  d.setUint32(0, flavor)
  d.setUint16(4, tags.length)
  tags.forEach((tag, i) => {
    const e = 12 + i * 16, o = 12 + tags.length * 16 + i * 56
    for (let j = 0; j < 4; j++) b[e + j] = tag.charCodeAt(j)
    d.setUint32(e + 8, o); d.setUint32(e + 12, tag==='head'?54:8); d.setUint32(o, i + 256)
    if(tag==='head')d.setUint32(o+12,0x5f0f3cf5)
  })
  return b
}
function standalone(font: Uint8Array) {
  return Object.fromEntries(parseSfnt(font).tables.map(t => [t.tag, [...font.subarray(t.offset,t.offset+t.length)]]))
}
test('detects magic bytes independently of the filename and refuses collections', () => {
  assert.equal(detectFont(sfnt()).container, 'ttf')
  assert.equal(detectFont(sfnt(0x4f54544f,['head','CFF ','name'])).container,'otf')
  assert.throws(() => detectFont(Uint8Array.of(116,116,99,102)), /컬렉션/)
  assert.throws(() => detectFont(Uint8Array.of(1)), /헤더/)
})
test('bounds raw allocation and rejects overlapping, out-of-range and duplicate tables', () => {
  const a=sfnt()
  view(a).setUint32(36,20)
  assert.throws(() => inspectFont(a), /범위/)
  const b=sfnt()
  view(b).setUint32(36,view(b).getUint32(20))
  assert.throws(() => inspectFont(b), /겹/)
  assert.throws(() => inspectFont(sfnt(0x10000,['head','glyf','glyf'])) , /중복/)
  const c=new Uint8Array(48),d=view(c)
  d.setUint32(0,0x774f4632);d.setUint32(4,0x10000);d.setUint32(8,48);d.setUint16(12,4);d.setUint32(16,LIMITS.raw+1)
  assert.throws(() => inspectFont(c), /크기/)
})
test('WOFF wraps a table without renaming outline kind or losing unrelated bytes', async () => {
  const font = sfnt()
  const woff = await convertFont(font,'woff')
  assert.equal(inspectFont(woff).container,'woff')
  const raw = await convertFont(woff,'original')
  const restored=standalone(raw), original=standalone(font)
  for(const tag of ['glyf','loca','name'])assert.deepEqual(restored[tag],original[tag])
  assert.deepEqual(restored.head.slice(12),original.head.slice(12))
  assert.deepEqual(await convertFont(woff,'woff'),woff)
  await assert.rejects(convertFont(woff,'otf'), /윤곽/)
})
test('truncated auxiliary metadata and an invalid OpenType head fail closed', async () => {
  const bad=sfnt()
  view(bad).setUint32(view(bad).getUint32(20)+12,0)
  assert.throws(() => inspectFont(bad),/head/)
  const woff=await convertFont(sfnt(),'woff')
  view(woff).setUint32(24,woff.length+4)
  view(woff).setUint32(28,12)
  assert.throws(() => inspectFont(woff),/부가 데이터/)
})
test('real TrueType and CFF fonts round-trip through WOFF and WOFF2', async (t) => {
  const paths = [process.env.TTF_FIXTURE,process.env.OTF_FIXTURE].filter(Boolean) as string[]
  if (!paths.length) { t.skip('set TTF_FIXTURE and OTF_FIXTURE'); return }
  for(const path of paths) {
    const input = new Uint8Array(await readFile(path))
    const from = inspectFont(input)
    const web = await convertFont(input,'woff2')
    const compact = await convertFont(input,'woff2-compact')
    assert.equal(inspectFont(compact).container,'woff2')
    const raw = await convertFont(web,'original')
    assert.equal(inspectFont(raw).flavor,from.flavor)
    const compactRaw = standalone(await convertFont(compact,'original'))
    const originalTables=standalone(input), restoredTables=standalone(raw)
    for(const tag of ['cmap','name','hmtx','GSUB','GPOS','fvar','gvar','CFF ']) {
      if(originalTables[tag]) { assert.deepEqual(restoredTables[tag],originalTables[tag],tag); assert.deepEqual(compactRaw[tag],originalTables[tag],tag) }
    }
    const wrap = await convertFont(web,'woff')
    const returned = await convertFont(wrap,'original')
    const tables = standalone(raw), after = standalone(returned)
    for(const tag of ['cmap','name','hhea']) assert.deepEqual(tables[tag],after[tag],tag)
    const second = await convertFont(wrap,'woff2')
    assert.equal(inspectFont(await convertFont(second,from.container)).container,from.container)
  }
})
