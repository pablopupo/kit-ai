// Real simplified app with a deterministic inference boundary. The default run
// verifies UI behavior only. KIT_SIMPLE_CHAT_REAL=1 additionally requires a
// previously downloaded, isolated hosted-model profile and tests real inference.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const require = createRequire(path.join(frontend, 'package.json'))
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const executablePath = process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const artifacts = process.env.KIT_ARTIFACT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'kit-ai-simple-chat-'))
await fs.mkdir(artifacts, { recursive: true })
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const output = path.join(root, 'verification/simple-chat-results.json')
let report = {
  schema: 'kit-ai-simple-chat-verification-v1', checkedAt: new Date().toISOString(), complete: false,
  scope: 'Real App/Home components with a deterministic useOfflineAssistant fixture in desktop Chromium and WebKit at phone viewports. This tests UI behavior, not device compatibility, model downloading, or medical accuracy. Real cached-model mechanics, when explicitly enabled, are recorded separately.',
  cases: [],
}
if (process.env.KIT_SIMPLE_CHAT_REAL_ONLY === '1' || process.env.KIT_SIMPLE_CHAT_LIVE) {
  const prior = JSON.parse(await fs.readFile(output, 'utf8'))
  assert(prior.cases.length === 8 && prior.cases.every(item => item.pageErrors.length === 0), 'Run the complete UI matrix successfully before adding the cached-model check')
  if (!prior.complete && prior.cachedModel?.failure) {
    ;(prior.cachedModelAttempts ||= []).push({ ...prior.cachedModel, explanation: 'Initial upgrade navigation loaded the prior app bundle despite a CDP bypass command. That older bundle started its already-approved legacy 1B load. The new service worker cached the new app during this attempt; browser was fully closed. The final passing attempt uses an ordinary navigation with the new worker already activated and denies any attempted weight download. An intermediate explicit service-worker update wait was canceled before inference because the harness waited indefinitely; no result is claimed for that attempt. This interrupted attempt is not counted as a passing cached-model or no-download check.' })
  }
  report = { ...prior, complete: false }
  delete report.failure
}
const fixture = `
import { useState, useRef } from 'react'
window.assistantFixture = { preparations: 0, retries: 0, sends: [], stopped: 0 }
export function useOfflineAssistant() {
  const [status, setStatus] = useState(new URLSearchParams(location.search).get('state') || 'consent')
  const [isGenerating, setGenerating] = useState(false)
  const statusRef = useRef(status)
  statusRef.current = status
  window.assistantFixture.setReady = () => { statusRef.current = 'ready'; setStatus('ready') }
  const prepare = () => { window.assistantFixture.preparations++; statusRef.current = 'ready'; setStatus('ready') }
  const retry = () => { window.assistantFixture.retries++; statusRef.current = 'ready'; setStatus('ready') }
  const sendMessage = async (content, history, onStream, signal) => {
    if (statusRef.current !== 'ready') throw new Error('Assistant is not ready')
    window.assistantFixture.sends.push({ content, history })
    const number = window.assistantFixture.sends.length
    setGenerating(true)
    try {
      onStream?.('Synthetic stream ' + number + '…')
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, content.includes('STOP_ME') ? 3500 : 220)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          window.assistantFixture.stopped++
          setTimeout(() => reject(new DOMException('Stopped', 'AbortError')), 100)
        }, { once: true })
      })
      if (content.includes('FAIL_ME') && number === 3) { setStatus('error'); throw new Error('Synthetic generation failure') }
      return 'Synthetic answer ' + number + '. ' + ('A long synthetic paragraph to exercise reading and scrolling; this is not medical guidance. '.repeat(8))
    } finally { setGenerating(false) }
  }
  return { status, progress: 37, prepare, resume: retry, retry, pause: () => setStatus('paused'), sendMessage,
    isGenerating, offlineSaved: status === 'ready', modelId: 'synthetic-ui-fixture', downloadGB: 1.83,
    lastFailureStage: status === 'error' ? 'generation' : null, needsDownloadConsent: status === 'consent',
    offlineApp: { status: 'ready', runtimeSaved: true }, check: { supported: true, reason: null, modelCached: true, features: { shaderF16: true }, storage: null },
  }
}
`
async function fixtureServer() {
  const { build } = require('esbuild')
  const postcss = require('postcss'), tailwind = require('tailwindcss'), autoprefixer = require('autoprefixer')
  const { default: tailwindConfig } = await import(path.join(frontend, 'tailwind.config.js'))
  const bundled = await build({
    absWorkingDir: frontend,
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './src/App.jsx'; createRoot(document.getElementById('root')).render(<App />);`, loader: 'jsx', resolveDir: frontend },
    bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent',
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'offline-assistant-fixture', setup(build) {
      build.onResolve({ filter: /onlineMedicalService(?:\.js)?$/ }, () => ({ path: 'fixture-online', namespace: 'online-fixture' }))
      build.onLoad({ filter: /.*/, namespace: 'online-fixture' }, () => ({ contents: `window.onlineFixture = { calls: [] }; export const MEDICAL_MODEL = 'synthetic-online-fixture'; export async function askMedicalModel(content, history) { window.onlineFixture.calls.push({ content, history }); throw new Error('Synthetic online failure'); }`, loader: 'js', resolveDir: frontend }))
      build.onResolve({ filter: /useOfflineAssistant(?:\.js)?$/ }, () => ({ path: 'fixture-hook', namespace: 'fixture' }))
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, loader: 'js', resolveDir: frontend }))
    } }],
  })
  const css = await postcss([tailwind({ ...tailwindConfig, content: [path.join(frontend, 'src/**/*.{js,jsx}')] }), autoprefixer]).process(await fs.readFile(path.join(frontend, 'src/index.css'), 'utf8'), { from: path.join(frontend, 'src/index.css') })
  const ui = await fs.readFile(path.join(frontend, 'src/ui.css'), 'utf8')
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundled.outputFiles[0].text); return }
    if (pathname === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css.css + '\n' + ui); return }
    if (/^\/fonts\/[a-z0-9-]+\.woff2$/.test(pathname)) {
      try { response.setHeader('Content-Type', 'font/woff2'); response.end(await fs.readFile(path.join(frontend, 'public', pathname))) } catch { response.writeHead(404); response.end() }
      return
    }
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, base: `http://127.0.0.1:${server.address().port}/` }
}
async function verifyFixtures() {
  const { server, base } = await fixtureServer()
  const copy = {
    en: { more: 'More options', download: 'Download Kit · 1.83 GB', setup: 'Use Kit without internet', ready: 'Ready without internet', conversation: 'Conversation', newChat: 'New conversation', history: 'Conversations', guides: 'First aid', settings: 'Settings', stop: 'Stop', question: 'How do I care for a small cut?', followUp: 'Can I wash it?' },
    es: { more: 'Más opciones', download: 'Descargar Kit · 1.83 GB', setup: 'Usar Kit sin internet', ready: 'Listo sin internet', conversation: 'Conversación', newChat: 'Nueva conversación', history: 'Conversaciones', guides: 'Primeros auxilios', settings: 'Ajustes', stop: 'Detener', question: '¿Cómo cuido un corte pequeño?', followUp: '¿Puedo lavarlo?' },
  }
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await (engine === 'chromium' ? chromium.launch({ headless: true, executablePath }) : webkit.launch({ headless: true }))
      try {
        for (const language of ['en', 'es']) for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
          const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true })
          await context.addInitScript(language => { localStorage.setItem('kit-ai-language', language); localStorage.setItem('kit-ai-allow-online', new URLSearchParams(location.search).get('online') === '1' ? 'true' : 'false'); if (new URLSearchParams(location.search).get('offline') === '1') Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }) }, language)
          const page = await context.newPage()
          const errors = [], externalRequests = []
          page.on('pageerror', error => errors.push(error.message))
          page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) externalRequests.push(request.url()) })
          const c = copy[language], assertions = []
          await page.goto(base + '?state=consent')
          const input = page.locator('#chat-message'), send = page.locator('form button[type="submit"]')
          const download = page.getByRole('button', { name: c.download, exact: true })
          await download.waitFor()
          assert(await page.evaluate(() => window.assistantFixture.preparations === 0 && !window.assistantFixture.sends.length), 'Prepared without explicit consent')
          assert(await input.isEditable(), 'Cannot write a question before setup')
          await input.fill(c.question)
          assert(await send.isDisabled(), 'Send enabled before offline assistant is ready')
          assert(await page.getByRole('region', { name: c.setup, exact: true }).count() === 1, 'Expected one setup card')
          assert(await page.locator('.kit-mobile-nav').count() === 0, 'Old four-tab navigation remains')
          assert(!/MLC|WebGPU|q4f16|Online medical model|Local AI/.test(await page.locator('body').innerText()), 'Technical model information on initial chat')
          assert(await page.getByRole('button', { name: c.settings, exact: true }).count() === 0, 'Secondary settings visible without opening menu')
          await page.screenshot({ path: path.join(artifacts, `${engine}-${language}-${viewport.width}-setup.png`), fullPage: true })
          assertions.push('single-consented-setup', 'question-editable-before-ready', 'send-disabled-before-ready', 'secondary-navigation-hidden')
          await download.click()
          await page.getByText(c.ready, { exact: true }).waitFor()
          assert(await page.evaluate(() => window.assistantFixture.preparations === 1), 'Approval not forwarded exactly once')
          assert(await page.getByRole('region', { name: c.setup, exact: true }).count() === 0, 'Setup card repeats after readiness')
          assert(await input.inputValue() === c.question, 'Preparation discarded draft question')
          await send.click()
          await page.getByText('Synthetic stream 1…', { exact: true }).waitFor()
          await page.getByText(/^Synthetic answer 1\./).waitFor()
          await input.fill(c.followUp)
          await send.click()
          await page.getByText(/^Synthetic answer 2\./).waitFor()
          assert(await page.evaluate(() => window.assistantFixture.sends[1].history.length === 2), 'Follow-up lost previous exchange')
          assert(await page.evaluate(() => window.assistantFixture.sends[1].history[0].role === 'user' && window.assistantFixture.sends[1].history[1].role === 'assistant'), 'Follow-up history role order is wrong')
          const log = page.getByRole('log')
          assert(await log.count() === 1, 'Missing single conversation log')
          assert(!(await log.locator('details').count()) || await log.locator('details').evaluateAll(items => items.every(item => !item.open)), 'References add expanded content by default')
          assertions.push('ready-chat-hides-setup', 'draft-survives-setup', 'streamed-generated-answer', 'two-turn-context', 'collapsed-references')
          const main = page.locator('#main-content')
          const scroll = await main.evaluate(element => {
            const overflow = element.scrollHeight - element.clientHeight
            element.scrollTop = 0
            return { overflow, top: element.scrollTop, height: element.clientHeight }
          })
          assert(scroll.overflow > 100 && scroll.height > 50, 'Conversation cannot scroll independently of composer')
          await page.waitForTimeout(100)
          assert(await main.evaluate(element => element.scrollTop) === 0, 'Scrolling to earlier messages was immediately overridden')
          await main.evaluate(element => { element.scrollTop = element.scrollHeight })
          assert(await main.evaluate(element => element.scrollTop > 0), 'Cannot return to latest message')
          const composerBox = await input.boundingBox()
          assert(composerBox && composerBox.y >= 0 && composerBox.y + composerBox.height <= viewport.height, 'Composer clipped in phone viewport')
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow')
          await page.screenshot({ path: path.join(artifacts, `${engine}-${language}-${viewport.width}-chat.png`), fullPage: true })
          assertions.push('scroll-earlier-and-latest', 'composer-visible', 'no-horizontal-overflow')
          await input.fill('FAIL_ME synthetic example')
          await send.click()
          await page.getByRole('alert').waitFor()
          assert(await page.getByText('FAIL_ME synthetic example', { exact: true }).count() === 1, 'Failed generation discarded question')
          assert(await page.getByText('Synthetic stream 3…', { exact: true }).count() === 0, 'Failed stream left a false completed reply')
          assert(await page.getByText(/^Synthetic answer 3\./).count() === 0, 'Failure produced a false generated answer')
          assert(!/Here is a matching first-aid guide|Scope:|Aquí tienes una guía/.test(await log.innerText()), 'Failure inserted a first-aid guide as assistant output')
          assert(await log.getByText(/^Synthetic answer /).count() === 2, 'Failure created an extra assistant answer')
          const alert = page.getByRole('alert')
          assert((await alert.innerText()).length < 450, 'Failure explanation is not compact')
          assertions.push('failed-question-retained', 'no-guide-as-answer', 'compact-failure')
          await alert.getByRole('button').click()
          await page.getByText(/^Synthetic answer 4\./).waitFor()
          assert(await page.getByText('FAIL_ME synthetic example', { exact: true }).count() === 1, 'Retry duplicated the question')
          assert(await page.evaluate(() => window.assistantFixture.sends[3].history.length === 4), 'Retry changed the original prior history')
          assert(await page.evaluate(() => window.assistantFixture.retries === 1), 'Retry did not recover the local assistant')
          await input.fill('STOP_ME synthetic example')
          await send.click()
          await page.getByRole('button', { name: c.stop, exact: true }).click()
          await page.waitForFunction(() => !document.querySelector('#chat-message').disabled)
          assert(await page.evaluate(() => window.assistantFixture.stopped === 1), 'Stop did not abort generation')
          assert(await page.getByText('STOP_ME synthetic example', { exact: true }).count() === 1, 'Stop discarded the question')
          assert(await page.getByText('Synthetic stream 5…', { exact: true }).count() === 0, 'Stopped stream looks complete')
          assertions.push('retry-recovers-local-without-duplicate', 'stop-aborts-and-drains')
          await page.getByRole('button', { name: c.more, exact: true }).click()
          for (const label of [c.history, c.guides, c.settings]) assert(await page.getByRole('button', { name: label, exact: true }).isVisible(), `Secondary destination missing: ${label}`)
          await page.keyboard.press('Escape')
          assert(await page.getByRole('button', { name: c.settings, exact: true }).count() === 0, 'Escape did not close navigation menu')
          await page.getByRole('button', { name: c.newChat, exact: true }).click()
          assert(await page.getByText('FAIL_ME synthetic example', { exact: true }).count() === 0, 'Logo plus did not reset chat')
          assertions.push('menu-destinations', 'escape-closes-menu', 'logo-new-chat')
          await input.fill('UNSENT_DRAFT synthetic question')
          await page.getByRole('button', { name: c.more, exact: true }).click()
          await page.getByRole('button', { name: c.settings, exact: true }).click()
          await page.getByRole('button', { name: language === 'es' ? 'Volver al chat' : 'Back to chat', exact: true }).click()
          assert(await input.inputValue() === 'UNSENT_DRAFT synthetic question', 'Opening settings discarded unsent draft')
          assertions.push('draft-survives-settings-navigation')
          await page.goto(base + '?state=waiting')
          await input.waitFor()
          await input.fill(language === 'es' ? 'Tengo una quemadura.' : 'I have a burn.')
          assert(await send.isDisabled(), 'Unavailable offline state allows an unanswerable request')
          assert(await page.evaluate(() => window.assistantFixture.sends.length === 0), 'Unavailable state called inference')
          assert(!/Here is a matching first-aid guide|Scope:|Aquí tienes una guía/.test(await page.locator('body').innerText()), 'Unavailable state renders guide fallback')
          assertions.push('offline-unavailable-honest')
          await page.goto(base + '?state=paused&offline=1')
          const resume = page.getByRole('button', { name: language === 'es' ? 'Continuar descarga' : 'Continue download', exact: true })
          await resume.waitFor()
          await resume.click()
          await page.getByText(c.ready, { exact: true }).waitFor()
          assert(await page.evaluate(() => window.assistantFixture.retries === 1), 'Offline pause cannot be resumed')
          assertions.push('paused-can-resume-offline')
          await page.goto(base + '?state=consent&online=1')
          await input.fill('ONLINE_FAILURE synthetic question')
          await send.click()
          await page.getByRole('alert').waitFor()
          assert(await page.evaluate(() => window.onlineFixture.calls.length === 1), 'Online failure fixture was not invoked')
          await page.evaluate(() => window.assistantFixture.setReady())
          await page.getByText(c.ready, { exact: true }).waitFor()
          await page.getByRole('alert').getByRole('button').click()
          await page.getByText(/^Synthetic answer 1\./).waitFor()
          assert(await page.evaluate(() => window.onlineFixture.calls.length === 1 && window.assistantFixture.sends.length === 1), 'Online retry did not prefer newly ready local model')
          assert(await page.getByText('ONLINE_FAILURE synthetic question', { exact: true }).count() === 1, 'Online-to-local retry duplicated question')
          assertions.push('online-failed-retry-uses-ready-local')
          await context.addInitScript(() => {
            const now = Date.now()
            localStorage.setItem('kit-ai-chat-history', JSON.stringify({
              version: 1, currentConversationId: 'legacy-fixture', conversationOrder: ['legacy-fixture'],
              conversations: { 'legacy-fixture': { id: 'legacy-fixture', title: 'Legacy synthetic question', createdAt: now, updatedAt: now, messages: [
                { role: 'user', content: 'Legacy synthetic question', source: 'guides', timestamp: now },
                { role: 'assistant', content: 'Legacy synthetic first-aid note. Not a newly generated answer.', source: 'guides', timestamp: now },
              ] } },
            }))
          })
          await page.reload()
          await page.getByRole('log').getByText('Legacy synthetic question', { exact: true }).waitFor()
          const legacyNote = page.getByText('Legacy synthetic first-aid note. Not a newly generated answer.', { exact: true })
          assert(!(await legacyNote.isVisible()), 'Legacy guide answer expanded as if newly generated')
          await page.getByRole('log').locator('summary').click()
          assert(await legacyNote.isVisible(), 'Legacy first-aid note was lost')
          assertions.push('legacy-guide-note-collapsed-preserved')
          assert(errors.length === 0, `Page errors: ${errors.join('; ')}`)
          assert(externalRequests.length === 0, 'UI fixture contacted an external service')
          report.cases.push({ engine, language, viewport, assertions, pageErrors: errors, externalRequests: externalRequests.length })
          await context.close()
        }
      } finally { await browser.close() }
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}
async function verifyCachedModel() {
  const { isolatedChromePids, closeBrowserAndConfirmExit } = await import('../model-tools/browser-eval/lifecycle.mjs')
  const previous = JSON.parse(await fs.readFile(path.join(root, 'verification/medical-trial-hosted-results.json'), 'utf8'))
  const profile = process.env.KIT_CACHED_MODEL_PROFILE
  if (!profile) throw new Error('Set KIT_CACHED_MODEL_PROFILE to the previously verified, closed hosted-model profile; no download is permitted by this check.')
  await fs.access(profile)
  const priorHost = previous.network['pre-consent'].requests.find(request => request.host.startsWith('127.0.0.1:')).host
  const origin = `http://${priorHost}`, port = Number(priorHost.split(':')[1])
  const dist = path.join(frontend, 'dist')
  const revision = (await fs.readFile(path.join(frontend, 'src/services/medicalTrialConfig.js'), 'utf8')).match(/MEDICAL_TRIAL_REVISION\s*=\s*'([0-9a-f]{40})'/)?.[1]
  assert(revision === previous.modelRevision, 'Cached model revision differs from build')
  const result = report.cachedModel = {
    scope: 'Real main chat using the previously verified immutable hosted 3B weights and approval in an isolated desktop Chrome profile. The new shell is loaded normally from the updated service worker after a recorded prior-shell upgrade interruption. All attempted weight shard requests are blocked and treated as failures; no replacement model or inference mock is supplied. Browser and owned app server are fully stopped before reopening with network transport blocked. This is not a physical phone, airplane-mode, or medical accuracy test.',
    modelRevision: revision, initialDownloadedModelReused: true,
    buildIndexSha256: crypto.createHash('sha256').update(await fs.readFile(path.join(dist, 'index.html'))).digest('hex'),
    network: {}, pageErrors: [], browserCloses: [], outputs: [], complete: false,
  }
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, origin).pathname)
      const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname))
      if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return }
      const data = await fs.readFile(file)
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': data.length })
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  let phase = 'new-build-cached-load', context, page, stoppedServer = false
  const save = () => fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
  const safeUrl = value => { const u = new URL(value); return { host: u.host, path: u.pathname } }
  const bucket = () => result.network[phase] ||= { requests: [], failures: [] }
  const close = async () => {
    if (!context) return
    result.browserCloses.push({ phase, ...await closeBrowserAndConfirmExit(context, () => isolatedChromePids(profile, executablePath)) })
    context = null
  }
  const launch = async offline => {
    context = await chromium.launchPersistentContext(profile, {
      executablePath, headless: true, chromiumSandbox: true, viewport: { width: 390, height: 844 },
      args: ['--enable-automation'], ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
    })
    await context.setOffline(offline)
    await context.addInitScript(() => localStorage.setItem('kit-ai-language', 'en'))
    // No model download is permitted: any attempted shard request is a failure,
    // blocked before transfer. Cached artifacts are read normally by WebLLM.
    await context.route('**/*.bin', route => route.abort('blockedbyclient'))
    context.on('request', request => bucket().requests.push({ ...safeUrl(request.url()), method: request.method() }))
    context.on('requestfailed', request => bucket().failures.push({ ...safeUrl(request.url()), error: request.failure()?.errorText }))
    page = context.pages()[0] || await context.newPage()
    page.on('pageerror', error => result.pageErrors.push({ phase, message: error.message }))
    const cdp = await context.newCDPSession(page)
    const args = (await cdp.send('Browser.getBrowserCommandLine')).arguments
    assert(!args.some(arg => /unsafe|swiftshader|disable-gpu/.test(arg)), 'Unsafe or software GPU arguments')
    await page.goto(origin, { waitUntil: 'load', timeout: 45000 })
    const navigation = await page.evaluate(() => ({ language: document.documentElement.lang, body: document.body.innerText.slice(0, 1800), scripts: [...document.scripts].map(script => new URL(script.src).pathname).filter(Boolean) }))
    ;(result.navigations ||= []).push({ phase, ...navigation })
    console.log(JSON.stringify({ phase, navigation }))
    await save()
    await page.getByRole('button', { name: 'More options', exact: true }).waitFor({ timeout: 30000 })
  }
  const ready = async () => {
    const start = Date.now()
    let lastStatus = ''
    while (!(await page.getByText('Ready without internet', { exact: true }).count())) {
      const status = await page.locator('h2[role=\"status\"]').innerText().catch(() => '')
      if (status !== lastStatus) { console.log(JSON.stringify({ phase, status })); lastStatus = status }
      if (/needs internet|did not finish|Connect once|Take Kit offline|paused/i.test(status)) throw new Error('Cached model unavailable: ' + status)
      if (Date.now() - start > 180000) throw new Error('Cached model readiness timeout: ' + status)
      await page.waitForTimeout(500)
    }
    assert(await page.getByRole('region', { name: 'Use Kit without internet', exact: true }).count() === 0, 'Ready chat kept setup card')
    assert(!bucket().requests.some(request => request.path.endsWith('.bin')), 'Previously saved model requested another weight download')
    return Date.now() - start
  }
  const ask = async question => {
    const start = Date.now()
    await page.getByRole('button', { name: 'New conversation', exact: true }).click()
    await page.locator('#chat-message').fill(question)
    await page.locator('form button[type="submit"]').click()
    await page.getByRole('log').getByText(question, { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('#chat-message') && !document.querySelector('#chat-message').disabled && document.querySelector('[role="log"]')?.innerText.length > 50, null, { timeout: 240000 })
    const text = await page.getByRole('log').innerText()
    assert(text.includes(question) && text.replace(question, '').trim().length > 15, 'No fresh generated answer')
    assert(await page.getByRole('alert').count() === 0, 'Generation failed')
    assert(!/Here is a matching first-aid guide|Scope:/.test(text), 'A guide was substituted for generated output')
    assert(!bucket().requests.some(request => request.method === 'POST'), 'Hosted inference used instead of local model')
    result.outputs.push({ phase, question, renderedConversation: text, elapsedMs: Date.now() - start, browserReportsOnline: await page.evaluate(() => navigator.onLine) })
    await page.screenshot({ path: path.join(artifacts, `${phase}.png`), fullPage: true })
    await save()
  }
  try {
    await launch(false)
    result.initialReadyMs = await ready()
    result.gpu = await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      return { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, isFallbackAdapter: adapter.isFallbackAdapter ?? adapter.info.isFallbackAdapter, shaderF16: adapter.features.has('shader-f16') }
    })
    assert(result.gpu.shaderF16 && result.gpu.isFallbackAdapter !== true && !/swiftshader|software|llvmpipe/i.test(JSON.stringify(result.gpu)), 'Hardware GPU not verified')
    phase = 'online-cached-local-answer'
    await ask('How do I care for a small cut?')
    await close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    stoppedServer = true
    phase = 'offline-full-browser-restart'
    await launch(true)
    const failureEvent = context.waitForEvent('requestfailed', { predicate: request => request.url().includes('/README.md'), timeout: 10000 }).catch(() => null)
    const probe = await page.evaluate(async target => {
      try { const response = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); return { blocked: false, status: response.status } }
      catch { return { blocked: true } }
    }, `https://huggingface.co/Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC/resolve/${revision}/README.md`)
    const failed = await failureEvent
    assert(probe.blocked && /ERR_INTERNET_DISCONNECTED/.test(failed?.failure()?.errorText), 'Offline network transport block not verified')
    result.offlineReadyMs = await ready()
    result.offlineEvidence = { appServerStopped: true, browserNetworkBlocked: true, uncachedExternalFetchBlocked: true, previousBrowserFullyExited: result.browserCloses.at(-1)?.confirmedExited, serviceWorkerControlsPage: await page.evaluate(() => Boolean(navigator.serviceWorker.controller)) }
    assert(result.offlineEvidence.serviceWorkerControlsPage, 'Offline page is not controlled by app service worker')
    await ask('Can I put butter on a small burn?')
    assert(!bucket().requests.some(request => request.path.endsWith('.bin') || request.method === 'POST'), 'Offline reopening requested weight download or hosted inference')
    assert(result.pageErrors.length === 0, 'Unexpected page errors')
    result.complete = true
  } catch (error) {
    result.failure = { phase, message: error.message }
    if (page && !page.isClosed()) {
      result.failure.visiblePage = await page.locator('body').innerText().catch(() => '')
      await page.screenshot({ path: path.join(artifacts, 'cached-model-failure.png'), fullPage: true }).catch(() => {})
    }
    throw error
  }
  finally {
    await close()
    if (!stoppedServer) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    await save()
  }
}

async function verifyLive() {
  const origin = new URL(process.env.KIT_SIMPLE_CHAT_LIVE).origin
  const browser = await chromium.launch({ headless: true, executablePath })
  const checks = []
  try {
    for (const language of ['en', 'es']) for (const suffix of ['/', '/?trial=medical3b']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      await context.addInitScript(language => localStorage.setItem('kit-ai-language', language), language)
      const page = await context.newPage(), requests = [], errors = []
      page.on('request', request => { const u = new URL(request.url()); requests.push({ host: u.host, path: u.pathname, method: request.method() }) })
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin + suffix, { waitUntil: 'load', timeout: 45000 })
      await page.getByRole('button', { name: language === 'es' ? 'Más opciones' : 'More options', exact: true }).waitFor()
      await page.getByRole('button', { name: language === 'es' ? 'Descargar Kit · 1.83 GB' : 'Download Kit · 1.83 GB', exact: true }).waitFor({ timeout: 30000 })
      await page.waitForTimeout(500)
      assert(await page.getByRole('region', { name: language === 'es' ? 'Usar Kit sin internet' : 'Use Kit without internet', exact: true }).count() === 1, 'Published chat does not show one setup card')
      assert(await page.locator('.kit-mobile-nav').count() === 0, 'Published app still shows old four-tab navigation')
      assert(await page.getByRole('link', { name: /Back to Kit|Volver a Kit/ }).count() === 0, 'Old trial page remains a separate route')
      const heavy = requests.filter(request => request.path.endsWith('.bin') || /model\.wasm|huggingface\.co|githubusercontent\.com/.test(request.path + request.host))
      assert(heavy.length === 0, 'Published app requested model files before consent')
      assert(requests.every(request => request.method !== 'POST'), 'Published app sent an unexpected request')
      assert(errors.length === 0, 'Published app page errors')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Published mobile layout overflows')
      const scripts = await page.locator('script[src]').evaluateAll(items => items.map(item => new URL(item.src).pathname))
      await page.screenshot({ path: path.join(artifacts, `live-${language}-${suffix.includes('trial') ? 'legacy-trial' : 'main'}.png`), fullPage: true })
      checks.push({ language, path: suffix, scripts, modelRequestsBeforeConsent: heavy.length, pageErrors: errors, requestCount: requests.length })
      await context.close()
    }
  } finally { await browser.close() }
  report.live = { checkedAt: new Date().toISOString(), origin, scope: 'Fresh desktop Chromium profiles at a phone viewport, no model consent or download. Verifies both URLs show the same simplified bilingual app; not a physical phone or inference test.', complete: true, checks }
}
try {
  if (process.env.KIT_SIMPLE_CHAT_LIVE) await verifyLive()
  else if (process.env.KIT_SIMPLE_CHAT_REAL_ONLY !== '1') await verifyFixtures()
  if (process.env.KIT_SIMPLE_CHAT_REAL === '1') await verifyCachedModel()
  report.complete = true
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  console.error(error)
} finally {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ complete: report.complete, cases: report.cases.length, artifacts, output }))
}
process.exit(report.complete ? 0 : 1)
