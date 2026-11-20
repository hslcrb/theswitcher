import { convertFont, detectFont, LIMITS, type ProgressEvent, type Target } from './font.ts'

export type RequestMessage = { file: File; target: Target; inputBudget: number; rawBudget: number }
export type Reply = {type:'progress'; value:ProgressEvent}
  | {type:'done'; result:Blob; extension:string}
  | {type:'error'; message:string}

const scope = self as unknown as DedicatedWorkerGlobalScope
let active = false
scope.onmessage = async ({data}: MessageEvent<RequestMessage>) => {
  if (active) return
  active=true
  const post = (message: Reply) => scope.postMessage(message)
  try {
    const inputBudget = Math.min(data.inputBudget, LIMITS.input)
    const rawBudget = Math.min(data.rawBudget, LIMITS.raw)
    if (!(data.file instanceof File) || data.file.size<4 || data.file.size>inputBudget)
      throw new Error('파일이 비었거나 이 기기의 입력 한도를 넘습니다.')
    const buffer = new Uint8Array(await data.file.arrayBuffer())
    const output=await convertFont(buffer,data.target,{
      rawBudget,progress:value=>post({type:'progress',value}),
    })
    const extension=detectFont(output).container
    const mime={ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'}[extension]
    post({type:'done',result:new Blob([output as Uint8Array<ArrayBuffer>],{type:mime}),extension})
  } catch (error) {
    const value=error instanceof Error?error.message:''
    post({type:'error',message:/[가-힣]/.test(value) ? value.slice(0,180) : '파일이 손상됐거나 엔진에서 읽을 수 없는 폰트입니다.'})
  } finally { active=false }
}
