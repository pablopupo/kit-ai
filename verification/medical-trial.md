# Medical model phone trial

The normal app's online/offline model defaults are unchanged. The explicit
`/?trial=medical3b` route mounts a separate assistant: it never calls the hosted
answer service or falls back to the general 1B model. Trial conversations exist
in component memory only; they are not included in reports or normal history.
The speech provider is not mounted for this route.

## Publication status

The converted 3B weights and matching runtime are staged locally in
`../model-conversion/phone-trial-upload/`. The intended distinct repository is
`Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC`. The model card is tracked in
`model-tools/phone-trial-model-card.md`. The original checkpoint is unchanged.

**Upload is pending Hugging Face authentication.** `MEDICAL_TRIAL_RECORD` remains
null until the uploaded files are verified and an immutable commit is set in
`medicalTrialConfig.js`. The route truthfully shows that the trial is unavailable
and offers no download. Do not set a guessed revision or use a mutable main URL.

## Before a phone downloads

- An asset-free worker requests the same GPU features and limits as the pinned
  WebLLM 0.2.80 runtime. Missing half precision or inadequate limits fail first.
- In particular, this runtime's 128 MiB fallback cannot hold the 188 MiB embedding,
  even on an adapter reporting 256 or 512 MiB. A generic WebGPU boolean is not enough.
- Known free storage below 2.1 GB prevents a new model download; unknown quota
  remains unknown. Passing does not establish available working memory.
- The trial asks separately for its roughly 1.83 GB download. The earlier 750 MB
  approval cannot authorize it. Consent is tied to the exact trial artifact ID.
- The page and runtime save before weights. Pause cancels initialization and
  revokes automatic resume; an explicit retry queues safely while cancellation drains.
- A previously approved version loads on reopening. Only successful loading plus
  app/runtime/model cache checks enable the saved indicator. Actual offline
  reopening and fresh generation on the physical phone remain to be tested.

## Verification scope

- Pure GPU/storage tests exercise binding limits, real request-device arguments,
  cleanup, denied/unknown storage, worker errors and timeouts.
- `verify-medical-trial-lifecycle.mjs` mounts the real hook under React StrictMode
  with fake GPU/storage/SDK operations. It checks consent, cancellation, exact model
  selection, cached reopening, unmounting and failure/retry. It is not inference.
- `evaluations/results/medical-3b-follow-up-2026-09-19.json` contains four actual
  desktop GPU generations with the owner's converted checkpoint. Retaining the
  relevant guide corrected the Spanish butter-on-burn follow-up in this small
  comparison. English rejected butter with both prompts. Answers still lacked a
  useful next step; medical and multilingual review remain incomplete.

## Remaining physical test

After publication, open the trial URL in Safari while on Wi-Fi, approve the
download if the compatibility check passes, and generate a synthetic example.
Then enable airplane mode, turn Wi-Fi off, reopen the exact same trial URL in
the same browser and generate a fresh question. Repeat on Android Chrome.
Record failure stage and timings through Help. Network flags are supporting
observations, not independent proof of airplane mode. A correct model identity
and successful generation are not medical-quality approval.

If the 3B model cannot run reliably on the phone, use those measurements when
choosing a smaller model/training experiment with the owner. No new training
or automatic substitution is part of this change.
