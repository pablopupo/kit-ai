// Immutable profiles keep the phone experiment separate from the owner's
// fine-tuned baseline. Selecting a profile never migrates approval or caches.
const baselineRevision = '34f6aa7d8fb5608dc2585e6660b982610ca4bc28'
const baselineBase = `https://huggingface.co/Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC/resolve/${baselineRevision}/`
const baselineId = `kit-medical-3b-df5aa311-q4f16_1-${baselineRevision}`

export const MEDICAL_3B_BASELINE = Object.freeze({
  revision: baselineRevision,
  modelId: baselineId,
  consentKey: `kit-ai-trial-download-approved:${baselineId}`,
  downloadGB: 1.83,
  record: Object.freeze({
    model: baselineBase,
    model_id: baselineId,
    model_lib: `${baselineBase}model.wasm`,
    required_features: ['shader-f16'],
    overrides: { context_window_size: 4096 },
  }),
  requirements: Object.freeze({
    artifactBytesApprox: 1_830_000_000,
    minimumFreeStorageBytes: 2_100_000_000,
    largestTensorBytes: 197_001_216,
    runtimeVersion: '0.2.80',
  }),
})

const candidateRevision = '9bd564b064631febf14deadcac492efb761d60c3'
const candidateId = `kit-qwen2.5-1.5b-q4f16_1-${candidateRevision}`
const candidateBase = `https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/${candidateRevision}/`
const runtimeRevision = '6ed5b97c37f4cdc49d1a8044a339db5588176d7e'

// This is an instruction model for the approved phone compatibility experiment,
// not the owner's medical fine-tune or a medically validated replacement.
export const PHONE_CANDIDATE = Object.freeze({
  revision: candidateRevision,
  modelId: candidateId,
  consentKey: `kit-ai-trial-download-approved:${candidateId}`,
  // Weights + config + manifest + tokenizer.json + pinned runtime; app assets
  // and HTTP overhead are separate. See phone-candidate-artifacts.json.
  downloadBytes: 881_089_605,
  downloadGB: 0.90,
  record: Object.freeze({
    model: candidateBase,
    model_id: candidateId,
    model_lib: `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${runtimeRevision}/web-llm-models/v0_2_80/Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
    required_features: ['shader-f16'],
    overrides: { context_window_size: 4096 },
  }),
  requirements: Object.freeze({
    artifactBytesApprox: 881_089_605,
    // Additional room for the small app and browser storage overhead. This is
    // a disk-space check; it does not establish available operating memory.
    minimumFreeStorageBytes: 1_050_000_000,
    largestTensorBytes: 116_686_848,
    runtimeVersion: '0.2.80',
  }),
})
