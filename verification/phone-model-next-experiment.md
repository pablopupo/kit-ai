# Phone viability after the repeated opening crash

Recorded 2026-09-20 UTC. Following the startup-recovery release, the owner reports
another iPhone browser crash and recalls the last message as “Opening Kit…”.
This narrows the reported stage to initialization rather than showing an ongoing
transfer. There is no new device report, OS crash log, or independently confirmed
device bundle identity. The exact cause remains unconfirmed. Memory pressure is
the leading hypothesis, not a measured diagnosis.

## Decision

Do not ask for another identical 3B retry or publish another speculative memory
tweak. Keep the original fine-tuned checkpoint and current production model.
The next experiment should compare a smaller model in isolation, then invite the
owner to review actual English/Spanish answers before choosing a phone release
or starting training. No replacement, training, new weight download or deployment
was performed during this investigation.

## Why another small 3B adjustment is a weak next bet

The local converted manifest records 1,807,423,488 bytes of model weights.
The architecture has 28 layers, 8 KV heads and 128 dimensions per head. The raw
FP16 KV payload calculation is `2 × layers × KV heads × head size × tokens × 2`.

| Context tokens | Raw KV payload | Weights + raw KV, GiB |
| --- | ---: | ---: |
| 4096 (current) | 448 MiB | 2.121 |
| 2048 | 224 MiB | 1.902 |
| 1024 | 112 MiB | 1.793 |

These are partial memory budgets, not observed process peaks or a device memory
limit. They exclude browser/WASM, compilation, staging and execution workspace.
The already-shipped patch avoids an additional 197,001,216-byte temporary tensor
copy and serializes compilation on small-binding devices; it does not shrink
the weights themselves.

Reducing context to 2048 would save 224 MiB but reduce the existing conservative
prompt allowance from 3264 to 1216 bytes. At 1024, only 192 bytes remain after
the 640-token output allowance and 192-token template reserve. Neither is a
drop-in change to the complete-guide prompts. The actual compiled runtime uses
prefill 1024 and reports about 86 MiB of prefill temporary allocation; compiling
smaller chunks might reduce that, but does not remove the resident weight floor.
MLC documents [context and prefill as memory controls](https://llm.mlc.ai/docs/deploy/ios.html#customize-the-app).

## Smaller candidates, metadata checked without downloading weights

Both have entries in the installed WebLLM 0.2.80 model list. Figures below were
calculated from pinned public `ndarray-cache.json` and `mlc-chat-config.json`.
Keeping a 4096-token context avoids changing the current prompt budget for the
first comparison. Model-specific templates and token counts still need checks.

| Candidate | Weight bytes | Raw KV at 4096 | Weights + raw KV, GiB |
| --- | ---: | ---: | ---: |
| [Llama 3.2 1B, q4f16_1](https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/tree/2a37b0a5ecb622d51ddc2fac74de0b95872affd7) | 695,242,752 | 128 MiB | 0.772 |
| [Qwen2.5 1.5B, q4f16_1](https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/tree/9bd564b064631febf14deadcac492efb761d60c3) | 868,547,584 | 112 MiB | 0.918 |

These figures establish a substantially smaller payload, not iPhone support or
medical quality. The earlier stock Llama 1B experiment refused basic questions;
the historical prompt made it answer but also produced incorrect guidance.
Qwen2.5 1.5B has not been evaluated on Kit's medical cases. It is a reasonable
first comparison candidate, not a selected production replacement. Earlier
Qwen3 0.6B and 1.7B findings must not be attributed to Qwen2.5.

## Bounded next comparison

1. Pin the candidate weights and matching runtime; use an isolated profile and
   keep the original 3B results as a baseline. Preserve complete references and
   check actual token budgets. Record settings, full outputs and failures.
2. Generate the existing paired English/Spanish cases and follow-ups. Review
   unnecessary refusals, incorrect steps, missing warnings and wrong-language
   answers. Fast generation does not count as accurate medical advice.
3. Record actual startup, first answer, repeated questions and memory where
   observable. Verify a full offline browser restart and new generated answers;
   a desktop pass does not establish an iPhone pass.
4. Review the comparison with the owner before any production replacement.
   Arrange one physical-phone test only for the candidate that warrants it,
   with its own explicit download approval. Do not silently reuse approval for
   different weights or call saved files proof of offline readiness.
5. If the smaller model fits but quality is insufficient, select the specific
   behavior to improve together before a reproducible training run. The 3B
   fine-tuning weights cannot simply be attached to a different-size base.

The product remains a simple offline AI chat. This investigation adds no model
selector, diagnostic dashboard, guide-as-answer fallback or other product UI.
