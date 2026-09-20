import { probeMedicalModelGPU } from '../services/modelTrialSupport.js'

// Runs where WebLLM runs. A main-window adapter alone is insufficient evidence.
let gpu
try { gpu = globalThis.navigator?.gpu } catch { /* Restricted environment. */ }
probeMedicalModelGPU(gpu).then(result => {
  self.postMessage(result)
  self.close()
})
