import assert from 'node:assert/strict'
import test from 'node:test'
import { profile, reservation, nextFitting, progressAt } from '../src/pool.ts'
test('parallelism follows hardware and leaves conservative defaults without telemetry', () => {
  assert.equal(profile(undefined,8).slots,2)
  assert.equal(profile(2,2).slots,2)
  assert.equal(profile(4,8).slots,3)
  assert.equal(profile(8,8).slots,4)
  assert.equal(profile(8,2).slots,2)
})
test('jobs fit in budget and an exclusive convertible file is not starved', () => {
  assert.equal(nextFitting([48,11,12],40,15,2,3),1)
  assert.equal(nextFitting([48],40,0,0,3),0)
  assert.equal(nextFitting([12],40,0,3,3),-1)
  assert.equal(nextFitting([50],40,10,1,3),-1)
  assert.equal(nextFitting([],40,0,0,3),-1)
  assert.ok(reservation(100,200,true)>reservation(100,200,false))
})
test('stage progress is bounded, never goes backward and never fakes 100%', () => {
  let p=progressAt({stage:'inspect'},0)
  assert.ok(p>0)
  p=progressAt({stage:'decode',fraction:.5},p)
  assert.ok(p>.1)
  assert.equal(progressAt({stage:'inspect'},p),p)
  assert.equal(progressAt({stage:'encode',fraction:-1},p),.4)
  assert.equal(progressAt({stage:'verify'},p),.95)
})
