import test from 'node:test'
import assert from 'node:assert/strict'
import { beginAssistantRun, finishAssistantRun, markAssistantRunInterrupted, readAssistantRun } from './assistantRunGuard.js'

test('startup journal survives interruption, accepts only safe fields, and clears only its owner', t => {
  const previous = globalThis.localStorage
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  t.after(() => { globalThis.localStorage = previous })
  assert.equal(beginAssistantRun('model-run', 'page-one', 'model-loading'), true)
  finishAssistantRun('model-run', 'page-two')
  assert.equal(readAssistantRun('model-run').state, 'active')
  markAssistantRunInterrupted('model-run', 'page-one')
  assert.deepEqual(readAssistantRun('model-run'), { state: 'interrupted', stage: 'model-loading', owner: 'page-one' })
  values.set('model-run', JSON.stringify({ state: 'active', stage: 'generation', owner: 'page-one', question: 'Private' }))
  assert.equal(JSON.stringify(readAssistantRun('model-run')).includes('Private'), false)
  finishAssistantRun('model-run', 'page-one')
  assert.equal(readAssistantRun('model-run'), null)
  for (const invalid of ['bad json', '{"state":"active"}', '{"state":"active","stage":"private details","owner":"page-one"}']) {
    values.set('model-run', invalid)
    assert.equal(readAssistantRun('model-run'), null)
  }
})

test('unavailable browser storage does not crash setup or pretend the journal saved', t => {
  const previous = globalThis.localStorage
  globalThis.localStorage = { getItem() { throw Error('Blocked') }, setItem() { throw Error('Blocked') } }
  t.after(() => { globalThis.localStorage = previous })
  assert.equal(readAssistantRun('run'), null)
  assert.equal(beginAssistantRun('run', 'page-one', 'model-loading'), false)
  assert.doesNotThrow(() => finishAssistantRun('run', 'page-one'))
})
