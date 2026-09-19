// Real built React app, hosted weights, hardware GPU, isolated persistent profile.
// This verifies desktop mechanics only, never physical phone support or accuracy.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { isolatedChromePids, closeBrowserAndConfirmExit } from '../model-tools/browser-eval/lifecycle.mjs'

const { chromium } = await import(process.env.KIT_PLAYWRIGHT_MODULE || 'playwright')
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(repo, 'frontend/dist')
const config = await fs.readFile(path.join(repo, 'frontend/src/services/medicalTrialConfig.js'), 'utf8')
const revision = config.match(/MEDICAL_TRIAL_REVISION\s*=\s*'([0-9a-f]{40})'/)?.[1]
if (!revision) throw new Error('Publish and pin the trial model before running this hosted check.')
const output = process.env.KIT_TRIAL_HOSTED_OUTPUT || path.join(repo, 'verification/medical-trial-hosted-results.json')
// An explicit resume is only for the recorded harness corrections below.
// It preserves the first actual download and consent evidence, never invents it.
const resumeDir = process.env.KIT_TRIAL_RESUME_ARTIFACT_DIR
const resumed = resumeDir ? JSON.parse(await fs.readFile(output, 'utf8')) : null
const buildHash = crypto.createHash('sha256').update(await fs.readFile(path.join(dist, 'index.html'))).digest('hex')
const interruptionExplanation = {
  'Mutable or unexpected Hugging Face artifact path': 'The original assertion rejected Hugging Face API cache redirects even though their paths contained the same immutable model SHA. Corrected to accept both resolve and resolve-cache paths, then resumed the same profile and app origin without redownloading.',
  'Offline run unexpectedly reported connectivity': 'The persistent-context launch offline option did not change the page network flag. The server-stopped reopen and fresh local answer succeeded, but were not counted as verified network-offline. Repeated with explicit context.setOffline(true) and a failed uncached external fetch as additional evidence.',
}
if (resumed && (resumed.modelRevision !== revision || resumed.buildIndexSha256 !== buildHash || !interruptionExplanation[resumed.failure?.message])) {
  throw new Error('Resume requires the identical build, revision, and recorded harness interruption.')
}
const artifactDir = resumeDir || await fs.mkdtemp(path.join(os.tmpdir(), 'kit-ai-hosted-trial-'))
const profile = path.join(artifactDir, 'chrome-profile')
const executable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return }
    const content = await fs.readFile(file)
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length, 'Cache-Control': 'no-cache' })
    response.end(content)
  } catch { response.writeHead(404).end() }
})
const resumePort = resumed ? Number(resumed.network['pre-consent'].requests.find(request => request.host.startsWith('127.0.0.1:')).host.split(':')[1]) : 0
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(resumePort, '127.0.0.1', resolve) })
const origin = `http://127.0.0.1:${server.address().port}`
const url = `${origin}/?trial=medical3b`
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const safeUrl = value => { const parsed = new URL(value); return { host: parsed.host, path: parsed.pathname } }
let phase = 'pre-consent', context, page, serverStopped = false
const report = resumed || {
  schema: 'kit-ai-hosted-trial-mechanics-v1', startedAt: new Date().toISOString(), modelRevision: revision,
  modelRepository: 'Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC',
  buildIndexSha256: buildHash,
  scope: 'Real production build and published immutable model files on desktop Chrome with hardware WebGPU. No inference mocks or local model substitutions. The offline restart disables browser networking and stops the owned app server. This is not a physical iPhone/Android or airplane-mode test and does not establish medical accuracy.',
  network: {}, pageErrors: [], consoleErrors: [], browserLaunches: [], browserCloses: [], outputs: [], complete: false,
}
if (resumed) {
  ;(report.harnessInterruptions ||= []).push({ ...report.failure, explanation: interruptionExplanation[report.failure.message], resumedAt: new Date().toISOString() })
  if (report.offlineRestart) (report.priorOfflineAttempts ||= []).push(report.offlineRestart)
  delete report.failure
}
const attemptSuffix = resumed ? `-retry-${report.harnessInterruptions.length}` : ''
const save = () => fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
const bucket = () => report.network[phase] ||= { requests: [], responses: 0, serviceWorkerResponses: 0, failures: [] }
function track(ctx) {
  ctx.on('request', request => {
    const requestUrl = safeUrl(request.url())
    bucket().requests.push({ ...requestUrl, method: request.method() })
  })
  ctx.on('response', response => { bucket().responses++; if (response.fromServiceWorker()) bucket().serviceWorkerResponses++ })
  ctx.on('requestfailed', request => bucket().failures.push({ ...safeUrl(request.url()), error: request.failure()?.errorText }))
}
async function launch(offline) {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: executable, headless: true, chromiumSandbox: true,
    viewport: { width: 1100, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'],
    args: ['--enable-automation'], ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
  })
  track(context)
  // Explicitly transition the new persistent context before navigation.
  await context.setOffline(offline)
  // The older, smaller download's approval must not authorize this trial.
  if (!offline) await context.addInitScript(() => localStorage.setItem('kit-ai-offline-download-approved', 'true'))
  page = context.pages()[0] || await context.newPage()
  page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ phase, message: message.text().replace(/https?:\/\/\S+/g, value => { try { const u = safeUrl(value); return `https://${u.host}${u.path}` } catch { return '[URL omitted]' } }).slice(0, 500) }) })
  const cdp = await context.newCDPSession(page)
  const args = (await cdp.send('Browser.getBrowserCommandLine')).arguments
  assert(!args.some(arg => /unsafe|swiftshader|disable-gpu/.test(arg)), 'Unexpected software/unsafe GPU override')
  assert(isolatedChromePids(profile, executable).length > 0, 'Isolated Chrome process not found')
  report.browserLaunches.push({ phase, offline, version: context.browser()?.version(), sandbox: true, unsafeGpuArguments: false })
  await page.goto(url, { waitUntil: 'load', timeout: 45000 })
}
async function closeBrowser() {
  if (!context) return
  report.browserCloses.push({ phase, ...await closeBrowserAndConfirmExit(context, () => isolatedChromePids(profile, executable)) })
  context = null
}
async function ready(timeout = 300000) {
  const deadline = Date.now() + timeout
  let previous = ''
  while (Date.now() < deadline) {
    const title = await page.locator('h2[role="status"]').innerText().catch(() => '')
    if (title === 'Saved for answers without internet') return
    if (/cannot|could not|Connect to|not available/.test(title)) throw new Error(`Trial not ready: ${title}`)
    const progress = await page.locator('progress').count() ? await page.locator('progress').getAttribute('value') : null
    const current = title + (progress === null ? '' : ` ${Math.floor(Number(progress) / 10) * 10}%`)
    if (current !== previous) { console.log(JSON.stringify({ phase, status: current })); previous = current }
    await page.waitForTimeout(500)
  }
  throw new Error(`Trial readiness timed out in ${phase}`)
}
async function supportReport() {
  const details = page.locator('details')
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click()
  await page.getByRole('button', { name: 'Copy report', exact: true }).click()
  await page.getByText('Report copied.', { exact: true }).waitFor()
  return JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
}
async function ask(question) {
  const start = Date.now()
  await page.locator('#chat-message').fill(question)
  await page.locator('form button[type="submit"]').click()
  const region = page.getByRole('region', { name: 'Trial conversation', exact: true })
  await region.waitFor()
  await page.waitForFunction(() => document.querySelector('section[aria-label="Trial conversation"]')?.getAttribute('aria-busy') === 'false', null, { timeout: 180000 })
  const paragraphs = await region.locator('p.whitespace-pre-wrap').allTextContents()
  assert(paragraphs.length === 2 && paragraphs[0] === question && paragraphs[1].trim(), 'No fresh generated answer returned')
  const observation = { phase, question, answer: paragraphs[1], elapsedMs: Date.now() - start, browserOnline: await page.evaluate(() => navigator.onLine), report: await supportReport() }
  assert(observation.report.configuredModel.endsWith(revision), 'Report is not the pinned owner model')
  assert(observation.report.runs.at(-1)?.status === 'answered', 'Support report did not record generation')
  report.outputs.push(observation)
  console.log(JSON.stringify({ phase, answerCharacters: paragraphs[1].length, elapsedMs: observation.elapsedMs }))
  await page.screenshot({ path: path.join(artifactDir, `${phase}.png`), fullPage: true })
  await save()
}
try {
  if (!resumed) {
    await launch(false)
    const consent = page.getByRole('button', { name: 'Download trial · 1.83 GB', exact: true })
    await consent.waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)
    const before = bucket().requests
    assert(before.every(request => request.host === new URL(origin).host), 'External model request before consent')
    report.consent = { distinctDownloadDisplayed: true, externalRequestsBeforeApproval: 0, freshProfile: true, productionDownloadPreviouslyApproved: true }
    report.gpu = await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      return { info: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description }, isFallbackAdapter: adapter.isFallbackAdapter ?? adapter.info.isFallbackAdapter, shaderF16: adapter.features.has('shader-f16') }
    })
    assert(report.gpu.shaderF16 && report.gpu.isFallbackAdapter !== true, 'Compatible hardware GPU unavailable')
    assert(!/swiftshader|llvmpipe|software/i.test(JSON.stringify(report.gpu.info)), 'Software GPU detected')
    await page.screenshot({ path: path.join(artifactDir, 'consent.png'), fullPage: true })
    phase = 'hosted-download'
    const start = Date.now()
    await consent.click()
    await ready(900000)
    report.initializationMs = Date.now() - start
  } else {
    phase = `cached-reopen-after-harness-fix${attemptSuffix}`
    await launch(false)
    await ready(180000)
  }
  const hostedRequests = report.network['hosted-download'].requests.filter(request => request.host === 'huggingface.co')
  const shardPaths = [...new Set(hostedRequests.filter(request => request.path.endsWith('.bin')).map(request => request.path))]
  assert(shardPaths.length === 58, `Expected 58 hosted shards, observed ${shardPaths.length}`)
  const publishedPath = `/Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC/resolve/${revision}/`
  const cachePath = `/api/resolve-cache/models/Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC/${revision}/`
  assert(hostedRequests.every(request => request.path.startsWith(publishedPath) || request.path.startsWith(cachePath)), 'Mutable or unexpected Hugging Face artifact path')
  report.hostedDownload = { immutableRevision: true, distinctShardRequests: shardPaths.length, support: await supportReport() }
  phase = `online-local-generation${attemptSuffix}`
  await ask('How do I care for a small cut?')
  assert(!bucket().requests.some(request => request.method === 'POST'), 'Unexpected hosted inference request')
  await closeBrowser()
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  serverStopped = true
  phase = `offline-browser-restart${attemptSuffix}`
  const reopenStart = Date.now()
  await launch(true)
  const failedProbe = context.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/README.md'), timeout: 10000 }).catch(() => null)
  const networkProbe = await page.evaluate(async target => {
    try { const response = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); return { blocked: false, status: response.status } }
    catch { return { blocked: true } }
  }, `https://huggingface.co/Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC/resolve/${revision}/README.md`)
  const probeFailure = await failedProbe
  assert(networkProbe.blocked && /ERR_INTERNET_DISCONNECTED/.test(probeFailure?.failure()?.errorText), 'External uncached fetch was not blocked by offline networking')
  await ready(180000)
  report.offlineRestart = { ownedAppServerStopped: true, browserNetworkOffline: true, uncachedExternalFetchBlocked: true, previousBrowserFullyExited: report.browserCloses.at(-1).confirmedExited, readyMs: Date.now() - reopenStart, serviceWorkerControlsPage: await page.evaluate(() => Boolean(navigator.serviceWorker.controller)) }
  assert(report.offlineRestart.serviceWorkerControlsPage, 'Offline page not controlled by service worker')
  await ask('Can I put butter on a small burn?')
  // Chrome's emulated transport blocking may leave navigator.onLine true.
  // Preserve that observation; the actual failed uncached fetch above supplies
  // the network-blocking evidence. Never spoof the browser flag to make it pass.
  report.offlineRestart.browserReportsOnline = report.outputs.at(-1).browserOnline
  report.offlineRestart.browserFlagMatchesNetworkBlock = report.outputs.at(-1).browserOnline === false
  assert(!bucket().requests.some(request => request.path.endsWith('.bin') || request.method === 'POST'), 'Offline restart attempted model redownload or hosted inference')
  assert(report.pageErrors.length === 0, 'Unexpected page errors')
  report.complete = true
} catch (error) {
  report.failure = { phase, message: error.message }
  console.log(JSON.stringify({ failure: report.failure }))
} finally {
  try { await closeBrowser() } catch (error) { report.cleanupFailure = error.message; report.complete = false }
  if (!serverStopped) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify({ complete: report.complete, output, artifacts: artifactDir }))
  process.exit(report.complete ? 0 : 1)
}
