// WebLLM 0.2.80's 128 MiB fallback is too small for the pinned medical
// model's 188 MiB embedding. Ask for at most 256 MiB on smaller adapters,
// never more than either advertised limit. This is also used by the guarded
// build patch: the preflight and actual inference device must agree.
export function webllmFallbackStorageBindingLimit(limits) {
  return Math.min(268435456, limits.maxStorageBufferBindingSize, limits.maxBufferSize)
}
