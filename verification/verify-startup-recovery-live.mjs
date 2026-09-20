// Public build verification without downloading weights or starting inference.
// The interrupted marker below is synthetic and confined to fresh test contexts.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { MEDICAL_TRIAL_CONSENT_KEY } from '../frontend/src/services/medicalTrialConfig.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'https://kit-ai-pablopupo.vercel.app'
const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-startup-live-'))
const report = {
  schema: 'kit-ai-startup-recovery-live-v1', checkedAt: new Date().toISOString(),
  deploymentId: 'dpl_12v9NViHYy4ZJbpNpvz4eHvYrnfc', codeCommit: 'ac6c58d', origin,
  scope: 'Desktop hardware Chrome, fresh phone-sized contexts. Public build identity, consent UI and synthetic interrupted-startup recovery. No weights, inference, physical iPhone, or medical accuracy test.',
  artifacts, cases: [], complete: false,
}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
let browser
try {
  const workerPath = '/assets/webllm-worker-fzQO_QBr.js'
  const worker = await fetch(origin + workerPath)
  assert(worker.ok, 'Public inference worker unavailable')
  const sha256 = createHash('sha256').update(Buffer.from(await worker.arrayBuffer())).digest('hex')
  const matchesVerifiedWorker = sha256 === 'a3ff8e69a272a2ed732c56f3ee34a32a08edd108250d001c0e8baafdb3f5103d'
  assert(matchesVerifiedWorker, 'Public inference worker differs from tested build')
  report.modelWorker = { path: workerPath, sha256, matchesVerifiedWorker }
  browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
  })
  for (const language of ['en', 'es']) {
    for (const scenario of ['fresh', 'interrupted']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      try {
        await context.addInitScript(({ language, scenario, consentKey }) => {
          localStorage.setItem('kit-ai-language', language)
          if (scenario === 'interrupted') {
            localStorage.setItem(consentKey, 'true')
            localStorage.setItem(`${consentKey}:active-run`, JSON.stringify({ state: 'active', owner: 'synthetic-live-check', stage: 'model-loading' }))
          }
        }, { language, scenario, consentKey: MEDICAL_TRIAL_CONSENT_KEY })
        const requests = [], pageErrors = []
        context.on('request', request => requests.push({ url: request.url(), method: request.method() }))
        const page = await context.newPage()
        page.on('pageerror', error => pageErrors.push(error.message))
        await page.goto(origin, { waitUntil: 'domcontentloaded' })
        if (scenario === 'fresh') {
          await page.getByRole('button', { name: language === 'en' ? 'Download Kit · 1.83 GB' : 'Descargar Kit · 1.83 GB', exact: true }).waitFor({ timeout: 30000 })
        } else {
          await page.getByText(language === 'en' ? 'Kit had trouble staying open' : 'Kit tuvo problemas para seguir abierto', { exact: true }).waitFor()
          await page.getByRole('button', { name: language === 'en' ? 'Try opening Kit' : 'Intentar abrir Kit', exact: true }).waitFor()
          await page.evaluate(() => window.dispatchEvent(new Event('online')))
        }
        await page.waitForTimeout(1200)
        const script = await page.locator('script[type="module"][src]').getAttribute('src')
        assert(script === '/assets/index-CuuMYpLq.js', 'Unexpected live entry bundle')
        const external = requests.filter(request => !request.url.startsWith(origin + '/'))
        const inferenceRequests = requests.filter(request => /\/webllm(?:Service|-worker)-/.test(request.url))
        const posts = requests.filter(request => request.method === 'POST')
        assert(external.length === 0, 'Unexpected external request')
        assert(inferenceRequests.length === 0, 'Model runtime requested without explicit action')
        assert(posts.length === 0, 'Unexpected inference POST')
        assert(pageErrors.length === 0, 'Live page errors')
        const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        assert(!horizontalOverflow, 'Horizontal overflow')
        let interruptedMarker = null
        if (scenario === 'interrupted') {
          interruptedMarker = await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}:active-run`))?.state, MEDICAL_TRIAL_CONSENT_KEY)
          assert(interruptedMarker === 'interrupted', 'Interrupted startup did not remain blocked')
        }
        await page.screenshot({ path: path.join(artifacts, `${language}-${scenario}.png`), fullPage: true })
        report.cases.push({ language, scenario, script, externalRequests: external.length, inferenceRuntimeRequests: inferenceRequests.length, posts: posts.length, pageErrors, horizontalOverflow, interruptedMarker })
      } finally { await context.close() }
    }
  }
  report.complete = true
} catch (error) { report.failure = error.stack; process.exitCode = 1 }
finally {
  await browser?.close()
  await fs.writeFile(path.join(root, 'verification/startup-recovery-live-results.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify(report, null, 2))
