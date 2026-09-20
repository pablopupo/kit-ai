// Compare real IndexedDB payload reads using separate clones of an already
// downloaded Qwen profile. This measures cumulative reads, not peak memory.
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
const sourceProfile = process.env.KIT_IDB_SOURCE_PROFILE || '/var/folders/l6/m4hsd79x1q11bsvd52jvt02m0000gn/T/kit-ai-phone-candidate-14Yewu/candidate-profile'
const baselineDist = process.env.KIT_IDB_BASELINE_DIST || '/var/folders/l6/m4hsd79x1q11bsvd52jvt02m0000gn/T/kit-idb-read-verification-HtOqUu/baseline-dist'
const patchedDistSource = path.join(root, 'frontend/dist')
const artifacts = process.env.KIT_IDB_ARTIFACTS || await fs.mkdtemp(path.join(os.tmpdir(), 'kit-ai-idb-presence-'))
const patchedDist = path.join(artifacts, 'patched-dist')
const output = path.join(root, 'verification/cache-presence-read-results.json')
const origin = 'http://127.0.0.1:51241'
const pauseKey = `${MEDICAL_TRIAL_CONSENT_KEY}:paused`
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const safeUrl = value => { try { const u = new URL(value); return { host: u.host, path: u.pathname } } catch { return { path: String(value) } } }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const report = {
  schema: 'kit-ai-cache-presence-read-verification-v1', checkedAt: new Date().toISOString(), complete: false,
  scope: 'Real saved Qwen model and hardware Chrome using independent closed-profile clones. Counts successful IndexedDB .bin payload reads and key-only queries in the main page and model workers. Does not measure peak RAM, establish physical iPhone compatibility, or assess medical accuracy.',
  instrumentation: 'Observers wrap IDBObjectStore.get/getKey but return the original native request unchanged; success listeners count result.data.byteLength. Page observer uses addInitScript; worker observer is a recorded prefix to the otherwise unchanged built worker. Native GPU adapter/device calls and granted limits are observed without changing their arguments or results. Only the assistant runtime CacheStorage is cleared in clones while loading is paused; IndexedDB weights and original profile remain untouched.',
  modelId: MEDICAL_TRIAL_MODEL_ID, sourceProfile, artifacts, arms: {}, reads: [], gpu: [], network: {}, outputs: [], browserCloses: [], pageErrors: [], observerErrors: [],
}
let phase = 'setup', arm, armDist, activeProfile, context, page, server, serverStopped = true
const save = () => fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
const bucket = () => report.network[phase] ||= { requests: [], failures: [], blocked: [] }

function idbObserver() {
  if (globalThis.__kitIDBObserver) return
  globalThis.__kitIDBObserver = true
  const surface = typeof document === 'undefined' ? 'worker' : 'page'
  const emit = value => console.log('__KIT_IDB_READ__' + JSON.stringify({ surface, observerPath: new URL(location.href).pathname, ...value }))
  emit({ kind: 'installed' })
  for (const method of ['get', 'getKey']) {
    const original = IDBObjectStore.prototype[method]
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: function (...args) {
      const request = Reflect.apply(original, this, args)
      const key = args[0]
      if (typeof key === 'string' && /\.bin(?:$|[?#])/.test(key)) {
        const details = { method, store: this.name, database: this.transaction.db.name, keyPath: new URL(key, location.href).pathname }
        request.addEventListener('success', () => {
          try {
            const result = request.result
            const payloadBytes = method === 'get' && Number.isFinite(result?.data?.byteLength) ? result.data.byteLength : 0
            emit({ kind: 'success', ...details, found: result !== undefined, payloadBytes })
          } catch (error) { emit({ kind: 'observer-error', message: error.message }) }
        })
        request.addEventListener('error', () => emit({ kind: 'request-error', ...details, name: request.error?.name }))
      }
      return request
    } })
  }
}

function gpuObserver() {
  const emit = value => console.log('__KIT_IDB_GPU__' + JSON.stringify({ workerPath: new URL(location.href).pathname, ...value }))
  const gpu = navigator.gpu
  if (!gpu) { emit({ kind: 'missing' }); return }
  const original = gpu.requestAdapter.bind(gpu)
  Object.defineProperty(gpu, 'requestAdapter', { configurable: true, value: async (...args) => {
    const adapter = await original(...args)
    if (!adapter) return adapter
    emit({ kind: 'adapter', identity: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description, isFallbackAdapter: adapter.isFallbackAdapter ?? adapter.info.isFallbackAdapter } })
    const request = adapter.requestDevice.bind(adapter)
    Object.defineProperty(adapter, 'requestDevice', { configurable: true, value: async (...args) => {
      const device = await request(...args)
      emit({ kind: 'device', requestedLimits: args[0]?.requiredLimits, grantedLimits: { maxBufferSize: device.limits.maxBufferSize, maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize }, shaderF16: device.features.has('shader-f16') })
      return device
    } })
    return adapter
  } })
}

const workerPrefix = `(${idbObserver.toString()})();\n(${gpuObserver.toString()})();\n`

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
  await context.addInitScript(idbObserver)
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
      if (value.startsWith('__KIT_IDB_READ__')) {
        const entry = { phase, ...JSON.parse(value.slice('__KIT_IDB_READ__'.length)) }
        report.reads.push(entry)
        if (entry.kind === 'observer-error') report.observerErrors.push(entry)
      }
      if (value.startsWith('__KIT_IDB_GPU__')) report.gpu.push({ phase, ...JSON.parse(value.slice('__KIT_IDB_GPU__'.length)) })
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
function summarize(stage) {
  const rows = report.reads.filter(row => row.phase === stage && row.kind === 'success')
  const totals = surface => {
    const selected = rows.filter(row => row.surface === surface)
    return { payloadGets: selected.filter(row => row.method === 'get').length, keyOnlyGets: selected.filter(row => row.method === 'getKey').length, cumulativePayloadBytes: selected.reduce((sum, row) => sum + row.payloadBytes, 0) }
  }
  return { page: totals('page'), worker: totals('worker'), cumulativePayloadBytes: rows.reduce((sum, row) => sum + row.payloadBytes, 0) }
}
function verifyNativeGPU(stage) {
  const adapter = report.gpu.filter(event => event.phase === stage && event.kind === 'adapter')
  const devices = report.gpu.filter(event => event.phase === stage && event.kind === 'device')
  assert(adapter.length && adapter.every(event => event.identity.isFallbackAdapter !== true && !/software|swiftshader|llvmpipe/i.test(JSON.stringify(event.identity))), 'Native hardware GPU not established')
  assert(devices.length && devices.every(event => event.shaderF16), 'Real f16 GPU device not established')
  assert(report.reads.some(row => row.phase === stage && row.kind === 'installed' && row.surface === 'worker' && /webllm-worker-/.test(row.observerPath)), 'Current model worker observer did not run')
}

try {
  assert(isolatedChromePids(sourceProfile, executablePath).length === 0, 'Original saved profile must be closed')
  await fs.mkdir(artifacts, { recursive: true })
  // Snapshot before either arm: a later deployment build cannot change bytes
  // served during this run, including assets saved for the offline restart.
  await fs.cp(patchedDistSource, patchedDist, { recursive: true, mode: fsConstants.COPYFILE_FICLONE })
  for (const name of ['baseline', 'patched']) {
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
      const before = await caches.keys()
      const deleted = await caches.delete('kit-ai-assistant-runtime-v2')
      const consent = localStorage.getItem(consentKey)
      localStorage.setItem(pauseKey, 'false')
      return { deletedRuntimeOnly: deleted, cachesBefore: before, cachesAfter: await caches.keys(), existingApproval: consent }
    }, { pauseKey, consentKey: MEDICAL_TRIAL_CONSENT_KEY })
    assert(report.arms[arm].setup.existingApproval === 'true', 'Profile lacks prior approval; do not silently approve a download')
    await close()
    phase = `${arm}-cached-load`
    await launch()
    assert((await page.locator('script[src]').evaluateAll(items => items.map(item => new URL(item.src).pathname))).includes(mainScript), 'Measured navigation did not load intended build')
    report.arms[arm].readyMs = await ready()
    verifyNativeGPU(phase)
    report.arms[arm].cachedLoad = summarize(phase)
    await ask('How do I care for a small cut?', 'en')
    console.log(JSON.stringify({ arm, readyMs: report.arms[arm].readyMs, reads: report.arms[arm].cachedLoad }))
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
      report.arms[arm].offline = { serverStopped, previousBrowserExitConfirmed: report.browserCloses.at(-1)?.confirmedExited, serviceWorkerControlsPage: await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), browserReportsOnline: await page.evaluate(() => navigator.onLine), uncachedRequestFailure: failure.failure().errorText, reads: summarize(phase) }
      await ask('¿Cómo cuido un corte pequeño?', 'es')
      await changeLanguage('en', 'es')
      await ask('Can I put butter on a small burn?', 'en')
      await close()
    }
    await save()
  }
  const before = report.arms.baseline.cachedLoad, after = report.arms.patched.cachedLoad
  assert(before.page.payloadGets > 0 && before.worker.payloadGets > 0, 'Baseline model payload reads missing')
  assert(after.page.payloadGets === 0 && after.page.keyOnlyGets > 0, 'Patched page presence checks still read weight payloads')
  assert(after.worker.keyOnlyGets > 0 && after.worker.payloadGets === 30, 'Patched worker should read each of the30 weight shards exactly once')
  assert(after.worker.cumulativePayloadBytes === 868547584, 'Patched worker byte count differs from full pinned weights')
  assert(report.arms.patched.offline.reads.page.payloadGets === 0 && report.arms.patched.offline.reads.worker.payloadGets === 30, 'Offline presence reads regressed')
  assert(!Object.values(report.network).some(value => value.blocked.length || value.requests.some(request => request.path.endsWith('.bin') || request.method === 'POST')), 'Unexpected shard request or online inference')
  assert(!report.pageErrors.length && !report.observerErrors.length, 'Browser or observer errors occurred')
  report.comparison = { baselineCumulativeBytes: before.cumulativePayloadBytes, patchedCumulativeBytes: after.cumulativePayloadBytes, avoidedCumulativePayloadBytes: before.cumulativePayloadBytes - after.cumulativePayloadBytes, peakMemoryMeasured: false }
  report.complete = true
} catch (error) {
  report.failure = { phase, message: error.message, stack: error.stack }
  if (page && !page.isClosed()) report.failure.visiblePage = await page.locator('body').innerText().catch(() => '')
  console.error(error)
} finally {
  try { await close() } catch (error) { report.complete = false; report.closeFailure = error.message }
  await stopServer()
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify({ complete: report.complete, output, artifacts, comparison: report.comparison }))
}
process.exitCode = report.complete ? 0 : 1
