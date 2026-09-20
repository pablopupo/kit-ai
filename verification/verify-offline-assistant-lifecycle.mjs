// Runs the real React hook in StrictMode, with deterministic dependency fakes.
// This checks application lifecycle/consent only. It does not run a model, prove
// physical-phone support, or evaluate the accuracy of any generated answer.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repo, 'frontend/package.json'))
const { build } = require('esbuild')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
// Test the selected model's real identity and permission boundary, with only
// its runtime/weights replaced by deterministic fakes. No model is downloaded.
const selectedModel = await import(pathToFileURL(path.join(repo, 'frontend/src/services/medicalTrialConfig.js')))
const modelId = selectedModel.MEDICAL_TRIAL_MODEL_ID
const consentKey = selectedModel.MEDICAL_TRIAL_CONSENT_KEY
const downloadGB = selectedModel.MEDICAL_TRIAL_DOWNLOAD_GB
const oldMedicalModelId = 'kit-medical-3b-df5aa311-q4f16_1-34f6aa7d8fb5608dc2585e6660b982610ca4bc28'
const oldMedicalConsentKey = `kit-ai-trial-download-approved:${oldMedicalModelId}`
const oldMedicalCacheName = `synthetic-saved-artifact:${oldMedicalModelId}`
const oldMedicalArtifact = 'Synthetic old medical model artifact; not real model data.'
const pauseKey = `${consentKey}:paused`
const activeRunKey = `${consentKey}:active-run`
const mocks = {
  SettingsContext: `export const useSettings = () => ({language: window.__scenario.language || 'en'})`,
  useOfflineApp: `export const useOfflineApp = () => window.__snapshot`,
  medicalTrialConfig: `
    export const MEDICAL_TRIAL_MODEL_ID = ${JSON.stringify(modelId)};
    export const MEDICAL_TRIAL_CONSENT_KEY = ${JSON.stringify(consentKey)};
    export const MEDICAL_TRIAL_DOWNLOAD_GB = ${JSON.stringify(downloadGB)};
    export const MEDICAL_TRIAL_RECORD = window.__scenario.published === false ? null : {model:'https://model.invalid/pinned-revision/',model_id:MEDICAL_TRIAL_MODEL_ID,model_lib:'https://model.invalid/pinned-revision/model.wasm',required_features:['shader-f16']};`,
  modelTrialCheck: `export const checkMedicalModelTrial = async options => {
    window.__calls.preflight.push(options);
    if (window.__scenario.preflightDeferred && window.__calls.preflight.length === 1) await new Promise(resolve => window.__resolvePreflight = resolve);
    return {supported: window.__scenario.supported !== false, reason: window.__scenario.supported === false ? 'storage-binding-limit' : null};
  }`,
  offlineAppService: `
    export const getOfflineAppSnapshot = () => window.__snapshot;
    export const checkOfflineApp = async () => { window.__calls.appChecks++; return window.__snapshot; };
    export const retryOfflineSave = async () => { window.__calls.appSaves++; if(window.__scenario.failAppSave) throw new Error('Synthetic app save error'); window.__snapshot.status='ready'; };
    export const ensureOfflineRuntime = async signal => { window.__calls.runtimeSaves++; if(window.__scenario.failRuntimeSave) throw new Error('Synthetic runtime save error'); if(signal.aborted) throw new DOMException('Stopped','AbortError'); window.__snapshot.runtimeSaved=true; };`,
  webllmService: `
    window.__calls.serviceImports++;
    export const isModelCached = async (id,record) => { window.__calls.cacheChecks.push({id,record}); return window.__cached; };
    export const invalidateEngine = () => { window.__calls.invalidations++; window.__engineLoaded=false; };
    export const initEngine = async (id,onProgress,signal,record) => {
      window.__calls.init.push({id,record});
      if(window.__engineLoaded) return;
      if(!window.__cached) window.__calls.modelDownloads++;
      window.__emitProgress=onProgress;
      onProgress(window.__cached ? {preparationStage:'opening',progress:null} : {preparationStage:'downloading',progress:45});
      if(window.__scenario.initDeferred) await new Promise((resolve,reject) => window.__pendingInit.push({resolve,reject,signal}));
      if(signal.aborted) throw new DOMException('Stopped','AbortError');
      window.__cached=window.__scenario.cacheAfterLoad !== false;
      window.__engineLoaded=true;
      onProgress({preparationStage:'opening',progress:null});
    };
    export const generateReply = async (messages,options) => {
      window.__calls.generate.push({messages,expectedModelId:options.expectedModelId,language:options.language});
      options.onStream?.('Synthetic local fixture');
      if(window.__scenario.generateDeferred) await new Promise((resolve,reject) => window.__pendingGeneration.push({resolve,reject,signal:options.signal}));
      if(options.signal.aborted) throw new DOMException('Stopped','AbortError');
      if(window.__scenario.failFirstGeneration && window.__calls.generate.length === 1) { window.__engineLoaded=false; throw new Error('Synthetic generation error'); }
      return 'Synthetic local fixture reply';
    };`,
}
const bundle = await build({
  stdin: {
    contents: `import React,{useEffect} from 'react'; import {createRoot} from 'react-dom/client'; import {useOfflineAssistant} from './src/hooks/useOfflineAssistant.js';
      function Harness(){const trial=useOfflineAssistant();window.__trial={...trial,send:trial.sendMessage};useEffect(()=>{window.__states.push(trial.status)},[trial.status]);useEffect(()=>{window.__progressStates.push({status:trial.status,stage:trial.preparationStage,progress:trial.progress})},[trial.status,trial.preparationStage,trial.progress]);return React.createElement('div',{'data-status':trial.status},trial.status)}
      window.__mount=()=>{window.__root=createRoot(document.getElementById('app'));window.__root.render(React.createElement(React.StrictMode,null,React.createElement(Harness)))};window.__mount();`,
    resolveDir: path.join(repo, 'frontend'), loader: 'jsx',
  },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'assistant-fixture-dependencies', setup(builder) {
    builder.onResolve({ filter: /(?:SettingsContext|useOfflineApp|medicalTrialConfig|modelTrialCheck|offlineAppService|webllmService)(?:\.js)?$/ }, args => {
      const name = path.basename(args.path).replace(/\.js$/, '')
      return name in mocks ? { path: name, namespace: 'assistant-fixture' } : undefined
    })
    builder.onLoad({ filter: /.*/, namespace: 'assistant-fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }))
    builder.onResolve({ filter: /onlineMedicalService/ }, () => { throw Error('Local assistant hook must not import an online provider') })
  } }],
})
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html')
  response.end(request.url === '/bundle.js' ? bundle.outputFiles[0].text : request.url === '/seed' ? '<!doctype html><p>Synthetic fixture setup</p>' : '<!doctype html><div id="app"></div><script src="/bundle.js"></script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/`
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}) })
const results = []
async function fixture(name, scenario, exercise) {
  const context = await browser.newContext()
  const errors = [], externalRequests = []
  await context.addInitScript(({ scenario, consentKey, pauseKey, activeRunKey, oldMedicalConsentKey }) => {
    window.__scenario = scenario
    window.__cached = scenario.cached === true
    window.__engineLoaded = false
    window.__online = scenario.online !== false
    window.__snapshot = { status: scenario.failAppSave ? 'error' : 'ready', runtimeSaved: !scenario.failRuntimeSave }
    window.__states = []
    window.__progressStates = []
    window.__pendingInit = []
    window.__pendingGeneration = []
    window.__calls = { preflight: [], serviceImports: 0, runtimeSaves: 0, appSaves: 0, appChecks: 0, init: [], cacheChecks: [], generate: [], persist: 0, invalidations: 0, modelDownloads: 0 }
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => window.__online })
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: async () => { window.__calls.persist++; return false } } })
    if (!sessionStorage.getItem('fixture-journal-seeded')) {
      if (scenario.previousRun) localStorage.setItem(activeRunKey, JSON.stringify(scenario.previousRun))
      if (scenario.oldMedicalState) {
        localStorage.setItem(oldMedicalConsentKey, 'true')
        localStorage.setItem(`${oldMedicalConsentKey}:paused`, 'true')
        localStorage.setItem(`${oldMedicalConsentKey}:active-run`, JSON.stringify({ state: 'active', stage: 'model-loading', owner: 'old-medical-page' }))
      }
      sessionStorage.setItem('fixture-journal-seeded', 'true')
    }
    if (scenario.approved) localStorage.setItem(consentKey, 'true')
    if (scenario.paused) localStorage.setItem(pauseKey, 'true')
    if (scenario.legacyApproved) localStorage.setItem('kit-ai-offline-download-approved', 'true')
    if (scenario.previousTrialApproved) localStorage.setItem('kit-ai-trial-download-approved:kit-medical-3b-previous-revision', 'true')
  }, { scenario, consentKey, pauseKey, activeRunKey, oldMedicalConsentKey })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (!request.url().startsWith(url.split('?')[0])) externalRequests.push(request.url()) })
  try {
    if (scenario.oldMedicalState) {
      await page.goto(`${url}seed`)
      await page.evaluate(async ({ cacheName, artifact }) => {
        const cache = await caches.open(cacheName)
        await cache.put('/synthetic-old-model-artifact', new Response(artifact))
      }, { cacheName: oldMedicalCacheName, artifact: oldMedicalArtifact })
    }
    await page.goto(url)
    await exercise(page)
    assert.deepEqual(errors, [], 'Unexpected browser errors')
    assert.deepEqual(externalRequests, [], 'The fixture must never download model assets')
    const evidence = await page.evaluate(key => ({ states: window.__states, progressStates: window.__progressStates, calls: window.__calls, offlineSaved: window.__trial.offlineSaved, activeRun: JSON.parse(localStorage.getItem(key) || 'null') }), activeRunKey)
    results.push({ name, result: 'pass', evidence })
  } finally { await context.close() }
}
const status = (page, expected) => page.waitForFunction(value => window.__trial?.status === value, expected)
const counts = page => page.evaluate(() => ({ runtime: window.__calls.runtimeSaves, imports: window.__calls.serviceImports, init: window.__calls.init.length }))
const journal = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), activeRunKey)
const reconnect = page => page.evaluate(async () => { window.__online = true; window.dispatchEvent(new Event('online')); await new Promise(resolve => setTimeout(resolve, 50)) })
const oldMedicalState = page => page.evaluate(async ({ key, cacheName }) => {
  const cache = await caches.open(cacheName)
  return {
    approval: localStorage.getItem(key), paused: localStorage.getItem(`${key}:paused`),
    journal: localStorage.getItem(`${key}:active-run`),
    artifact: await (await cache.match('/synthetic-old-model-artifact'))?.text(),
  }
}, { key: oldMedicalConsentKey, cacheName: oldMedicalCacheName })
try {
  await fixture('Legacy 750 MB approval does not approve the selected model', { legacyApproved: true }, async page => {
    await status(page, 'consent')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), null)
  })
  await fixture('Approval for a previous medical model revision does not approve the selected model', { previousTrialApproved: true }, async page => {
    await status(page, 'consent')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), null)
  })
  await fixture('Saved 3B approval, pause, journal and artifacts do not approve, block or start the new candidate', { oldMedicalState: true }, async page => {
    assert.notEqual(modelId, oldMedicalModelId, 'This regression requires a separately selected candidate')
    assert.notEqual(consentKey, oldMedicalConsentKey, 'The candidate must have its own approval key')
    await status(page, 'consent')
    const previous = await oldMedicalState(page)
    assert.deepEqual(previous, {
      approval: 'true', paused: 'true',
      journal: JSON.stringify({ state: 'active', stage: 'model-loading', owner: 'old-medical-page' }),
      artifact: oldMedicalArtifact,
    })
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), null)
    assert.equal(await page.evaluate(() => window.__trial.downloadGB), downloadGB)
    assert.equal(await page.evaluate(() => window.__trial.needsDownloadConsent), true)
    await reconnect(page)
    await page.reload()
    await status(page, 'consent')
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'consent')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.deepEqual(await oldMedicalState(page), previous)
    await page.evaluate(() => window.__trial.prepare())
    await status(page, 'ready')
    const calls = await page.evaluate(() => window.__calls)
    assert.deepEqual(calls.init.map(call => call.id), [modelId])
    assert.equal(calls.modelDownloads, 1)
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'true')
    assert.deepEqual(await oldMedicalState(page), previous, 'Opting into the candidate must preserve the old model state and saved artifact')
  })
  await fixture('Old 3B recovery state cannot pause or block an already-approved cached candidate offline', {
    oldMedicalState: true, approved: true, cached: true, online: false,
  }, async page => {
    await status(page, 'ready')
    const previous = await oldMedicalState(page)
    const calls = await page.evaluate(() => window.__calls)
    assert.deepEqual(calls.init.map(call => call.id), [modelId])
    assert.equal(calls.modelDownloads, 0)
    assert.equal(await page.evaluate(() => window.__states.includes('paused') || window.__states.includes('interrupted')), false)
    assert.equal(await journal(page), null)
    await page.reload()
    await status(page, 'ready')
    assert.deepEqual(await oldMedicalState(page), previous)
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 0)
  })
  await fixture('Incompatible phone stops before runtime or model imports', { supported: false }, async page => {
    await status(page, 'unsupported')
    await page.evaluate(() => window.__trial.prepare())
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
  })
  await fixture('Unpublished conversion cannot be downloaded', { published: false, approved: true }, async page => {
    await status(page, 'unavailable')
    await page.evaluate(() => window.__trial.prepare())
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(() => window.__calls.preflight.length), 0)
  })
  await fixture('Explicit consent loads only the selected pinned model; generated replies always use it', {}, async page => {
    await status(page, 'consent')
    await page.evaluate(() => window.__trial.prepare())
    await status(page, 'ready')
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'true')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    await page.evaluate(async () => {
      await window.__trial.send('Synthetic English question', [])
      window.__online = false
      await window.__trial.send('Synthetic second question', [])
    })
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.init.length, 1)
    assert.equal(calls.init[0].id, modelId)
    assert.equal(calls.init[0].record.model_id, modelId)
    assert.deepEqual(calls.generate.map(call => call.expectedModelId), [modelId, modelId])
  })
  await fixture('Approved cached selected model reopens offline without another consent request', { approved: true, cached: true, online: false }, async page => {
    await status(page, 'ready')
    // A fresh JS realm reads the same model-specific preference after refresh.
    // Cached artifacts and the offline flag are still fixture inputs, not proof
    // that a real phone can refresh or run this model without a connection.
    await page.reload()
    await status(page, 'ready')
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.init.length, 1)
    assert.equal(calls.init[0].id, modelId)
    assert.deepEqual(calls.preflight, [{ modelCached: true }, { modelCached: true }])
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
  })
  await fixture('Spanish replies retain the chosen language and pinned local model', { approved: true, cached: true, language: 'es' }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => window.__trial.send('Pregunta ficticia para una prueba', []))
    const generation = await page.evaluate(() => window.__calls.generate[0])
    assert.equal(generation.language, 'es')
    assert.equal(generation.expectedModelId, modelId)
    assert.ok(generation.messages.some(message => /Spanish|español/.test(message.content)))
  })
  await fixture('Cancelled initialization cannot become ready; a subsequent retry succeeds', { initDeferred: true }, async page => {
    await status(page, 'consent')
    await page.evaluate(() => { void window.__trial.prepare() })
    await status(page, 'downloading')
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => { window.__trial.pause(); window.__pendingInit[0].resolve() })
    await status(page, 'paused')
    assert.equal(await page.evaluate(() => window.__pendingInit[0].signal.aborted), true)
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'true')
    assert.equal(await page.evaluate(key => localStorage.getItem(key), pauseKey), 'true')
    assert.equal(await journal(page), null, 'An explicit pause must not look like a crash')
    await page.evaluate(() => { void window.__trial.retry() })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 2)
  })
  await fixture('Unmounted compatibility checks cannot initiate a download', { approved: true, preflightDeferred: true }, async page => {
    await page.waitForFunction(() => typeof window.__resolvePreflight === 'function')
    await page.evaluate(async () => { window.__root.unmount(); window.__resolvePreflight(); await new Promise(resolve => setTimeout(resolve, 0)) })
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
  })
  await fixture('Immediate retry escapes an aborted compatibility check that has not settled', { approved: true, preflightDeferred: true }, async page => {
    await page.waitForFunction(() => typeof window.__resolvePreflight === 'function')
    await page.evaluate(() => { window.__trial.pause(); void window.__trial.retry() })
    await page.waitForFunction(() => window.__trial.status === 'ready', null, { timeout: 1500 })
    await page.evaluate(async () => { window.__resolvePreflight(); await new Promise(resolve => setTimeout(resolve, 0)) })
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
  })
  await fixture('An immediate retry queued during initialization resumes once it unwinds', { approved: true, initDeferred: true }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => { window.__trial.pause(); void window.__trial.retry(); window.__pendingInit[0].reject(new DOMException('Stopped', 'AbortError')) })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 2)
  })
  await fixture('Failed initialization records its stage and allows another attempt', { approved: true, initDeferred: true }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => window.__pendingInit[0].reject(new Error('Synthetic initialization error')))
    await status(page, 'error')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'model-download')
    await page.evaluate(() => { void window.__trial.retry() })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
  })

  await fixture('Resume without approval cannot authorize the large download', {}, async page => {
    await status(page, 'consent')
    await page.evaluate(() => window.__trial.resume())
    await status(page, 'consent')
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'consent')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(() => window.__trial.needsDownloadConsent), true)
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), null)
  })
  await fixture('A deliberately paused download stays paused after reconnect and reload', { approved: true, paused: true }, async page => {
    await status(page, 'paused')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.reload()
    await status(page, 'paused')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    await page.evaluate(() => window.__trial.resume())
    await status(page, 'ready')
    assert.equal(await page.evaluate(key => localStorage.getItem(key), pauseKey), 'false')
    assert.equal(await page.evaluate(() => window.__trial.needsDownloadConsent), false)
  })
  await fixture('Reconnecting resumes an approved incomplete download without approval again', { approved: true, online: false }, async page => {
    await status(page, 'waiting')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 0)
    await page.evaluate(() => { window.__online = true; window.dispatchEvent(new Event('online')) })
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
  })
  await fixture('Reconnecting while a failed partial download unwinds queues exactly one retry', { approved: true, initDeferred: true }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => {
      window.__online = false
      window.__pendingInit[0].reject(new Error('Synthetic connection lost'))
      window.__online = true
      window.dispatchEvent(new Event('online'))
    })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 2)
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
  })
  await fixture('Saved guides or model metadata never prove that AI is ready', { approved: true, cached: true, initDeferred: true }, async page => {
    await status(page, 'loading')
    assert.equal(await page.evaluate(() => window.__trial.offlineApp.status), 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    assert.equal(await page.evaluate(() => window.__states.includes('ready')), false)
    await page.evaluate(() => window.__pendingInit[0].resolve())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
  })
  await fixture('Successful generation setup without cached artifacts cannot claim offline saving', { approved: true, cacheAfterLoad: false }, async page => {
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
  })
  await fixture('Stopping drains the generation before allowing a fresh question', { approved: true, cached: true, generateDeferred: true }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => {
      window.__abortAnswer = new AbortController()
      window.__answerResult = window.__trial.send('Synthetic question', [], undefined, window.__abortAnswer.signal).then(() => 'resolved', error => error.name)
    })
    await page.waitForFunction(() => window.__pendingGeneration.length === 1 && window.__trial.isGenerating)
    await page.evaluate(() => window.__abortAnswer.abort())
    assert.equal(await page.evaluate(() => window.__pendingGeneration[0].signal.aborted), true)
    assert.equal(await page.evaluate(() => window.__trial.isGenerating), true)
    assert.match(await page.evaluate(() => window.__trial.send('Too soon', []).catch(error => error.message)), /already in progress/)
    await page.evaluate(() => window.__pendingGeneration[0].resolve())
    assert.equal(await page.evaluate(() => window.__answerResult), 'AbortError')
    await page.waitForFunction(() => !window.__trial.isGenerating)
    await status(page, 'ready')
    assert.equal(await journal(page), null, 'Stopping an answer must not look like a crash')
    await page.evaluate(() => { window.__scenario.generateDeferred = false; return window.__trial.send('Fresh question', []) })
    assert.equal(await page.evaluate(() => window.__calls.generate.length), 2)
  })
  await fixture('Failed generation can reload the same pinned model and answer again', { approved: true, cached: true, failFirstGeneration: true }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => window.__trial.send('Synthetic question', []).catch(error => error.message))
    await status(page, 'error')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'generation')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'ready')
    await page.evaluate(() => window.__trial.send('Retry question', []))
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), null)
    assert.deepEqual(await page.evaluate(() => window.__calls.generate.map(call => call.expectedModelId)), [modelId, modelId])
  })
  await fixture('Unmounting aborts a running answer without a late state update', { approved: true, cached: true, generateDeferred: true }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => { window.__answerResult = window.__trial.send('Synthetic question', []).then(() => 'resolved', error => error.name) })
    await page.waitForFunction(() => window.__pendingGeneration.length === 1)
    await page.evaluate(() => window.__root.unmount())
    assert.equal(await page.evaluate(() => window.__pendingGeneration[0].signal.aborted), true)
    await page.evaluate(() => window.__pendingGeneration[0].resolve())
    assert.equal(await page.evaluate(() => window.__answerResult), 'AbortError')
  })

  await fixture('Finish saving repairs missing app and runtime files without downloading cached weights again', { approved: true, cached: true }, async page => {
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    await page.evaluate(() => {
      window.__snapshot.status = 'error'
      window.__snapshot.runtimeSaved = false
      return window.__trial.retry()
    })
    await status(page, 'ready')
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.appSaves, 1)
    assert.equal(calls.runtimeSaves, 2)
    assert.equal(calls.invalidations, 0)
    assert.equal(calls.modelDownloads, 0)
    assert.deepEqual(calls.init.map(call => call.id), [modelId, modelId])
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
  })
  await fixture('Finish saving repairs missing model files even when an engine is already ready', { approved: true, cacheAfterLoad: false }, async page => {
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    await page.evaluate(() => {
      window.__scenario.cacheAfterLoad = true
      return window.__trial.retry()
    })
    await status(page, 'ready')
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.invalidations, 1)
    assert.equal(calls.modelDownloads, 2)
    assert.deepEqual(calls.init.map(call => call.id), [modelId, modelId])
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'true')
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
  })
  await fixture('Repair waits for internet instead of attempting an uncached download offline', { approved: true, cacheAfterLoad: false }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => { window.__online = false; return window.__trial.retry() })
    await status(page, 'waiting')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 1)
    assert.equal(await page.evaluate(() => window.__calls.invalidations), 0)
    await page.evaluate(() => { window.__online = true; window.__scenario.cacheAfterLoad = true; window.dispatchEvent(new Event('online')) })
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.invalidations), 1)
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 2)
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
  })
  await fixture('Finish saving cannot invalidate the engine while an answer is in progress', { approved: true, cached: true, generateDeferred: true }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => { window.__answerResult = window.__trial.send('Synthetic question', []) })
    await page.waitForFunction(() => window.__pendingGeneration.length === 1)
    await page.evaluate(() => { window.__cached = false; return window.__trial.retry() })
    assert.equal(await page.evaluate(() => window.__calls.invalidations), 0)
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    assert.equal(await page.evaluate(() => window.__pendingGeneration[0].signal.aborted), false)
    await page.evaluate(() => window.__pendingGeneration[0].resolve())
    await page.evaluate(() => window.__answerResult)
    await status(page, 'ready')
  })
  await fixture('A prior interrupted model opening blocks automatic loading across reconnect and reload', {
    approved: true, cached: true,
    previousRun: { state: 'active', stage: 'model-loading', owner: 'previous-page' },
  }, async page => {
    await status(page, 'interrupted')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'model-loading')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    await reconnect(page)
    await status(page, 'interrupted')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal((await journal(page)).stage, 'model-loading')
    await page.reload()
    await status(page, 'interrupted')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 0)
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
  })
  await fixture('An explicit retry after interruption can open the cached model offline and clears the guard', {
    approved: true, cached: true, online: false,
    previousRun: { state: 'interrupted', stage: 'model-loading', owner: 'previous-page' },
  }, async page => {
    await status(page, 'interrupted')
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'ready')
    assert.equal(await journal(page), null)
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 0)
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
    await page.reload()
    await status(page, 'ready')
    assert.equal(await journal(page), null)
    assert.equal(await page.evaluate(() => window.__states.includes('interrupted')), false)
  })
  await fixture('An interrupted download cannot restart itself after a page reopen', {
    approved: true,
    previousRun: { state: 'active', stage: 'model-download', owner: 'previous-page' },
  }, async page => {
    await status(page, 'interrupted')
    await reconnect(page)
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 1)
    assert.equal(await journal(page), null)
  })
  await fixture('An interrupted run without model approval cannot authorize a new download', {
    previousRun: { state: 'active', stage: 'model-loading', owner: 'previous-page' },
  }, async page => {
    await status(page, 'interrupted')
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'consent')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), null)
  })
  await fixture('A hard navigation while opening preserves the unfinished run and prevents a restart loop', {
    approved: true, cached: true, initDeferred: true,
  }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    const active = await journal(page)
    assert.equal(active.state, 'active')
    assert.equal(active.stage, 'model-loading')
    assert.ok(active.owner)
    // A browser replacing a document cannot rely on React cleanup. Do not call
    // __root.unmount(), pause(), or any graceful cancellation before reload.
    await page.reload()
    await status(page, 'interrupted')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    await reconnect(page)
    assert.equal(await page.evaluate(() => window.__calls.init.length), 0)
    assert.equal((await journal(page)).stage, 'model-loading')
  })
  await fixture('A hard navigation during an answer prevents automatic engine reopening', {
    approved: true, cached: true, generateDeferred: true,
  }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => { window.__answerResult = window.__trial.send('Synthetic interruption case', []) })
    await page.waitForFunction(() => window.__pendingGeneration.length === 1)
    assert.equal((await journal(page)).stage, 'generation')
    await page.reload()
    await status(page, 'interrupted')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'generation')
    await reconnect(page)
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'ready')
    assert.equal(await journal(page), null)
    assert.equal(await page.evaluate(() => window.__calls.generate.length), 0, 'An interrupted question must never be resent automatically')
  })
  await fixture('A clean component unmount during preparation removes its own unfinished marker', {
    approved: true, cached: true, initDeferred: true,
  }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    assert.equal((await journal(page)).state, 'active')
    await page.evaluate(async () => {
      window.__root.unmount()
      window.__pendingInit[0].resolve()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    assert.equal(await journal(page), null)
    await page.evaluate(() => { window.__scenario.initDeferred = false; window.__mount() })
    await status(page, 'ready')
    assert.equal(await journal(page), null)
  })
  await fixture('A caught model opening failure stays stopped on reconnect until the user retries', {
    approved: true, cached: true, initDeferred: true,
  }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => window.__pendingInit[0].reject(new Error('Synthetic opening failure')))
    await status(page, 'error')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'model-loading')
    await reconnect(page)
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    await page.evaluate(() => { void window.__trial.retry() })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
    assert.equal(await journal(page), null)
  })
  await fixture('A reconnect queued before an opening failure cannot restart the failed model', {
    approved: true, cached: true, initDeferred: true,
  }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('online'))
      window.__pendingInit[0].reject(new Error('Synthetic opening failure after reconnect'))
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    await status(page, 'error')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'model-loading')
  })
  await fixture('An explicit pause and retry still works after an earlier model opening failure', {
    approved: true, cached: true, initDeferred: true,
  }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => window.__pendingInit[0].reject(new Error('Synthetic first opening failure')))
    await status(page, 'error')
    await page.evaluate(() => { void window.__trial.retry() })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => {
      window.__trial.pause()
      void window.__trial.retry()
      window.__pendingInit[1].reject(new DOMException('Stopped', 'AbortError'))
    })
    await page.waitForFunction(() => window.__pendingInit.length === 3, null, { timeout: 2000 })
    await page.evaluate(() => window.__pendingInit[2].resolve())
    await status(page, 'ready')
    assert.equal(await journal(page), null)
  })
  await fixture('A cached model opening error offline offers explicit retry without waiting for internet', {
    approved: true, cached: true, online: false, initDeferred: true,
  }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => window.__pendingInit[0].reject(new Error('Synthetic offline opening failure')))
    await status(page, 'error')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'model-loading')
    await page.evaluate(() => { void window.__trial.retry() })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
    assert.equal(await journal(page), null)
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 0)
  })
  for (const [name, scenario, stage] of [
    ['App saving failure does not leave a model crash marker', { failAppSave: true }, 'app-saving'],
    ['Runtime saving failure does not leave a model crash marker', { failRuntimeSave: true }, 'runtime-saving'],
  ]) {
    await fixture(name, { approved: true, ...scenario }, async page => {
      await status(page, 'error')
      assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), stage)
      assert.equal(await journal(page), null)
      assert.equal(await page.evaluate(() => window.__calls.init.length), 0)
      assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 0)
    })
  }
  await fixture('Measured transfer progress is replaced by an indeterminate opening phase', {
    approved: true, initDeferred: true,
  }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    assert.equal(await page.evaluate(() => window.__trial.preparationStage), 'downloading')
    assert.equal(await page.evaluate(() => window.__trial.progress), 45)
    await page.evaluate(() => window.__emitProgress({ preparationStage: 'opening', progress: null }))
    await page.waitForFunction(() => window.__trial.preparationStage === 'opening')
    assert.equal(await page.evaluate(() => window.__trial.progress), null, 'Opening must not display a fabricated percentage')
    assert.equal((await journal(page)).stage, 'model-loading')
    await page.evaluate(() => window.__pendingInit[0].resolve())
    await status(page, 'ready')
    assert.equal(await journal(page), null)
  })
  await fixture('A cached model opens without a misleading zero-percent download', {
    approved: true, cached: true, initDeferred: true,
  }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    assert.equal(await page.evaluate(() => window.__trial.preparationStage), 'opening')
    assert.equal(await page.evaluate(() => window.__trial.progress), null)
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 0)
    await page.evaluate(() => window.__pendingInit[0].resolve())
    await status(page, 'ready')
  })
  const output = process.env.KIT_ASSISTANT_LIFECYCLE_RESULTS || path.join(repo, 'verification/offline-assistant-lifecycle-results.json')
  await fs.writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Real React StrictMode hook with mocked GPU, SDK, and offline storage. Selected model identity is from current configuration. No real inference or physical-phone validation.', selectedModel: { modelId, consentKey, downloadGB }, checks: results.length, results }, null, 2) + '\n')
  console.log(JSON.stringify({ result: 'pass', checks: results.length, output }))
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
