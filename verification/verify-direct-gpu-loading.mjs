// Real saved Qwen before/after direct-to-GPU loading. Samples WASM linear
// memory sizes and native GPU queue writes; it does not measure peak process RAM.
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { MEDICAL_TRIAL_MODEL_ID, MEDICAL_TRIAL_RECORD, MEDICAL_TRIAL_CONSENT_KEY } from '../frontend/src/services/medicalTrialConfig.js'
import { isolatedChromePids, closeBrowserAndConfirmExit } from '../model-tools/browser-eval/lifecycle.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sourceProfile = process.env.KIT_DIRECT_GPU_SOURCE_PROFILE || '/var/folders/l6/m4hsd79x1q11bsvd52jvt02m0000gn/T/kit-ai-phone-candidate-14Yewu/candidate-profile'
const baselineDist = process.env.KIT_DIRECT_GPU_BASELINE_DIST || '/var/folders/l6/m4hsd79x1q11bsvd52jvt02m0000gn/T/kit-direct-gpu-verification-DWIbzp/baseline-dist'
const output = process.env.KIT_DIRECT_GPU_OUTPUT || path.join(root, 'verification/direct-gpu-loading-results.json')
const mode = process.env.KIT_DIRECT_GPU_ARM || 'all'
const previous = mode === 'patched' ? JSON.parse(await fs.readFile(output, 'utf8')) : null
const artifacts = previous?.artifacts || process.env.KIT_DIRECT_GPU_ARTIFACTS || await fs.mkdtemp(path.join(os.tmpdir(), 'kit-ai-direct-gpu-'))
const patchedDist = path.join(artifacts, 'patched-dist')
const patchedDistSource = process.env.KIT_DIRECT_GPU_PATCHED_DIST || path.join(root, 'frontend/dist')
const origin = 'http://127.0.0.1:51241'
const pauseKey = `${MEDICAL_TRIAL_CONSENT_KEY}:paused`
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const safeUrl = value => { try { const u = new URL(value); return { host: u.host, path: u.pathname } } catch { return { path: String(value) } } }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const report = previous || {
  schema: 'kit-ai-direct-gpu-loading-verification-v1', checkedAt: new Date().toISOString(), complete: false,
  scope: 'Real saved pinned Qwen model, independent closed-profile clones, hardware Chrome and native 256 MiB GPU devices. Baseline already includes getKey cache presence fix. Samples exported/imported WASM linear-memory buffer lengths during initialization and at readiness, not peak RSS or total RAM. Does not establish physical iPhone compatibility or medical accuracy.',
  instrumentation: 'A recorded prefix precedes unchanged built workers. WebAssembly instantiate/instantiateStreaming wrappers pass native arguments and return the original native promise; fulfillment observers discover memories without changing results. Memory handles use WeakRef and buffer.byteLength is read without copying. Worker postMessage arguments/return are preserved; progress messages trigger samples. Native adapter limits are advertised as the recorded phone limits via proxy, but requestDevice and all allocations/writes execute on real hardware unchanged. Native GPU queue.writeBuffer arguments/return are preserved; cumulative bytes include every initialization write, not only weights. Cloned assistant runtime cache alone is cleared while paused to install the observer; original profile and stored weights are untouched.',
  modelId: MEDICAL_TRIAL_MODEL_ID, sourceProfile, artifacts, arms: {}, wasm: [], gpu: [], network: {}, outputs: [], browserCloses: [], pageErrors: [], observerErrors: [],
}
let phase = 'setup', arm, armDist, activeProfile, context, page, server, serverStopped = true
const save = () => fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
const bucket = () => report.network[phase] ||= { requests: [], failures: [], blocked: [] }

function wasmObserver() {
  const emit = value => console.log('__KIT_DIRECT_WASM__' + JSON.stringify({ workerPath: new URL(location.href).pathname, ...value }))
  const observed = [], identifiers = new WeakMap()
  let callSequence = 0
  function remember(memory, source, callId, modelRuntime = false) {
    if (!(memory instanceof WebAssembly.Memory)) return
    let row = identifiers.get(memory)
    if (!row) {
      row = { id: observed.length + 1, ref: new WeakRef(memory), sources: [], modelRuntime: false }
      identifiers.set(memory, row)
      observed.push(row)
    }
    const label = `${callId}:${source}`
    if (!row.sources.includes(label)) row.sources.push(label)
    row.modelRuntime ||= modelRuntime
  }
  function sample(tag, progress) {
    try {
      const memories = observed.flatMap(row => {
        const memory = row.ref.deref()
        return memory ? [{ id: row.id, bytes: memory.buffer.byteLength, sources: row.sources, modelRuntime: row.modelRuntime }] : []
      })
      emit({ kind: 'sample', tag, ...(progress ? { progress } : {}), memories, totalObservedBytes: memories.reduce((sum, row) => sum + row.bytes, 0), gpuWrites: globalThis.__kitGPUWriteSnapshot?.() || [] })
    } catch (error) { emit({ kind: 'observer-error', message: error.message }) }
  }
  globalThis.__kitSampleWasm = sample
  for (const name of ['instantiate', 'instantiateStreaming']) {
    const native = WebAssembly[name]
    if (typeof native !== 'function') continue
    Object.defineProperty(WebAssembly, name, { configurable: true, writable: true, value: function (...args) {
      const callId = ++callSequence
      try {
        for (const [moduleName, module] of Object.entries(Object.getOwnPropertyDescriptors(args[1] || {}))) {
          for (const [field, entry] of Object.entries(Object.getOwnPropertyDescriptors(module.value || {}))) remember(entry.value, `import:${moduleName}.${field}`, callId)
        }
      } catch (error) { emit({ kind: 'observer-error', message: error.message }) }
      const pending = Reflect.apply(native, this, args)
      pending.then(result => {
        try {
          const instance = result instanceof WebAssembly.Instance ? result : result?.instance
          const exports = instance?.exports || {}
          const modelRuntime = Object.keys(exports).some(key => /^TVM/.test(key))
          for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(exports))) remember(descriptor.value, `export:${key}`, callId, modelRuntime)
          sample(`${name}-resolved`)
        } catch (error) { emit({ kind: 'observer-error', message: error.message }) }
      }, () => {})
      return pending
    } })
  }
  const post = globalThis.postMessage
  globalThis.postMessage = function (...args) {
    const data = args[0]
    if (data?.kind === 'initProgressCallback') sample('init-progress', { text: data.content?.text, fraction: data.content?.progress })
    return Reflect.apply(post, this, args)
  }
  emit({ kind: 'installed' })
}

function gpuObserver() {
  const emit = value => console.log('__KIT_DIRECT_GPU__' + JSON.stringify({ workerPath: new URL(location.href).pathname, ...value }))
  const limits = { maxBufferSize: 429496728, maxStorageBufferBindingSize: 429496728, maxComputeWorkgroupStorageSize: 32768, maxStorageBuffersPerShaderStage: 44 }
  const rows = []
  globalThis.__kitGPUWriteSnapshot = () => rows.map(row => ({ ...row }))
  const gpu = navigator.gpu
  if (!gpu) { emit({ kind: 'missing' }); return }
  const requestAdapter = gpu.requestAdapter.bind(gpu)
  Object.defineProperty(gpu, 'requestAdapter', { configurable: true, value: async (...args) => {
    const adapter = await requestAdapter(...args)
    if (!adapter) return adapter
    if (['maxBufferSize', 'maxStorageBufferBindingSize'].some(name => adapter.limits[name] < limits[name])) throw new Error('Host GPU cannot expose the phone buffer limits')
    const advertised = Object.fromEntries(Object.entries(limits).map(([name, value]) => [name, Math.min(adapter.limits[name], value)]))
    emit({ kind: 'adapter', advertisedLimits: advertised, nativeLimits: Object.fromEntries(Object.keys(limits).map(name => [name, adapter.limits[name]])), identity: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description, isFallbackAdapter: adapter.isFallbackAdapter ?? adapter.info.isFallbackAdapter } })
    const limitProxy = new Proxy(adapter.limits, { get(target, key) { return key in advertised ? advertised[key] : Reflect.get(target, key, target) } })
    return new Proxy(adapter, { get(target, key) {
      if (key === 'limits') return limitProxy
      if (key === 'requestDevice') return async descriptor => {
        if (Object.keys(limits).some(name => descriptor?.requiredLimits?.[name] > limits[name])) throw new Error('Requested device exceeds phone limits')
        const device = await target.requestDevice(descriptor)
        const row = { deviceId: rows.length + 1, calls: 0, bytes: 0 }
        rows.push(row)
        const write = device.queue.writeBuffer
        Object.defineProperty(device.queue, 'writeBuffer', { configurable: true, value: function (...args) {
          const result = Reflect.apply(write, this, args)
          const data = args[2], unit = ArrayBuffer.isView(data) ? data.BYTES_PER_ELEMENT || 1 : 1
          row.calls++
          row.bytes += args[4] === undefined ? data.byteLength - (args[3] || 0) * unit : args[4] * unit
          return result
        } })
        emit({ kind: 'device', deviceId: row.deviceId, requestedLimits: descriptor?.requiredLimits, grantedLimits: { maxBufferSize: device.limits.maxBufferSize, maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize }, shaderF16: device.features.has('shader-f16') })
        return device
      }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    } })
  } })
}
const workerPrefix = `(${gpuObserver.toString()})();\n(${wasmObserver.toString()})();\n`

async function startServer() {
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, origin).pathname)
      const file = path.resolve(armDist, '.' + (pathname === '/' ? '/index.html' : pathname))
      if (!file.startsWith(armDist + path.sep)) { response.writeHead(403).end(); return }
      let data = await fs.readFile(file)
      if (/\/assets\/(?:webllm-worker-|model-trial-check-worker-)[^/]+\.js$/.test(pathname)) {
        report.arms[arm].instrumentedWorkers[pathname] = { originalSha256: sha256(data), prefixSha256: sha256(workerPrefix), bytesAdded: Buffer.byteLength(workerPrefix) }
        data = Buffer.concat([Buffer.from(workerPrefix), data])
      }
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': data.length })
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(51241, '127.0.0.1', resolve) })
  serverStopped = false
}
async function stopServer() {
  if (serverStopped || !server) return
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  serverStopped = true
}
async function close() {
  if (!context) return
  report.browserCloses.push({ phase, ...await closeBrowserAndConfirmExit(context, () => isolatedChromePids(activeProfile, executablePath)) })
  context = null
}
async function launch({ setup = false, offline = false, language = 'en' } = {}) {
  assert(isolatedChromePids(activeProfile, executablePath).length === 0, 'The cloned profile is still open')
  context = await chromium.launchPersistentContext(activeProfile, {
    executablePath, headless: true, chromiumSandbox: true, viewport: { width: 390, height: 844 },
    args: ['--enable-automation'], ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
  })
  await context.setOffline(offline)
  await context.addInitScript(({ setup, pauseKey, language }) => {
    localStorage.setItem('kit-ai-language', language)
    localStorage.setItem('kit-ai-allow-online', 'false')
    if (setup) localStorage.setItem(pauseKey, 'true')
  }, { setup, pauseKey, language })
  await context.route('**/*', route => {
    const request = route.request()
    if (/\.bin(?:$|[?#])/.test(request.url()) || request.method() === 'POST') {
      bucket().blocked.push({ ...safeUrl(request.url()), method: request.method() })
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  context.on('request', request => bucket().requests.push({ ...safeUrl(request.url()), method: request.method() }))
  context.on('requestfailed', request => bucket().failures.push({ ...safeUrl(request.url()), error: request.failure()?.errorText }))
  context.on('console', message => {
    const value = message.text()
    try {
      if (value.startsWith('__KIT_DIRECT_WASM__')) {
        const entry = { phase, ...JSON.parse(value.slice('__KIT_DIRECT_WASM__'.length)) }
        report.wasm.push(entry)
        if (entry.kind === 'observer-error') report.observerErrors.push(entry)
      }
      if (value.startsWith('__KIT_DIRECT_GPU__')) report.gpu.push({ phase, ...JSON.parse(value.slice('__KIT_DIRECT_GPU__'.length)) })
    } catch (error) { report.observerErrors.push({ phase, message: error.message }) }
  })
  page = context.pages()[0] || await context.newPage()
  page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }))
  const cdp = await context.newCDPSession(page)
  const args = (await cdp.send('Browser.getBrowserCommandLine')).arguments
  assert(!args.some(value => /unsafe|swiftshader|disable-gpu/.test(value)), 'Unsafe or software GPU argument')
  await page.goto(origin, { waitUntil: 'load', timeout: 45000 })
}
async function ensureBuild() {
  const main = report.arms[arm].mainScript
  for (let attempt = 0; attempt < 8; attempt++) {
    const scripts = await page.locator('script[src]').evaluateAll(items => items.map(item => new URL(item.src).pathname))
    report.arms[arm].setupNavigations.push({ attempt, scripts })
    if (scripts.includes(main)) return
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg?.update()
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    })
    await page.waitForTimeout(1000)
    await page.reload({ waitUntil: 'load' })
  }
  throw new Error('Failed to activate the intended build')
}
async function ready(language = 'en') {
  const start = Date.now(), label = language === 'es' ? 'Listo sin internet' : 'Ready without internet'
  let previous = ''
  while (!(await page.getByText(label, { exact: true }).count())) {
    const status = await page.locator('h2[role="status"]').innerText().catch(() => '')
    if (status !== previous) { console.log(JSON.stringify({ phase, status })); previous = status }
    if (/needs internet|did not finish|Connect once|Take Kit offline|paused|could not open|trouble staying|necesita internet|no termin|no pudo abrir|Pausad/i.test(status)) throw new Error('Saved model unavailable: ' + status)
    if (Date.now() - start > 180000) throw new Error('Readiness timeout: ' + status)
    assert(!report.observerErrors.length, 'Observer failed')
    await page.waitForTimeout(250)
  }
  assert(!bucket().blocked.length, 'Model download or online inference was attempted')
  await sampleWorkers('ready')
  return Date.now() - start
}
async function changeLanguage(language, previous) {
  await page.getByRole('button', { name: previous === 'es' ? 'Más opciones' : 'More options', exact: true }).click()
  await page.getByRole('button', { name: previous === 'es' ? 'Ajustes' : 'Settings', exact: true }).click()
  await page.getByRole('combobox').selectOption(language)
  await page.getByRole('button', { name: language === 'es' ? 'Volver al chat' : 'Back to chat', exact: true }).click()
}
async function ask(question, language) {
  await page.getByRole('button', { name: language === 'es' ? 'Nueva conversación' : 'New conversation', exact: true }).click()
  await page.locator('#chat-message').fill(question)
  const start = Date.now()
  await page.locator('form button[type="submit"]').click()
  await page.getByRole('log').getByText(question, { exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('#chat-message') && !document.querySelector('#chat-message').disabled && document.querySelector('[role="log"]')?.innerText.length > 50, null, { timeout: 240000 })
  assert(await page.getByRole('alert').count() === 0, 'Answering failed')
  const answer = await page.getByRole('log').locator('p.whitespace-pre-wrap').last().innerText()
  assert(answer.trim().length > 15 && answer !== question, 'Fresh generated answer missing')
  report.outputs.push({ phase, language, question, answer, elapsedMs: Date.now() - start })
  await page.screenshot({ path: path.join(artifacts, `${phase}-${language}.png`), fullPage: true })
  await save()
}
async function sampleWorkers(tag) {
  const workers = page.workers().filter(worker => /webllm-worker-/.test(worker.url()))
  assert(workers.length > 0, 'Model worker missing when sampling memory')
  for (const worker of workers) await worker.evaluate(tag => globalThis.__kitSampleWasm(tag), tag)
  await page.waitForTimeout(50)
}
function summarize(stage) {
  const samples = report.wasm.filter(row => row.phase === stage && row.kind === 'sample' && /webllm-worker-/.test(row.workerPath))
  const ready = samples.findLast(row => row.tag === 'ready')
  assert(ready && ready.memories.length, 'No native WASM memory observed at readiness')
  assert(ready.memories.some(row => row.modelRuntime), 'Model runtime WASM memory was not identified')
  return {
    samples: samples.length,
    largestObservedTotalWasmBytes: Math.max(...samples.map(row => row.totalObservedBytes)),
    largestObservedModelWasmBytes: Math.max(...samples.flatMap(row => row.memories.filter(memory => memory.modelRuntime).map(memory => memory.bytes))),
    readyMemories: ready.memories, readyTotalWasmBytes: ready.totalObservedBytes,
    readyModelWasmBytes: ready.memories.filter(row => row.modelRuntime).reduce((sum, row) => sum + row.bytes, 0),
    initializationGPUWriteCalls: ready.gpuWrites.reduce((sum, row) => sum + row.calls, 0),
    initializationGPUWriteBytes: ready.gpuWrites.reduce((sum, row) => sum + row.bytes, 0),
  }
}
function verifyNativeGPU(stage) {
  const adapters = report.gpu.filter(event => event.phase === stage && event.kind === 'adapter')
  const devices = report.gpu.filter(event => event.phase === stage && event.kind === 'device')
  assert(adapters.length && adapters.every(event => event.identity.isFallbackAdapter !== true && !/software|swiftshader|llvmpipe/i.test(JSON.stringify(event.identity))), 'Native hardware GPU not established')
  assert(devices.length && devices.every(event => event.shaderF16 && event.grantedLimits.maxBufferSize === 268435456 && event.grantedLimits.maxStorageBufferBindingSize === 268435456), 'Native phone-sized f16 GPU device not established')
  assert(report.wasm.some(row => row.phase === stage && row.kind === 'installed' && /webllm-worker-/.test(row.workerPath)), 'Current model worker observer did not run')
}

try {
  assert(['all', 'baseline', 'patched'].includes(mode), 'Unknown requested comparison arm')
  assert(report.modelId === MEDICAL_TRIAL_MODEL_ID, 'Model changed between comparison arms')
  assert(isolatedChromePids(sourceProfile, executablePath).length === 0, 'Original saved profile must be closed')
  await fs.mkdir(artifacts, { recursive: true })
  if (mode !== 'baseline') await fs.cp(patchedDistSource, patchedDist, { recursive: true, mode: fsConstants.COPYFILE_FICLONE })
  const arms = mode === 'all' ? ['baseline', 'patched'] : [mode]
  for (const name of arms) {
    assert(!report.arms[name], 'Do not overwrite an already-recorded comparison arm')
    arm = name
    armDist = name === 'baseline' ? baselineDist : patchedDist
    activeProfile = path.join(artifacts, `${arm}-profile`)
    await fs.cp(sourceProfile, activeProfile, { recursive: true, mode: fsConstants.COPYFILE_FICLONE })
    const index = await fs.readFile(path.join(armDist, 'index.html'), 'utf8')
    const mainScript = index.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
    assert(mainScript, 'Missing main bundle')
    report.arms[arm] = { dist: armDist, profile: activeProfile, sourceUntouched: true, cloneMode: 'COPYFILE_FICLONE', indexSha256: sha256(index), mainScript, mainSha256: sha256(await fs.readFile(path.join(armDist, mainScript))), instrumentedWorkers: {}, setupNavigations: [] }
    await startServer()
    phase = `${arm}-setup`
    await launch({ setup: true })
    await ensureBuild()
    report.arms[arm].setup = await page.evaluate(async ({ pauseKey, consentKey }) => {
      const deleted = await caches.delete('kit-ai-assistant-runtime-v2')
      const consent = localStorage.getItem(consentKey)
      localStorage.setItem(pauseKey, 'false')
      return { deletedRuntimeOnly: deleted, existingApproval: consent }
    }, { pauseKey, consentKey: MEDICAL_TRIAL_CONSENT_KEY })
    assert(report.arms[arm].setup.existingApproval === 'true', 'Profile lacks prior approval; do not authorize a download')
    await close()
    phase = `${arm}-cached-load`
    await launch()
    assert((await page.locator('script[src]').evaluateAll(items => items.map(item => new URL(item.src).pathname))).includes(mainScript), 'Measured navigation did not load intended build')
    report.arms[arm].readyMs = await ready()
    verifyNativeGPU(phase)
    report.arms[arm].cachedLoad = summarize(phase)
    await ask('How do I care for a small cut?', 'en')
    console.log(JSON.stringify({ arm, readyMs: report.arms[arm].readyMs, memory: report.arms[arm].cachedLoad }))
    await close()
    await stopServer()
    if (arm === 'patched') {
      phase = 'patched-offline-reopen'
      await launch({ offline: true, language: 'es' })
      report.arms[arm].offlineReadyMs = await ready('es')
      verifyNativeGPU(phase)
      const failedProbe = context.waitForEvent('requestfailed', { predicate: request => request.url().includes('/README.md'), timeout: 10000 }).catch(() => null)
      const blocked = await page.evaluate(async url => { try { await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); return false } catch { return true } }, new URL('README.md', MEDICAL_TRIAL_RECORD.model).href)
      const failure = await failedProbe
      assert(blocked && /ERR_INTERNET_DISCONNECTED/.test(failure?.failure()?.errorText), 'Offline transport block not demonstrated')
      report.arms[arm].offline = { serverStopped, previousBrowserExitConfirmed: report.browserCloses.at(-1)?.confirmedExited, serviceWorkerControlsPage: await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), browserReportsOnline: await page.evaluate(() => navigator.onLine), uncachedRequestFailure: failure.failure().errorText, memory: summarize(phase) }
      assert(report.arms[arm].offline.serverStopped && report.arms[arm].offline.previousBrowserExitConfirmed && report.arms[arm].offline.serviceWorkerControlsPage, 'Offline reopening prerequisites absent')
      await ask('¿Cómo cuido un corte pequeño?', 'es')
      await changeLanguage('en', 'es')
      await ask('Can I put butter on a small burn?', 'en')
      await close()
    }
    await save()
  }
  assert(!Object.values(report.network).some(value => value.blocked.length || value.requests.some(request => request.path.endsWith('.bin') || request.method === 'POST')), 'Unexpected shard request or online inference')
  assert(!report.pageErrors.length && !report.observerErrors.length, 'Browser or observer errors occurred')
  if (report.arms.baseline?.cachedLoad && report.arms.patched?.offline) {
    const before = report.arms.baseline.cachedLoad, after = report.arms.patched.cachedLoad
    assert(after.readyModelWasmBytes < before.readyModelWasmBytes, 'Direct loading did not reduce observed model WASM size')
    assert(after.initializationGPUWriteBytes === before.initializationGPUWriteBytes && after.initializationGPUWriteCalls === before.initializationGPUWriteCalls, 'Initialization GPU writes differ between arms')
    report.comparison = {
      baselineReadyModelWasmBytes: before.readyModelWasmBytes, patchedReadyModelWasmBytes: after.readyModelWasmBytes,
      reducedObservedModelWasmBytes: before.readyModelWasmBytes - after.readyModelWasmBytes,
      baselineInitializationGPUWriteBytes: before.initializationGPUWriteBytes, patchedInitializationGPUWriteBytes: after.initializationGPUWriteBytes,
      peakProcessMemoryMeasured: false,
    }
    report.complete = true
  } else report.baselineComplete = true
} catch (error) {
  report.failure = { phase, message: error.message, stack: error.stack }
  if (page && !page.isClosed()) report.failure.visiblePage = await page.locator('body').innerText().catch(() => '')
  console.error(error)
} finally {
  try { await close() } catch (error) { report.complete = false; report.closeFailure = error.message }
  await stopServer()
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify({ complete: report.complete, baselineComplete: report.baselineComplete, output, artifacts, comparison: report.comparison }))
}
process.exitCode = report.failure || report.closeFailure ? 1 : 0
