import test from 'node:test'
import assert from 'node:assert/strict'
import { splitOfflineAssets, allAssetsSaved, savedAppStatus, OFFLINE_PROTOCOL } from './offlineCachePolicy.js'

test('large assistant downloads cannot make app installation depend on their success', () => {
  const entries = ['index.html', 'assets/index-a.js', 'assets/index-b.css', 'assets/webgpu-check-worker-c.js', 'assets/webllm-worker-d.js', 'assets/webllmService-e.js'].map(url => ({ url }))
  const split = splitOfflineAssets(entries)
  assert.deepEqual(split.app.map(x => x.url), entries.slice(0, 4).map(x => x.url))
  assert.equal(split.assistant.length, 2)
})

test('a cache container, missing file, failed response or failed cache lookup is not offline readiness', async () => {
  const entries = [{ url: 'index.html' }, { url: 'assets/app.js' }]
  assert.equal(await allAssetsSaved(entries, async () => undefined), false)
  assert.equal(await allAssetsSaved(entries, async url => url === 'index.html' ? { status: 200 } : undefined), false)
  assert.equal(await allAssetsSaved(entries, async () => ({ status: 404 })), false)
  assert.equal(await allAssetsSaved(entries, async () => { throw new Error('Storage denied') }), false)
  assert.equal(await allAssetsSaved([], async () => ({ status: 200 })), false)
  assert.equal(await allAssetsSaved(entries, async () => ({ status: 200 })), true)
})

test('ready requires both current-page control and a complete saved app, never just a loaded model', () => {
  const report = { protocol: OFFLINE_PROTOCOL, appSaved: true, runtimeSaved: true }
  assert.equal(savedAppStatus(report, true), 'ready')
  assert.equal(savedAppStatus(report, false), 'error')
  assert.equal(savedAppStatus({ ...report, appSaved: false }, true), 'error')
  assert.equal(savedAppStatus({ ...report, protocol: 'old-worker' }, true), 'error')
  assert.equal(savedAppStatus({ modelReady: true, runtimeSaved: true }, true), 'error')
})
