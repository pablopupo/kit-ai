// Upgrade the saved public app in an isolated profile without downloading weights.
// The synthetic interruption marker must keep model startup paused across the update.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { MEDICAL_TRIAL_CONSENT_KEY, MEDICAL_TRIAL_MODEL_ID } from '../frontend/src/services/medicalTrialConfig.js'
import { isolatedChromePids, closeBrowserAndConfirmExit } from '../model-tools/browser-eval/lifecycle.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'verification/cache-presence-live-results.json')
const origin = 'https://kit-ai-pablopupo.vercel.app'
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const prepare = process.argv.includes('--prepare')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const assert = (value, message) => { if (!value) throw new Error(message) }
const report = prepare ? {
  schema: 'kit-ai-cache-presence-live-v1', startedAt: new Date().toISOString(), origin,
  modelId: MEDICAL_TRIAL_MODEL_ID, complete: false,
  scope: 'Saved public app upgrade in isolated desktop Chrome with a synthetic interrupted Qwen startup. No weight download or inference. Published entry, SDK and worker bytes checked against the local build. This is not a physical-phone test.',
  artifacts: await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cache-live-')), navigations: [],
} : JSON.parse(await fs.readFile(output, 'utf8'))
const profile = path.join(report.artifacts, 'profile')
let context
const requests = [], pageErrors = []
try {
  if (!prepare) assert(report.prepared, 'Prepare the previous public app first')
  assert(!isolatedChromePids(profile, executablePath).length, 'Isolated profile already open')
  context = await chromium.launchPersistentContext(profile, {
    executablePath, headless: true, viewport: { width: 390, height: 844 },
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
  })
  if (prepare) await context.addInitScript(key => {
    localStorage.setItem('kit-ai-language', 'en')
    localStorage.setItem('kit-ai-allow-online', 'false')
    localStorage.setItem(key, 'true')
    localStorage.setItem(`${key}:active-run`, JSON.stringify({ state: 'active', owner: 'synthetic-cache-update', stage: 'model-loading' }))
  }, MEDICAL_TRIAL_CONSENT_KEY)
  await context.route(/\.(bin|wasm)(\?|$)/, route => route.abort('blockedbyclient'))
  context.on('request', request => requests.push({ url: request.url(), method: request.method() }))
  const page = context.pages()[0] || await context.newPage()
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(origin, { waitUntil: 'load' })
  await page.getByText('Kit had trouble staying open', { exact: true }).waitFor()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  const script = () => page.locator('script[type="module"][src]').getAttribute('src')
  if (prepare) {
    report.previousScript = await script()
    await page.waitForTimeout(800)
    report.prepared = true
  } else {
    const html = await fs.readFile(path.join(root, 'frontend/dist/index.html'), 'utf8')
    report.expectedScript = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
    assert(report.expectedScript && report.expectedScript !== report.previousScript, 'No different build available to verify')
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await script()
      report.navigations.push(current)
      if (current === report.expectedScript) break
      await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update() })
      await page.waitForTimeout(1200)
      await page.reload({ waitUntil: 'load' })
    }
    assert(await script() === report.expectedScript, 'Saved app did not update to tested build')
    await page.getByText('Kit had trouble staying open', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Try opening Kit', exact: true }).waitFor()
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForTimeout(800)
    const saved = await page.evaluate(key => ({ consent: localStorage.getItem(key), run: JSON.parse(localStorage.getItem(`${key}:active-run`)) }), MEDICAL_TRIAL_CONSENT_KEY)
    assert(saved.consent === 'true' && saved.run.state === 'interrupted' && saved.run.owner === 'synthetic-cache-update', 'Update changed consent or cleared interruption')
    report.savedState = saved
    report.publicAssets = []
    const assets = await fs.readdir(path.join(root, 'frontend/dist/assets'))
    const paths = [report.expectedScript, ...assets.filter(name => /^(webllm-worker-|webllmService-).*\.js$/.test(name)).map(name => '/assets/' + name)]
    assert(paths.length === 3, 'Expected one main, worker and SDK bundle')
    for (const asset of paths) {
      const local = await fs.readFile(path.join(root, 'frontend/dist', asset))
      const response = await fetch(origin + asset)
      assert(response.ok, 'Published asset unavailable: ' + asset)
      const publicHash = hash(Buffer.from(await response.arrayBuffer()))
      assert(publicHash === hash(local), 'Published bytes differ: ' + asset)
      report.publicAssets.push({ path: asset, sha256: publicHash, matchesLocalBuild: true })
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow')
    await page.screenshot({ path: path.join(report.artifacts, 'updated-interrupted.png'), fullPage: true })
    report.complete = true
  }
  assert(!requests.some(request => !request.url.startsWith(origin + '/') || /\/webllm(?:Service|-worker)-|\.(bin|wasm)(\?|$)/.test(request.url) || request.method === 'POST'), 'Unexpected external/model request')
  assert(!pageErrors.length, 'Page errors')
  report[prepare ? 'prepareEvidence' : 'updateEvidence'] = { modelRequests: 0, externalRequests: 0, pageErrors, requests: requests.map(item => ({ path: new URL(item.url).pathname, method: item.method })) }
} catch (error) {
  report.complete = false
  report.failure = error.stack
  process.exitCode = 1
} finally {
  if (context) report[prepare ? 'prepareClose' : 'updateClose'] = await closeBrowserAndConfirmExit(context, () => isolatedChromePids(profile, executablePath))
  report.updatedAt = new Date().toISOString()
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ prepared: report.prepared, complete: report.complete, failure: report.failure, output, artifacts: report.artifacts }))
