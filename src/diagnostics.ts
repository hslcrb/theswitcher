export const failureMessages={
  INPUT_EMPTY:'빈 파일입니다.',
  INPUT_LIMIT:'기기의 파일 크기 한도를 넘었습니다.',
  RAW_LIMIT:'압축 해제 크기가 작업 한도를 넘습니다.',
  RESULT_LIMIT:'결과 보관 한도입니다. 이전 결과를 저장한 뒤 제거해 주세요.',
  INVALID_HEADER:'지원하지 않거나 잘린 폰트 헤더입니다.',
  COLLECTION_UNSUPPORTED:'TTC/OTC는 먼저 개별 폰트로 분리해 주세요.',
  INVALID_DIRECTORY:'폰트 테이블 디렉터리가 올바르지 않습니다.',
  INVALID_RANGE:'폰트 테이블이나 부가 데이터 범위가 올바르지 않습니다.',
  INVALID_COMPRESSION:'압축 데이터와 선언된 크기가 맞지 않습니다.',
  INVALID_OUTLINE:'원본 윤곽과 요청한 형식이 다릅니다.',
  INVALID_OUTPUT:'변환 결과의 형식 검증에 실패했습니다.',
  FILE_READ:'브라우저가 파일을 읽지 못했습니다.',
  CODEC_INIT:'변환 코덱을 로드하지 못했습니다. 페이지를 새로 열어 주세요.',
  CODEC_REJECTED:'코덱이 폰트를 읽거나 변환하지 못했습니다.',
  STREAM_UNAVAILABLE:'이 브라우저에서는 WOFF 압축 스트림을 사용할 수 없습니다.',
  WORKER_START:'변환 작업자를 시작하지 못했습니다.',
  WORKER_RUNTIME:'변환 작업자에서 예기치 않은 오류가 발생했습니다.',
  WORKER_MESSAGE:'파일 또는 결과를 작업자와 주고받지 못했습니다.',
  SAVE_PERMISSION:'선택한 폴더에 쓸 권한이 없습니다.',
  SAVE_STORAGE:'저장 공간이 부족합니다.',
  SAVE_WRITE:'폴더 저장에 실패했습니다.',
  TIMEOUT:'파일 하나의 처리 제한 시간(45초)을 넘겼습니다.',
  INTERNAL:'예기치 않은 오류가 발생했습니다.',
} as const
export type FailureCode=keyof typeof failureMessages
export type SafeFailure={code:FailureCode;message:string}
export class FontIssue extends Error {
  readonly code:FailureCode
  constructor(code:FailureCode,message:string=failureMessages[code]) {
    super(message);this.name='FontIssue';this.code=code
  }
}
// Never retain raw exceptions, stacks, or font names. / 예상치 않은 원문·스택·폰트 이름은 기록하지 않는다.
export function safeFailure(error:unknown, fallback:FailureCode='INTERNAL'):SafeFailure {
  return error instanceof FontIssue ? {code:error.code,message:error.message}
    : {code:fallback,message:failureMessages[fallback]}
}
export function formatPercent(value:number) {
  // Keep 100.0% reserved for a genuinely settled batch. / 실제 종료 전에는 100.0%로 반올림하지 않는다.
  const n=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0
  return (n===1?100:Math.min(99.9,n*100)).toFixed(1)+'%'
}
export type DiagnosticInput={id:number;code:FailureCode;stage:string;format:string;bytes:number;target?:string;elapsedMs?:number}
export type DiagnosticRecord=DiagnosticInput&{at:string}
export class DiagnosticLog {
  private readonly data:DiagnosticRecord[]=[]
  private readonly max:number
  constructor(max=48){this.max=Number.isFinite(max)?Math.max(1,Math.min(64,Math.floor(max))):48}
  add(input:DiagnosticInput){
    const {id,code,stage,format,bytes,target,elapsedMs}=input
    this.data.push({id,code,stage,format,bytes,target,elapsedMs,at:new Date().toISOString()})
    if(this.data.length>this.max)this.data.shift()
  }
  records(){return this.data.map(x=>({...x}))}
  clear(){this.data.length=0}
}
