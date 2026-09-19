import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { webllmFallbackStorageBindingLimit } from '../src/services/webllmGpuLimits.js'

const require = createRequire(import.meta.url)
const entry = require.resolve('@mlc-ai/web-llm')
const version = JSON.parse(readFileSync(path.resolve(entry, '../../package.json'), 'utf8')).version
const original = 'const backupRequiredMaxStorageBufferBindingSize = 1 << 27; // 128MB'

export function patchWebllmGpuLimits(code, runtimeVersion) {
  // Fail the build on SDK drift, rather than silently shipping a preflight
  // that accepts phones the real worker still cannot use.
  if (runtimeVersion !== '0.2.80' || code.split(original).length !== 2) {
    throw new Error('Review the Kit WebLLM GPU limit patch before changing the runtime.')
  }
  return code.replace(original, `const backupRequiredMaxStorageBufferBindingSize = (${webllmFallbackStorageBindingLimit.toString()})(adapter.limits); // Kit: bounded mobile storage binding`)
}

export function webllmGpuLimitsPatch() {
  return {
    name: 'kit-webllm-gpu-limits',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== entry) return null
      return { code: patchWebllmGpuLimits(code, version), map: null }
    },
  }
}
