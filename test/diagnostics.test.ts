import assert from 'node:assert/strict'
import test from 'node:test'
import { DiagnosticLog, formatPercent, FontIssue, safeFailure } from '../src/diagnostics.ts'
test('fixed decimal progress never shows finished before the task is finished',()=>{
 for(const [input,out] of [[0,'0.0%'],[.06234,'6.2%'],[.4476,'44.8%'],[.9998,'99.9%'],[1,'100.0%'],[NaN,'0.0%']] as const)
   assert.equal(formatPercent(input),out)
})
test('untrusted error text and stack never enter the local diagnostics',()=>{
 const result=safeFailure(new Error('secret-example data:font/file'), 'CODEC_REJECTED')
 assert.equal(result.code,'CODEC_REJECTED')
 assert.ok(!JSON.stringify(result).includes('secret'))
 const a=safeFailure(new FontIssue('INVALID_HEADER','잘린 폰트'), 'INTERNAL')
 assert.deepEqual(a,{code:'INVALID_HEADER',message:'잘린 폰트'})
})
test('diagnostics retain only a small bounded window of metadata',()=>{
 const log=new DiagnosticLog(3)
 for(let i=0;i<5;i++)log.add({id:i,code:'TIMEOUT',stage:'encode',format:'WOFF2',bytes:512,target:'woff2'})
 const report=log.records()
 assert.deepEqual(report.map(x=>x.id),[2,3,4])
 assert.ok(report.every(x=>x.at.length>0))
 log.clear()
 assert.deepEqual(log.records(),[])
})
