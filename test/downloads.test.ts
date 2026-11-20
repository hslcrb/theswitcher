import assert from 'node:assert/strict'
import test from 'node:test'
import { decodePreferences, encodePreferences, safeFilename, writeNewFile, PREF_COOKIE } from '../src/downloads.ts'
test('only fixed preference flags persist under the Latin cookie pet names',()=>{
  const stored=encodePreferences({useBrowser:false,autoSelect:false})
  assert.equal(PREF_COOKIE,'jjondeukCookie')
  assert.match(stored,/gingerbreadManCookie/)
  assert.match(stored,/purePickledGingerCookie/)
  assert.deepEqual(decodePreferences(PREF_COOKIE+'='+stored),{useBrowser:false,autoSelect:false})
  assert.deepEqual(decodePreferences(PREF_COOKIE+'='+encodePreferences({useBrowser:true,autoSelect:true})),{useBrowser:true,autoSelect:true})
  assert.deepEqual(decodePreferences(PREF_COOKIE+'=../path'),{useBrowser:true,autoSelect:true})
})
test('normalizes unsafe and Windows-sensitive output names',()=>{
  assert.equal(safeFilename('CON.ttf','woff2'),'_CON.woff2')
  assert.equal(safeFilename('../a:b.otf','woff'),'_a_b.woff')
  assert.equal(safeFilename('normal.ttf','html'),'normal.font')
})
test('directory save never intentionally opens an existing filename for writing',async()=>{
  const writes:string[]=[]
  const names=new Set(['letter.woff2'])
  const dir={
    async getFileHandle(name:string, options?:{create?:boolean}){
      if(!options?.create&&!names.has(name))throw new DOMException('missing','NotFoundError')
      if(options?.create)names.add(name)
      return {async createWritable(){return {async write(){writes.push(name)},async close(){},async abort(){}}}}
    }
  }
  const chosen=await writeNewFile(dir,'letter.woff2',new Blob(['sample']))
  assert.equal(chosen,'letter-2.woff2')
  assert.deepEqual(writes,['letter-2.woff2'])
})
