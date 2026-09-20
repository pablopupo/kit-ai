import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { patchWebllmMemory, webllmMemoryPatch } from '../../build/webllmMemoryPatch.js'

const require = createRequire(import.meta.url)
const entry = require.resolve('@mlc-ai/web-llm')
const original = readFileSync(entry, 'utf8')
const patched = patchWebllmMemory(original, '0.2.80')

// Execute the actual installed SDK methods, with fake hardware and storage.
// No model download or GPU is needed to prove scheduling and byte semantics.
function methodSource(code, signature, nextSignature) {
  const start = code.indexOf(signature)
  const next = code.indexOf(nextSignature, start)
  return code.slice(start, code.lastIndexOf('/**', next)).trim()
}

function awaiter(_self, _args, _promise, generator) {
  return new Promise((resolve, reject) => {
    const iter = generator.call(_self)
    function step(verb, value) {
      let result
      try { result = iter[verb](value) } catch (error) { reject(error); return }
      if (result.done) resolve(result.value)
      else Promise.resolve(result.value).then(value => step('next', value), error => step('throw', error))
    }
    step('next')
  })
}

function compileFixture(limit, failAt = -1) {
  let active = 0, peak = 0, clock = 0
  const started = [], completed = [], updated = [], reports = []
  const infos = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`shader${i}`, { name: `shader${i}` }]))
  const method = methodSource(patched, 'asyncLoadWebGPUPipelines(mod) {', 'initWebGPU(device) {')
  const object = new Function('__awaiter', 'getPerformance', 'assert', `return { ${method} }`)(
    awaiter, () => ({ now: () => clock += 1100 }), assert,
  )
  Object.assign(object, {
    beginScope() {}, endScope() {}, detachFromCurrentScope: value => value,
    initProgressCallback: [report => reports.push(report)],
    lib: { webGPUContext: {
      device: { limits: { maxStorageBufferBindingSize: limit } },
      async createShaderAsync(info, code) {
        assert.equal(code, `code:${info.name}`)
        started.push(info.name)
        peak = Math.max(peak, ++active)
        await new Promise(resolve => setTimeout(resolve, 1))
        active -= 1
        if (info.name === `shader${failAt}`) throw new Error('Synthetic compilation failure')
        completed.push(info.name)
        return `compiled:${info.name}`
      },
    } },
  })
  const mod = { getFunction(name) {
    if (name === 'webgpu.get_fmap') return () => JSON.stringify(infos)
    if (name === 'webgpu.get_shader') return name => `code:${name}`
    if (name === 'webgpu.update_prebuild') return (name, func) => updated.push([name, func])
    throw new Error(`Unexpected function ${name}`)
  } }
  return { run: () => object.asyncLoadWebGPUPipelines(mod), started, completed, updated, reports, peak: () => peak }
}

test('small-buffer devices compile serially and still finish every shader with progress', async () => {
  const fixture = compileFixture(268435456)
  await fixture.run()
  assert.equal(fixture.peak(), 1)
  assert.equal(fixture.completed.length, 6)
  assert.deepEqual(fixture.updated, fixture.completed.map(key => [key, `compiled:${key}`]))
  assert.equal(fixture.reports.length, 6)
  assert.equal(fixture.reports.at(-1).progress, 1)
})

test('desktop compiler concurrency is preserved', async () => {
  const fixture = compileFixture(1073741824)
  await fixture.run()
  assert.equal(fixture.peak(), 6)
  assert.equal(fixture.completed.length, 6)
  assert.equal(fixture.reports.at(-1).progress, 1)
})

test('a failed mobile compilation rejects without starting subsequent shaders', async () => {
  const fixture = compileFixture(268435456, 1)
  await assert.rejects(fixture.run(), /Synthetic compilation failure/)
  assert.deepEqual(fixture.started, ['shader0', 'shader1'])
  assert.deepEqual(fixture.completed, ['shader0'])
  assert.equal(fixture.reports.at(-1).progress, 1 / 6)
})

test('tensor loading passes exact shared views to the copying decoder without changing cached bytes', async () => {
  const source = new Uint8Array([99, 1, 2, 3, 88, 4, 5, 77])
  const before = source.slice()
  const records = [
    { name: 'one', byteOffset: 1, nbytes: 3, shape: [3], dtype: 'uint8', format: 'raw' },
    { name: 'two', byteOffset: 5, nbytes: 2, shape: [2], dtype: 'uint8', format: 'raw' },
  ]
  const method = methodSource(patched,
    'fetchTensorCacheInternal(tensorCacheUrl, list, device, artifactCache, signal) {', 'scalar(value, dtype) {')
  const object = new Function('__awaiter', 'getPerformance', 'DeviceStrToEnum', `return { ${method} }`)(
    awaiter, () => ({ now: () => 0 }), { cpu: 1 },
  )
  const decoded = [], loaded = [], reports = []
  Object.assign(object, {
    initProgressCallback: [report => reports.push(report)],
    withNewScope: fn => fn(), detachFromCurrentScope: value => value, cpu: () => ({ deviceType: 1 }),
    empty() { return { copyFrom(other) { this.data = other.data.slice() }, dispose() {} } },
    tensorCacheUpdate: (name, tensor) => loaded.push([name, [...tensor.data]]),
    ctx: { arrayDecodeStorage(target, bytes, format, dtype) {
      const rec = records[decoded.length]
      assert.equal(bytes.buffer, source.buffer)
      assert.equal(bytes.byteOffset, rec.byteOffset)
      assert.equal(bytes.byteLength, rec.nbytes)
      assert.equal(format, 'raw')
      assert.equal(dtype, 'uint8')
      // The real bridge makes this synchronous copy through viewU8.set.
      target.data = new Uint8Array(bytes.length)
      target.data.set(bytes)
      decoded.push([...target.data])
    } },
    env: { logger(message) { throw new Error(message) } },
  })
  const cache = { hasAllKeys: async () => true, fetchWithCache: async () => source.buffer }
  await object.fetchTensorCacheInternal('https://example.test/model/',
    [{ dataPath: 'one.bin', nbytes: source.length, records }], { deviceType: 2, sync: async () => {} }, cache)
  assert.deepEqual(loaded, [['one', [1, 2, 3]], ['two', [4, 5]]])
  assert.deepEqual(source, before)
  assert.equal(reports.at(-1).progress, 1)
  // Pin the source-copy behavior this view optimization relies on.
  assert.match(original, /storeRawBytes\(offset, bytes\)\s*\{\s*this\.viewU8\.set\(bytes, offset\);/)
  assert.match(original, /this\.storeRawBytes\(dataOffset, data\);/)
})

test('runtime drift fails closed and unrelated modules are untouched', () => {
  assert.throws(() => patchWebllmMemory(original, '0.2.81'), /Review/)
  assert.throws(() => patchWebllmMemory(original.replace('buffer.slice(rec.byteOffset, rec.byteOffset + rec.nbytes)', 'changed()'), '0.2.80'), /Review/)
  assert.throws(() => patchWebllmMemory(patched, '0.2.80'), /Review/)
  const plugin = webllmMemoryPatch()
  assert.equal(plugin.transform(original, '/unrelated.js'), null)
  assert.equal(plugin.transform(original, `${entry}?worker`).code, patched)
})
