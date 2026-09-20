// Deterministic UI verification: no model requests, device compatibility, or
// medical accuracy claims. Real setup component, desktop Chromium and WebKit.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const require = createRequire(path.join(frontend, 'package.json'))
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const { build } = require('esbuild')
const postcss = require('postcss'), tailwind = require('tailwindcss'), autoprefixer = require('autoprefixer')
const { default: tailwindConfig } = await import(path.join(frontend, 'tailwind.config.js'))
const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-setup-feedback-'))
const report = { schema: 'kit-ai-setup-feedback-verification-v1', checkedAt: new Date().toISOString(), complete: false, scope: 'Actual AssistantSetup component using synthetic hook state in desktop Chromium/WebKit phone-sized viewports. Verifies feedback and actions, not a physical iPhone, model loading, or medical accuracy.', artifacts, cases: [] }
const assert = (value, message) => { if (!value) throw new Error(message) }
const bundled = await build({
  absWorkingDir: frontend,
  stdin: { contents: `
    import React, { useState } from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
    import { SettingsProvider } from './src/contexts/SettingsContext.jsx';
    import AssistantSetup from './src/components/AssistantSetup.jsx';
    window.actions = { prepare: 0, retry: 0, pause: 0, resume: 0, dismiss: 0, help: 0 };
    function Fixture() {
      const [state, setState] = useState({status: 'consent', preparationStage: 'preparing', progress: null, online: true});
      window.setSetup = patch => flushSync(() => setState(old => ({...old, ...patch})));
      const action = name => () => { window.actions[name]++; };
      return <main style={{maxWidth: 520, margin: '24px auto', padding: 16}}><AssistantSetup
        local={{...state, downloadGB: 1.83, prepare: action('prepare'), retry: action('retry'), pause: action('pause'), resume: action('resume')}}
        online={state.online} onDismiss={action('dismiss')} onHelp={action('help')}/></main>;
    }
    createRoot(document.getElementById('root')).render(<SettingsProvider><Fixture/></SettingsProvider>);
  `, loader: 'jsx', resolveDir: frontend },
  bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
})
const css = await postcss([tailwind({ ...tailwindConfig, content: [path.join(frontend, 'src/**/*.{js,jsx}')] }), autoprefixer]).process(await fs.readFile(path.join(frontend, 'src/index.css'), 'utf8'), { from: path.join(frontend, 'src/index.css') })
const ui = await fs.readFile(path.join(frontend, 'src/ui.css'), 'utf8')
const server = http.createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundled.outputFiles[0].text); return }
  if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css.css + '\n' + ui); return }
  if (request.url.startsWith('/fonts/')) { response.writeHead(404); response.end(); return }
  response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/`
const copy = {
  en: { download: 'Download Kit · 1.83 GB', pause: 'Pause', retry: 'Try opening Kit', ready: 'Opening Kit…', interrupted: 'Kit had trouble staying open', delayed: 'Opening Kit can take a few minutes.', downloadFailed: 'The download did not finish', openingFailed: 'Kit could not open', progress: 'Kit download progress', resume: 'Continue opening Kit', unknown: 'Starting the download…' },
  es: { download: 'Descargar Kit · 1.83 GB', pause: 'Pausar', retry: 'Intentar abrir Kit', ready: 'Abriendo Kit…', interrupted: 'Kit tuvo problemas para seguir abierto', delayed: 'Abrir Kit puede tardar unos minutos.', downloadFailed: 'La descarga no terminó', openingFailed: 'Kit no pudo abrirse', progress: 'Progreso de la descarga de Kit', resume: 'Seguir abriendo Kit', unknown: 'Iniciando la descarga…' },
}
try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await (engine === 'chromium' ? chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }) : webkit.launch({ headless: true }))
    try {
      for (const language of ['en', 'es']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
        await context.addInitScript(language => localStorage.setItem('kit-ai-language', language), language)
        const page = await context.newPage(), errors = [], externalRequests = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) externalRequests.push(request.url()) })
        await page.clock.install()
        await page.goto(base)
        const c = copy[language], assertions = []
        await page.getByRole('button', {name: c.download, exact: true}).waitFor()
        assert(await page.evaluate(() => window.actions.prepare) === 0, 'Preparation before consent')
        await page.getByRole('button', {name: c.download, exact: true}).click()
        assert(await page.evaluate(() => window.actions.prepare) === 1, 'Explicit download action not forwarded once')
        assertions.push('consent-preserved')
        const set = async state => {
          await page.evaluate(state => window.setSetup(state), state)
          // Flush React's scheduling while keeping the component's 20s delay deterministic.
          await page.clock.runFor(30)
        }
        for (const status of ['checking', 'saving', 'downloading', 'loading']) {
          await set({ status, preparationStage: status === 'loading' ? 'opening' : status === 'downloading' ? 'downloading' : 'preparing', progress: 0 })
          assert(await page.locator('svg.animate-spin').count() === 1, `${status}: missing immediate visible activity`)
          assert(await page.getByRole('progressbar').count() === 0, `${status}: zero presented as measured progress`)
          assert(!/\b0%/.test(await page.locator('body').innerText()), `${status}: stuck zero label shown`)
          assert(await page.locator('svg.animate-spin').evaluate(node => getComputedStyle(node).animationName) !== 'none', `${status}: default spinner is not animated`)
        }
        assertions.push('immediate-activity-all-active-stages', 'no-zero-or-fake-percent')
        await set({ status: 'downloading', preparationStage: 'downloading', progress: null })
        await page.getByText(c.unknown, { exact: true }).waitFor()
        await set({ progress: 0.4 })
        assert(!(await page.locator('body').innerText()).includes('0%'), 'Sub-one progress shown as zero')
        assert(await page.getByRole('progressbar', { name: c.progress }).getAttribute('value') === '0.4', 'Small measured progress altered')
        await set({ progress: 37.4 })
        assert((await page.locator('body').innerText()).includes('37%'), 'Measured percentage absent')
        assert(await page.getByRole('progressbar', { name: c.progress }).getAttribute('value') === '37.4', 'Measured progress value altered')
        await page.screenshot({ path: path.join(artifacts, `${engine}-${language}-download.png`) })
        await set({ status: 'loading', preparationStage: 'opening', progress: 100 })
        await page.getByText(c.ready, { exact: true }).waitFor()
        assert(await page.getByRole('progressbar').count() === 0, 'Opening advertises completed percentage before ready')
        assertions.push('only-measured-download-progress', 'opening-distinct-from-download')
        await page.clock.runFor(19000)
        assert(await page.getByText(c.delayed, { exact: false }).count() === 0, 'Delay explanation appears too early')
        await page.clock.runFor(1100)
        await page.getByText(c.delayed, { exact: false }).waitFor()
        await page.getByRole('button', { name: c.pause, exact: true }).click()
        assert(await page.evaluate(() => window.actions.pause) === 1, 'Pause not actionable while opening')
        assertions.push('delayed-explanation-after-20s', 'pause-available')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        assert(await page.locator('svg.animate-spin').evaluate(node => getComputedStyle(node).animationName) === 'none', 'Reduced motion ignored')
        await page.screenshot({ path: path.join(artifacts, `${engine}-${language}-opening.png`) })
        assertions.push('reduced-motion-respected')
        await set({ status: 'paused', progress: null })
        assert(await page.getByText(c.delayed, { exact: false }).count() === 0, 'Delayed explanation lingers after pause')
        await page.getByRole('button', { name: c.resume, exact: true }).click()
        assert(await page.evaluate(() => window.actions.resume) === 1, 'Opening resume not forwarded')
        await set({ status: 'interrupted', lastFailureStage: 'model-loading', online: false })
        await page.getByText(c.interrupted, { exact: true }).waitFor()
        assert(await page.locator('svg.animate-spin').count() === 0, 'Interrupted state falsely shows active work')
        assert(await page.getByRole('progressbar').count() === 0, 'Interrupted state shows progress')
        await page.getByRole('button', { name: c.retry, exact: true }).click()
        assert(await page.evaluate(() => window.actions.retry) === 1, 'Offline interrupted retry unavailable')
        await page.screenshot({ path: path.join(artifacts, `${engine}-${language}-interrupted.png`) })
        assertions.push('interrupted-requires-explicit-retry-offline', 'paused-opening-resume')
        await set({ status: 'error', lastFailureStage: 'model-loading' })
        await page.getByText(c.openingFailed, { exact: true }).waitFor()
        assert(await page.getByRole('button', { name: c.retry, exact: true }).isEnabled(), 'Cached opening failure cannot retry offline')
        assert(await page.getByText(c.downloadFailed, { exact: true }).count() === 0, 'Opening failure mislabeled download failure')
        await set({ status: 'error', lastFailureStage: 'model-download', online: true })
        await page.getByText(c.downloadFailed, { exact: true }).waitFor()
        assertions.push('opening-and-download-errors-distinguished')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow')
        assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
        assert(externalRequests.length === 0, 'UI verification made external requests')
        report.cases.push({ engine, language, assertions, pageErrors: errors, externalRequests: externalRequests.length })
        await context.close()
      }
    } finally { await browser.close() }
  }
  report.complete = true
} catch (error) { report.failure = error.stack; process.exitCode = 1 }
finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  await fs.writeFile(path.join(root, 'verification/setup-feedback-results.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ complete: report.complete, cases: report.cases.length, artifacts, failure: report.failure }, null, 2))
