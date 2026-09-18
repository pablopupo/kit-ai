import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseAnswerSource, shouldDeferDownload } from './offlinePolicy.js'

test('the fine-tuned service is preferred online; the prepared device model works offline', () => {
  assert.equal(chooseAnswerSource({ localReady: true, online: true, allowOnline: true }), 'online')
  assert.equal(chooseAnswerSource({ localReady: true, online: false, allowOnline: true }), 'device')
  assert.equal(chooseAnswerSource({ localReady: true, online: true, allowOnline: false }), 'device')
})
test('online fallback respects connectivity and the saved privacy preference', () => {
  assert.equal(chooseAnswerSource({ localReady: false, online: true, allowOnline: true }), 'online')
  assert.equal(chooseAnswerSource({ localReady: false, online: true, allowOnline: false }), 'guides')
  assert.equal(chooseAnswerSource({ localReady: false, online: false, allowOnline: true }), 'guides')
})
test('first large download waits on explicitly limited connections; cached startup does not', () => {
  assert.equal(shouldDeferDownload({ saveData: true }), true)
  assert.equal(shouldDeferDownload({ type: 'cellular' }), true)
  assert.equal(shouldDeferDownload({ type: 'wifi' }), false)
  assert.equal(shouldDeferDownload(undefined), false)
  assert.equal(shouldDeferDownload({ saveData: true }, true), false)
})
