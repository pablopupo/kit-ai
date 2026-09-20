import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const entry = require.resolve('@mlc-ai/web-llm')
const version = JSON.parse(readFileSync(path.resolve(entry, '../../package.json'), 'utf8')).version

// Bounded backport of Apache TVM #20166, merged as
// 4e9a099d154d7c4644a40a1a9c00b8873226468e (2026-08-23):
// https://github.com/apache/tvm/pull/20166
// Only fresh, zero-offset GPU tensors use this branch. Keep the installed
// decoder for CPU, packed BF16, unaligned, and unrecognized format records.
// Unlike upstream's general Tensor changes, this checks storage size locally.
const directTensorUpload = `const rec = shardRecords[j];
const passThroughFormat = rec.format === "raw" ||
    (rec.format === "f32-to-bf16" && rec.dtype !== "float32");
const directToWebGPU = device.deviceType === DeviceStrToEnum.webgpu &&
    passThroughFormat && rec.nbytes % 4 === 0;
if (directToWebGPU) {
    if (!Number.isSafeInteger(rec.byteOffset) || rec.byteOffset < 0 ||
        !Number.isSafeInteger(rec.nbytes) || rec.nbytes < 0 ||
        !Number.isSafeInteger(rec.byteOffset + rec.nbytes) ||
        rec.byteOffset + rec.nbytes > buffer.byteLength ||
        !Array.isArray(rec.shape) ||
        rec.shape.some(dim => !Number.isSafeInteger(dim) || dim < 0)) {
        throw new Error("Invalid tensor-cache record bounds or shape");
    }
    const gpu_arr = this.withNewScope(() => {
        return this.detachFromCurrentScope(this.empty(rec.shape, rec.dtype, device));
    });
    try {
        let totalBits = gpu_arr.dlDataType.bits * gpu_arr.dlDataType.lanes;
        for (const dim of rec.shape) {
            totalBits *= dim;
            if (!Number.isSafeInteger(totalBits) || totalBits < 0) {
                throw new Error("Invalid tensor-cache storage size");
            }
        }
        // SDK 0.2.80 reads Tensor.byteOffset from unaligned wasm32 padding
        // and truncates its high word. Inspect DLTensor's aligned uint64 field
        // locally: this path only supports a fresh tensor with offset zero.
        const pointerBytes = gpu_arr.lib.sizeofPtr();
        if (pointerBytes !== 4 && pointerBytes !== 8) {
            throw new Error("Unsupported tensor pointer size");
        }
        const offsetAddress = gpu_arr.dltensor + Math.ceil((3 * pointerBytes + 16) / 8) * 8;
        const offsetLow = gpu_arr.lib.memory.loadU32(offsetAddress);
        const offsetHigh = gpu_arr.lib.memory.loadU32(offsetAddress + 4);
        if (!Number.isSafeInteger(totalBits) || totalBits < 0 ||
            Math.ceil(totalBits / 8) !== rec.nbytes || offsetLow !== 0 || offsetHigh !== 0) {
            throw new Error("Tensor-cache storage size or destination offset mismatch");
        }
        // copyFromRawBytes synchronously calls queue.writeBuffer, which copies
        // this borrowed view before returning. Do not keep a record view over
        // the await or send pass-through bytes through the CPU/WASM decoder.
        gpu_arr.copyFromRawBytes(new Uint8Array(buffer, rec.byteOffset, rec.nbytes));
        yield device.sync();
        this.tensorCacheUpdate(rec.name, gpu_arr, false);
    } finally {
        gpu_arr.dispose();
    }
    continue;
}`

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
      ['const rec = shardRecords[j];', directTensorUpload],
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
