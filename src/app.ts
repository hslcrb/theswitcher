import { detectFont, LIMITS, type Target } from './format.ts'
import { MIB, nextFitting, profile, progressAt, reservation } from './pool.ts'
import type { Reply, RequestMessage } from './worker.ts'
import './style.css'

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T
const picker=$<HTMLInputElement>('files'), target=$<HTMLSelectElement>('target')
const drop=$('drop'), rows=$('jobs'), empty=$('empty'), status=$('status'), detail=$('detail')
const start=$<HTMLButtonElement>('start'), stop=$<HTMLButtonElement>('stop'), clear=$<HTMLButtonElement>('clear')
const progress=$<HTMLProgressElement>('progress')
const memory=(navigator as Navigator & {deviceMemory?: number}).deviceMemory
const limits=profile(memory,navigator.hardwareConcurrency||2)
$('limits').textContent=`파일당 ${limits.input/MIB} MiB · 최대 ${limits.slots}개 동시 변환`

type State='checking'|'queued'|'running'|'done'|'error'|'cancelled'
type Job={file:File; format:string; state:State; info:string; rawLimit:number; fraction:number; result?:{url:string;name:string;bytes:number}; ui?:JobUI}
type JobUI={row:HTMLElement; badge:HTMLElement; meta:HTMLElement; actions:HTMLElement}
type Active={worker?:Worker;timer?:number;bytes:number}
const jobs:Job[]=[]
const active=new Map<Job,Active>()
let batch:Job[]|null=null, mode:Target='woff2', cacheBytes=0, reserved=0
const labels={checking:'확인 중',queued:'대기',running:'변환 중',done:'완료',error:'실패',cancelled:'취소'}
const fmt=(n:number) => n >= MIB ? `${(n/MIB).toFixed(2)} MiB` : n>=1024 ? `${(n/1024).toFixed(1)} KiB` : `${n} B`
const baseName=(filename:string)=>filename.replace(/\.[^.]+$/,'').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').trim().slice(0,120)||'font'
function note(title:string, secondary:string){status.textContent=title;detail.textContent=secondary}
function makeButton(label:string,action:()=>void) {
  const b=document.createElement('button');b.type='button';b.className='quiet';b.textContent=label;b.onclick=action;return b
}
function refresh() {
  empty.hidden=jobs.length>0
  const waiting=jobs.filter(j=>j.state==='queued').length
  start.disabled=!!batch||waiting===0||jobs.some(j=>j.state==='checking')
  stop.disabled=!batch;clear.disabled=!!batch||!jobs.length
  target.disabled=!!batch;picker.disabled=!!batch
  start.textContent=waiting?`변환 시작 · ${waiting}개`:'변환 시작'
  $('count').textContent=`${jobs.length} / ${LIMITS.batch}개`
}
function render(j:Job) {
  if(!j.ui){
    const row=document.createElement('li');row.className='file-row'
    const title=document.createElement('div');title.className='file-title'
    const name=document.createElement('strong');name.textContent=j.file.name;name.title=j.file.name
    const meta=document.createElement('span');meta.className='file-meta';title.append(name,meta)
    const badge=document.createElement('span');badge.className='badge'
    const actions=document.createElement('div');actions.className='file-actions'
    row.append(title,badge,actions);rows.append(row);j.ui={row,badge,meta,actions}
  }
  const {badge, meta, actions}=j.ui
  badge.dataset.state=j.state;badge.textContent=labels[j.state]
  meta.textContent=[j.format,fmt(j.file.size),j.info].filter(Boolean).join(' · ')
  actions.replaceChildren()
  if(j.result){
    const a=document.createElement('a');a.className='save';a.href=j.result.url;a.download=j.result.name;a.textContent='내려받기'
    actions.append(a)
  }
  if(j.state==='cancelled'&&!batch)actions.append(makeButton('다시 대기',()=>{j.state='queued';j.info='';render(j);refresh()}))
  if(!batch)actions.append(makeButton('제거',()=>remove(j)))
}
function remove(j:Job) {
  if(batch)return
  if(j.result){URL.revokeObjectURL(j.result.url);cacheBytes-=j.result.bytes}
  const index=jobs.indexOf(j);if(index>=0)jobs.splice(index,1)
  j.ui?.row.remove();refresh()
}
function add(files: FileList | File[]) {
  if(batch)return
  let skipped=0,added=0
  for(const file of files){
    if(jobs.length>=LIMITS.batch){skipped++;continue}
    const j:Job={file,format:'',state:'checking',info:'',rawLimit:limits.raw,fraction:0}
    jobs.push(j);added++;render(j)
    // UI only probes a small header; each worker validates its own complete input.
    // UI는 헤더만 보고, 전체 유효성 검사는 각 워커에서 수행한다.
    void (async()=>{
      try{
        if(file.size<4||file.size>limits.input)throw new Error(`파일당 ${limits.input/MIB} MiB 한도 또는 빈 파일`)
        const head=await file.slice(0,48).arrayBuffer(), flavor=detectFont(new Uint8Array(head))
        j.format=flavor.container.toUpperCase()
        const wrapped=flavor.container.startsWith('woff')
        const raw=wrapped?new DataView(head).getUint32(16):file.size
        if(!raw||raw>limits.raw)throw new Error(`압축 해제 한도 ${limits.raw/MIB} MiB`)
        // WOFF2 normalization can slightly change SFNT size; still cap claims per task.
        // WOFF2의 원본 크기는 약간 달라질 수 있으므로 작업별 여유를 제한적으로만 둔다.
        j.rawLimit=Math.min(limits.raw,Math.max(raw+MIB,Math.ceil(raw*1.25)))
        j.state='queued';j.info=wrapped?`${flavor.flavor.toUpperCase()} 윤곽`:''
      }catch(error){j.state='error';j.info=error instanceof Error?error.message:'읽을 수 없는 파일'}
      if(jobs.includes(j)){render(j);refresh()}
    })()
  }
  note(added?`${added}개 추가됨`:'파일 한도 도달',skipped?`${skipped}개 제외 · 파일 개수 한도`:'')
  refresh()
}
const stageLabel={inspect:'파일 구조 확인',decode:'압축 해제',encode:'변환',verify:'결과 검증'} as const
const compatible=(j:Job)=>j.format==='WOFF2'||mode==='woff2-compact'
const cost=(j:Job)=>reservation(j.file.size,j.rawLimit,compatible(j))

function release(j:Job,item:Active){
  if(active.get(j)!==item)return false
  active.delete(j);reserved-=item.bytes
  window.clearTimeout(item.timer);item.worker?.terminate()
  return true
}

function paint() {
  if(!batch)return
  const done=batch.filter(j=>j.state==='done').length
  const failed=batch.filter(j=>j.state==='error').length
  const queued=batch.filter(j=>j.state==='queued').length
  // Fixed run membership and monotonic per-file milestones; no indeterminate pulses.
  // 배치 구성은 고정하며 파일별 확인된 진행점만 합산한다.
  const value=batch.reduce((a,j)=>a+j.fraction,0)/batch.length
  progress.value=Math.max(progress.value,value)
  note(`변환 중 ${active.size}개`,`대기 ${queued} · 완료 ${done} · 실패 ${failed} · ${Math.floor(progress.value*100)}%`)
}
function finish(cancelled:boolean){
  if(!batch)return
  const current=batch
  const totals=`완료 ${current.filter(j=>j.state==='done').length} · 실패 ${current.filter(j=>j.state==='error').length}`
  batch=null
  if(!cancelled)progress.value=1
  note(cancelled?'변환 중지':'처리 완료',totals)
  for(const j of jobs)render(j)
  refresh()
}
function dispatch(j:Job,bytes:number){
  const item:Active={bytes}
  active.set(j,item);reserved+=bytes
  j.state='running';j.info='파일 읽는 중';render(j)
  const finishJob=(message:string|undefined,result?:Blob,extension?:string)=>{
    // Stale callbacks after cancel/restart must not overwrite the current run.
    // 중지한 워커의 늦은 응답은 새 작업에 영향을 주면 안 된다.
    if(!release(j,item))return
    if(!message&&result){
      if(result.size>limits.results-cacheBytes) message='결과 보관 한도. 이전 결과를 저장한 뒤 제거해 주세요.'
      else {
        cacheBytes+=result.size
        j.result={url:URL.createObjectURL(result),name:`${baseName(j.file.name)}.${extension}`,bytes:result.size}
        j.info=`${extension?.toUpperCase()} · ${fmt(result.size)}`
      }
    }
    j.state=message?'error':'done';if(message)j.info=message
    j.fraction=1;render(j);queueMicrotask(pump)
  }
  try {
    const entry=compatible(j)?'./worker-compat.js':'./worker.js'
    const worker=new Worker(new URL(entry,import.meta.url),{type:'module',name:'font-conversion'})
    item.worker=worker
    worker.onmessage=({data}:MessageEvent<Reply>)=>{
      if(active.get(j)!==item)return
      if(data.type==='progress'){
        j.fraction=progressAt(data.value,j.fraction)
        const label=stageLabel[data.value.stage]
        if(j.info!==label){j.info=label;render(j)}
        paint();return
      }
      if(data.type==='error')finishJob(data.message)
      else finishJob(undefined,data.result,data.extension)
    }
    worker.onerror=e=>{e.preventDefault();finishJob('변환 모듈을 시작하지 못했습니다.')}
    worker.onmessageerror=()=>finishJob('결과를 전달하지 못했습니다.')
    item.timer=window.setTimeout(()=>finishJob('한 파일의 처리 제한(45초) 초과'),45_000)
    const request:RequestMessage={file:j.file,target:mode,inputBudget:limits.input,rawBudget:j.rawLimit}
    worker.postMessage(request)
  }catch{finishJob('브라우저가 변환 작업을 시작하지 못했습니다.')}
}
function pump(){
  if(!batch)return
  const candidates=batch.filter(j=>j.state==='queued')
  while(candidates.length){
    const amounts=candidates.map(cost)
    const index=nextFitting(amounts,limits.working,reserved,active.size,limits.slots)
    if(index<0)break
    const [job]=candidates.splice(index,1)
    dispatch(job,amounts[index])
  }
  if(!active.size&&!candidates.length)finish(false)
  else paint()
}
picker.onchange=()=>{if(picker.files)add(picker.files);picker.value=''}
start.onclick=()=>{
  if(batch)return
  const queued=jobs.filter(j=>j.state==='queued')
  if(!queued.length)return
  batch=queued;mode=target.value as Target;progress.value=0
  for(const j of jobs){j.fraction=0;render(j)}
  refresh();pump()
}
stop.onclick=()=>{
  if(!batch)return
  for(const [j,item] of active){
    release(j,item);j.state='cancelled';j.info='사용자가 중지함'
  }
  finish(true)
}
clear.onclick=()=>{if(batch)return;for(const j of [...jobs])remove(j);progress.value=0;note('대기','')}
drop.ondragover=e=>{e.preventDefault();if(!batch)drop.dataset.drag='true'}
drop.ondragleave=e=>{if(!drop.contains(e.relatedTarget as Node))delete drop.dataset.drag}
drop.ondrop=e=>{e.preventDefault();delete drop.dataset.drag;if(e.dataTransfer)add(e.dataTransfer.files)}
// An accidental drop outside the picker should never navigate away.
// 입력 영역 밖에 파일을 놓아도 브라우저 기본 탐색을 막는다.
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault()})
document.addEventListener('drop',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault()})
window.addEventListener('pagehide',e=>{if(!e.persisted){
  for(const [j,item] of active)release(j,item)
  for(const j of jobs)if(j.result)URL.revokeObjectURL(j.result.url)
}})
refresh()
