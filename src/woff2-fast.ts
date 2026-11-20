import { BrotliEncoder } from 'brotli-lib/encode-no-dict'
import { view, WOFF2 } from './format.ts'

type TableSpan = { tag:string; tagValue:number; offset:number; length:number }
const KNOWN='cmap,head,hhea,hmtx,maxp,name,OS/2,post,cvt ,fpgm,glyf,loca,prep,CFF ,VORG,EBDT,EBLC,gasp,hdmx,kern,LTSH,PCLT,VDMX,vhea,vmtx,BASE,GDEF,GPOS,GSUB,EBSC,JSTF,MATH,CBDT,CBLC,COLR,CPAL,SVG ,sbix,acnt,avar,bdat,bloc,bsln,cvar,fdsc,feat,fmtx,fvar,gvar,hsty,just,lcar,mort,morx,opbd,prop,trak,Zapf,Silf,Glat,Gloc,Feat,Sill'.split(',')
const GLYF=0x676c7966, LOCA=0x6c6f6361, HEAD=0x68656164

function base128(value:number, out:number[]) {
  // OpenType 길이를 부호 없이 big-endian Base128로 쓴다. / Emit canonical unsigned Base128.
  let shift=0
  for(let v=value;v>=128;v=Math.floor(v/128)) shift+=7
  for(;shift>=0;shift-=7)out.push((Math.floor(value / 2**shift)&127)|(shift>0?128:0))
}

/**
 * 급한 작업용 WOFF2: 원본 테이블에 손대지 않고 Brotli 스트림에 순차 입력.
 * Fast WOFF2: stream original tables with null transforms, never rewrite outlines.
 */
export function encodeWoff2Fast(font:Uint8Array, marker:number, tables:readonly TableSpan[]) {
  const ordered=[...tables].filter(t=>t.tagValue!==0x44534947).sort((a,b)=>a.tagValue-b.tagValue)
  // DSIG cannot remain valid across container serialization. / 컨테이너 재작성 후 DSIG는 유효하지 않다.
  const directory:number[]=[]
  let raw=12+ordered.length*16, bytes=0, major=0, minor=0
  const blocks:Uint8Array[]=[]
  const encoder=new BrotliEncoder({quality:5,lgwin:19})
  for(const t of ordered) {
    const tag=t.tagValue
    // Custom tag 63 is legal for every tag. Null transforms for glyf/loca use version 3.
    // 태그 63은 4바이트 태그를 뒤에 적는 규격이며 glyf/loca 무변환은 버전 3이다.
    const known=KNOWN.indexOf(t.tag)
    const flag=tag===GLYF||tag===LOCA?192:0
    directory.push((known<0?63:known)|flag)
    if(known<0) directory.push(tag>>>24,(tag>>>16)&255,(tag>>>8)&255,tag&255)
    base128(t.length,directory)
    raw+=Math.ceil(t.length/4)*4
    const table=font.subarray(t.offset,t.offset+t.length)
    if(tag===HEAD&&table.length>=8){const d=view(table);major=d.getUint16(4);minor=d.getUint16(6)}
    const piece=encoder.update(table)
    if(piece.length){blocks.push(piece);bytes+=piece.length}
  }
  const tail=encoder.finish()
  if(tail.length){blocks.push(tail);bytes+=tail.length}
  const out=new Uint8Array(Math.ceil((48+directory.length+bytes)/4)*4),d=view(out)
  d.setUint32(0,WOFF2);d.setUint32(4,marker);d.setUint32(8,out.length)
  d.setUint16(12,ordered.length);d.setUint32(16,raw);d.setUint32(20,bytes);d.setUint16(24,major);d.setUint16(26,minor)
  out.set(directory,48)
  let offset=48+directory.length
  for(const block of blocks){out.set(block,offset);offset+=block.length}
  return out
}
