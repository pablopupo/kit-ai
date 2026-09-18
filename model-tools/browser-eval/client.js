import { CreateWebWorkerMLCEngine, hasModelInCache } from '@mlc-ai/web-llm';

const modelId = 'kit-ai-medical-3b-df5aa311-q4f16_1';
const appConfig = { useIndexedDBCache: true, model_list: [{
  model_id: modelId,
  model: new URL('../mlc-q4f16_1/', location.href).href,
  model_lib: new URL('./model.wasm', location.href).href,
  required_features: ['shader-f16'],
  overrides: { context_window_size: 4096 },
}] };
let worker, engine;
window.kitEval = {
  ready: true,
  appConfig,
  async prepareShell() {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    return { controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() };
  },
  async gpu() {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return { supported: false };
    return { supported: true, vendor: adapter.info.vendor, architecture: adapter.info.architecture,
      device: adapter.info.device, description: adapter.info.description,
      isFallbackAdapter: adapter.info.isFallbackAdapter, features: [...adapter.features],
      maxBufferSize: adapter.limits.maxBufferSize, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize };
  },
  async init() {
    if (engine) throw new Error('Engine already initialized');
    const cachedBefore = await hasModelInCache(modelId, appConfig);
    const start = performance.now();
    worker = new Worker('./worker.bundle.js', { type: 'module' });
    engine = await CreateWebWorkerMLCEngine(worker, modelId, {
      appConfig, logLevel: 'WARN',
      initProgressCallback: p => { document.querySelector('#status').textContent = p.text; window.reportProgress?.(p); },
    }, { context_window_size: 4096, prefill_chunk_size: 128 });
    const result = { elapsedMs: Math.round(performance.now() - start), cachedBefore,
      cachedAfter: await hasModelInCache(modelId, appConfig), online: navigator.onLine,
      storage: await navigator.storage.estimate() };
    document.querySelector('#status').textContent = 'Loaded for evaluation only';
    return result;
  },
  async ask(messages) {
    if (!engine) throw new Error('Initialize explicitly first');
    const started = performance.now();
    let first = null, answer = '', finishReason = null, usage = null, chunks = 0;
    const stream = await engine.chat.completions.create({ messages, temperature: 0,
      repetition_penalty: 1.1, max_tokens: 512, stream: true,
      stream_options: { include_usage: true } });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) { first ??= performance.now(); answer += content; chunks++; }
      finishReason = chunk.choices[0]?.finish_reason || finishReason;
      usage = chunk.usage || usage;
    }
    return { answer, firstTokenMs: first === null ? null : Math.round(first - started),
      elapsedMs: Math.round(performance.now() - started), finishReason, usage, chunks, online: navigator.onLine };
  },
};

document.querySelector('#init').onclick = () => window.kitEval.init().catch(error => document.querySelector('#status').textContent = error.message);
