import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseAssistantSource } from './assistantPolicy.js'

test('a ready device model answers with or without internet or online permission', () => {
  for (const online of [true, false]) {
    for (const allowOnline of [true, false]) {
      assert.equal(chooseAssistantSource({ localReady: true, online, allowOnline }), 'device')
    }
  }
})

test('online fallback requires both connection and explicit permission', () => {
  assert.equal(chooseAssistantSource({ localReady: false, online: true, allowOnline: true }), 'online')
  for (const [online, allowOnline] of [[false, false], [true, false], [false, true]]) {
    assert.equal(chooseAssistantSource({ localReady: false, online, allowOnline }), null)
  }
})

test('missing readiness or permissions never make a source available', () => {
  assert.equal(chooseAssistantSource({}), null)
  assert.equal(chooseAssistantSource({ online: true }), null)
})
