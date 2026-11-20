import type { ProgressEvent } from './font.ts'

export const MIB=1024**2

/** 모르는 메모리는 넉넉하다고 가정하지 않는다. / Stay conservative when RAM is unknown. */
export function profile(memory:number|undefined, cores:number) {
  if(memory!==undefined&&memory<=2)return {input:6*MIB,raw:12*MIB,results:24*MIB,working:64*MIB,slots:2}
  if(memory===undefined)return {input:8*MIB,raw:20*MIB,results:36*MIB,working:104*MIB,slots:2}
  if(memory<8)return {input:8*MIB,raw:20*MIB,results:36*MIB,working:128*MIB,slots:cores>=4?3:2}
  return {input:20*MIB,raw:32*MIB,results:64*MIB,working:240*MIB,slots:cores>=6?4:cores>=4?3:2}
}

// 예약량은 실제 RSS 측정이 아닌 보수적인 스케줄링 기준이다.
// Admission estimate, not a guarantee about browser or OS memory.
export const reservation=(input:number,raw:number,compat:boolean)=>input*2+raw*4+(compat?24:8)*MIB

export function nextFitting(reservations:readonly number[],pool:number,used:number,active:number,slots:number){
  if(active>=slots||!reservations.length)return -1
  const fitting=reservations.findIndex(bytes=>bytes<=pool-used)
  // Big jobs can take the entire worker pool rather than wait forever.
  // 큰 파일도 대기열에서 굶지 않도록 빈 풀을 단독 사용한다.
  return fitting<0&&active===0?0:fitting
}

const stages={
  read:[.005,0],inspect:[.03,0],'load-decoder':[.06,0],decode:[.10,.24],'load-encoder':[.36,0],encode:[.40,.48],verify:[.95,0],
} as const

export function progressAt(event:ProgressEvent,previous:number){
  const [starting,span]=stages[event.stage]
  const reported=Number.isFinite(event.fraction)?Math.max(0,Math.min(1,event.fraction!)):0
  return Math.max(previous,starting+span*reported)
}
