import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isMedicalTrial, MEDICAL_TRIAL_CONSENT_KEY, MEDICAL_TRIAL_MODEL_ID, MEDICAL_TRIAL_RECORD, MEDICAL_TRIAL_DOWNLOAD_BYTES, MEDICAL_TRIAL_DOWNLOAD_GB, MEDICAL_3B_BASELINE, PHONE_CANDIDATE } from './medicalTrialConfig.js'

test('trial is explicit and old production download approval cannot authorize it', () => {
  assert.equal(isMedicalTrial(''), false)
  assert.equal(isMedicalTrial('?trial=1'), false)
  assert.equal(isMedicalTrial('?trial=medical3b'), true)
  assert.equal(isMedicalTrial('?other=medical3b'), false)
  assert.notEqual(MEDICAL_TRIAL_CONSENT_KEY, 'kit-ai-offline-download-approved')
  assert.ok(MEDICAL_TRIAL_CONSENT_KEY.includes(MEDICAL_TRIAL_MODEL_ID))
})

test('the phone candidate pins both weights and runtime to immutable revisions', () => {
  if (!MEDICAL_TRIAL_RECORD) return
  assert.match(MEDICAL_TRIAL_RECORD.model, /\/resolve\/[0-9a-f]{40}\/$/)
  assert.match(MEDICAL_TRIAL_RECORD.model_lib, /^https:\/\/raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\/[0-9a-f]{40}\/web-llm-models\/v0_2_80\/Qwen2-1\.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu\.wasm$/)
  assert.deepEqual(MEDICAL_TRIAL_RECORD.required_features, ['shader-f16'])
})

test('candidate download approval cannot reuse or overwrite the retained medical baseline', () => {
  assert.equal(MEDICAL_3B_BASELINE.modelId, 'kit-medical-3b-df5aa311-q4f16_1-34f6aa7d8fb5608dc2585e6660b982610ca4bc28')
  assert.equal(MEDICAL_3B_BASELINE.consentKey, `kit-ai-trial-download-approved:${MEDICAL_3B_BASELINE.modelId}`)
  assert.equal(MEDICAL_3B_BASELINE.record.model_lib, `${MEDICAL_3B_BASELINE.record.model}model.wasm`)
  assert.equal(MEDICAL_TRIAL_MODEL_ID, PHONE_CANDIDATE.modelId)
  assert.notEqual(MEDICAL_TRIAL_CONSENT_KEY, MEDICAL_3B_BASELINE.consentKey)
  assert.notEqual(MEDICAL_TRIAL_RECORD.model, MEDICAL_3B_BASELINE.record.model)
})

test('download size and tensor limits match the pinned artifact inspection', () => {
  const report = JSON.parse(readFileSync(new URL('../../../model-tools/results/phone-candidate-artifacts.json', import.meta.url), 'utf8'))
  assert.equal(MEDICAL_TRIAL_DOWNLOAD_BYTES, report.files.reduce((sum, asset) => sum + asset.bytes, 0))
  assert.equal(MEDICAL_TRIAL_DOWNLOAD_BYTES, report.artifactDownloadBytes)
  assert.ok(MEDICAL_TRIAL_DOWNLOAD_GB * 1e9 >= MEDICAL_TRIAL_DOWNLOAD_BYTES)
  assert.ok(PHONE_CANDIDATE.requirements.minimumFreeStorageBytes > MEDICAL_TRIAL_DOWNLOAD_BYTES)
  assert.equal(PHONE_CANDIDATE.requirements.largestTensorBytes, report.largestTensorBytes)
  assert.equal(MEDICAL_TRIAL_RECORD.model_lib, report.runtime.url)
  assert.equal(report.parameterCompatibility.exactNamesShapesDtypes, true)
  assert.equal(report.runtime.compiledMetadata.context_window_size, MEDICAL_TRIAL_RECORD.overrides.context_window_size)
})
