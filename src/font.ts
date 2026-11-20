import { FontIssue } from './diagnostics.ts'
import { detectFont, LIMITS, WOFF, flavorFor, fail, view, type Target } from './format.ts'
export { detectFont, LIMITS } from './format.ts'
export type { Container, Target } from './format.ts'
const pad = (n: number) => Math.ceil(n / 4) * 4

type Table = { tag: string; tagValue: number; offset: number; length: number; packed: number; checksum: number }
function entry(d: DataView, start: number, web: boolean): Table {
  const tagValue = d.getUint32(start)
  const tag = String.fromCharCode(d.getUint8(start),d.getUint8(start+1),d.getUint8(start+2),d.getUint8(start+3))
  if (!/^[\x20-\x7e]{4}$/.test(tag)) return fail('유효하지 않은 테이블 이름입니다.', 'INVALID_DIRECTORY')
  const length = d.getUint32(start + 12)
  return {tag, tagValue, offset:d.getUint32(start + (web ? 4 : 8)), length,
    packed:web ? d.getUint32(start + 8) : length, checksum:d.getUint32(start + (web ? 16 : 4))}
}
function validateRanges(tables: Table[], beginning: number, end: number, rawBudget: number) {
  const seen = new Set<number>()
  let raw = 12 + tables.length * 16
  for(const t of tables) {
    if(seen.has(t.tagValue)) return fail('중복된 테이블입니다.', 'INVALID_DIRECTORY')
    seen.add(t.tagValue)
    if(t.offset < beginning || t.offset > end || t.offset % 4 !== 0 || t.packed > end - t.offset || t.packed > t.length)
      return fail('테이블 범위가 잘못되었습니다.', 'INVALID_RANGE')
    raw += pad(t.length)
    if(raw > rawBudget) return fail('압축을 풀었을 때의 크기가 안전 한도를 넘습니다.', 'RAW_LIMIT')
  }
  let edge=beginning
  for(const t of tables.filter(t=>t.packed).sort((a,b)=>a.offset-b.offset)) {
    if(t.offset < edge) return fail('서로 겹치는 테이블이 있습니다.', 'INVALID_RANGE')
    edge=t.offset+t.packed
  }
  return raw
}
function extract(d: DataView, count: number, start: number, width: number, web: boolean) {
  if (count < 1 || count > LIMITS.tables || start + count * width > d.byteLength)
    return fail('테이블 수나 디렉터리 범위가 잘못되었습니다.', 'INVALID_DIRECTORY')
  return Array.from({length:count}, (_,i)=>entry(d,start+i*width,web))
}
export function parseSfnt(b: Uint8Array, rawBudget: number = LIMITS.raw) {
  if (b.length < 12 || b.length > rawBudget) return fail('원본 폰트 크기 또는 헤더가 안전 한도를 벗어났습니다.', 'RAW_LIMIT')
  const d = view(b), marker=d.getUint32(0), flavor=flavorFor(marker), count=d.getUint16(4)
  const tables=extract(d,count,12,16,false)
  validateRanges(tables,12+count*16,b.length,rawBudget)
  const tags=new Set(tables.map(t=>t.tag))
  // Verify the fixed head record before accepting or allocating an output.
  // 고정 헤더 필드를 확인한 다음 포맷을 신뢰한다.
  const head=tables.find(t=>t.tag==='head')
  if(!head||head.length<54||d.getUint32(head.offset+12)!==0x5f0f3cf5)
    return fail('필수 head 테이블이 손상되었습니다.', 'INVALID_DIRECTORY')
  if(!tags.has('head') || (flavor==='ttf' ? !tags.has('glyf')||!tags.has('loca') : !tags.has('CFF ')&&!tags.has('CFF2')))
    return fail('폰트 윤곽선과 필수 테이블이 헤더의 형식과 맞지 않습니다.', 'INVALID_OUTLINE')
  return {tables, flavor, marker}
}

/** Bound both the original and transformed Brotli output before loading WASM. */
function validateWoff2Directory(d: DataView, count: number, budget: number) {
  let offset=48, expanded=0, declaredSfnt=12+count*16
  const byte=()=>{
    if(offset>=d.byteLength) return fail('WOFF2 테이블 디렉터리가 잘렸습니다.', 'INVALID_DIRECTORY')
    return d.getUint8(offset++)
  }
  function base128() {
    let n=0
    for(let i=0;i<5;i++){
      const b=byte()
      if((i===0&&b===0x80) || n>=0x02000000) return fail('WOFF2 정수 범위가 잘못되었습니다.', 'INVALID_RANGE')
      n=n*128+(b&127)
      if(!(b&128))return n
    }
    return fail('WOFF2 정수 길이가 잘못되었습니다.', 'INVALID_DIRECTORY')
  }
  for(let i=0;i<count;i++){
    const flags=byte(), tag=flags&63, transform=flags>>>6
    let custom=0
    if(tag===63)for(let j=0;j<4;j++)custom=custom*256+byte()
    const glyf=tag===10||custom===0x676c7966,loca=tag===11||custom===0x6c6f6361
    const hmtx=tag===3||custom===0x686d7478
    if(glyf||loca) {
      if(transform!==0&&transform!==3) return fail('지원하지 않는 WOFF2 윤곽 변환입니다.', 'INVALID_OUTLINE')
    } else if(transform!==0 && !(hmtx&&transform===1)) return fail('지원하지 않는 WOFF2 테이블 변환입니다.', 'INVALID_DIRECTORY')
    const original=base128(), changed=(glyf||loca)?transform===0:transform!==0
    const transformed=changed?base128():original
    if(loca&&changed&&transformed!==0) return fail('WOFF2 loca 변환 길이가 잘못되었습니다.', 'INVALID_COMPRESSION')
    declaredSfnt+=pad(original);expanded+=transformed
    if(declaredSfnt>budget||expanded>budget) return fail('압축 데이터의 확장 크기가 안전 한도를 넘습니다.', 'RAW_LIMIT')
  }
  const compressed=d.getUint32(20)
  if(!compressed||compressed>d.byteLength-offset) return fail('WOFF2 압축 범위가 잘못되었습니다.', 'INVALID_RANGE')
  auxiliaryLimit(d,offset+compressed,[[d.getUint32(28),d.getUint32(32)],[d.getUint32(40),d.getUint32(44)]])
}

// Wrapper metadata and private sections are not carried forward, but must still
// occupy valid non-overlapping file ranges. / 보존하지 않는 부가 블록도 범위를 검사한다.
function auxiliaryLimit(d:DataView, min:number, blocks:readonly [number,number][]) {
  let first=d.byteLength, end=min
  for(const [offset,length] of blocks) {
    if(!offset&&!length) continue
    if(!offset||!length||offset%4||offset<end||offset>d.byteLength||length>d.byteLength-offset)
      return fail('웹폰트 부가 데이터 범위가 잘못되었습니다.', 'INVALID_RANGE')
    first=Math.min(first,offset);end=offset+length
  }
  return first
}

export function inspectFont(b: Uint8Array, rawBudget: number = LIMITS.raw) {
  const kind=detectFont(b)
  if(kind.container==='ttf' || kind.container==='otf') { parseSfnt(b,rawBudget); return kind }
  const d=view(b),declared=d.getUint32(8), count=d.getUint16(12),raw=d.getUint32(16)
  if(declared!==b.length || d.getUint16(14)!==0) return fail('웹폰트 헤더 길이가 파일과 맞지 않습니다.')
  if(count<1 || count>LIMITS.tables || raw < 12+count*16 || raw > rawBudget)
    return fail('압축을 풀었을 때의 크기 또는 테이블 수가 안전 한도를 벗어났습니다.', 'RAW_LIMIT')
  if(kind.container==='woff'){
    const tables=extract(d,count,44,20,true)
    const firstAux=auxiliaryLimit(d,44+count*20,[[d.getUint32(24),d.getUint32(28)],[d.getUint32(36),d.getUint32(40)]])
    if(validateRanges(tables,44+count*20, firstAux, rawBudget)!==raw) return fail('예상 원본 크기와 테이블이 맞지 않습니다.', 'INVALID_COMPRESSION')
  } else {
    validateWoff2Directory(d,count,rawBudget)
  }
  return kind
}

function sum(bytes: Uint8Array, head = false) {
  let result=0
  for(let i=0;i<bytes.length;i+=4) {
    if(head && i===8) continue
    result=(result+((bytes[i]??0)*0x1000000+(bytes[i+1]??0)*0x10000+(bytes[i+2]??0)*0x100+(bytes[i+3]??0)))>>>0
  }
  return result
}
function toStream(data: Uint8Array) {
  // File and WASM buffers here are non-shared. Transfer occurs only across the worker boundary.
  return new Blob([data as Uint8Array<ArrayBuffer>]).stream()
}
// Read into a fixed output slice; never grow to fit a corrupt stream.
// 잘못된 압축 데이터를 따라 버퍼를 늘리지 않는다.
async function inflateInto(input: Uint8Array, output: Uint8Array) {
  const r=toStream(input).pipeThrough(new DecompressionStream('deflate')).getReader()
  let written = 0
  try {
    for (;;) {
      const {value,done}=await r.read()
      if(done) break
      if(value.byteLength>output.length-written) { await r.cancel(); return fail('압축 데이터가 선언된 테이블 크기를 넘었습니다.', 'INVALID_COMPRESSION') }
      output.set(value,written);written+=value.byteLength
    }
  } finally { r.releaseLock() }
  if(written!==output.length) return fail('압축 데이터가 선언된 길이와 일치하지 않습니다.', 'INVALID_COMPRESSION')
}
async function deflate(input: Uint8Array) {
  const result=await new Response(toStream(input).pipeThrough(new CompressionStream('deflate'))).arrayBuffer()
  return result.byteLength<input.length ? new Uint8Array(result) : input
}

async function unpackWoff(b: Uint8Array, progress: Progress) {
  const d=view(b), count=d.getUint16(12)
  const tables=extract(d,count,44,20,true).sort((a,b)=>a.tagValue-b.tagValue)
  const out=new Uint8Array(d.getUint32(16)),v=view(out)
  const power=2**Math.floor(Math.log2(count))
  v.setUint32(0,d.getUint32(4));v.setUint16(4,count);v.setUint16(6,power*16);v.setUint16(8,Math.log2(power));v.setUint16(10,count*16-power*16)
  let offset=12+count*16,headOffset=-1
  for(let i=0;i<count;i++){
    const t=tables[i],e=12+i*16,src=b.subarray(t.offset,t.offset+t.packed)
    const dst=out.subarray(offset,offset+t.length)
    if(t.packed===t.length) dst.set(src)
    else await inflateInto(src,dst)
    if(t.tag==='head'&&t.length>=12) {headOffset=offset;v.setUint32(offset+8,0)}
    v.setUint32(e,t.tagValue);v.setUint32(e+4,sum(dst,t.tag==='head'));v.setUint32(e+8,offset);v.setUint32(e+12,t.length)
    offset+=pad(t.length)
    if(i%8===0||i+1===count) progress({stage:'decode',fraction:(i+1)/count,tables:{done:i+1,total:count}})
  }
  if(headOffset>=0) v.setUint32(headOffset+8,(0xb1b0afba-sum(out))>>>0)
  return out
}

async function packWoff(b: Uint8Array, rawBudget: number, progress: Progress) {
  const {tables,marker}=parseSfnt(b,rawBudget); tables.sort((a,b)=>a.tagValue-b.tagValue)
  const blocks: Uint8Array[]=[]
  let total=44+tables.length*20, raw=12+tables.length*16
  for(let i=0;i<tables.length;i++){
    const t=tables[i], src=b.subarray(t.offset,t.offset+t.length)
    const block=src.length>20 ? await deflate(src) : src
    total+=pad(block.length);raw+=pad(src.length);blocks.push(block)
    if(i%8===0||i+1===tables.length) progress({stage:'encode',fraction:(i+1)/tables.length,tables:{done:i+1,total:tables.length}})
  }
  const out=new Uint8Array(total),d=view(out)
  d.setUint32(0,WOFF);d.setUint32(4,marker);d.setUint32(8,total);d.setUint16(12,tables.length);d.setUint32(16,raw)
  let offset=44+tables.length*20
  for(let i=0;i<tables.length;i++){
    const t=tables[i],block=blocks[i],e=44+i*20
    d.setUint32(e,t.tagValue);d.setUint32(e+4,offset);d.setUint32(e+8,block.length);d.setUint32(e+12,t.length)
    d.setUint32(e+16,sum(b.subarray(t.offset,t.offset+t.length),t.tag==='head'));out.set(block,offset);offset+=pad(block.length)
  }
  return out
}

export type ProgressEvent={stage:'read'|'inspect'|'load-decoder'|'decode'|'load-encoder'|'encode'|'verify';fraction?:number;tables?:{done:number;total:number}}
type Progress = (progress: ProgressEvent)=>void

async function loadCodec<T>(load:()=>Promise<T>) {
  try{return await load()}catch{throw new FontIssue('CODEC_INIT')}
}

export async function convertFont(input: Uint8Array, target: Target, options: {rawBudget?:number;progress?:Progress}={}) {
  const rawBudget=options.rawBudget??LIMITS.raw, progress=options.progress??(()=>{})
  progress({stage:'inspect'})
  const source=inspectFont(input,rawBudget)
  const format=target==='original'?source.flavor:target==='woff2-compact'?'woff2':target
  if((format==='ttf'||format==='otf')&&source.flavor!==format)
    return fail('이 폰트의 윤곽선은 ' + source.flavor.toUpperCase() + '입니다. 원본 윤곽 또는 WOFF 형식을 선택하세요.', 'INVALID_OUTLINE')
  // 같은 컨테이너는 재인코딩하지 않는다. / Pass through, except explicitly requested compaction.
  if(format===source.container&&target!=='woff2-compact'){progress({stage:'verify'});return input}
  let sfnt=input
  if(source.container==='woff'){
    if(typeof DecompressionStream==='undefined')throw new FontIssue('STREAM_UNAVAILABLE')
    progress({stage:'decode'});sfnt=await unpackWoff(input,progress)
  }
  if(source.container==='woff2') {
    progress({stage:'load-decoder'})
    const {default:decompress}=await loadCodec(()=>import('woff2-encoder/decompress'))
    progress({stage:'decode'})
    sfnt=await decompress(input)
  }
  const parsed=parseSfnt(sfnt,rawBudget)
  let out=sfnt
  if(format==='woff'){
    if(typeof CompressionStream==='undefined')throw new FontIssue('STREAM_UNAVAILABLE')
    progress({stage:'encode'});out=await packWoff(sfnt,rawBudget,progress)
  }
  if(format==='woff2') {
    progress({stage:'load-encoder'})
    if(target==='woff2-compact'){
      const {compress}=await loadCodec(()=>import('woff2-encoder'))
      progress({stage:'encode'})
      out=await compress(sfnt)
    } else {
      const {encodeWoff2Fast}=await loadCodec(()=>import('./woff2-fast.ts'))
      progress({stage:'encode'})
      out=encodeWoff2Fast(sfnt,parsed.marker,parsed.tables)
    }
  }
  progress({stage:'verify'})
  const result=inspectFont(out,rawBudget)
  if(result.container!==format||result.flavor!==source.flavor) return fail('출력 형식이 일치하지 않습니다.', 'INVALID_OUTPUT')
  return out
}
