// Public-site update check. The old approval/interruption is synthetic, in an
// isolated test profile. This never approves a model download or runs inference.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { MEDICAL_3B_BASELINE, PHONE_CANDIDATE } from '../frontend/src/services/modelProfiles.js'
import { isolatedChromePids, closeBrowserAndConfirmExit } from '../model-tools/browser-eval/lifecycle.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'verification/phone-candidate-live-results.json')
const origin = 'https://kit-ai-pablopupo.vercel.app'
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const prepare = process.argv.includes('--prepare')
const report = prepare ? {
  schema: 'kit-ai-phone-candidate-live-v1', startedAt: new Date().toISOString(), origin,
  scope: 'Fresh desktop Chrome contexts plus upgrade of a previously saved public app with synthetic 3B consent/interruption. No model download or inference, no physical phone proof.',
  artifacts: await fs.mkdtemp(path.join(os.tmpdir(), 'kit-candidate-live-')), complete: false, cases: [],
} : JSON.parse(await fs.readFile(output, 'utf8'))
const profile = path.join(report.artifacts, 'upgrade-profile')
const assert = (value, message) => { if (!value) throw new Error(message) }
const oldKey = MEDICAL_3B_BASELINE.consentKey
const hash = value => createHash('sha256').update(value).digest('hex')
let context, page, errors = [], requests = []

async function launch(profilePath, { language = 'en', state = 'legacy' } = {}) {
  errors = []; requests = []
  context = await chromium.launchPersistentContext(profilePath, {
    headless: true, executablePath, viewport: { width: 390, height: 844 },
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
  })
  await context.addInitScript(({ oldKey, newKey, language, state }) => {
    localStorage.setItem('kit-ai-language', language)
    localStorage.setItem('kit-ai-allow-online', 'false')
    if (state === 'legacy') {
      localStorage.setItem(oldKey, 'true')
      localStorage.setItem(`${oldKey}:active-run`, JSON.stringify({ state: 'interrupted', owner: 'synthetic-legacy-check', stage: 'model-loading' }))
    }
    if (state === 'interrupted') {
      localStorage.setItem(newKey, 'true')
      localStorage.setItem(`${newKey}:active-run`, JSON.stringify({ state: 'active', owner: 'synthetic-candidate-check', stage: 'model-loading' }))
    }
  }, { oldKey, newKey: PHONE_CANDIDATE.consentKey, language, state })
  await context.route(/\.(bin|wasm)(\?|$)/, route => route.abort('blockedbyclient'))
  context.on('request', request => requests.push({ url: request.url(), method: request.method() }))
  page = context.pages()[0] || await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin, { waitUntil: 'load' })
}
async function close(profilePath) {
  if (!context) return
  await closeBrowserAndConfirmExit(context, () => isolatedChromePids(profilePath, executablePath))
  context = null
}
async function consent(language) {
  await page.getByRole('button', { name: `${language === 'en' ? 'Download Kit' : 'Descargar Kit'} · ${PHONE_CANDIDATE.downloadGB} GB`, exact: true }).waitFor({ timeout: 30000 })
}
async function inspect({ language, state, profilePath }) {
  await page.waitForTimeout(700)
  const script = await page.locator('script[type="module"][src]').getAttribute('src')
  assert(script === report.expectedScript, 'Published app differs from tested build')
  const external = requests.filter(request => !request.url.startsWith(origin + '/'))
  const model = requests.filter(request => /\/webllm(?:Service|-worker)-|\.(bin|wasm)(\?|$)/.test(request.url))
  assert(external.length === 0 && model.length === 0, 'Unexpected model/external request before consent or retry')
  assert(!requests.some(request => request.method === 'POST'), 'Unexpected remote inference')
  assert(errors.length === 0, 'Page error')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow')
  if (state === 'legacy') {
    const values = await page.evaluate(({ oldKey, newKey }) => ({ old: localStorage.getItem(oldKey), new: localStorage.getItem(newKey), journal: JSON.parse(localStorage.getItem(`${oldKey}:active-run`))?.owner }), { oldKey, newKey: PHONE_CANDIDATE.consentKey })
    assert(values.old === 'true' && values.new === null && values.journal === 'synthetic-legacy-check', 'Prior model approval migrated or was altered')
  }
  await page.screenshot({ path: path.join(report.artifacts, `${language}-${state}.png`), fullPage: true })
  report.cases.push({ language, state, script, externalRequests: external.length, modelRequests: model.length, pageErrors: errors, horizontalOverflow: false })
  await close(profilePath)
}

try {
  if (prepare) {
    await launch(profile)
    await page.getByText('Kit had trouble staying open', { exact: true }).waitFor()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    await page.waitForTimeout(1000)
    report.previousScript = await page.locator('script[type="module"][src]').getAttribute('src')
    report.prepared = true
    assert(!requests.some(request => /\.(bin|wasm)(\?|$)/.test(request.url)), 'Old model unexpectedly requested')
    await close(profile)
  } else {
    assert(report.prepared, 'Prepare the preceding release before deployment')
    const html = await fs.readFile(path.join(root, 'frontend/dist/index.html'), 'utf8')
    report.expectedScript = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
    await launch(profile)
    for (let attempt = 0; attempt < 5; attempt++) {
      const script = await page.locator('script[type="module"][src]').getAttribute('src')
      report.upgradeNavigations ||= []
      report.upgradeNavigations.push(script)
      if (script === report.expectedScript) break
      await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r?.update() })
      await page.waitForTimeout(1200)
      await page.reload({ waitUntil: 'load' })
    }
    await consent('en')
    await inspect({ language: 'en', state: 'legacy', profilePath: profile })
    for (const language of ['en', 'es']) {
      for (const state of ['fresh', 'interrupted']) {
        const profilePath = path.join(report.artifacts, `${language}-${state}-profile`)
        await launch(profilePath, { language, state })
        if (state === 'fresh') await consent(language)
        else {
          await page.getByText(language === 'en' ? 'Kit had trouble staying open' : 'Kit tuvo problemas para seguir abierto', { exact: true }).waitFor()
          await page.evaluate(() => window.dispatchEvent(new Event('online')))
        }
        await inspect({ language, state, profilePath })
      }
    }
    const publicJs = await fetch(origin + report.expectedScript)
    assert(publicJs.ok, 'Public entry script unavailable')
    report.publicEntrySha256 = hash(Buffer.from(await publicJs.arrayBuffer()))
    assert(report.publicEntrySha256 === hash(await fs.readFile(path.join(root, 'frontend/dist', report.expectedScript))), 'Public app bytes differ from verified build')
    report.complete = true
    report.finishedAt = new Date().toISOString()
  }
} catch (error) { report.failure = error.stack; process.exitCode = 1 }
finally {
  await context?.close()
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ prepared: report.prepared, complete: report.complete, cases: report.cases.length, previousScript: report.previousScript, expectedScript: report.expectedScript, failure: report.failure, artifacts: report.artifacts }, null, 2))
