// Four deterministic desktop cases; no weights download, conversion or training.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildMessages } from '../frontend/src/services/chatPrompt.js';
import { startOwnedServer, stopOwnedServer, isolatedChromePids, closeBrowserAndConfirmExit } from '../model-tools/browser-eval/lifecycle.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.KIT_MODEL_WORK_DIR || path.resolve(repo, '../model-conversion');
const runId = Date.now();
const root = path.join(work, `follow-up-eval-${runId}`);
const output = process.env.KIT_BROWSER_OUTPUT || path.join(repo, 'evaluations/results', `medical-3b-follow-up-${runId}.json`);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = file => hash(fs.readFileSync(file));
const baselineRevision = '5134c71';
const baselineSource = execFileSync('git', ['show', `${baselineRevision}:frontend/src/services/chatPrompt.js`], { cwd: repo, encoding: 'utf8' });
const guideModule = pathToFileURL(path.join(repo, 'frontend/src/services/firstAidGuides.js')).href;
const baselineModule = baselineSource.replace("'./firstAidGuides.js'", JSON.stringify(guideModule));
const { buildMessages: beforeMessages } = await import(`data:text/javascript;base64,${Buffer.from(baselineModule).toString('base64')}`);
const questions = [
  { language: 'en', previous: 'I burned my hand on a hot pan.', question: 'Can I put butter on it?' },
  { language: 'es', previous: 'Me quemé la mano con una sartén caliente.', question: '¿Puedo ponerle mantequilla?' },
];
const cases = questions.flatMap(({ language, previous, question }) => {
  // A neutral prior response avoids injecting the expected answer through history.
  const history = [{ role: 'user', content: previous }, { role: 'assistant', content: language === 'es' ? '¿Qué quieres saber?' : 'What would you like to know?' }];
  return [
    { caseId: `burn-butter-follow-up-${language}-before`, phase: 'before', language, question, history, messages: beforeMessages(question, history, { language }) },
    { caseId: `burn-butter-follow-up-${language}-after`, phase: 'after', language, question, history, messages: buildMessages(question, history, { language }) },
  ];
});
const recorded = JSON.parse(fs.readFileSync(path.join(repo, 'evaluations/results/medical-3b-mlc-browser.json'), 'utf8'));
const sourceAssets = path.join(work, 'browser-eval');
if (hashFile(path.join(sourceAssets, 'model.wasm')) !== recorded.artifactHashes.wasm) throw Error('Prepared runtime differs from recorded verified runtime.');
fs.mkdirSync(path.join(root, 'browser-eval'), { recursive: true });
fs.symlinkSync(path.join(work, 'mlc-q4f16_1'), path.join(root, 'mlc-q4f16_1'), 'dir');
for (const name of ['index.html', 'client.bundle.js', 'worker.bundle.js', 'model.wasm']) fs.copyFileSync(path.join(sourceAssets, name), path.join(root, 'browser-eval', name));
fs.writeFileSync(path.join(root, 'browser-eval/cases.json'), JSON.stringify(cases, null, 2) + '\n');
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), kind: 'desktop-browser-follow-up-retrieval-comparison',
  model: recorded.model, modelRevision: recorded.modelRevision, format: recorded.format,
  phoneTest: false, hostedModelTest: false, clinicalReview: 'pending',
  webllmVersion: '0.2.80', librarySource: recorded.librarySource,
  artifactHashes: {
    config: hashFile(path.join(work, 'mlc-q4f16_1/mlc-chat-config.json')),
    tensorManifest: hashFile(path.join(work, 'mlc-q4f16_1/tensor-cache.json')),
    wasm: hashFile(path.join(sourceAssets, 'model.wasm')),
    clientBundle: hashFile(path.join(sourceAssets, 'client.bundle.js')),
    workerBundle: hashFile(path.join(sourceAssets, 'worker.bundle.js')),
    baselinePromptSource: hash(baselineSource),
    currentPromptSource: hashFile(path.join(repo, 'frontend/src/services/chatPrompt.js')),
    guideModule: hashFile(path.join(repo, 'frontend/src/services/firstAidGuides.js')),
    cases: hash(JSON.stringify(cases)),
  },
  baselineRevision,
  promptPipeline: 'Exact frontend buildMessages before and after follow-up retrieval, passed directly to WebLLM with the preserved HF chat template. No hosted Space wrapper. Baseline imports current guide content; only the after prompt retrieves it for these follow-ups.',
  generation: { temperature: 0, repetition_penalty: 1.1, max_tokens: 512, stream: true },
  runtimeOptions: { context_window_size: 4096, prefill_chunk_size: 128, useIndexedDBCache: true, required_features: ['shader-f16'] },
  caveats: ['Four selected synthetic cases, one deterministic output each; not a held-out accuracy benchmark or clinical validation.', 'Desktop Apple Metal only; does not establish phone compatibility or speed.', 'No offline restart is measured here; browser mechanics were tested separately.', 'Generated medical text is retained as evaluation evidence, not first-aid instructions.'],
  results: [], errors: [], externalRequests: [], network: { requests: 0, shardRequests: 0, failures: [] },
};
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const { chromium } = await import(process.env.KIT_PLAYWRIGHT_MODULE || 'playwright');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profilePath = path.join(root, 'browser-profile');
let ownedServer, context, phase = 'startup';
try {
  ownedServer = await startOwnedServer(path.join(repo, 'model-tools/browser-eval/server.mjs'), { KIT_MODEL_WORK_DIR: root });
  context = await chromium.launchPersistentContext(profilePath, {
    headless: true, executablePath: chromePath, viewport: { width: 1100, height: 700 },
    args: ['--enable-automation'], chromiumSandbox: true,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
  });
  context.on('request', request => {
    report.network.requests++;
    if (request.url().endsWith('.bin')) report.network.shardRequests++;
    if (!request.url().startsWith('http://127.0.0.1:4190/')) report.externalRequests.push({ phase, url: request.url() });
  });
  context.on('requestfailed', request => report.network.failures.push({ phase, url: request.url(), failure: request.failure()?.errorText }));
  await context.exposeFunction('reportProgress', () => {});
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', error => { report.errors.push({ phase, message: error.message }); save(); });
  await page.goto('http://127.0.0.1:4190/browser-eval/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.kitEval?.ready);
  const cdp = await context.newCDPSession(page);
  const actualArguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments;
  report.browser = { version: context.browser()?.version(), headless: true, executable: chromePath, actualArguments, chromiumSandbox: true };
  if (actualArguments.some(arg => /unsafe|swiftshader|disable-gpu/.test(arg))) throw Error('Unexpected GPU override in Chrome arguments.');
  report.gpu = await page.evaluate(() => window.kitEval.gpu());
  console.log('GPU', JSON.stringify(report.gpu)); save();
  if (!report.gpu.supported || report.gpu.isFallbackAdapter || !report.gpu.features.includes('shader-f16')) throw Error('A real compatible GPU is unavailable.');
  phase = 'initial-model-load';
  report.initialization = await page.evaluate(() => window.kitEval.init());
  console.log('INITIALIZED', report.initialization.elapsedMs); save();
  for (const item of cases) {
    phase = item.caseId;
    const result = await page.evaluate(messages => window.kitEval.ask(messages), item.messages);
    report.results.push({ ...item, ...result }); save();
    console.log('ANSWER', item.caseId, result.elapsedMs, result.finishReason, result.answer.replaceAll('\n', ' ').slice(0, 180));
  }
  report.complete = true;
} catch (error) {
  report.complete = false;
  report.errors.push({ phase, message: error.message, stack: error.stack });
  console.log('FAILED', phase, error.message);
} finally {
  if (context) {
    try { report.browserCloseConfirmation = await closeBrowserAndConfirmExit(context, () => isolatedChromePids(profilePath, chromePath)); }
    catch (error) { report.complete = false; report.errors.push({ phase: 'browser-cleanup', message: error.message }); }
  }
  try { report.serverCleanup = await stopOwnedServer(ownedServer); }
  catch (error) { report.complete = false; report.errors.push({ phase: 'server-cleanup', message: error.message }); }
  report.finishedAt = new Date().toISOString(); save();
  console.log('SAVED', output);
  process.exit(report.complete ? 0 : 1);
}
