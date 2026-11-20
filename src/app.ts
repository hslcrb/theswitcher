import { detectFont, LIMITS, type Target } from './format.ts'
import type { Reply, RequestMessage } from './worker.ts'
import './style.css'

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T
const picker=$<HTMLInputElement>('files'), target=$<HTMLSelectElement>('target')
const drop=$('drop'), rows=$('jobs'), empty=$('empty'), status=$('status'), detail=$('detail')
const start=$<HTMLButtonElement>('start'), stop=$<HTMLButtonElement>('stop'), clear=$<HTMLButtonElement>('clear')
const progress=$<HTMLProgressElement>('progress')
const memory = (navigator as Navigator & {deviceMemory?: number}).deviceMemory
const mib=1024**2
const budgets = memory !== undefined && memory <= 2 ? [6,12,24]
  : memory === undefined || memory <= 4 ? [8,20,36] : [20,32,64]
const [inputBudget,rawBudget,resultBudget]=budgets.map(n=>n*mib)
$('limits').textContent=`이 기기에서 파일당 ${budgets[0]} MiB · 압축 해제 ${budgets[1]} MiB · 최대 ${LIMITS.batch}개`

type State='checking'|'queued'|'running'|'done'|'error'|'cancelled'
type Job={id:number; file:File; format:string; state:State; info:string; result?:{url:string;name:string;bytes:number}; ui?:JobUI}
type JobUI={row:HTMLElement; badge:HTMLElement; meta:HTMLElement; actions:HTMLElement}
const jobs:Job[]=[]
let id=0, active=false, pause=false, current:Job|undefined, worker:Worker|undefined, timer=0, cacheBytes=0, generation=0
const labels={checking:'확인 중',queued:'대기',running:'변환 중',done:'완료',error:'실패',cancelled:'취소'}
const fmt=(n:number) => n >= mib ? `${(n/mib).toFixed(2)} MiB` : n>=1024 ? `${(n/1024).toFixed(1)} KiB` : `${n} B`
const baseName=(filename:string)=>filename.replace(/\.[^.]+$/,'').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').trim().slice(0,120)||'font'
function note(title:string, secondary:string) { status.textContent=title; detail.textContent=secondary }
function makeButton(label:string,action:()=>void) {
  const b=document.createElement('button');b.type='button';b.className='quiet';b.textContent=label;b.onclick=action;return b
}
function refresh() {
  empty.hidden=jobs.length>0
  const waiting=jobs.filter(j=>j.state==='queued').length
  start.disabled=active||waiting===0
  stop.disabled=!active
  clear.disabled=active||!jobs.length
  target.disabled=active
  start.textContent=waiting?`변환 시작 · ${waiting}개`:'변환 시작'
  $('count').textContent=`${jobs.length} / ${LIMITS.batch}개`
}
function render(j:Job) {
  if(!j.ui) {
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
  if(j.result) {
    const a=document.createElement('a');a.className='save';a.href=j.result.url;a.download=j.result.name;a.textContent='내려받기'
    actions.append(a)
  }
  if(j.state==='cancelled') actions.append(makeButton('다시 대기',()=>{j.state='queued';j.info='';render(j);refresh()}))
  if(j.state!=='running') actions.append(makeButton('제거',()=>remove(j)))
}
function remove(j:Job) {
  if(j.result){URL.revokeObjectURL(j.result.url);cacheBytes-=j.result.bytes}
  const index=jobs.indexOf(j);if(index>=0)jobs.splice(index,1)
  j.ui?.row.remove();refresh()
}
function add(files: FileList | File[]) {
  let skipped=0, added=0
  for(const file of files){
    if(jobs.length>=LIMITS.batch){skipped++;continue}
    const j:Job={id:++id,file,format:'',state:'checking',info:''}
    jobs.push(j);added++;render(j)
    // 작은 헤더만 UI에서 읽고, 전체 작업은 워커로 분리한다.
    // Inspect only the tiny header here; full reads and codec work stay off the UI.
    void (async()=>{
      try {
        if(file.size<4||file.size>inputBudget)throw new Error(`파일당 ${budgets[0]} MiB 한도 또는 빈 파일`)
        const flavor=detectFont(new Uint8Array(await file.slice(0,48).arrayBuffer()))
        j.state='queued';j.format=flavor.container.toUpperCase()
        j.info=flavor.container.startsWith('woff')?`${flavor.flavor.toUpperCase()} 윤곽`:''
      } catch(error){j.state='error';j.info=error instanceof Error?error.message:'읽을 수 없는 파일'}
      if(jobs.includes(j)){render(j);refresh()}
    })()
  }
  if(!active)note(added?`${added}개 추가됨`:'파일 한도 도달',skipped?`${skipped}개 제외 · 파일 개수 한도`:'')
  refresh()
}
// 단일 워커만 두고 매 파일마다 메모리를 반납한다. / Retire the only worker after each file.
function dispose() {window.clearTimeout(timer);worker?.terminate();worker=undefined}
const stageLabel={inspect:'파일 구조 확인',decode:'웹폰트 압축 해제',encode:'지정한 형식으로 변환',verify:'출력 형식 검증'} as const
function advance(format:Target, run:number) {
  if(run!==generation || !active) return
  dispose()
  if(pause) { finish('변환 중지','대기 파일은 다시 시작할 수 있습니다.');return }
  current=jobs.find(j=>j.state==='queued')
  if(!current){finish('처리 완료',`완료 ${jobs.filter(j=>j.state==='done').length}개 · 실패 ${jobs.filter(j=>j.state==='error').length}개`);return}
  const j=current
  j.state='running';j.info='메모리 한도 확인 중';render(j)
  progress.removeAttribute('value');note('변환 중',j.file.name);refresh()
  const next=(error?:string)=>{
    if(error){j.state='error';j.info=error;render(j)}
    window.setTimeout(()=>advance(format,run),0)
  }
  // 레퍼런스 Emscripten만 제한된 별도 진입점으로. / Only legacy codec work uses the compatibility entry.
  const entry=j.format==='WOFF2'||format==='woff2-compact'?'./worker-compat.js':'./worker.js'
  try { worker=new Worker(new URL(entry,import.meta.url),{type:'module',name:'font-conversion'}) }
  catch { next('이 환경에서는 변환 작업자를 시작할 수 없습니다.');return }
  worker.onmessage=({data}:MessageEvent<Reply>)=>{
    if(current!==j||j.state!=='running')return
    if(data.type==='progress'){
      const label=stageLabel[data.value.stage]
      if(data.value.fraction===undefined)progress.removeAttribute('value');else progress.value=data.value.fraction
      if(j.info!==label){j.info=label;render(j);note(label,j.file.name)}
      return
    }
    if(data.type==='error'){dispose();next(data.message);return}
    dispose()
    if(data.result.size>resultBudget-cacheBytes) {next('결과 보관 한도에 도달했습니다. 이전 결과를 내려받고 제거한 뒤 다시 추가해 주세요.');return}
    cacheBytes+=data.result.size
    j.result={url:URL.createObjectURL(data.result),name:`${baseName(j.file.name)}.${data.extension}`,bytes:data.result.size}
    j.state='done';j.info=`${data.extension.toUpperCase()} · ${fmt(data.result.size)}`;render(j)
    next()
  }
  worker.onerror=(event)=>{event.preventDefault();dispose();next('변환 모듈을 불러오지 못했습니다. 연결을 확인하거나 페이지를 새로 고쳐 주세요.')}
  worker.onmessageerror=()=>{dispose();next('브라우저에서 결과를 전달하지 못했습니다.')}
  timer=window.setTimeout(()=>{dispose();next('한 파일의 처리 제한 시간(45초)을 넘겨 중단했어요.')},45_000)
  const request:RequestMessage={file:j.file,target:format,inputBudget,rawBudget}
  try {worker.postMessage(request)} catch {dispose();next('브라우저가 파일을 작업자에게 전달하지 못했습니다.')}
}
function finish(title:string,subtitle:string){dispose();current=undefined;active=false;progress.value=0;note(title,subtitle);refresh()}
picker.onchange=()=>{if(picker.files)add(picker.files);picker.value=''}
start.onclick=()=>{if(active)return;active=true;pause=false;advance(target.value as Target,++generation)}
stop.onclick=()=>{
  if(!active)return;pause=true;generation++
  if(current?.state==='running'){current.state='cancelled';current.info='사용자가 중지함';render(current)}
  // 동기 WASM도 작업자 전체를 끊으면 중지된다. / Termination interrupts synchronous WASM too.
  finish('변환 중지','대기 파일은 다시 시작할 수 있습니다.')
}
clear.onclick=()=>{if(active)return;for(const j of [...jobs])remove(j);note('대기','')}
drop.ondragover=(e)=>{e.preventDefault();drop.dataset.drag='true'}
drop.ondragleave=(e)=>{if(!drop.contains(e.relatedTarget as Node))delete drop.dataset.drag}
drop.ondrop=(e)=>{e.preventDefault();delete drop.dataset.drag;if(e.dataTransfer)add(e.dataTransfer.files)}
// Avoid browser navigation if a dropped file lands just outside the drop zone.
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault()})
document.addEventListener('drop',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault()})
window.addEventListener('pagehide',e=>{if(!e.persisted){dispose();for(const j of jobs)if(j.result)URL.revokeObjectURL(j.result.url)}})
refresh()
