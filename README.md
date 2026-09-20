# KIT AI

A simple, experimental health chat that can generate answers without internet after download on a compatible device.

**Personal deployment:** https://kit-ai-pablopupo.vercel.app

KIT AI provides general information. It cannot diagnose a condition or replace professional care. In an emergency, contact the local emergency number without waiting for an AI answer.

## One Ask Kit experience

Kit opens directly into one chat. A single setup card offers a one-time download,
then disappears when the assistant is ready. The approved smaller Qwen candidate
answers on the device whenever loaded, even with Wi-Fi on. Before it is ready,
online answers are available if enabled. When neither is available, Kit explains
what is missing and keeps the question; it never substitutes a guide as an AI reply.
Conversations, first-aid notes and settings live behind one header menu. There is
no separate trial flow, model selector, bottom navigation or diagnostic dashboard.

| Capability | What is available |
| --- | --- |
| English and Spanish | Interface, complete guides, bilingual search and requested AI answer language |
| Offline preparation | Saves the small app automatically; asks once for the roughly 0.9 GB phone candidate, then loads saved files automatically unless paused or interrupted |
| Online assistant | `Pablo305/llama3-medical-3b-4bit` through the owner's existing Space |
| Browser assistant | Approved Qwen2.5 1.5B experiment, immutable weights/runtime in `modelProfiles.js`; original medical 3B retained as a baseline |
| Offline retrieval | Bilingual keyword matching over six whole source-linked guides; relevant complete guidance is included in model prompts |
| Web search | Not implemented; online model inference does not browse the internet |
| Help | Menu → Settings → Help; optional report excludes conversations and browser identity |

The current download contains 881,089,605 bytes of model/runtime files, rounded
up to 0.9 GB in the download offer. The
app precaches its small shell independently of the large assistant JavaScript.
Assistant preparation begins only after the user agrees to the download and the
app cache/control check passes. A ready engine alone no longer means offline
files are saved. The Qwen candidate has its own approval and cache identity;
earlier 750 MB or 1.83 GB approvals do not authorize it. Original 3B files and
preferences are preserved. A deliberate
pause survives reload and reconnect. Browser storage may be evicted or cleared.

The previous coupled precache could fail when one assistant file failed, leaving
the online page usable but offline refresh broken. This was reproduced and fixed;
it does not establish the exact failure cause on the reported iPhone.
See [offline-refresh verification](verification/offline-refresh.md).

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
not a medical-quality pass. The converted checkpoint now powers the experimental
main chat at that time with those limitations disclosed; clinical review remains outstanding.
It generated in desktop Chrome on Apple Metal and after a full offline browser
restart, using about 1.86 GB of browser storage. Real phone testing remains open.
See [evaluation results](evaluations/README.md) and [conversion tooling](model-tools/README.md).

**Smaller phone experiment (2026-09-20 UTC):** after the owner reported repeated
iPhone crashes while opening the 3B model, the owner approved testing Qwen2.5
1.5B. The built app downloaded the pinned candidate after explicit approval and
generated 24 answers on a hardware desktop GPU with native 256 MiB buffer limits.
Twenty-two were generated after full browser exit, stopped app server and blocked
network transport. Offline reopening took 2.42 seconds in that test. These are
runtime observations, not iPhone or medical-quality certification. The 20 frozen
EN/ES development cases are retained for review. No training has started.
See [candidate verification](verification/phone-candidate.md).

## Run locally

```sh
cd frontend
npm ci
npm run dev
```

The app starts in chat. Use the production preview below to test saving and assistant preparation; those depend on the built service worker. No keys, backend, or database are needed. An internet connection and an operational public HF Space are needed for online answers before local preparation finishes.

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
| `VITE_WEBLLM_MODEL_URL`, `VITE_WEBLLM_MODEL_ID`, `VITE_WEBLLM_MODEL_LIB` | Legacy engine defaults only; the main chat passes its explicit pinned record from `medicalTrialConfig.js` |
| `VITE_BACKEND_URL` | Legacy speech backend; not mounted by the main chat |

`VITE_` settings are public client configuration. Never put API keys or HF tokens in them. A private Space needs a separate authenticated server integration; the default browser client deliberately has no token.

See [Space repair and deployment](huggingface-space/README.md).

## Deploy on Vercel

The Vercel project root is **frontend**. `frontend/vercel.json` defines the Vite build and response headers.

```sh
cd frontend
vercel link --project kit-ai-pablopupo
vercel --prod
```

This deploys the web app. Downloaded weights are hosted on Hugging Face and run
inside the browser; the optional online fallback uses the owner's Hugging Face
Space. Vercel does not run model inference. Online requests have a bounded wait
and stop action; failures preserve the question for retry.

## Mobile and offline

- Responsive navigation and multiline composer, touch targets, safe-area padding, keyboard-aware viewport sizing, and zoom support.
- Installable PWA with standalone display and 192/512 pixel icons.
- Offline app shell and source-linked guide text after a successful initial cache; linked source websites still require internet.
- Offline generated answers need working WebGPU in a worker and substantial device memory. Safari 26 and some Android browsers support it; support and memory differ by device. Firefox, older phones and unsupported GPUs retain guides and online access. A successful API probe alone does not guarantee the model fits.
- Browser storage can be cleared or evicted. Test offline access before relying on saved content.
- Readiness requires the exact loaded model plus complete app/runtime/model caches. The optional Help report describes compatibility and failure stages, not clinical accuracy or proof of airplane mode.
- Conversation history is stored in the current browser; only online turns are eligible for later online request context. Errors saving history are visible, and deleting another conversation does not change the open conversation.

## Source structure

- `frontend/src/components/Home.jsx`: the main conversation and secondary menu pages.
- `frontend/src/hooks/useOfflineAssistant.js`: pinned local model, consent, cache reuse, pause/reconnect and recovery.
- `frontend/src/services/assistantPolicy.js`: prefer the ready local model; optional online answer only before local readiness.
- `frontend/src/services/firstAidGuides.js`: active guide library with scope, source links, and check dates.
- `frontend/src/services/chatPrompt.js`: bounded recent history and relevant complete reference blocks.
- `frontend/src/services/onlineMedicalService.js`: lazy Gradio client, timeout/cancellation, explicit errors.
- `frontend/src/services/webllmService.js`: automatically prepared browser engine, cache reuse, interrupted-stream draining and failed-worker recovery.
- `frontend/src/sw.js` and `services/offlineAppService.js`: independent app/runtime saving, verified readiness, cancelable download preparation and missing-cache recovery.
- `huggingface-space/`: GPU service repair and GPU-free prompt/output regression tests.
- `evaluations/`: frozen bilingual cases, exact model inputs, reproducible runners, raw outputs and a portable review worksheet generator.
- `model-tools/`: pinned checkpoint reconstruction/conversion, metadata and tokenizer checks, and original/float parity checks. Large weights remain outside Git.
- `backend/`: legacy optional Express/MongoDB/Gemini/TTS pipeline, not deployed by this frontend project.

The historical `frontend/public/medical-knowledge.json` and `packs/learned.json` are generated prototype content. They are not used by the new guide library or chat grounding and are not clinician-reviewed.

## Validation and next work

Automated checks cover guide matching, excluding adult instructions for explicitly pediatric requests, complete source/context bounds, conversation persistence and deletion, and Space prompt/output behavior. Browser checks cover phone layouts, unavailable WebGPU, navigation, and offline reload. Responsive emulation is not a physical-device certification.

Real hardware checks on Apple Metal verified automatic loading, cached offline
reload (about five seconds), and generation without model-network requests. This
is not a physical iPhone/Android certification. The earlier stock 1B browser Llama refused
basic cut/burn questions during evaluation. Qwen 0.6B and 1.7B comparisons answered
but omitted or contradicted source guidance, so they were not silently substituted
for the owner's model. Functional offline AI is established; reliable offline
medical answer quality remains work to do.

See [simplified chat verification](verification/simple-chat.md) for the current
main-chat checks. Earlier trial reports remain historical evidence.

See [IMPROVEMENTS.md](IMPROVEMENTS.md) and the [learning plan](evaluations/README.md)
for next steps. The historical Space prompt is preserved in
[evaluations/original-space-prompt.txt](evaluations/original-space-prompt.txt).
No new fine-tuning job has been launched.

## Team

Originally built by a five-person hackathon team. Pablo's original contributions included IndexedDB medical retrieval, online/offline speech fallback, Vercel deployment fixes, and the published medical checkpoint. This cleanup preserves the existing project and makes its runtime modes and limitations explicit.
