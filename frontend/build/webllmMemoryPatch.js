import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const entry = require.resolve('@mlc-ai/web-llm')
const version = JSON.parse(readFileSync(path.resolve(entry, '../../package.json'), 'utf8')).version

function replaceInMethod(code, signature, nextSignature, replacements) {
  const start = code.indexOf(signature)
  const end = code.indexOf(nextSignature, start + signature.length)
  if (start < 0 || end < 0 || code.indexOf(signature, start + signature.length) !== -1) {
    throw new Error('Review the Kit WebLLM memory patch before changing the runtime.')
  }
  let method = code.slice(start, end)
  for (const [before, after] of replacements) {
    if (method.split(before).length !== 2) {
      throw new Error('Review the Kit WebLLM memory patch before changing the runtime.')
    }
    method = method.replace(before, after)
  }
  return code.slice(0, start) + method + code.slice(end)
}

export function patchWebllmMemory(code, runtimeVersion) {
  if (runtimeVersion !== '0.2.80') {
    throw new Error('Review the Kit WebLLM memory patch before changing the runtime.')
  }
  // Presence checks must not deserialize model weights. The original SDK
  // reads every shard concurrently in hasAllKeys(), including after the GPU
  // model is already resident. Cache records use the inline `url` key, so
  // getKey has the same existence semantics without retrieving their data.
  // Keep asyncGetHelper's get(): that path actually needs the stored payload.
  code = replaceInMethod(code,
    'class ArtifactIndexedDBCache {',
    'function hasTensorInCache(', [
      ['const request = store.get(url);', 'const request = store.getKey(url);'],
      ['const request = store.get(key);', 'const request = store.getKey(key);'],
    ])
  // The packed-function bridge synchronously copies this view into its own
  // argument storage. Avoid a second whole-tensor JS buffer before that copy.
  code = replaceInMethod(code,
    'fetchTensorCacheInternal(tensorCacheUrl, list, device, artifactCache, signal) {',
    'scalar(value, dtype) {', [
      ['const recSource = buffer.slice(rec.byteOffset, rec.byteOffset + rec.nbytes);',
        'const recSource = new Uint8Array(buffer, rec.byteOffset, rec.nbytes);'],
      ['this.ctx.arrayDecodeStorage(cpu_arr, new Uint8Array(recSource), rec.format, rec.dtype);',
        'this.ctx.arrayDecodeStorage(cpu_arr, recSource, rec.format, rec.dtype);'],
    ])
  // Small-buffer devices include the reported iPhone. Compile one pipeline at
  // a time there, instead of retaining all concurrent compiler jobs. This does
  // not lower the model's resident weight memory or promise device support.
  return replaceInMethod(code,
    'asyncLoadWebGPUPipelines(mod) {',
    'initWebGPU(device) {', [
      ['allEvents = Promise.all([allEvents, event]).then(() => { });',
        'if (webgpuContext.device.limits.maxStorageBufferBindingSize <= 268435456) { yield event; } else { allEvents = Promise.all([allEvents, event]).then(() => { }); }'],
    ])
}

export function webllmMemoryPatch() {
  return {
    name: 'kit-webllm-memory',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== entry) return null
      return { code: patchWebllmMemory(code, version), map: null }
    },
  }
}
