# KIT AI: next improvements

**Current phone status:** commit `5027de9` is live at the same personal site. On
the owner's physical iPhone, Safari on iOS 26.0 loaded the saved Qwen model and
reached “Ready without internet.” The owner confirmed airplane mode with Wi-Fi
off; inspection showed `navigator.onLine: false` and an uncached same-origin
request failed. Kit then generated fresh English and Spanish answers offline and reached
readiness again after an offline page reload. Full Safari process exit and
Android remain unverified. These are runtime observations, not medical accuracy
results. See [phone observations](verification/iphone-startup-observations.json).

## Current product and evidence

Kit's main purpose is one simple chat that can generate health answers without
internet. Keep the current pink/mint interface and English/Spanish support. First
aid, conversations and settings remain secondary; more setup screens or model
choices are not the next improvement.

The current browser experiment is the owner-approved Qwen2.5 1.5B candidate,
pinned to revision `9bd564b064631febf14deadcac492efb761d60c3`. Its roughly 0.9 GB
download has a separate approval and cache identity. The owner's converted 3B
medical model is preserved as a baseline. Once preparation succeeds, the main
chat prefers the saved model online and offline. Until then, an allowed connected
request can use the owner's Hugging Face Space. Kit does not insert a saved guide
as if it were a generated answer.

Both the earlier 3B model and the smaller candidate have generated after full
offline browser reopening on tested desktop configurations. The candidate
produced 24 desktop answers, including 22 with network transport blocked. See
[candidate verification](verification/phone-candidate.md) and the historical
[3B main-chat checks](verification/simple-chat.md). These results do not establish
support across phones or medical accuracy. The current 118 frontend tests pass.

The current investigation found that WebLLM 0.2.80's cache-presence checks retrieve
full model shards with IndexedDB `get()`. A bounded local patch uses `getKey()` to
check existence without retrieving shard values. It changes no model, weights,
cache identity or download approval. The real saved-model comparison reduced
cumulative returned weight bytes from 4.34 GB to 0.87 GB; offline desktop answers
and native WebKit storage checks pass. This is not a peak-memory measurement or
a successful phone-fix claim. That build still stopped after 23 of 30 cached
shards on the connected iPhone, followed by a restart; an OS-level memory failure
was not established. See [cache-presence verification](verification/cache-presence.md).

The subsequent direct GPU upload patch skips temporary CPU tensors and FFI
staging for eligible records without changing weights or download approval. The
desktop comparison measured model WASM linear memory at readiness of 353,370,112
bytes before and 167,772,160 bytes after; this is not total or peak process RAM.
The physical iPhone then completed all 30 shards and shader compilation, reaching
readiness in one observed 2.551-second load, not a benchmark. Evidence:
[direct-upload verification](verification/direct-gpu-loading.md),
[raw comparison](verification/direct-gpu-loading-results.json), and
[phone observations](verification/iphone-startup-observations.json).
Earlier [GPU-limit corrections](verification/phone-gpu-limits.md) and
[startup recovery](verification/startup-recovery.md) remain historical evidence.

## Next work, in order

1. **Extend the physical offline checks.** Loading, fresh English/Spanish answers and
   page reloading now succeed on the reported iPhone in airplane mode with Wi-Fi
   off. Check a full Safari process exit and Android Chrome separately; do not
   extend one phone's result to every phone or browser.
2. **Evaluate the answers people actually receive.** Run the current main-chat
   prompts and runtime on the frozen English/Spanish cases. Review unsupported
   claims, missed warning signs, follow-ups, language and age scope against the
   sources. Keep raw outputs and exact model/runtime settings. The owner can
   review clarity; medical correctness needs qualified review.
3. **Choose one measured model improvement together.** Address source coverage
   and adherence first, then use remaining findings to decide whether a targeted
   fine-tuning experiment addresses the gap.
   Review examples and the proposed method with the owner before new training,
   paid compute or replacing the checkpoint. Keep held-out cases separate from
   training and repeat the browser evaluation after quantization.

## Model work already completed

Twenty synthetic English/Spanish cases, a local float export, MLC conversion, an
original-NF4 versus float parity check, and targeted retrieval/follow-up reruns
are recorded in [the evaluation plan](evaluations/README.md). The original
checkpoint reproduced an unsafe infant answer; conversion did not introduce
that particular failure. The recovered historical prompt also failed selected
difficult cases. Willingness to answer is not medical reliability.

Earlier stock Llama 1B and Qwen3 0.6B/1.7B comparisons remain historical baselines,
distinct from the current Qwen2.5 1.5B candidate. A targeted whole-guide follow-up
change improved one Spanish burn answer, but other errors and incomplete answers remain. Current
retrieval is lexical matching over six bilingual guides; there is no embedding
index or live web search.

No training notebook or dataset was found in the public Hugging Face inventory or
nine reachable repository revisions. The config suggests an Unsloth export. The
historical inference prompt was recovered; original training artifacts may still
exist elsewhere. No new training job has been started.

The existing Hugging Face Space has answered connected test questions on its
ZeroGPU hardware. That is evidence of online inference only, and quota/cold-start
constraints remain relevant. The physical iPhone runtime checks above do not
establish clinical reliability or Android support.
