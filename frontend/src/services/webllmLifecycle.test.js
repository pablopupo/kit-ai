import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// Bundle the real service in memory with only its browser SDK replaced. No model
// downloads or application build are needed to exercise the worker lifecycle.
async function loadService(t, createEngine) {
  const key = `kitSdkTest${Math.random().toString(36).slice(2)}`
  const workers = []
  const originalWorker = globalThis.Worker
  globalThis.Worker = class {
    constructor() { this.terminated = false; this.listeners = new Map(); workers.push(this) }
    addEventListener(type, callback) { this.listeners.set(type, callback) }
    removeEventListener(type) { this.listeners.delete(type) }
    emit(type) { this.listeners.get(type)?.({ preventDefault() {} }) }
    terminate() { this.terminated = true }
  }
  globalThis[key] = createEngine
  t.after(() => { globalThis.Worker = originalWorker; delete globalThis[key] })
  const serviceURL = new URL('./webllmService.js', import.meta.url)
  const result = await build({
    entryPoints: [fileURLToPath(serviceURL)], bundle: true, write: false,
    platform: 'node', format: 'esm', logLevel: 'silent',
    define: { 'import.meta.env': '{}', 'import.meta.url': JSON.stringify(serviceURL.href) },
    plugins: [{
      name: 'fake-browser-sdk',
      setup(build) {
        build.onResolve({ filter: /^@mlc-ai\/web-llm$/ }, () => ({ path: 'sdk', namespace: 'test' }))
        build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export const prebuiltAppConfig = {model_list: []};
          export const hasModelInCache = async () => true;
          export const CreateWebWorkerMLCEngine = (...args) => globalThis[${JSON.stringify(key)}](...args);
        ` }))
      },
    }],
  })
  const service = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  return { service, workers }
}

const delta = (content, finish_reason = null) => ({ choices: [{ delta: { content }, finish_reason }] })

test('explicit trial record loads only that model and never falls back to the default', async t => {
  const calls = []
  const { service } = await loadService(t, async (...args) => {
    calls.push(args)
    return { chat: { completions: { create: async () => (async function* () { yield delta('Trial answer', 'stop') })() } } }
  })
  const record = { model_id: 'trial-pinned', model: 'https://example.test/immutable/', model_lib: 'https://example.test/immutable/model.wasm' }
  await assert.rejects(service.generateReply([], { expectedModelId: record.model_id }), /not loaded/)
  assert.equal(calls.length, 0)
  await service.initEngine(record.model_id, undefined, undefined, record)
  assert.equal(calls[0][1], record.model_id)
  assert.deepEqual(calls[0][2].appConfig.model_list, [record])
  assert.equal(calls[0][2].appConfig.useIndexedDBCache, true)
  assert.equal(await service.generateReply([], { expectedModelId: record.model_id }), 'Trial answer')
  await assert.rejects(service.initEngine('other-model'), /Unload/)
  service.invalidateEngine()
  await assert.rejects(service.generateReply([], { expectedModelId: record.model_id }), /not loaded/)
  assert.equal(calls.length, 1)
})

test('a worker crash or unreadable response rejects loading and permits an explicit retry', async t => {
  t.mock.method(console, 'error', () => {})
  let starts = 0
  const { service, workers } = await loadService(t, async () => {
    if (++starts < 3) return new Promise(() => {})
    return {}
  })
  for (const type of ['error', 'messageerror']) {
    const loading = service.initEngine()
    workers.at(-1).emit(type)
    await assert.rejects(loading, /stopped while opening/)
    assert.equal(workers.at(-1).terminated, true)
    assert.equal(workers.at(-1).listeners.size, 0)
  }
  await service.initEngine()
  assert.equal(starts, 3)
  service.invalidateEngine()
})

test('Stop drains the worker response, hides later chunks, and releases the next request', async t => {
  let locked = false
  let interrupted = false
  let releaseReached = 0
  const sdk = {
    interruptGenerate() { interrupted = true },
    chat: { completions: { create: async () => {
      if (locked) throw new Error('Previous worker generator still owns the lock')
      locked = true
      interrupted = false
      return (async function* () {
        yield delta('First text')
        if (!interrupted) yield delta(' More text')
        yield delta('', 'stop')
        // Deliberately after the final yield, matching WebLLM 0.2.80. Iterator
        // return() skips this release, so breaking early makes the test fail.
        locked = false
        releaseReached++
      })()
    } } },
  }
  const { service } = await loadService(t, async () => sdk)
  await service.initEngine()
  const controller = new AbortController()
  const visible = []
  await assert.rejects(service.generateReply([], {
    signal: controller.signal,
    onStream: text => { visible.push(text); controller.abort() },
  }), { name: 'AbortError' })
  assert.deepEqual(visible, ['First text'])
  assert.equal(locked, false)
  assert.equal(releaseReached, 1)
  assert.equal(await service.generateReply([]), 'First text More text')
})

test('runtime failure terminates the failed worker and Retry creates a fresh engine', async t => {
  let starts = 0
  const { service, workers } = await loadService(t, async () => {
    const failing = ++starts === 1
    return { chat: { completions: { create: async () => (async function* () {
      if (failing) throw new Error('GPU device lost')
      yield delta('Recovered answer', 'stop')
    })() } } }
  })
  await service.initEngine()
  await assert.rejects(service.generateReply([]), /GPU device lost/)
  assert.equal(workers[0].terminated, true)
  await service.initEngine()
  assert.equal(starts, 2)
  assert.equal(await service.generateReply([]), 'Recovered answer')
})

test('length-limited responses keep their content and disclose incompleteness in either language', async t => {
  const { service } = await loadService(t, async () => ({}))
  for (const language of ['en', 'es']) {
    const chunks = (async function* () { yield delta('Important first step.'); yield delta('', 'length') })()
    const answer = await service.collectResponse(chunks, { language })
    assert.ok(answer.startsWith('Important first step.'))
    assert.match(answer, language === 'es' ? /puede estar incompleta/ : /may be incomplete/)
  }
  const complete = (async function* () { yield delta('Complete answer.', 'stop') })()
  assert.equal(await service.collectResponse(complete), 'Complete answer.')
})
