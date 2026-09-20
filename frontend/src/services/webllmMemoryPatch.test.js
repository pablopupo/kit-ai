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

function indexedDBFixture(source, { entries = [['one', { url: 'one', data: new Uint8Array([1, 2, 3]).buffer }]], errorKeys = [], failTransaction = false } = {}) {
  const start = source.indexOf('class ArtifactIndexedDBCache {')
  const next = source.indexOf('function hasTensorInCache(', start)
  const classSource = source.slice(start, source.lastIndexOf('/**', next))
  const Cache = new Function('__awaiter', `${classSource}; return ArtifactIndexedDBCache`)(awaiter)
  const cache = new Cache('synthetic-model-cache')
  const records = new Map(entries)
  const calls = [], payloads = []
  const requestError = new Error('Synthetic storage read failure')
  cache.db = { transaction(stores, mode) {
    assert.deepEqual(stores, ['urls'])
    assert.equal(mode, 'readonly')
    if (failTransaction) throw new Error('Synthetic transaction failure')
    const tx = { objectStore(name) {
      assert.equal(name, 'urls')
      function read(method, key) {
        calls.push([method, key])
        const request = {}
        queueMicrotask(() => {
          if (errorKeys.includes(key)) {
            request.error = requestError
            request.onerror?.({ target: request })
            tx.error = requestError
            tx.onerror?.()
            return
          }
          if (method === 'getKey') request.result = records.has(key) ? key : undefined
          else {
            request.result = records.has(key) ? structuredClone(records.get(key)) : undefined
            if (request.result?.data instanceof ArrayBuffer) payloads.push(request.result.data.byteLength)
          }
          request.onsuccess?.({ target: request })
          queueMicrotask(() => tx.oncomplete?.())
        })
        return request
      }
      return { get: key => read('get', key), getKey: key => read('getKey', key) }
    } }
    return tx
  } }
  return { cache, calls, payloads, requestError }
}

test('installed cache presence methods use keys without reading or cloning payloads', async () => {
  const entries = [
    ['one', { url: 'one', data: new Uint8Array([1, 2, 3]).buffer }],
    ['two', { url: 'two', data: new Uint8Array([4, 5]).buffer }],
  ]
  const before = indexedDBFixture(original, { entries })
  const after = indexedDBFixture(patched, { entries })
  for (const fixture of [before, after]) {
    assert.equal(await fixture.cache.hasAllKeys(['one', 'two']), true)
    assert.equal(await fixture.cache.isUrlInDB('one'), true)
  }
  assert.deepEqual(before.calls, [['get', 'one'], ['get', 'two'], ['get', 'one']])
  assert.deepEqual(before.payloads, [3, 2, 3])
  assert.deepEqual(after.calls, [['getKey', 'one'], ['getKey', 'two'], ['getKey', 'one']])
  assert.deepEqual(after.payloads, [])
  // This inline key schema precludes storing an entirely undefined record.
  // A record whose `data` is absent is still present under either method.
  assert.match(original, /createObjectStore\('urls', \{ keyPath: 'url' \}\)/)
  assert.match(original, /store\.add\(\{ data, url \}\)/)
})

test('cache key checks preserve missing, duplicate, empty-list, and incomplete-value behavior', async () => {
  for (const source of [original, patched]) {
    const fixture = indexedDBFixture(source, { entries: [['one', { url: 'one', data: undefined }], ['two', { url: 'two', data: null }]] })
    assert.equal(await fixture.cache.hasAllKeys([]), true)
    assert.deepEqual(fixture.calls, [])
    assert.equal(await fixture.cache.hasAllKeys(['one', 'one', 'two']), true)
    assert.equal(await fixture.cache.hasAllKeys(['one', 'missing']), false)
    assert.equal(await fixture.cache.isUrlInDB('missing'), false)
    assert.equal(await fixture.cache.isUrlInDB('one'), true)
    assert.equal(await fixture.cache.isUrlInDB('two'), true)
  }
})

test('cache key checks preserve request and transaction failure behavior', async () => {
  for (const source of [original, patched]) {
    const fixture = indexedDBFixture(source, { errorKeys: ['broken'] })
    assert.equal(await fixture.cache.hasAllKeys(['one', 'broken']), false)
    await assert.rejects(fixture.cache.isUrlInDB('broken'), error => error === fixture.requestError)
    const failed = indexedDBFixture(source, { failTransaction: true })
    await assert.rejects(failed.cache.hasAllKeys(['one']), /Synthetic transaction failure/)
    await assert.rejects(failed.cache.isUrlInDB('one'), /Synthetic transaction failure/)
  }
})

test('a real payload retrieval still reads stored bytes exactly once after its key check', async () => {
  const fixture = indexedDBFixture(patched)
  assert.deepEqual(new Uint8Array(await fixture.cache.fetchWithCache('one', 'arraybuffer')), new Uint8Array([1, 2, 3]))
  assert.deepEqual(fixture.calls, [['getKey', 'one'], ['get', 'one']])
  assert.deepEqual(fixture.payloads, [3])
})

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

function tensorFixture(sourceCode, records, { deviceType = 15, failure, source = Uint8Array.from({ length: 48 }, (_, i) => i + 1), tensorOffset = 0, tensorOffsetHigh = 0, pointerBytes = 4, padding = 0 } = {}) {
  const devices = { cpu: 1, webgpu: 15 }
  const method = methodSource(sourceCode,
    'fetchTensorCacheInternal(tensorCacheUrl, list, device, artifactCache, signal) {', 'scalar(value, dtype) {')
  const object = new Function('__awaiter', 'getPerformance', 'DeviceStrToEnum', `return { ${method} }`)(
    awaiter, () => ({ now: () => 0 }), devices,
  )
  const rawCopy = new Function('DeviceStrToEnum', `return { ${methodSource(original, 'copyFromRawBytes(data) {', 'toRawBytes() {')} }`)(devices).copyFromRawBytes
  const allocated = [], decoded = [], uploads = [], loaded = [], events = [], reports = []
  Object.assign(object, {
    initProgressCallback: [value => reports.push(value)],
    withNewScope: fn => fn(), detachFromCurrentScope: value => value, cpu: () => ({ deviceType: 1 }),
    empty(shape, dtype, device) {
      const bits = Number(dtype.match(/\d+/)[0])
      const layout = new DataView(new ArrayBuffer(96))
      // DLTensor begins at an aligned address. The wasm32 ABI has four bytes
      // of padding before uint64 byte_offset; offsets are literal here so the
      // test does not copy the implementation's alignment formula.
      const dltensor = 16
      const byteOffsetAddress = dltensor + (pointerBytes === 4 ? 32 : 40)
      if (pointerBytes === 4) layout.setUint32(dltensor + 28, padding, true)
      layout.setUint32(byteOffsetAddress, tensorOffset, true)
      layout.setUint32(byteOffsetAddress + 4, tensorOffsetHigh, true)
      const tensor = {
        shape, dtype, device, dltensor, dlDataType: { bits, lanes: 1 }, disposed: 0,
        // Model the installed SDK's incorrect unaligned, low-signed-word read.
        byteOffset: layout.getInt32(dltensor + (pointerBytes === 4 ? 28 : 40), true),
        getDataPtr() { return allocated.indexOf(this) + 1 },
        dispose() { this.disposed++; events.push('dispose') },
        copyFrom(other) { events.push('cpu-copy'); this.data = other.data.slice() },
        copyFromRawBytes: rawCopy,
        lib: { sizeofPtr: () => pointerBytes, memory: { loadU32: address => layout.getUint32(address, true) }, webGPUContext: { copyRawBytesToBuffer(bytes, ptr, offset, nbytes) {
          assert.equal(ptr, allocated.indexOf(tensor) + 1)
          assert.equal(offset, 0)
          assert.equal(bytes.buffer, source.buffer, 'upload must borrow the saved shard')
          assert.equal(nbytes, bytes.byteLength)
          events.push('upload')
          uploads.push({ offset: bytes.byteOffset, bytes: [...bytes] })
          if (failure === 'upload') throw new Error('Synthetic upload failure')
          tensor.data = bytes.slice() // models writeBuffer consuming data synchronously
        } } },
      }
      allocated.push(tensor)
      return tensor
    },
    ctx: { arrayDecodeStorage(target, bytes, format, dtype) {
      decoded.push({ format, dtype, bytes: [...bytes] })
      events.push('decode')
      if (format === 'f32-to-bf16' && dtype === 'float32') {
        // Match the real decoder's BF16 bit expansion, not numerical rounding.
        target.data = new Uint8Array(bytes.length * 2)
        for (let i = 0; i < bytes.length; i += 2) target.data.set(bytes.subarray(i, i + 2), i * 2 + 2)
      } else if (format === 'future-format') {
        // An unknown format must still reach the original decoder. Do not
        // silently assume future format bytes are raw in the new fast path.
        target.data = bytes.map(value => value ^ 255)
      } else target.data = bytes.slice()
    } },
    tensorCacheUpdate(name, tensor) {
      events.push('cache')
      if (deviceType !== devices.cpu) assert.equal(events.at(-2), 'sync')
      if (failure === 'cache') throw new Error('Synthetic cache failure')
      loaded.push({ name, bytes: [...tensor.data] })
    },
    env: { logger() {} },
  })
  const device = { deviceType, async sync() {
    events.push('sync')
    if (failure === 'sync') throw new Error('Synthetic synchronization failure')
  } }
  const cache = { hasAllKeys: async () => true, fetchWithCache: async () => source.buffer }
  return { allocated, decoded, uploads, loaded, events, reports, source,
    run: () => object.fetchTensorCacheInternal('https://example.test/model/', [{ dataPath: 'one.bin', nbytes: source.length, records }], device, cache),
  }
}

test('pass-through GPU uploads match the installed decoder byte-for-byte with no CPU tensors or FFI calls', async () => {
  const records = [
    { name: 'quantized-weight', byteOffset: 4, nbytes: 8, shape: [2], dtype: 'uint32', format: 'f32-to-bf16' },
    { name: 'scale', byteOffset: 16, nbytes: 8, shape: [4], dtype: 'float16', format: 'f32-to-bf16' },
    { name: 'raw-float', byteOffset: 32, nbytes: 4, shape: [1], dtype: 'float32', format: 'raw' },
  ]
  const before = tensorFixture(original, records), after = tensorFixture(patched, records)
  const unchanged = after.source.slice()
  await before.run()
  await after.run()
  assert.deepEqual(after.loaded, before.loaded)
  assert.equal(after.decoded.length, 0)
  assert.equal(after.allocated.length, records.length)
  assert(after.allocated.every(tensor => tensor.device.deviceType === 15 && tensor.disposed === 1))
  assert.deepEqual(after.uploads.map(value => value.offset), records.map(record => record.byteOffset))
  assert.deepEqual(after.events, records.flatMap(() => ['upload', 'sync', 'cache', 'dispose']))
  assert.deepEqual(after.source, unchanged)
  assert.equal(after.reports.at(-1).progress, 1)
})

test('packed BF16, unaligned, CPU, other device, and unknown-format records retain decoding', async () => {
  const examples = [
    { record: { dtype: 'float32', format: 'f32-to-bf16', nbytes: 4, shape: [2] } },
    { record: { dtype: 'float16', format: 'f32-to-bf16', nbytes: 2, shape: [1] } },
    { record: { dtype: 'uint32', format: 'raw', nbytes: 4, shape: [1] }, deviceType: 1 },
    { record: { dtype: 'uint32', format: 'raw', nbytes: 4, shape: [1] }, deviceType: 2 },
    { record: { dtype: 'uint32', format: 'future-format', nbytes: 4, shape: [1] } },
  ]
  for (const { record, deviceType } of examples) {
    const records = [{ name: 'fallback', byteOffset: 4, ...record }]
    const before = tensorFixture(original, records, { deviceType }), after = tensorFixture(patched, records, { deviceType })
    await before.run()
    await after.run()
    assert.deepEqual(after.loaded, before.loaded)
    assert.equal(after.decoded.length, 1)
    assert.equal(after.uploads.length, 0)
    assert(after.allocated.some(tensor => tensor.device.deviceType === 1))
  }
})

test('direct GPU loading releases temporary handles after upload, sync, or cache failure', async () => {
  const records = [{ name: 'one', byteOffset: 4, nbytes: 8, shape: [2], dtype: 'uint32', format: 'raw' }]
  for (const failure of ['upload', 'sync', 'cache']) {
    const fixture = tensorFixture(patched, records, { failure })
    await assert.rejects(fixture.run(), /Synthetic/)
    assert.equal(fixture.allocated.length, 1)
    assert.equal(fixture.allocated[0].disposed, 1)
    assert.equal(fixture.loaded.length, 0)
    assert.equal(fixture.decoded.length, 0)
    assert.equal(fixture.reports.at(-1).progress, 0)
  }
})

test('direct uploads reject invalid record bounds, shape, storage length, and destination offset', async () => {
  const record = { name: 'one', byteOffset: 4, nbytes: 8, shape: [2], dtype: 'uint32', format: 'raw' }
  for (const override of [{ byteOffset: -1 }, { byteOffset: 0.5 }, { byteOffset: 44 }, { nbytes: -4 }, { shape: [-2] }, { shape: [1.5] }, { shape: [3] }]) {
    const fixture = tensorFixture(patched, [{ ...record, ...override }])
    await assert.rejects(fixture.run(), /Invalid tensor-cache|Tensor-cache storage/)
    assert.equal(fixture.uploads.length, 0)
    assert(fixture.allocated.every(tensor => tensor.disposed === 1))
  }
  const offset = tensorFixture(patched, [record], { tensorOffset: 4 })
  await assert.rejects(offset.run(), /destination offset mismatch/)
  assert.equal(offset.uploads.length, 0)
  assert.equal(offset.allocated[0].disposed, 1)
})

test('fresh GPU tensor offset check handles wasm32 ABI padding and both uint64 words', async () => {
  const record = { name: 'one', byteOffset: 4, nbytes: 8, shape: [2], dtype: 'uint32', format: 'raw' }
  const padded = tensorFixture(patched, [record], { padding: 0xffffffff })
  await padded.run()
  assert.equal(padded.allocated[0].byteOffset, -1, 'installed SDK property reads padding')
  assert.equal(padded.uploads.length, 1, 'aligned actual offset is still zero')
  for (const pointerBytes of [4, 8]) {
    const zero = tensorFixture(patched, [record], { pointerBytes })
    await zero.run()
    assert.equal(zero.uploads.length, 1)
    for (const offsetWords of [{ tensorOffset: 4 }, { tensorOffset: 0x80000000 }, { tensorOffsetHigh: 1 }, { tensorOffsetHigh: 0x80000000 }]) {
      const fixture = tensorFixture(patched, [record], { pointerBytes, ...offsetWords })
      await assert.rejects(fixture.run(), /destination offset mismatch/)
      assert.equal(fixture.uploads.length, 0)
      assert.equal(fixture.allocated[0].disposed, 1)
    }
  }
})

test('runtime drift fails closed and unrelated modules are untouched', () => {
  assert.throws(() => patchWebllmMemory(original, '0.2.81'), /Review/)
  assert.throws(() => patchWebllmMemory(original.replace('buffer.slice(rec.byteOffset, rec.byteOffset + rec.nbytes)', 'changed()'), '0.2.80'), /Review/)
  for (const target of ['class ArtifactIndexedDBCache {', 'const request = store.get(url);', 'const request = store.get(key);']) {
    assert.throws(() => patchWebllmMemory(original.replace(target, 'changed()'), '0.2.80'), /Review/)
  }
  assert.throws(() => patchWebllmMemory(patched, '0.2.80'), /Review/)
  const plugin = webllmMemoryPatch()
  assert.equal(plugin.transform(original, '/unrelated.js'), null)
  assert.equal(plugin.transform(original, `${entry}?worker`).code, patched)
})
