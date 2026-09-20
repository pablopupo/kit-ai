// Specific to the selected phone candidate and patched WebLLM 0.2.80.
// The SDK still requests at most 256 MiB bindings on smaller adapters; the
// candidate's 111.3 MiB largest tensor also fits a 128 MiB binding limit.
import { webllmFallbackStorageBindingLimit } from './webllmGpuLimits.js'
import { PHONE_CANDIDATE } from './modelProfiles.js'
export const MEDICAL_TRIAL_REQUIREMENTS = PHONE_CANDIDATE.requirements

export const MODEL_TRIAL_MEMORY_CAVEAT = 'Passing this check does not prove there is enough working memory to load or run the model. A real generation test is still required.'

const GIB = 2 ** 30
const LIMIT_NAMES = ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize', 'maxStorageBuffersPerShaderStage']
const REASONS = new Set([
  'webgpu-unavailable', 'adapter-unavailable', 'adapter-request-failed',
  'shader-f16-unavailable', 'gpu-limits-unavailable', 'storage-binding-limit',
  'buffer-limit', 'workgroup-storage-limit', 'storage-buffer-count-limit',
  'device-request-failed', 'device-limits-unavailable', 'storage-space-low',
  'worker-unavailable', 'worker-error', 'worker-timeout', 'invalid-check-result',
])
const numberOrNull = value => Number.isFinite(value) && value >= 0 ? value : null
const read = getter => { try { return getter() } catch { return undefined } }
const limitsOnly = limits => Object.fromEntries(LIMIT_NAMES.map(name => [name, numberOrNull(read(() => limits?.[name]))]))

export function modelTrialReason(value) {
  return REASONS.has(value) ? value : 'invalid-check-result'
}

/** Mirrors Kit's patched WebLLM 0.2.80 request, not the adapter maximum. */
export function medicalTrialRequestedLimits(limits = {}) {
  return {
    maxBufferSize: limits.maxBufferSize >= GIB ? GIB : 2 ** 28,
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize >= GIB ? GIB : webllmFallbackStorageBindingLimit(limits),
    maxComputeWorkgroupStorageSize: 32768,
    maxStorageBuffersPerShaderStage: 10,
  }
}

function adapterReason({ features, limits, requestedLimits }) {
  if (!features.shaderF16) return 'shader-f16-unavailable'
  if (LIMIT_NAMES.some(name => limits[name] === null)) return 'gpu-limits-unavailable'
  if (requestedLimits.maxStorageBufferBindingSize < MEDICAL_TRIAL_REQUIREMENTS.largestTensorBytes) return 'storage-binding-limit'
  if (limits.maxBufferSize < requestedLimits.maxBufferSize) return 'buffer-limit'
  if (limits.maxComputeWorkgroupStorageSize < requestedLimits.maxComputeWorkgroupStorageSize) return 'workgroup-storage-limit'
  if (limits.maxStorageBuffersPerShaderStage < requestedLimits.maxStorageBuffersPerShaderStage) return 'storage-buffer-count-limit'
  return null
}

function gpuSnapshot({ features, limits, requestedLimits, deviceChecked = false, reason } = {}) {
  return {
    supported: reason === null && deviceChecked === true,
    reason: reason === null ? null : modelTrialReason(reason),
    features: { shaderF16: features?.shaderF16 === true },
    limits: limitsOnly(limits),
    requestedLimits: limitsOnly(requestedLimits),
    deviceChecked: deviceChecked === true,
  }
}

/** Worker-safe, asset-free device request. Exported for deterministic tests. */
export async function probeMedicalModelGPU(gpu) {
  let details = {}
  let device
  let stage = 'adapter-request-failed'
  try {
    if (typeof gpu?.requestAdapter !== 'function') return gpuSnapshot({ reason: 'webgpu-unavailable' })
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) return gpuSnapshot({ reason: 'adapter-unavailable' })
    const limits = limitsOnly(adapter.limits)
    details = {
      features: { shaderF16: adapter.features?.has?.('shader-f16') === true },
      limits,
      requestedLimits: medicalTrialRequestedLimits(limits),
    }
    const reason = adapterReason(details)
    if (reason) return gpuSnapshot({ ...details, reason })
    stage = 'device-request-failed'
    device = await adapter.requestDevice({
      requiredFeatures: ['shader-f16'], requiredLimits: details.requestedLimits,
    })
    const deviceLimits = limitsOnly(device?.limits)
    if (!device || device.features?.has?.('shader-f16') !== true || LIMIT_NAMES.some(name => deviceLimits[name] === null || deviceLimits[name] < details.requestedLimits[name])) {
      return gpuSnapshot({ ...details, reason: 'device-limits-unavailable' })
    }
    return gpuSnapshot({ ...details, deviceChecked: true, reason: null })
  } catch {
    // Exception strings may contain browser or device details; expose only codes.
    return gpuSnapshot({ ...details, reason: stage })
  } finally {
    // Never retain a second GPU device beside the model engine. No model buffers
    // are allocated here, so this deliberately cannot prove free working memory.
    try { device?.destroy() } catch { /* A lost device is already unusable. */ }
  }
}

/** Pure decision used after the worker and best-effort storage probe finish. */
export function assessModelTrialSupport({ gpu, estimate, modelCached = false } = {}) {
  const savedModel = modelCached === true
  const details = gpuSnapshot(gpu)
  let reason = details.reason
  if (gpu?.supported === true && details.deviceChecked) {
    const expectedLimits = medicalTrialRequestedLimits(details.limits)
    reason = adapterReason({ ...details, requestedLimits: expectedLimits })
    if (!reason && LIMIT_NAMES.some(name => details.requestedLimits[name] !== expectedLimits[name])) reason = 'invalid-check-result'
  } else if (!reason) reason = 'invalid-check-result'
  const usageBytes = numberOrNull(estimate?.usage)
  const quotaBytes = numberOrNull(estimate?.quota)
  const availableBytes = usageBytes !== null && quotaBytes !== null ? Math.max(0, quotaBytes - usageBytes) : null
  if (!reason && !savedModel && availableBytes !== null && availableBytes < MEDICAL_TRIAL_REQUIREMENTS.minimumFreeStorageBytes) reason = 'storage-space-low'
  return {
    ...details, supported: reason === null, reason,
    storage: { usageBytes, quotaBytes, availableBytes },
    modelCached: savedModel,
    memoryUnverified: true,
    memoryCaveat: MODEL_TRIAL_MEMORY_CAVEAT,
  }
}
