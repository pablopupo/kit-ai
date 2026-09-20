import { PHONE_CANDIDATE } from './modelProfiles.js'
export { MEDICAL_3B_BASELINE, PHONE_CANDIDATE } from './modelProfiles.js'

// Keep these import names for existing consumers, but use the separately
// approved phone candidate. Its new model ID requires fresh download consent.
export const MEDICAL_TRIAL_REVISION = PHONE_CANDIDATE.revision
export const MEDICAL_TRIAL_MODEL_ID = PHONE_CANDIDATE.modelId
export const MEDICAL_TRIAL_DOWNLOAD_BYTES = PHONE_CANDIDATE.downloadBytes
export const MEDICAL_TRIAL_DOWNLOAD_GB = PHONE_CANDIDATE.downloadGB
export const MEDICAL_TRIAL_RECORD = PHONE_CANDIDATE.record
export const MEDICAL_TRIAL_CONSENT_KEY = PHONE_CANDIDATE.consentKey

export function isMedicalTrial(search = '') {
  return new URLSearchParams(search).get('trial') === 'medical3b'
}
