// Public-origin preflight/consent UI smoke; deliberately never approves download.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.KIT_PLAYWRIGHT_MODULE || 'playwright')
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-trial-live-'))
const target = 'https://kit-ai-pablopupo.vercel.app/?trial=medical3b'
const report = { checkedAt: new Date().toISOString(), url: target, scope: 'Fresh desktop hardware Chrome profile with a 390×844 viewport. Production-origin consent and language UI only. No model download approval, inference, offline operation, or physical phone support is tested here.', requests: [], pageErrors: [], languages: [], complete: false }
const assert = (value, message) => { if (!value) throw new Error(message) }
let context
try {
  context = await chromium.launchPersistentContext(path.join(artifacts, 'profile'), { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, chromiumSandbox: true, viewport: { width: 390, height: 844 }, args: ['--enable-automation'], ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'] })
  context.on('request', request => { const url = new URL(request.url()); report.requests.push({ host: url.host, path: url.pathname }) })
  const page = context.pages()[0] || await context.newPage()
  page.on('pageerror', error => report.pageErrors.push(error.message))
  const args = (await (await context.newCDPSession(page)).send('Browser.getBrowserCommandLine')).arguments
  assert(!args.some(arg => /unsafe|swiftshader|disable-gpu/.test(arg)), 'Unexpected GPU override')
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 })
  for (const language of ['en', 'es']) {
    if (language === 'es') await page.getByRole('combobox', { name: 'Language' }).selectOption('es')
    const buttonName = language === 'en' ? 'Download trial · 1.83 GB' : 'Descargar prueba · 1,83 GB'
    const title = language === 'en' ? 'Try Kit on this phone' : 'Prueba Kit en este teléfono'
    await page.getByRole('button', { name: buttonName, exact: true }).waitFor({ timeout: 30000 })
    assert(await page.getByRole('heading', { name: title, exact: true }).isVisible(), 'Missing localized title')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow')
    assert((await page.getByRole('link', { name: language === 'en' ? 'Back to Kit' : 'Volver a Kit', exact: true }).getAttribute('href')) === '/', 'Wrong normal-app link')
    await page.screenshot({ path: path.join(artifacts, `${language}-consent.png`), fullPage: true })
    report.languages.push({ language, title: true, separate183GBApproval: true, horizontalOverflow: false, normalAppLink: true })
  }
  await page.waitForTimeout(1500)
  report.entryScript = await page.locator('script[type="module"][src]').getAttribute('src')
  assert(report.entryScript === '/assets/index-BCqTJ6oC.js', 'Unexpected deployed build')
  const external = report.requests.filter(request => request.host !== 'kit-ai-pablopupo.vercel.app')
  assert(external.length === 0, 'External request before download consent')
  assert(report.pageErrors.length === 0, 'Page errors')
  report.noExternalModelRequests = true
  report.downloadApprovalClicked = false
  report.complete = true
} catch (error) { report.failure = error.message }
finally {
  await context?.close()
  await fs.writeFile(path.join(repo, 'verification/medical-trial-live-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ complete: report.complete, failure: report.failure, languages: report.languages, entryScript: report.entryScript, pageErrors: report.pageErrors, artifacts }))
}
process.exit(report.complete ? 0 : 1)
