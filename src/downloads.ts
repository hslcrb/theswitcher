export type DownloadPreferences={useBrowser:boolean;autoSelect:boolean}
export const PREF_COOKIE='jjondeukCookie'
const DEFAULT={useBrowser:true,autoSelect:true}
const namedModes={browser:'smoreCookie',folder:'gingerbreadManCookie',select:'christmasCookie',manual:'purePickledGingerCookie'} as const
const cookieAge=90*24*60*60

export function encodePreferences(state:DownloadPreferences){
  return ['v1',state.useBrowser?namedModes.browser:namedModes.folder,state.autoSelect?namedModes.select:namedModes.manual].join('.')
}
export function decodePreferences(cookie:string):DownloadPreferences {
  const candidate=cookie.split(';').find(x=>x.trimStart().startsWith(PREF_COOKIE+'='))?.trim().slice(PREF_COOKIE.length+1)??''
  const [version,mode,select,...extra]=candidate.split('.')
  if(version!=='v1'||extra.length||!([namedModes.browser,namedModes.folder] as string[]).includes(mode)||
      !([namedModes.select,namedModes.manual] as string[]).includes(select))return {...DEFAULT}
  return {useBrowser:mode===namedModes.browser,autoSelect:select===namedModes.select}
}
// Persist only preferences, not the folder handle, names, or font data.
// 설정값만 저장하고 폴더 핸들·이름·폰트는 쿠키에 쓰지 않는다.
export function cookieString(prefs:DownloadPreferences, secure:boolean){
  return PREF_COOKIE+'='+encodePreferences(prefs)+'; Max-Age='+cookieAge+'; Path=/; SameSite=Strict'+(secure?'; Secure':'')
}
const KNOWN=new Set(['ttf','otf','woff','woff2'])
export function safeFilename(input:string,extension:string){
  const suffix=KNOWN.has(extension)?extension:'font'
  let basename=input.replace(/\.[^.]+$/,'').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g,'_')
    .trim().replace(/^\.+|[. ]+$/g,'')
  basename=Array.from(basename).slice(0,100).join('').replace(/[. ]+$/g,'')||'font'
  if(/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(basename))basename='_'+basename
  return basename+'.'+suffix
}

type Writer={write(blob:Blob):Promise<void>;close():Promise<void>;abort?:()=>Promise<void>}
export type DownloadDirectory={name?:string;getFileHandle(name:string,options?:{create?:boolean}):Promise<{createWritable(options?:{mode?:'exclusive'}):Promise<Writer>}>}
type DirectoryPicker=()=>Promise<DownloadDirectory>
export function directoryPicker(win:Window):DirectoryPicker|undefined{
  const picker=(win as Window&{showDirectoryPicker?:(options:{mode:'readwrite'})=>Promise<DownloadDirectory>}).showDirectoryPicker
  return typeof picker==='function'?()=>picker.call(win,{mode:'readwrite'}):undefined
}
const errorName=(error:unknown)=>error instanceof DOMException?error.name:'UnknownError'
export function downloadFailure(error:unknown){
  switch(errorName(error)){
    case 'AbortError':return '폴더 선택이 취소됐습니다.'
    case 'NotAllowedError':case 'SecurityError':return '폴더 쓰기 권한이 없습니다. 다시 선택하거나 브라우저 기본 다운로드를 사용하세요.'
    case 'QuotaExceededError':return '저장 공간이 부족합니다.'
    case 'InvalidModificationError':return '사용 가능한 파일 이름을 만들 수 없습니다.'
    case 'NotFoundError':return '선택한 폴더를 찾을 수 없습니다. 다시 선택해 주세요.'
    default:return '파일을 저장하지 못했습니다. 폴더와 저장 공간을 확인해 주세요.'
  }
}

export async function writeNewFile(directory:DownloadDirectory,filename:string,blob:Blob,reserved=new Set<string>()){
  const dot=filename.lastIndexOf('.'), head=dot>0?filename.slice(0,dot):filename, tail=dot>0?filename.slice(dot):''
  for(let i=1;i<=40;i++){
    const name=head+(i===1?'':'-'+i)+tail, key=name.toLowerCase()
    if(reserved.has(key)) continue
    reserved.add(key)
    try{await directory.getFileHandle(name,{create:false});continue}
    catch(error){const code=errorName(error);if(code==='TypeMismatchError')continue;if(code!=='NotFoundError')throw error}
    // Reserve names before await to avoid collisions within a parallel save.
    // 이미 존재하는 이름은 열어 쓰지 않으며 짧은 일괄 저장에서도 내부 이름 충돌을 막는다.
    const file=await directory.getFileHandle(name,{create:true})
    const writer=await file.createWritable({mode:'exclusive'})
    try{await writer.write(blob);await writer.close()}
    catch(error){try{await writer.abort?.()}catch{/* preserve original failure */}throw error}
    return name
  }
  throw new DOMException('filename unavailable','InvalidModificationError')
}
