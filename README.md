# KIT AI

A mobile-friendly first-aid reference and experimental health assistant.

**Personal deployment:** https://kit-ai-pablopupo.vercel.app

KIT AI provides general information. It cannot diagnose a condition or replace professional care. In an emergency, contact the local emergency number without waiting for an AI answer.

## Three clearly separated experiences

| Experience | Internet | Model / source |
| --- | --- | --- |
| First-aid guides | Available offline after the app finishes its first online load | Six source-linked summaries from NHS, American Red Cross and AHA guidance |
| Online medical chat | Required | `Pablo305/llama3-medical-3b-4bit` through the owner's Hugging Face Space |
| Optional local AI | Required for first download; cached afterward on compatible devices | General-purpose Llama 3.2 1B, or a configured MLC-format model |

Guides and navigation work even when WebGPU or an AI service is unavailable. No model weights download until the user chooses **Download local AI**. Online chat is explicitly labeled and sends the question and recent conversation to Hugging Face. Avoid identifying information.

**Current online-model status:** the frontend is integrated with the intended Space, but the existing deployed Space failed a synthetic inference check on 2026-09-18. The repaired Space files in `huggingface-space/` must be uploaded from the owner's Hugging Face account and GPU inference must pass before this is considered working end to end.

## Why a model URL alone did not fix chat

The old frontend used general-purpose `Llama-3.2-1B-Instruct`, not the published medical model. The medical checkpoint is a 2.24 GB bitsandbytes NF4 Transformers model. WebLLM requires converted MLC weights and a matching compiled WebGPU runtime; these formats are not interchangeable.

The existing Space also used a Hub dependency incompatible with its exported Transformers 5 tokenizer, bypassed the tokenizer's chat template, and cut answers to a fixed number of sentences. The replacement Space uses compatible dependencies and the saved chat template, preserving complete generated responses and identifying token-limit cutoffs.

Changing prompts does not establish medical reliability. The model has not had formal clinical evaluation; its model card still needs training-data and methodology details.

## Run locally

```sh
cd frontend
npm ci
npm run dev
```

The app starts with bundled guides. No keys, backend, or database are needed. An internet connection and an operational public HF Space are needed for online chat.

```sh
npm test
npm run build
npm run preview
```

Use the production preview to verify service-worker/offline behavior; the development server intentionally does not register the production cache.

## Configure models

Copy `frontend/.env.example` only when overriding defaults.

| Variable | Purpose |
| --- | --- |
| `VITE_MEDICAL_SPACE` | Public Gradio Space, default `Pablo305/offline-medical-assistant`; `/ask(question, n, max_tokens)` |
| `VITE_WEBLLM_MODEL_URL` | Optional **MLC** model repository; never a raw bitsandbytes checkpoint |
| `VITE_WEBLLM_MODEL_ID` | Identifier for the custom browser model |
| `VITE_WEBLLM_MODEL_LIB` | Required with a custom model: architecture/quantization-compatible WebGPU WASM URL |
| `VITE_BACKEND_URL` | Optional legacy TTS backend; unset uses browser speech |

`VITE_` settings are public client configuration. Never put API keys or HF tokens in them. A private Space needs a separate authenticated server integration; the default browser client deliberately has no token.

See [Space repair and deployment](huggingface-space/README.md).

## Deploy on Vercel

The Vercel project root is **frontend**. `frontend/vercel.json` defines the Vite build and response headers.

```sh
cd frontend
vercel link --project kit-ai-pablopupo
vercel --prod
```

This deploys the web app, not the GPU model. The medical model runs on Hugging Face; Vercel does not host its weights or GPU inference. ZeroGPU can sleep, queue requests, or exhaust quota. The UI provides a stop action, bounded wait, and access to guides when this happens.

## Mobile and offline

- Responsive navigation and multiline composer, touch targets, safe-area padding, keyboard-aware viewport sizing, and zoom support.
- Installable PWA with standalone display and 192/512 pixel icons.
- Offline app shell and source-linked guide text after a successful initial cache; linked source websites still require internet.
- Optional local AI needs browser WebGPU support and substantial device memory. A successful API check does not guarantee a specific phone can hold the model.
- Browser storage can be cleared or evicted. Test offline access before relying on saved content.
- Conversation history stays in the current browser; errors saving it are visible, and deleting another conversation does not change the open conversation.

## Source structure

- `frontend/src/components/`: guides, chat, history, settings, speech controls.
- `frontend/src/services/firstAidGuides.js`: active guide library with scope, source links, and check dates.
- `frontend/src/services/chatPrompt.js`: bounded recent history and relevant complete reference blocks.
- `frontend/src/services/onlineMedicalService.js`: lazy Gradio client, timeout/cancellation, explicit errors.
- `frontend/src/services/webllmService.js`: optional local engine and explicit custom-model configuration.
- `huggingface-space/`: GPU service repair and GPU-free prompt/output regression tests.
- `backend/`: legacy optional Express/MongoDB/Gemini/TTS pipeline, not deployed by this frontend project.

The historical `frontend/public/medical-knowledge.json` and `packs/learned.json` are generated prototype content. They are not used by the new guide library or chat grounding and are not clinician-reviewed.

## Validation and next work

Automated checks cover guide matching, excluding adult instructions for explicitly pediatric requests, complete source/context bounds, conversation persistence and deletion, and Space prompt/output behavior. Browser checks cover phone layouts, unavailable WebGPU, navigation, and offline reload. Responsive emulation is not a physical-device certification.

See [IMPROVEMENTS.md](IMPROVEMENTS.md) for the prioritized next steps and remaining model blocker.

## Team

Originally built by a five-person hackathon team. Pablo's original contributions included IndexedDB medical retrieval, online/offline speech fallback, Vercel deployment fixes, and the published medical checkpoint. This cleanup preserves the existing project and makes its runtime modes and limitations explicit.
