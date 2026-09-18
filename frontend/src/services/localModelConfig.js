export const LOCAL_MODEL_ID = import.meta.env.VITE_WEBLLM_MODEL_URL
  ? import.meta.env.VITE_WEBLLM_MODEL_ID || 'kit-ai-medical-v1'
  : 'Llama-3.2-1B-Instruct-q4f32_1-MLC'

export const LOCAL_MODEL_LABEL = import.meta.env.VITE_WEBLLM_MODEL_URL ? 'Custom device model' : 'Llama 3.2 1B'
