import { FontIssue, safeFailure, type FailureCode, type SafeFailure } from './diagnostics.ts'
import { convertFont, detectFont, LIMITS, type ProgressEvent, type Target } from './font.ts'

export type RequestMessage = { file: File; target: Target; inputBudget: number; rawBudget: number }
export type Reply = {type:'progress';value:ProgressEvent}
  | {type:'done';result:Blob;extension:string}
  | {type:'error';failure:SafeFailure}

const scope = self as unknown as DedicatedWorkerGlobalScope
let active=false
scope.onmessage=async ({data}:MessageEvent<RequestMessage>)=>{
  if(active)return
  active=true
  const post=(message:Reply)=>scope.postMessage(message)
  let fallback:FailureCode='FILE_READ'
  try {
    const inputBudget=Math.min(data.inputBudget,LIMITS.input)
    const rawBudget=Math.min(data.rawBudget,LIMITS.raw)
    if(!(data.file instanceof File))throw new FontIssue('FILE_READ')
    if(data.file.size===0)throw new FontIssue('INPUT_EMPTY')
    if(data.file.size>inputBudget)throw new FontIssue('INPUT_LIMIT')
    if(data.file.size<4)throw new FontIssue('INVALID_HEADER')
    post({type:'progress',value:{stage:'read'}})
    const buffer=new Uint8Array(await data.file.arrayBuffer())
    const output=await convertFont(buffer,data.target,{rawBudget,progress:value=>{
      // The worker forwards controlled stages and codes, never the exception stack.
      // 정해진 단계와 코드만 보내며 원본 예외 스택은 전달하지 않는다.
      fallback=value.stage==='inspect'?'INVALID_HEADER':value.stage==='verify'?'INVALID_OUTPUT':'CODEC_REJECTED'
      post({type:'progress',value})
    }})
    fallback='INVALID_OUTPUT'
    const extension=detectFont(output).container
    const mime={ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'}[extension]
    // 검증한 동일 파일은 복사하지 않는다. / Reuse the immutable File after validation.
    post({type:'done',result:output===buffer?data.file:new Blob([output as Uint8Array<ArrayBuffer>],{type:mime}),extension})
  }catch(error){post({type:'error',failure:safeFailure(error,fallback)})}
  finally{active=false}
}
