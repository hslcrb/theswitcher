import { readFile } from 'node:fs/promises'
import { compress, decompress } from 'woff2-encoder'
import { encodeWoff2Fast } from '../src/woff2-fast.ts'
import {inspectFont,parseSfnt} from '../src/font.ts'
import assert from 'node:assert/strict'
const files = process.argv.slice(2)
const all=[]
for(const file of files){
 const input=new Uint8Array(await readFile(file))
 const parsed=parseSfnt(input)
 const runFast=()=>encodeWoff2Fast(input,parsed.marker,parsed.tables)
 const baseline=await compress(input),fast=runFast()
 const rawBase=await decompress(baseline),rawFast=await decompress(fast)
 assert.equal(inspectFont(rawFast).flavor,inspectFont(rawBase).flavor)
 const tables = (raw)=>new Map(parseSfnt(raw).tables.map(t=>[t.tag,raw.slice(t.offset,t.offset+t.length)]))
 const ref=tables(rawBase),got=tables(rawFast)
 for(const tag of ['cmap','name','GPOS','GSUB','hmtx','fvar','gvar','CFF ']) if(ref.has(tag)) assert.deepEqual(got.get(tag),ref.get(tag),tag)
 const ms={baseline:[],fast:[]}
 for(let i=0;i<5;i++){
   for (const v of (i%2 ? ['fast','baseline'] : ['baseline','fast'])) {
     const start=performance.now()
     if(v==='baseline') await compress(input)
     else runFast()
     ms[v].push(performance.now()-start)
   }
 }
 const median=(l)=>[...l].sort((a,b)=>a-b)[Math.floor(l.length/2)]
 all.push({font:file.split('/').at(-1),input:input.length,baselineBytes:baseline.length,fastBytes:fast.length,medianBaseline:median(ms.baseline),medianFast:median(ms.fast),ms})
}
console.log(JSON.stringify(all,null,2))
