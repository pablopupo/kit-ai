// The main chat's experimental medical assistant, pinned to verified artifacts.
// Keep the legacy identifiers so previous trial downloads and approval are reused.
export const MEDICAL_TRIAL_REVISION = '34f6aa7d8fb5608dc2585e6660b982610ca4bc28'
const base = MEDICAL_TRIAL_REVISION
  ? `https://huggingface.co/Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC/resolve/${MEDICAL_TRIAL_REVISION}/`
  : ''
export const MEDICAL_TRIAL_MODEL_ID = `kit-medical-3b-df5aa311-q4f16_1-${MEDICAL_TRIAL_REVISION || 'unpublished'}`
export const MEDICAL_TRIAL_DOWNLOAD_GB = 1.83
export const MEDICAL_TRIAL_RECORD = base ? {
  model: base,
  model_id: MEDICAL_TRIAL_MODEL_ID,
  model_lib: `${base}model.wasm`,
  required_features: ['shader-f16'],
  overrides: { context_window_size: 4096 },
} : null
export const MEDICAL_TRIAL_CONSENT_KEY = `kit-ai-trial-download-approved:${MEDICAL_TRIAL_MODEL_ID}`

export function isMedicalTrial(search = '') {
  return new URLSearchParams(search).get('trial') === 'medical3b'
}
