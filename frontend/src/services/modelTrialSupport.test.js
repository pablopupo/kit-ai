import test from 'node:test'
import assert from 'node:assert/strict'
import { assessModelTrialSupport, MEDICAL_TRIAL_REQUIREMENTS, medicalTrialRequestedLimits, probeMedicalModelGPU } from './modelTrialSupport.js'
import { checkMedicalModelGPUInWorker, checkMedicalModelTrial } from './modelTrialCheck.js'

const LIMITS = { maxBufferSize: 2 ** 30, maxStorageBufferBindingSize: 2 ** 30, maxComputeWorkgroupStorageSize: 32768, maxStorageBuffersPerShaderStage: 10 }
const FEATURES = new Set(['shader-f16'])
function fakeGPU({ limits = LIMITS, features = FEATURES, deviceLimits = medicalTrialRequestedLimits(limits), deviceFeatures = FEATURES, requestError = false } = {}) {
  const state = { adapterRequests: [], deviceRequests: [], destroys: 0 }
  return {
    state,
    gpu: { requestAdapter: async options => {
      state.adapterRequests.push(options)
      return { limits, features, requestDevice: async options => {
        state.deviceRequests.push(options)
        if (requestError) throw new Error('Private driver detail')
        return { limits: deviceLimits, features: deviceFeatures, destroy() { state.destroys++ } }
      } }
    } },
  }
}

test('rejects adapters that cannot bind the actual largest model tensor', async () => {
  for (const maxStorageBufferBindingSize of [2 ** 27, MEDICAL_TRIAL_REQUIREMENTS.largestTensorBytes - 4]) {
    const { gpu, state } = fakeGPU({ limits: { ...LIMITS, maxStorageBufferBindingSize } })
    const result = await probeMedicalModelGPU(gpu)
    assert.equal(result.supported, false)
    assert.equal(result.reason, 'storage-binding-limit')
    assert.equal(result.requestedLimits.maxStorageBufferBindingSize, maxStorageBufferBindingSize)
    assert.ok(result.requestedLimits.maxStorageBufferBindingSize < MEDICAL_TRIAL_REQUIREMENTS.largestTensorBytes)
    assert.equal(state.deviceRequests.length, 0)
  }
})

test('reported iPhone and 256/512 MiB adapters request and validate a usable device', async () => {
  for (const maximum of [2 ** 28, 429496728, 2 ** 29]) {
    const { gpu, state } = fakeGPU({ limits: { ...LIMITS, maxBufferSize: maximum, maxStorageBufferBindingSize: maximum } })
    const result = await probeMedicalModelGPU(gpu)
    assert.equal(result.supported, true)
    assert.equal(result.deviceChecked, true)
    assert.equal(result.requestedLimits.maxBufferSize, 2 ** 28)
    assert.equal(result.requestedLimits.maxStorageBufferBindingSize, 2 ** 28)
    assert.equal(state.deviceRequests.length, 1)
    assert.equal(state.destroys, 1)
    assert.equal(assessModelTrialSupport({ gpu: result }).supported, true)
  }
})

test('requests the runtime features/limits, validates the granted device, and destroys it', async () => {
  // Runtime independently falls back to 256 MiB maxBufferSize below 1 GiB.
  const limits = { ...LIMITS, maxBufferSize: 2 ** 29 }
  const { gpu, state } = fakeGPU({ limits })
  const result = await probeMedicalModelGPU(gpu)
  assert.equal(result.supported, true)
  assert.equal(result.reason, null)
  assert.equal(result.deviceChecked, true)
  assert.deepEqual(state.adapterRequests, [{ powerPreference: 'high-performance' }])
  assert.deepEqual(state.deviceRequests, [{ requiredFeatures: ['shader-f16'], requiredLimits: { ...LIMITS, maxBufferSize: 2 ** 28 } }])
  assert.equal(state.destroys, 1)
})

test('rejects missing f16 and insufficient runtime limits before requesting a device', async () => {
  const cases = [
    [{ features: new Set() }, 'shader-f16-unavailable'],
    [{ limits: { ...LIMITS, maxBufferSize: 2 ** 27 } }, 'buffer-limit'],
    [{ limits: { ...LIMITS, maxComputeWorkgroupStorageSize: 16384 } }, 'workgroup-storage-limit'],
    [{ limits: { ...LIMITS, maxStorageBuffersPerShaderStage: 8 } }, 'storage-buffer-count-limit'],
    [{ limits: { ...LIMITS, maxBufferSize: undefined } }, 'gpu-limits-unavailable'],
  ]
  for (const [options, reason] of cases) {
    const { gpu, state } = fakeGPU(options)
    const result = await probeMedicalModelGPU(gpu)
    assert.equal(result.reason, reason)
    assert.equal(result.supported, false)
    assert.equal(state.deviceRequests.length, 0)
  }
})

test('a rejected request never passes and a granted but inadequate device is destroyed', async () => {
  const rejected = fakeGPU({ requestError: true })
  assert.equal((await probeMedicalModelGPU(rejected.gpu)).reason, 'device-request-failed')
  for (const options of [{ deviceLimits: { ...LIMITS, maxStorageBufferBindingSize: 2 ** 27 } }, { deviceFeatures: new Set() }]) {
    const { gpu, state } = fakeGPU(options)
    const result = await probeMedicalModelGPU(gpu)
    assert.equal(result.supported, false)
    assert.equal(result.reason, 'device-limits-unavailable')
    assert.equal(state.destroys, 1)
    assert.equal(JSON.stringify(result).includes('Private'), false)
  }
})

test('missing WebGPU, null adapters, and thrown adapter requests fail with allowlisted reasons', async () => {
  for (const [gpu, reason] of [
    [undefined, 'webgpu-unavailable'],
    [{ requestAdapter: async () => null }, 'adapter-unavailable'],
    [{ requestAdapter: async () => { throw new Error('Private adapter detail') } }, 'adapter-request-failed'],
  ]) {
    const result = await probeMedicalModelGPU(gpu)
    assert.equal(result.supported, false)
    assert.equal(result.reason, reason)
    assert.equal(JSON.stringify(result).includes('Private'), false)
  }
})

test('quota is best-effort: unknown can attempt loading, insufficient known space cannot', async () => {
  const gpu = await probeMedicalModelGPU(fakeGPU().gpu)
  for (const estimate of [undefined, {}, { quota: 10_000_000_000 }, { usage: NaN, quota: Infinity }]) {
    const result = assessModelTrialSupport({ gpu, estimate })
    assert.equal(result.supported, true)
    assert.equal(result.storage.availableBytes, null)
    assert.equal(result.memoryUnverified, true)
    assert.match(result.memoryCaveat, /does not prove/)
  }
  const estimate = { usage: 8_000_000_000, quota: 10_000_000_000 }
  assert.equal(assessModelTrialSupport({ gpu, estimate }).reason, 'storage-space-low')
  assert.equal(assessModelTrialSupport({ gpu, estimate, modelCached: true }).supported, true)
  assert.equal(assessModelTrialSupport({ gpu, estimate: { usage: 0, quota: 2_100_000_000 } }).supported, true)
})

test('pure assessment does not accept an incomplete success or copy arbitrary worker data', async () => {
  for (const gpu of [{ supported: true }, { supported: true, deviceChecked: true, reason: null }, { supported: false, reason: 'Private browser details' }]) {
    const result = assessModelTrialSupport({ gpu })
    assert.equal(result.supported, false)
    assert.equal(JSON.stringify(result).includes('Private'), false)
  }
  const gpu = await probeMedicalModelGPU(fakeGPU().gpu)
  const result = assessModelTrialSupport({ gpu: { ...gpu, requestedLimits: { ...gpu.requestedLimits, maxStorageBufferBindingSize: 2 ** 28 }, secret: 'Private' } })
  assert.equal(result.reason, 'invalid-check-result')
  assert.equal(JSON.stringify(result).includes('Private'), false)
})

test('worker cleanup runs on timeout, malformed output, error, and successful device check', async () => {
  const valid = await probeMedicalModelGPU(fakeGPU().gpu)
  for (const mode of ['timeout', 'error', 'messageerror', 'malformed', 'success']) {
    let destroys = 0
    const worker = { terminate() { destroys++ } }
    const workerFactory = () => {
      queueMicrotask(() => {
        if (mode === 'error') worker.onerror({ message: 'Private worker path' })
        if (mode === 'messageerror') worker.onmessageerror({})
        if (mode === 'malformed') worker.onmessage({ data: null })
        if (mode === 'success') worker.onmessage({ data: valid })
      })
      return worker
    }
    const result = await checkMedicalModelGPUInWorker({ workerFactory, timeoutMs: 1 })
    assert.equal(destroys, 1)
    assert.equal(result.supported, mode === 'success')
    assert.equal(result.reason, { timeout: 'worker-timeout', error: 'worker-error', messageerror: 'worker-error', malformed: 'invalid-check-result', success: null }[mode])
  }
  const blocked = await checkMedicalModelGPUInWorker({ workerFactory: () => { throw new Error('Blocked') } })
  assert.equal(blocked.reason, 'worker-unavailable')
})

test('combined check tolerates denied or stalled quota and does not retain exception text', async () => {
  const gpu = await probeMedicalModelGPU(fakeGPU().gpu)
  for (const nav of [{}, { get storage() { throw new Error('Private storage detail') } }, { storage: { estimate: () => new Promise(() => {}) } }]) {
    const result = await checkMedicalModelTrial({ nav, checkGPU: async () => gpu, timeoutMs: 1 })
    assert.equal(result.supported, true)
    assert.equal(result.storage.availableBytes, null)
  }
  const failed = await checkMedicalModelTrial({ nav: {}, checkGPU: async () => { throw new Error('Private worker detail') } })
  assert.equal(failed.supported, false)
  assert.equal(failed.reason, 'worker-error')
  assert.equal(JSON.stringify(failed).includes('Private'), false)
})
