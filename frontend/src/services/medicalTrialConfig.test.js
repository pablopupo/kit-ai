import test from 'node:test'
import assert from 'node:assert/strict'
import { isMedicalTrial, MEDICAL_TRIAL_CONSENT_KEY, MEDICAL_TRIAL_MODEL_ID, MEDICAL_TRIAL_RECORD } from './medicalTrialConfig.js'

test('trial is explicit and old production download approval cannot authorize it', () => {
  assert.equal(isMedicalTrial(''), false)
  assert.equal(isMedicalTrial('?trial=1'), false)
  assert.equal(isMedicalTrial('?trial=medical3b'), true)
  assert.equal(isMedicalTrial('?other=medical3b'), false)
  assert.notEqual(MEDICAL_TRIAL_CONSENT_KEY, 'kit-ai-offline-download-approved')
  assert.ok(MEDICAL_TRIAL_CONSENT_KEY.includes(MEDICAL_TRIAL_MODEL_ID))
})

test('a published trial pins both weights and runtime to one immutable revision', () => {
  if (!MEDICAL_TRIAL_RECORD) return
  assert.match(MEDICAL_TRIAL_RECORD.model, /\/resolve\/[0-9a-f]{40}\/$/)
  assert.equal(MEDICAL_TRIAL_RECORD.model_lib, `${MEDICAL_TRIAL_RECORD.model}model.wasm`)
  assert.deepEqual(MEDICAL_TRIAL_RECORD.required_features, ['shader-f16'])
})
