// Tiny native desktop WebKit IndexedDB checks of the actual installed SDK class.
// No GPU, model assets, user browser profile, or real health information is used.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { patchWebllmMemory } from '../frontend/build/webllmMemoryPatch.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repo, 'frontend/package.json'))
const entry = require.resolve('@mlc-ai/web-llm')
const sdkVersion = JSON.parse(await fs.readFile(path.resolve(entry, '../../package.json'), 'utf8')).version
const original = await fs.readFile(entry, 'utf8')
const patched = patchWebllmMemory(original, sdkVersion)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function cacheClass(source) {
  const start = source.indexOf('class ArtifactIndexedDBCache {')
  const next = source.indexOf('function hasTensorInCache(', start)
  assert(start >= 0 && next > start, 'Installed SDK class was not found')
  return source.slice(start, source.lastIndexOf('/**', next)).trim()
}

// Stringified unchanged into both native browser realms. Only the SDK's class
// is extracted; its IndexedDB, fetch, storage schema and requests stay native.
async function runInRealm({ source, variant, realm, origin, binary, json }) {
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  function awaiter(self, _args, _promise, generator) {
    return new Promise((resolve, reject) => {
      const iterator = generator.call(self)
      function step(verb, value) {
        let result
        try { result = iterator[verb](value) } catch (error) { reject(error); return }
        if (result.done) resolve(result.value)
        else Promise.resolve(result.value).then(value => step('next', value), error => step('throw', error))
      }
      step('next')
    })
  }
  const Cache = new Function('__awaiter', `${source}; return ArtifactIndexedDBCache`)(awaiter)
  const dbName = `kit-synthetic-cache-${realm}-${variant}-${Date.now()}`
  const cache = new Cache(dbName)
  const native = { get: IDBObjectStore.prototype.get, getKey: IDBObjectStore.prototype.getKey }
  check(typeof native.getKey === 'function', 'Native getKey is unavailable')
  let phase = 'opening'
  const reads = []
  for (const method of ['get', 'getKey']) {
    IDBObjectStore.prototype[method] = function (...args) {
      const record = { phase, method, key: String(args[0]), found: null, arrayBufferBytes: 0 }
      reads.push(record)
      const request = Reflect.apply(native[method], this, args)
      request.addEventListener('success', () => {
        record.found = request.result !== undefined
        record.arrayBufferBytes = request.result?.data instanceof ArrayBuffer ? request.result.data.byteLength : 0
      })
      return request
    }
  }
  try {
    await cache.initDB()
    const transaction = cache.db.transaction(['urls'], 'readonly')
    const keyPath = transaction.objectStore('urls').keyPath
    check(keyPath === 'url' && cache.db.version === 1, 'Unexpected native storage schema')
    const jsonUrl = `${origin}/fixtures/${realm}-${variant}.json`
    const binaryUrl = `${origin}/fixtures/${realm}-${variant}.bin`
    const missingUrl = `${origin}/fixtures/never-fetched-missing.bin`
    phase = 'fresh-write-read'
    check(JSON.stringify(await cache.fetchWithCache(jsonUrl, 'json')) === JSON.stringify(json), 'Fresh JSON changed')
    check(JSON.stringify([...new Uint8Array(await cache.fetchWithCache(binaryUrl, 'arraybuffer'))]) === JSON.stringify(binary), 'Fresh bytes changed')

    phase = 'presence'
    check(await cache.hasAllKeys([jsonUrl, binaryUrl]) === true, 'Hit list missing')
    check(await cache.isUrlInDB(jsonUrl) === true, 'JSON key missing')
    check(await cache.isUrlInDB(binaryUrl) === true, 'Binary key missing')
    check(await cache.hasAllKeys([binaryUrl, binaryUrl, jsonUrl]) === true, 'Duplicate key changed result')
    check(await cache.hasAllKeys([jsonUrl, missingUrl]) === false, 'Missing key incorrectly present')
    check(await cache.isUrlInDB(missingUrl) === false, 'Missing URL incorrectly present')
    const beforeEmpty = reads.length
    check(await cache.hasAllKeys([]) === true, 'Empty list changed result')
    check(reads.length === beforeEmpty, 'Empty list created a value request')

    phase = 'cached-read'
    check(JSON.stringify(await cache.fetchWithCache(jsonUrl, 'json')) === JSON.stringify(json), 'Cached JSON changed')
    check(JSON.stringify([...new Uint8Array(await cache.fetchWithCache(binaryUrl, 'arraybuffer'))]) === JSON.stringify(binary), 'Cached bytes changed')
    return {
      realm, variant, result: 'pass', nativeIndexedDB: true,
      dbVersion: cache.db.version, keyPath, getKeyAvailable: true,
      checks: ['fresh JSON write/read', 'fresh ArrayBuffer write/read', 'all keys present', 'JSON presence', 'binary presence', 'duplicate keys', 'missing key list', 'missing URL', 'empty list', 'cached JSON read', 'cached ArrayBuffer read'],
      phases: Object.fromEntries(['fresh-write-read', 'presence', 'cached-read'].map(name => {
        const entries = reads.filter(item => item.phase === name)
        return [name, {
          get: entries.filter(item => item.method === 'get').length,
          getKey: entries.filter(item => item.method === 'getKey').length,
          returnedArrayBufferBytes: entries.reduce((sum, item) => sum + item.arrayBufferBytes, 0),
          reads: entries,
        }]
      })),
    }
  } finally {
    for (const method of ['get', 'getKey']) IDBObjectStore.prototype[method] = native[method]
    cache.db?.close()
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName)
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Synthetic database deletion blocked'))
    })
  }
}

const binary = [0, 1, 2, 3, 127, 128, 254, 255]
const json = { fixture: 'synthetic cache verification', count: 7 }
const fixtureRequests = []
const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  if (request.url === '/worker.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(`const run = ${runInRealm.toString()}; self.onmessage = async event => { try { self.postMessage({ok:true,result:await run(event.data)}); } catch(error) { self.postMessage({ok:false,error:error.message}); } };`)
  } else if (/^\/fixtures\/(window|worker)-(before|after)\.(json|bin)$/.test(request.url)) {
    fixtureRequests.push(request.url)
    response.setHeader('Content-Type', request.url.endsWith('.json') ? 'application/json' : 'application/octet-stream')
    response.end(request.url.endsWith('.json') ? JSON.stringify(json) : Buffer.from(binary))
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><title>Native synthetic cache verification</title>')
  } else response.writeHead(404).end()
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const { webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const executablePath = process.env.WEBKIT_EXECUTABLE_PATH || '/Users/owner/Library/Caches/ms-playwright/webkit-2336/pw_run.sh'
const output = process.env.KIT_WEBKIT_CACHE_RESULTS || path.join(repo, 'verification/webkit-cache-presence-results.json')
const report = {
  schema: 'kit-native-webkit-cache-presence-v1', checkedAt: new Date().toISOString(), complete: false,
  scope: 'Native IndexedDB and fetch in isolated headless desktop Playwright WebKit window and dedicated worker. Actual installed SDK cache class, before/after the guarded patch. Eight-byte synthetic binary plus small JSON only; no model download, GPU, user profile, physical iPhone or process-memory measurement.',
  sdkVersion, classHashes: { before: sha256(cacheClass(original)), after: sha256(cacheClass(patched)) },
  webkitExecutable: executablePath, results: [], pageErrors: [], externalRequests: [],
}
let browser, context
try {
  browser = await webkit.launch({ headless: true, executablePath })
  report.browserVersion = browser.version()
  context = await browser.newContext()
  context.on('request', request => { if (!request.url().startsWith(origin + '/')) report.externalRequests.push(request.url()) })
  const page = await context.newPage()
  page.on('pageerror', error => report.pageErrors.push(error.message))
  await page.goto(origin)
  report.userAgent = await page.evaluate(() => navigator.userAgent)
  for (const realm of ['window', 'worker']) {
    for (const [variant, source] of [['before', cacheClass(original)], ['after', cacheClass(patched)]]) {
      const args = { source, variant, realm, origin, binary, json }
      const result = realm === 'window'
        ? await page.evaluate(runInRealm, args)
        : await page.evaluate(args => new Promise((resolve, reject) => {
          const worker = new Worker('/worker.js')
          const finish = (error, result) => { clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(result) }
          const timer = setTimeout(() => finish(new Error('Synthetic worker test timed out')), 20000)
          worker.onerror = event => finish(new Error(event.message))
          worker.onmessage = event => event.data.ok ? finish(null, event.data.result) : finish(new Error(event.data.error))
          worker.postMessage(args)
        }), args)
      const presence = result.phases.presence
      assert.equal(presence.get, variant === 'before' ? 10 : 0)
      assert.equal(presence.getKey, variant === 'after' ? 10 : 0)
      assert.equal(presence.returnedArrayBufferBytes, variant === 'before' ? binary.length * 4 : 0)
      assert.equal(result.phases['cached-read'].returnedArrayBufferBytes, variant === 'before' ? binary.length * 2 : binary.length)
      assert.equal(result.phases['fresh-write-read'].returnedArrayBufferBytes, binary.length)
      report.results.push(result)
    }
  }
  assert.equal(fixtureRequests.length, 8, 'Only initial fixture writes may fetch; cached reads must not refetch')
  assert.equal(new Set(fixtureRequests).size, 8, 'A fixture was fetched again')
  assert.deepEqual(report.externalRequests, [])
  assert.deepEqual(report.pageErrors, [])
  report.fixtureRequests = fixtureRequests
  report.complete = true
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  process.exitCode = 1
} finally {
  await context?.close()
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ complete: report.complete, cases: report.results.length, browserVersion: report.browserVersion, output, ...(report.failure ? { failure: report.failure.message } : {}) }))
}
