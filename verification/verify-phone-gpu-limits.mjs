// Real production app + saved owner model on a hardware desktop GPU. The owned
// test server prefixes built worker responses with instrumentation to constrain
// the real adapter's advertised limits to the user's report. requestDevice is never
// mocked: the real device must grant the smaller limits requested by the SDK.
// This does NOT emulate iPhone memory pressure, WebKit, or medical accuracy.
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { isolatedChromePids, closeBrowserAndConfirmExit } from '../model-tools/browser-eval/lifecycle.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'frontend/dist')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const executablePath = process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = process.env.KIT_CACHED_MODEL_PROFILE
let cachedProfile
const origin = process.env.KIT_CACHED_MODEL_ORIGIN || 'http://127.0.0.1:51240'
const artifacts = process.env.KIT_ARTIFACT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'kit-ai-phone-gpu-limits-'))
const output = process.env.KIT_PHONE_GPU_OUTPUT || path.join(root, 'verification/phone-gpu-limits-results.json')
const phoneLimits = Object.freeze({
  maxBufferSize: 429496728, maxStorageBufferBindingSize: 429496728,
  maxComputeWorkgroupStorageSize: 32768, maxStorageBuffersPerShaderStage: 44,
})
const expectedBufferBytes = 2 ** 28
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const safeUrl = value => { try { const u = new URL(value); return { host: u.host, path: u.pathname } } catch { return { path: value } } }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const report = {
  schema: 'kit-ai-phone-gpu-limits-verification-v1', checkedAt: new Date().toISOString(), complete: false,
  instrumentation: 'Owned test server adds a recorded test-only prefix to built GPU-check/model worker responses. The app service worker caches those instrumented responses for the offline restart. Original worker bytes follow the prefix unchanged; original and prefix hashes are recorded. Other production assets are unchanged. Adapter buffer limits match the phone report; other adapter limits are min(host, phone). Real device grants and allocations are untouched.',
  scope: 'Current production build, real immutable saved medical 3B weights, real hardware GPU inference with worker adapter limits constrained to the user-reported iPhone limits. No model or inference mocks and no weight downloads. Actual GPUDevice requested/granted limits are recorded. Full browser exit and stopped app server precede offline reopening with browser transport blocked. This is not a physical iPhone, WebKit, total-memory, airplane-mode, or medical accuracy test.',
  phoneLimits, expectedBufferBytes, artifacts, network: {}, workerEvents: [], injectionErrors: [], pageErrors: [], browserCloses: [], outputs: [],
}
let phase = 'initializing', server, serverStopped = true, context, page, activeProfile
const save = () => fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
const bucket = () => report.network[phase] ||= { requests: [], failures: [] }

function workerPrelude() {
  const phoneLimits = __PHONE_LIMITS__
  const limitNames = Object.keys(phoneLimits)
  const limitsOf = limits => Object.fromEntries(limitNames.map(name => [name, limits[name]]))
  const emit = data => console.log('__KIT_PHONE_GPU__' + JSON.stringify({ workerPath: new URL(location.href).pathname, ...data }))
  let deviceSequence = 0
  const gpu = navigator.gpu
  if (!gpu) { emit({ kind: 'no-worker-gpu' }); return }
  const requestAdapter = gpu.requestAdapter.bind(gpu)
  Object.defineProperty(gpu, 'requestAdapter', { configurable: true, value: async (...args) => {
    const adapter = await requestAdapter(...args)
    if (!adapter) { emit({ kind: 'no-adapter' }); return adapter }
    const nativeLimits = limitsOf(adapter.limits)
    if (['maxBufferSize', 'maxStorageBufferBindingSize'].some(name => nativeLimits[name] < phoneLimits[name])) throw new Error('The host GPU cannot reproduce the phone buffer limits')
    const advertisedLimits = Object.fromEntries(limitNames.map(name => [name, Math.min(nativeLimits[name], phoneLimits[name])]))
    const identity = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, isFallbackAdapter: adapter.isFallbackAdapter ?? adapter.info.isFallbackAdapter, shaderF16: adapter.features.has('shader-f16') }
    emit({ kind: 'adapter', nativeLimits, advertisedLimits, identity })
    const limitProxy = new Proxy(adapter.limits, { get(target, key) { return key in advertisedLimits ? advertisedLimits[key] : Reflect.get(target, key, target) } })
    return new Proxy(adapter, { get(target, key) {
      if (key === 'limits') return limitProxy
      if (key === 'requestDevice') return async descriptor => {
        const requestedLimits = { ...descriptor?.requiredLimits }
        const requiredFeatures = [...(descriptor?.requiredFeatures || [])]
        emit({ kind: 'request-device', requestedLimits, requiredFeatures })
        if (limitNames.some(name => requestedLimits[name] > phoneLimits[name])) throw new Error('The app requested limits above the reported phone limits')
        const device = await target.requestDevice(descriptor)
        const deviceId = ++deviceSequence
        emit({ kind: 'granted-device', deviceId, requestedLimits, grantedLimits: limitsOf(device.limits), requiredFeatures, shaderF16: device.features.has('shader-f16') })
        const createBuffer = device.createBuffer.bind(device)
        let largestBufferBytes = 0, buffersCreated = 0
        Object.defineProperty(device, 'createBuffer', { configurable: true, value: descriptor => {
          const buffer = createBuffer(descriptor)
          buffersCreated++
          if (descriptor.size > largestBufferBytes) {
            largestBufferBytes = descriptor.size
            emit({ kind: 'largest-created-buffer', deviceId, largestBufferBytes, buffersCreated })
          }
          return buffer
        } })
        device.lost.then(info => emit({ kind: 'device-lost', deviceId, reason: info.reason, message: info.message }))
        return device
      }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    } })
  } })
  emit({ kind: 'installed' })
}


async function startServer() {
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, origin).pathname)
      const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname))
      if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return }
      let data = await fs.readFile(file)
      if (/\/assets\/(?:webllm-worker-|model-trial-check-worker-)[^/]+\.js$/.test(pathname)) {
        const instrumentation = `(${workerPrelude.toString().replace('__PHONE_LIMITS__', JSON.stringify(phoneLimits))})();\n`
        report.instrumentedWorkers ||= {}
        report.instrumentedWorkers[pathname] = { originalSha256: sha256(data), prefixSha256: sha256(instrumentation), bytesAdded: Buffer.byteLength(instrumentation) }
        data = Buffer.concat([Buffer.from(instrumentation), data])
      }
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': data.length })
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(new URL(origin).port), '127.0.0.1', resolve) })
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
async function launch({ offline = false, fresh = false, language = 'en' } = {}) {
  activeProfile = fresh ? await fs.mkdtemp(path.join(artifacts, 'fresh-profile-')) : cachedProfile
  assert(isolatedChromePids(activeProfile, executablePath).length === 0, 'The isolated profile is already open')
  context = await chromium.launchPersistentContext(activeProfile, {
    executablePath, headless: true, chromiumSandbox: true, viewport: { width: 390, height: 844 },
    args: ['--enable-automation'], ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
  })
  await context.setOffline(offline)
  // This is an isolated synthetic profile. Turn off online answering so a test
  // failure can never send its prompts to the hosted model. Do not change consent.
  await context.addInitScript(language => { localStorage.setItem('kit-ai-language', language); localStorage.setItem('kit-ai-allow-online', 'false') }, language)
  await context.route('**/*.bin', route => route.abort('blockedbyclient'))
  context.on('request', request => bucket().requests.push({ ...safeUrl(request.url()), method: request.method() }))
  context.on('requestfailed', request => bucket().failures.push({ ...safeUrl(request.url()), error: request.failure()?.errorText }))
  page = context.pages()[0] || await context.newPage()
  page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }))
  const cdp = await context.newCDPSession(page)
  const args = (await cdp.send('Browser.getBrowserCommandLine')).arguments
  assert(!args.some(arg => /unsafe|swiftshader|disable-gpu/.test(arg)), 'Unsafe or software GPU arguments')
  context.on('console', message => {
    const text = message.text()
    if (text.startsWith('__KIT_PHONE_GPU__')) {
      try { const { workerPath, ...event } = JSON.parse(text.slice('__KIT_PHONE_GPU__'.length)); report.workerEvents.push({ phase, worker: { path: workerPath }, ...event }) }
      catch (error) { report.injectionErrors.push({ phase, message: error.message }) }
    }
  })
  await page.goto(origin, { waitUntil: 'load', timeout: 45000 })
  // An existing service worker can serve the preceding release on the first
  // navigation. Ordinary reloads after update preserve cache/consent semantics.
  for (let attempt = 0; attempt < 4; attempt++) {
    const scripts = await page.locator('script[src]').evaluateAll(items => items.map(item => new URL(item.src).pathname))
    report.navigations ||= []
    report.navigations.push({ phase, scripts, attempt })
    if (scripts.includes(report.mainScript)) break
    assert(!offline, 'Offline reopen served a different production build')
    await page.waitForTimeout(1500)
    await page.reload({ waitUntil: 'load' })
  }
  assert((await page.locator('script[src]').evaluateAll(items => items.map(item => new URL(item.src).pathname))).includes(report.mainScript), 'The current production build was not loaded')
  await page.getByRole('button', { name: language === 'es' ? 'Más opciones' : 'More options', exact: true }).waitFor({ timeout: 30000 })
  await save()
}
async function ready(language = 'en') {
  const start = Date.now(), label = language === 'es' ? 'Listo sin internet' : 'Ready without internet'
  let lastStatus = ''
  while (!(await page.getByText(label, { exact: true }).count())) {
    const status = await page.locator('h2[role="status"]').innerText().catch(() => '')
    if (status !== lastStatus) { console.log(JSON.stringify({ phase, status })); lastStatus = status }
    assert(!report.injectionErrors.length, 'Worker interception failed: ' + JSON.stringify(report.injectionErrors))
    if (/needs internet|did not finish|Connect once|Take Kit offline|paused|necesita internet|no termin|Pausad/i.test(status)) throw new Error('Cached model unavailable: ' + status)
    if (Date.now() - start > 180000) throw new Error('Cached model readiness timeout: ' + status)
    await page.waitForTimeout(400)
  }
  assert(!bucket().requests.some(request => request.path.endsWith('.bin')), 'Previously saved model requested a weight download')
  return Date.now() - start
}
async function changeLanguage(language, previous = 'en') {
  await page.getByRole('button', { name: previous === 'es' ? 'Más opciones' : 'More options', exact: true }).click()
  await page.getByRole('button', { name: previous === 'es' ? 'Ajustes' : 'Settings', exact: true }).click()
  await page.getByRole('combobox').selectOption(language)
  await page.getByRole('button', { name: language === 'es' ? 'Volver al chat' : 'Back to chat', exact: true }).click()
}
async function ask(question, language) {
  const start = Date.now()
  await page.getByRole('button', { name: language === 'es' ? 'Nueva conversación' : 'New conversation', exact: true }).click()
  await page.locator('#chat-message').fill(question)
  await page.locator('form button[type="submit"]').click()
  await page.getByRole('log').getByText(question, { exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('#chat-message') && !document.querySelector('#chat-message').disabled && document.querySelector('[role="log"]')?.innerText.length > 50, null, { timeout: 240000 })
  const text = await page.getByRole('log').innerText()
  assert(text.includes(question) && text.replace(question, '').trim().length > 15, 'No fresh generated answer')
  assert(await page.getByRole('alert').count() === 0, 'Generation failed')
  assert(!/Here is a matching first-aid guide|Scope:|Aquí tienes una guía/.test(text), 'A guide was substituted for generated output')
  assert(!bucket().requests.some(request => request.method === 'POST'), 'Hosted inference was used')
  report.outputs.push({ phase, language, question, renderedConversation: text, elapsedMs: Date.now() - start, browserReportsOnline: await page.evaluate(() => navigator.onLine) })
  await page.screenshot({ path: path.join(artifacts, `${phase}-${language}.png`), fullPage: true })
  console.log(JSON.stringify({ phase, language, generated: true, elapsedMs: Date.now() - start }))
  await save()
}
function verifyGrantedDevices(phaseName) {
  const events = report.workerEvents.filter(event => event.phase === phaseName && report.instrumentedWorkers?.[event.worker?.path])
  const adapters = events.filter(event => event.kind === 'adapter')
  assert(adapters.length > 0 && adapters.every(event => event.identity.shaderF16 && event.identity.isFallbackAdapter !== true && !/swiftshader|software|llvmpipe/i.test(JSON.stringify(event.identity))), 'Real hardware worker GPU not verified')
  const granted = events.filter(event => event.kind === 'granted-device')
  assert(granted.length > 0, 'No real GPUDevice was granted')
  for (const event of granted) {
    assert(event.requestedLimits.maxBufferSize === expectedBufferBytes && event.requestedLimits.maxStorageBufferBindingSize === expectedBufferBytes, 'App/SDK did not request the intended 256 MiB limits')
    assert(event.grantedLimits.maxBufferSize === expectedBufferBytes && event.grantedLimits.maxStorageBufferBindingSize === expectedBufferBytes && event.shaderF16, 'Real GPUDevice did not grant the intended 256 MiB limits')
  }
  return granted.length
}

try {
  assert(profile, 'Set KIT_CACHED_MODEL_PROFILE to the previously verified isolated model profile; downloading is not permitted')
  await fs.access(profile)
  try {
    const prior = JSON.parse(await fs.readFile(output, 'utf8'))
    if (!prior.complete) report.previousHarnessAttempt = { checkedAt: prior.checkedAt, failure: prior.failure, injectionErrors: prior.injectionErrors, explanation: 'CDP worker-start interception raced with Playwright’s worker handling. No inference or model compatibility result was obtained. Replaced by an explicitly recorded test-only prefix on the owned app server’s worker responses.' }
  } catch {}
  await fs.mkdir(artifacts, { recursive: true })
  assert(isolatedChromePids(profile, executablePath).length === 0, 'The saved source profile must be closed before cloning')
  cachedProfile = path.join(artifacts, 'cached-profile')
  await fs.cp(profile, cachedProfile, { recursive: true, mode: fsConstants.COPYFILE_FICLONE })
  report.isolatedProfile = { cloned: true, path: cachedProfile, originalProfileUnchanged: true }
  const index = await fs.readFile(path.join(dist, 'index.html'), 'utf8')
  report.buildIndexSha256 = sha256(index)
  report.mainScript = index.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
  assert(report.mainScript, 'Cannot identify the current production app script')
  report.buildMainSha256 = sha256(await fs.readFile(path.join(dist, report.mainScript)))
  const config = await fs.readFile(path.join(root, 'frontend/src/services/medicalTrialConfig.js'), 'utf8')
  report.modelRevision = config.match(/MEDICAL_TRIAL_REVISION\s*=\s*'([0-9a-f]{40})'/)?.[1]
  assert(report.modelRevision, 'Missing immutable model revision')
  await startServer()

  phase = 'fresh-before-consent'
  await launch({ fresh: true })
  await page.getByRole('button', { name: 'Download Kit · 1.83 GB', exact: true }).waitFor({ timeout: 30000 })
  await page.waitForTimeout(300)
  assert(!bucket().requests.some(request => request.path.endsWith('.bin') || /model\.wasm/.test(request.path) || /huggingface|githubusercontent/.test(request.host)), 'Fresh profile requested model files before approval')
  assert(!bucket().requests.some(request => request.method === 'POST'), 'Unexpected hosted request before approval')
  report.preConsent = { offeredDownload: true, modelRequests: 0, realDevicesGranted: verifyGrantedDevices(phase) }
  await page.screenshot({ path: path.join(artifacts, 'fresh-before-consent.png'), fullPage: true })
  await close()

  phase = 'current-build-cached-load'
  await launch()
  report.initialReadyMs = await ready()
  report.initialRealDevicesGranted = verifyGrantedDevices(phase)
  assert(report.workerEvents.some(event => event.phase === phase && event.kind === 'granted-device' && /webllm-worker/.test(event.worker?.path)), 'Main model worker did not expose a real constrained GPUDevice')
  phase = 'online-cached-english'
  await ask('How do I care for a small cut?', 'en')
  phase = 'online-cached-spanish'
  await changeLanguage('es')
  await ask('¿Puedo poner mantequilla en una quemadura pequeña?', 'es')
  await close()
  await stopServer()

  phase = 'offline-full-browser-restart'
  await launch({ offline: true, language: 'es' })
  const failureEvent = context.waitForEvent('requestfailed', { predicate: request => request.url().includes('/README.md'), timeout: 10000 }).catch(() => null)
  const probe = await page.evaluate(async target => {
    try { const response = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); return { blocked: false, status: response.status } }
    catch { return { blocked: true } }
  }, `https://huggingface.co/Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC/resolve/${report.modelRevision}/README.md`)
  const failed = await failureEvent
  assert(probe.blocked && /ERR_INTERNET_DISCONNECTED/.test(failed?.failure()?.errorText), 'Offline transport block not verified')
  report.offlineReadyMs = await ready('es')
  report.offlineRealDevicesGranted = verifyGrantedDevices(phase)
  report.offlineEvidence = { appServerStopped: serverStopped, browserNetworkBlocked: true, uncachedExternalFetchBlocked: true, previousBrowserFullyExited: report.browserCloses.at(-1)?.confirmedExited, serviceWorkerControlsPage: await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), browserReportsOnline: await page.evaluate(() => navigator.onLine) }
  assert(report.offlineEvidence.serviceWorkerControlsPage, 'Offline page is not controlled by its service worker')
  await ask('¿Cómo cuido un corte pequeño?', 'es')
  phase = 'offline-fresh-english'
  await changeLanguage('en', 'es')
  await ask('Can I put butter on a small burn?', 'en')
  assert(Object.values(report.network).every(value => value.requests.every(request => !request.path.endsWith('.bin') && request.method !== 'POST')), 'A phase attempted weight downloading or hosted inference')
  assert(!report.injectionErrors.length && !report.pageErrors.length, 'Unexpected browser or worker injection errors')
  report.complete = true
} catch (error) {
  report.failure = { phase, message: error.message, stack: error.stack }
  if (page && !page.isClosed()) {
    report.failure.visiblePage = await page.locator('body').innerText().catch(() => '')
    await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
  }
  console.error(error)
} finally {
  try { await close() } catch (error) { report.complete = false; report.closeFailure = error.message }
  await stopServer()
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify({ complete: report.complete, output, artifacts, generatedAnswers: report.outputs.length }))
}
process.exitCode = report.complete ? 0 : 1
