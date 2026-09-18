# KIT AI

A mobile-friendly first-aid reference and experimental health assistant.

**Personal deployment:** https://kit-ai-pablopupo.vercel.app

KIT AI provides general information. It cannot diagnose a condition or replace professional care. In an emergency, contact the local emergency number without waiting for an AI answer.

## One Ask Kit experience

Ask Kit chooses the available assistant automatically. It prefers the owner's
fine-tuned Hugging Face model when connected, uses the prepared browser model
when offline (or when online answers are disabled), and can show matching saved
guides if the device cannot run AI. There is no model-mode selector in chat.
Generated answers remain enabled; reference excerpts are clearly identified.

| Capability | What is available |
| --- | --- |
| English and Spanish | Interface, complete guides, bilingual search, requested AI answer language and browser speech language |
| Automatic offline preparation | Downloads the current browser model on supported devices, shows progress/pause/retry, reuses cached files on later visits, requests persistent storage |
| Online assistant | `Pablo305/llama3-medical-3b-4bit` through the owner's existing Space |
| Browser assistant | Experimental general-purpose Llama 3.2 1B; **not the same weights as the fine-tuned medical model** |
| Offline retrieval | Bilingual keyword matching over six whole source-linked guides; relevant complete guidance is included in model prompts |
| Web search | Not implemented; online model inference does not browse the internet |
| Device check | Settings → Check this device, or `/#device-check`; local synthetic generation, guided offline reopen, and a local diagnostic report |

The first browser-model cache measured about 718 MB on the test machine. The
app precaches about 11 MB of runtime/worker JavaScript so it can reopen offline
even when initial preparation starts before service-worker control. Known
cellular/Data Saver connections defer the first model download; browser network
information is not available everywhere. Pause and online-answer preferences live
in Settings. Browser storage may be evicted or cleared.

Online questions and prior **online** turns are sent to Hugging Face. Earlier
device-only and guide-only turns are excluded from cloud history. Turning off
online answers keeps new questions on the device. Avoid identifying information.

**Current online-model status:** the repaired Space is deployed and real inference passed on 2026-09-18. A synthetic scrape-care question succeeded through the live Vercel frontend, and a first-aid-kit question succeeded through the official Gradio client (17.24 seconds). Runtime commit `adb12bb2fcb5c477e09acb140cc195bf44947e4e` uses the intended pinned medical checkpoint. These are functional smoke checks, not clinical accuracy validation.

## Why a model URL alone did not fix chat

The old frontend used general-purpose `Llama-3.2-1B-Instruct`, not the published medical model. The medical checkpoint is a 2.24 GB bitsandbytes NF4 Transformers model. WebLLM requires converted MLC weights and a matching compiled WebGPU runtime; these formats are not interchangeable.

The existing Space also used a Hub dependency incompatible with its exported Transformers 5 tokenizer, bypassed the tokenizer's chat template, and cut answers to a fixed number of sentences. The replacement Space uses compatible dependencies and the saved chat template, preserving complete generated responses and identifying token-limit cutoffs.

Changing prompts does not establish medical reliability. The model has not had formal clinical evaluation; its model card still needs training-data and methodology details.

**Latest model experiment (2026-09-18):** the original NF4 checkpoint was locally
dequantized and exported to MLC without retraining. Twenty EN/ES cases ran on the
float export. An infant-choking failure was independently reproduced on the
original NF4 checkpoint and matched the float export token for token on CPU.
Other findings include missing steps, source contradictions and a Spanish refusal.
The recovered historical prompt also produced serious errors. The conversion is
an evaluation artifact, not a production model selection or medical-quality pass.
It generated in desktop Chrome on Apple Metal and after a full offline browser
restart, using about 1.86 GB of browser storage. Real phone testing remains open.
See [evaluation results](evaluations/README.md) and [conversion tooling](model-tools/README.md).

## Run locally

```sh
cd frontend
npm ci
npm run dev
```

The app starts with bundled guides and automatically checks whether it can prepare its browser assistant. No keys, backend, or database are needed. An internet connection and an operational public HF Space are needed for online chat.

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
- Offline generated answers need working WebGPU in a worker and substantial device memory. Safari 26 and some Android browsers support it; support and memory differ by device. Firefox, older phones and unsupported GPUs retain guides and online access. A successful API probe alone does not guarantee the model fits.
- Browser storage can be cleared or evicted. Test offline access before relying on saved content.
- The device-check page uses a fixed harmless prompt, empty chat history, and the existing local engine with no cloud fallback. A nonempty generated answer passes only the runtime check. Offline claims distinguish the browser's network flag from the user's confirmation of closing/reopening; neither establishes universal device support.
- Conversation history is stored in the current browser; only online turns are eligible for later online request context. Errors saving history are visible, and deleting another conversation does not change the open conversation.

## Source structure

- `frontend/src/components/`: guides, chat, history, settings, speech controls.
- `frontend/src/services/firstAidGuides.js`: active guide library with scope, source links, and check dates.
- `frontend/src/services/chatPrompt.js`: bounded recent history and relevant complete reference blocks.
- `frontend/src/services/onlineMedicalService.js`: lazy Gradio client, timeout/cancellation, explicit errors.
- `frontend/src/services/webllmService.js`: automatically prepared browser engine, cache reuse, interrupted-stream draining and failed-worker recovery.
- `huggingface-space/`: GPU service repair and GPU-free prompt/output regression tests.
- `evaluations/`: frozen bilingual cases, exact model inputs, reproducible runners, raw outputs and a portable review worksheet generator.
- `model-tools/`: pinned checkpoint reconstruction/conversion, metadata and tokenizer checks, and original/float parity checks. Large weights remain outside Git.
- `backend/`: legacy optional Express/MongoDB/Gemini/TTS pipeline, not deployed by this frontend project.

The historical `frontend/public/medical-knowledge.json` and `packs/learned.json` are generated prototype content. They are not used by the new guide library or chat grounding and are not clinician-reviewed.

## Validation and next work

Automated checks cover guide matching, excluding adult instructions for explicitly pediatric requests, complete source/context bounds, conversation persistence and deletion, and Space prompt/output behavior. Browser checks cover phone layouts, unavailable WebGPU, navigation, and offline reload. Responsive emulation is not a physical-device certification.

Real hardware checks on Apple Metal verified automatic loading, cached offline
reload (about five seconds), and generation without model-network requests. This
is not a physical iPhone/Android certification. The current browser Llama refused
basic cut/burn questions during evaluation. Qwen 0.6B and 1.7B comparisons answered
but omitted or contradicted source guidance, so they were not silently substituted
for the owner's model. Functional offline AI is established; reliable offline
medical answer quality remains work to do.

See [IMPROVEMENTS.md](IMPROVEMENTS.md) and the [learning plan](evaluations/README.md)
for next steps. The historical Space prompt is preserved in
[evaluations/original-space-prompt.txt](evaluations/original-space-prompt.txt).
No new fine-tuning job has been launched.

## Team

Originally built by a five-person hackathon team. Pablo's original contributions included IndexedDB medical retrieval, online/offline speech fallback, Vercel deployment fixes, and the published medical checkpoint. This cleanup preserves the existing project and makes its runtime modes and limitations explicit.
