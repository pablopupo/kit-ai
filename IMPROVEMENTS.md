# KIT AI: next improvements

**Latest phone report:** the smaller Qwen model was interrupted at `model-loading`
after download. On reopening, the app/runtime files were saved, but
`offlineSaved` was false and `check` was null. Offline AI still does not work on
the reported iPhone. The report does not prove an OS-level out-of-memory cause;
direct capture of the phone failure remains pending.

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
physical phone support or medical accuracy. The current 113 frontend tests pass.

The current investigation found that WebLLM 0.2.80's cache-presence checks retrieve
full model shards with IndexedDB `get()`. A bounded local patch uses `getKey()` to
check existence without retrieving shard values. It changes no model, weights,
cache identity or download approval. The real saved-model comparison reduced
cumulative returned weight bytes from 4.34 GB to 0.87 GB; offline desktop answers
and native WebKit storage checks pass. This is not a peak-memory measurement or
a successful phone-fix claim. See [cache-presence verification](verification/cache-presence.md).
Earlier [GPU-limit corrections](verification/phone-gpu-limits.md) and
[startup recovery](verification/startup-recovery.md) remain separate evidence.

## Next work, in order

1. **Make the saved model run on the reported iPhone.** Verify the cache-presence
   change with the same candidate and capture the physical phone's loading
   behavior. Then confirm a full close/reopen and a fresh answer with airplane
   mode on and Wi-Fi off. A successful preflight or completed download alone does
   not establish offline generation. Test Android Chrome separately; do not
   promise every phone or browser.
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
constraints remain relevant. Clinical reliability and physical offline AI on
iPhone and Android remain unestablished.
