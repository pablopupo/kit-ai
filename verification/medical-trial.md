# Medical model phone trial

The normal app's online/offline model defaults are unchanged. The explicit
`/?trial=medical3b` route mounts a separate assistant: it never calls the hosted
answer service or falls back to the general 1B model. Trial conversations exist
in component memory only; they are not included in reports or normal history.
The speech provider is not mounted for this route.

## Publication status

Published on 2026-09-19 in the distinct repository
[`Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC`](https://huggingface.co/Pablo305/Llama-3.2-3B-Kit-Medical-q4f16_1-MLC).
`medicalTrialConfig.js` pins both the weights and runtime to immutable revision
`34f6aa7d8fb5608dc2585e6660b982610ca4bc28`. The original checkpoint is unchanged.
The model card is tracked in `model-tools/phone-trial-model-card.md`.

Anonymous publication verification matched all 67 staged files and 1,830,911,064
bytes against public sizes and SHA-256 hashes. All 63 browser assets passed CORS
checks on redirects and final responses. Six transient header-request timeouts
cleared on one targeted retry; the report retains those initial failures.
See [`phone-trial-publication.json`](../model-tools/results/phone-trial-publication.json)
and `model-tools/verify_phone_trial_publication.py`. These checks establish
publication integrity, not successful phone inference or medical accuracy.

The trial is deployed at
[`https://kit-ai-pablopupo.vercel.app/?trial=medical3b`](https://kit-ai-pablopupo.vercel.app/?trial=medical3b)
in Vercel deployment `dpl_H1qvSb9dk83m4GPvXUrVJPdXNZVB`.
The public alias serves the expected `index-BCqTJ6oC.js` build. A fresh desktop
Chrome profile at a 390×844 mobile viewport shows the English and Spanish
1.83 GB approval buttons without external requests, horizontal overflow or page
errors. This live check did not approve or repeat the download. See
[`medical-trial-live-results.json`](medical-trial-live-results.json).

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

- `verify-medical-trial-hosted.mjs` runs the built app in a separate desktop Chrome
  profile with hardware WebGPU. It verifies separate consent, downloads all 58
  shards from the pinned public revision, generates a synthetic answer, closes
  Chrome completely, stops its own app server, then reopens offline and asks a
  fresh question. It uses no model mocks or locally substituted weights. Run after
  building `frontend/dist` with `KIT_PLAYWRIGHT_MODULE` pointing to an installed
  Playwright module if it is not available through normal module resolution.
- On 2026-09-19, desktop Chrome on Apple Metal downloaded the 58 public shards
  after approval and generated a synthetic small-cut answer. After full browser
  exit, with its app server stopped and browser network requests blocked, it
  reopened from saved files and generated a fresh answer in 0.824 seconds.
  An uncached external request failed with `ERR_INTERNET_DISCONNECTED`; no model
  shard or inference request accompanied that answer. Chrome's `navigator.onLine`
  nevertheless stayed true under this emulation. The report retains that mismatch,
  earlier harness assertion failures, and raw synthetic outputs; the browser flag
  was not spoofed. This establishes desktop cached-generation mechanics only.
  See [`medical-trial-hosted-results.json`](medical-trial-hosted-results.json).
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

Open the trial URL in Safari while on Wi-Fi, approve the
download if the compatibility check passes, and generate a synthetic example.
Then enable airplane mode, turn Wi-Fi off, reopen the exact same trial URL in
the same browser and generate a fresh question. Repeat on Android Chrome.
Record failure stage and timings through Help. Network flags are supporting
observations, not independent proof of airplane mode. A correct model identity
and successful generation are not medical-quality approval.

If the 3B model cannot run reliably on the phone, use those measurements when
choosing a smaller model/training experiment with the owner. No new training
or automatic substitution is part of this change.
