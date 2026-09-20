import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { patchWebllmGpuLimits, webllmGpuLimitsPatch } from '../../build/webllmGpuLimitsPatch.js'
import { MEDICAL_TRIAL_REQUIREMENTS, probeMedicalModelGPU } from './modelTrialSupport.js'
import { MEDICAL_3B_BASELINE } from './modelProfiles.js'

const require = createRequire(import.meta.url)
const entry = require.resolve('@mlc-ai/web-llm')
const originalSDK = readFileSync(entry, 'utf8')
const patchedSDK = patchWebllmGpuLimits(originalSDK, '0.2.80')
const MIB = 2 ** 20
const desktopLimits = {
  maxBufferSize: 1024 * MIB,
  maxStorageBufferBindingSize: 1024 * MIB,
  maxComputeWorkgroupStorageSize: 32768,
  maxStorageBuffersPerShaderStage: 10,
}
const reportedIPhoneLimits = {
  maxBufferSize: 429496728,
  maxStorageBufferBindingSize: 429496728,
  maxComputeWorkgroupStorageSize: 32768,
  maxStorageBuffersPerShaderStage: 44,
}

// Execute the actual installed SDK's device-selection function. Testing just
// our helper would miss a patch that never changes the inference worker.
function detectFromSDK(source, gpu) {
  const signature = 'function detectGPUDevice('
  assert.equal(source.split(signature).length, 2, 'Expected one SDK device detector')
  const start = source.indexOf(signature)
  const nextComment = source.slice(start).search(/\n[\t ]*\/\*\*/)
  assert.ok(nextComment > 0, 'Expected the SDK detector boundary')
  const detector = source.slice(start, start + nextComment)
  const awaiter = (thisArg, args, _Promise, generator) => new Promise((resolve, reject) => {
    const iterator = generator.apply(thisArg, args || [])
    function advance(method, value) {
      try {
        const result = iterator[method](value)
        if (result.done) resolve(result.value)
        else Promise.resolve(result.value).then(
          next => advance('next', next), error => advance('throw', error),
        )
      } catch (error) { reject(error) }
    }
    advance('next')
  })
  return new Function('navigator', '__awaiter', 'console', `${detector}; return detectGPUDevice();`)(
    { gpu }, awaiter, { log() {} },
  )
}

function mockGPU(limits, features = new Set(['shader-f16'])) {
  const state = { adapterRequests: [], deviceRequests: [], destroyed: 0 }
  const gpu = {
    async requestAdapter(options) {
      state.adapterRequests.push(options)
      return {
        limits,
        features,
        info: { description: 'Synthetic adapter', vendor: 'test' },
        async requestDevice(descriptor) {
          state.deviceRequests.push(descriptor)
          // Model WebGPU's cap validation; do not silently grant excessive
          // limits or return the adapter's maxima as device limits.
          for (const [name, requested] of Object.entries(descriptor.requiredLimits)) {
            if (!Number.isFinite(requested) || requested > limits[name]) {
              throw new Error(`Unsupported requested limit: ${name}`)
            }
          }
          for (const feature of descriptor.requiredFeatures) {
            if (!features.has(feature)) throw new Error('Unsupported feature')
          }
          return {
            limits: { ...descriptor.requiredLimits },
            features: new Set(descriptor.requiredFeatures),
            destroy() { state.destroyed++ },
          }
        },
      }
    },
  }
  return { gpu, state }
}

test('installed SDK reproduces the reported iPhone binding mismatch before the patch', async () => {
  const { gpu, state } = mockGPU(reportedIPhoneLimits)
  await detectFromSDK(originalSDK, gpu)
  assert.equal(state.deviceRequests[0].requiredLimits.maxBufferSize, 256 * MIB)
  assert.equal(state.deviceRequests[0].requiredLimits.maxStorageBufferBindingSize, 128 * MIB)
  assert.ok(128 * MIB < MEDICAL_3B_BASELINE.requirements.largestTensorBytes)
})

test('patched installed SDK and preflight request the same 256 MiB device for the reported iPhone', async () => {
  const runtime = mockGPU(reportedIPhoneLimits)
  const preflight = mockGPU(reportedIPhoneLimits)
  const device = (await detectFromSDK(patchedSDK, runtime.gpu)).device
  const result = await probeMedicalModelGPU(preflight.gpu)
  assert.equal(result.supported, true)
  assert.equal(result.deviceChecked, true)
  assert.deepEqual(runtime.state.deviceRequests, preflight.state.deviceRequests)
  assert.deepEqual(runtime.state.adapterRequests, [{ powerPreference: 'high-performance' }])
  assert.equal(device.limits.maxBufferSize, 256 * MIB)
  assert.equal(device.limits.maxStorageBufferBindingSize, 256 * MIB)
  assert.ok(device.limits.maxStorageBufferBindingSize >= MEDICAL_TRIAL_REQUIREMENTS.largestTensorBytes)
  assert.ok(device.limits.maxStorageBufferBindingSize >= MEDICAL_3B_BASELINE.requirements.largestTensorBytes)
  assert.equal(preflight.state.destroyed, 1)
})

test('patch preserves the installed SDK request on adapters supporting 1 GiB or more', async () => {
  for (const maximum of [1024 * MIB, 2048 * MIB]) {
    const limits = { ...desktopLimits, maxBufferSize: maximum, maxStorageBufferBindingSize: maximum }
    const before = mockGPU(limits)
    const after = mockGPU(limits)
    const preflight = mockGPU(limits)
    await detectFromSDK(originalSDK, before.gpu)
    await detectFromSDK(patchedSDK, after.gpu)
    assert.equal((await probeMedicalModelGPU(preflight.gpu)).supported, true)
    assert.deepEqual(after.state.deviceRequests, before.state.deviceRequests)
    assert.deepEqual(after.state.deviceRequests, preflight.state.deviceRequests)
    assert.equal(after.state.deviceRequests[0].requiredLimits.maxStorageBufferBindingSize, 1024 * MIB)
  }
})

test('patch stays within intermediate adapter limits and agrees with preflight', async () => {
  for (const [maxBufferSize, maxStorageBufferBindingSize] of [
    [256 * MIB, 256 * MIB],
    [512 * MIB, 512 * MIB],
    [1024 * MIB, MEDICAL_TRIAL_REQUIREMENTS.largestTensorBytes],
    [256 * MIB, 224 * MIB],
  ]) {
    const limits = { ...desktopLimits, maxBufferSize, maxStorageBufferBindingSize }
    const runtime = mockGPU(limits)
    const preflight = mockGPU(limits)
    await detectFromSDK(patchedSDK, runtime.gpu)
    assert.equal((await probeMedicalModelGPU(preflight.gpu)).supported, true)
    assert.deepEqual(runtime.state.deviceRequests, preflight.state.deviceRequests)
    const requested = runtime.state.deviceRequests[0].requiredLimits
    assert.ok(requested.maxStorageBufferBindingSize <= maxStorageBufferBindingSize)
    assert.ok(requested.maxStorageBufferBindingSize <= maxBufferSize)
  }
})

test('128 MiB binding adapters fit the smaller candidate but not the retained 3B baseline', async () => {
  const limits = { ...desktopLimits, maxBufferSize: 256 * MIB, maxStorageBufferBindingSize: 128 * MIB }
  const runtime = mockGPU(limits)
  const preflight = mockGPU(limits)
  const device = (await detectFromSDK(patchedSDK, runtime.gpu)).device
  assert.equal(device.limits.maxStorageBufferBindingSize, 128 * MIB)
  const result = await probeMedicalModelGPU(preflight.gpu)
  assert.equal(result.supported, true)
  assert.equal(result.reason, null)
  assert.equal(preflight.state.deviceRequests.length, 1)
  assert.ok(device.limits.maxStorageBufferBindingSize >= MEDICAL_TRIAL_REQUIREMENTS.largestTensorBytes)
  assert.ok(device.limits.maxStorageBufferBindingSize < MEDICAL_3B_BASELINE.requirements.largestTensorBytes)
})

test('patch fails closed on runtime version drift, missing or duplicated target, and double application', () => {
  const target = 'const backupRequiredMaxStorageBufferBindingSize = 1 << 27; // 128MB'
  for (const [source, version] of [
    [originalSDK, '0.2.81'],
    [originalSDK.replace(target, 'const changed = 1 << 27;'), '0.2.80'],
    [`${originalSDK}\n${target}`, '0.2.80'],
    [patchedSDK, '0.2.80'],
  ]) {
    assert.throws(() => patchWebllmGpuLimits(source, version), /Review the Kit WebLLM GPU limit patch/)
  }
})

test('Vite transform patches only the resolved SDK entry, including worker query suffixes', () => {
  const plugin = webllmGpuLimitsPatch()
  assert.equal(plugin.enforce, 'pre')
  for (const id of [entry, `${entry}?worker_file&type=module`]) {
    assert.equal(plugin.transform(originalSDK, id).code, patchedSDK)
  }
  assert.equal(plugin.transform(originalSDK, `${entry}.map`), null)
  assert.equal(plugin.transform(originalSDK, '/another-package/lib/index.js'), null)
})
