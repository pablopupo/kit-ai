import test from 'node:test'
import assert from 'node:assert/strict'
import { engineProgress } from './engineProgress.js'

test('only measured transfer progress becomes a download percentage', () => {
  assert.deepEqual(engineProgress({ text: 'Fetching param cache[1/58]:', progress: 0.374 }), { preparationStage: 'downloading', progress: 37.4 })
  assert.deepEqual(engineProgress({ text: 'Fetching param cache[0/58]:', progress: 0 }), { preparationStage: 'downloading', progress: null })
  assert.equal(engineProgress({ text: 'Fetching param cache[1/58]:', progress: 0.005 }).progress, 0.5)
  for (const progress of [undefined, NaN, -1, '0.5']) assert.equal(engineProgress({ text: 'Fetching param cache[0/58]:', progress }).progress, null)
})

test('resetting progress for cache loading and shader preparation never resets a visible download', () => {
  for (const text of ['Loading model from cache[1/58]:', 'Loading GPU shader modules[1/400]:', 'Finish loading on WebGPU']) {
    for (const progress of [0, 0.5, 1]) assert.deepEqual(engineProgress({ text, progress }), { preparationStage: 'opening', progress: null })
  }
  assert.deepEqual(engineProgress({ text: 'Fetching param cache[58/58]:', progress: 1 }), { preparationStage: 'opening', progress: null })
  assert.deepEqual(engineProgress({ text: 'Start to fetch params', progress: 0 }), { preparationStage: 'preparing', progress: null })
  assert.deepEqual(engineProgress({ text: 'Unknown new SDK stage', progress: 0.4 }), { preparationStage: 'preparing', progress: null })
})
