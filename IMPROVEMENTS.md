# KIT AI: next improvements

**Latest phone report:** the GPU check now passes, but Safari stops while opening the cached AI. The loading feedback, interrupted-startup guard and bounded memory reductions are documented in [startup recovery](verification/startup-recovery.md). Physical offline generation on that phone remains unverified.

## Current product and evidence

Kit's main purpose is one simple chat that can generate health answers without
internet. Keep the current pink/mint interface and English/Spanish support. First
aid, conversations and settings remain secondary; more setup screens or model
choices are not the next improvement.

Release `abcef5b` uses the owner's converted 3B medical checkpoint, pinned to
Hugging Face revision `34f6aa7d8fb5608dc2585e6660b982610ca4bc28`. After the user
approves the 1.83 GB download and preparation succeeds, the main chat prefers
that saved model both online and offline. Existing downloads from the earlier
trial are reused; the old trial URL now opens the same main chat. If the local
model is not ready, an allowed connected request can use the owner's Hugging Face
Space. Kit does not insert a saved guide as if it were a generated answer.

The released main chat passed a desktop Chrome/Apple Metal test that closed the
browser, stopped the app server, blocked transport, reopened the saved app and
generated a fresh answer without model-shard requests or inference requests.
The UI also passed phone-sized Chromium/WebKit checks in English and Spanish.
See [simple-chat verification](verification/simple-chat.md). These results do not
establish physical phone support or medical accuracy.

The owner's subsequent iPhone report shows **offline AI is not working there**:
`status: unsupported`, `reason: storage-binding-limit`, and `offlineSaved: false`.
The adapter reports a 429,496,728-byte storage-binding limit, but the pinned SDK's
device request selects 134,217,728 bytes. Saving the small app succeeded; saving
and running its AI did not. The bounded GPU-limit correction now passes real
desktop generation with native 256 MiB buffer limits, including offline reopening.
Physical iPhone retesting remains pending. Track release status and scope in
[phone GPU-limit verification](verification/phone-gpu-limits.md).

## Next work, in order

1. **Make the saved model run on the reported iPhone.** Verify the GPU-limit
   correction on the exact downloaded checkpoint. The constrained desktop test
   now passes; confirm a full close/reopen and a fresh generated answer with airplane
   mode on and Wi-Fi off on the physical phone. A successful preflight alone does
   not establish sufficient working memory or offline generation. Test Android
   Chrome separately; do not promise every phone or browser.
2. **Evaluate the answers people actually receive.** Run the current main-chat
   prompts and runtime on the frozen English/Spanish cases. Review unsupported
   claims, missed warning signs, follow-ups, language and age scope against the
   sources. Keep raw outputs and exact model/runtime settings. The owner can
   review clarity; medical correctness needs qualified review.
3. **Choose one measured model improvement together.** Use the findings to decide
   whether a prompt/reference change or a training experiment addresses the gap.
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

Earlier stock Llama 1B and Qwen comparisons remain historical baselines, not the
current browser model. A targeted whole-guide follow-up change improved one
Spanish burn answer, but other errors and incomplete answers remain. Current
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
