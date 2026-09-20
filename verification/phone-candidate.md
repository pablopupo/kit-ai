# Smaller phone candidate: Qwen2.5 1.5B

The owner approved this runtime experiment after repeated iPhone crashes at
“Opening Kit…” with the medical 3B model. The same simple chat now selects the
smaller candidate. It is an instruction model, not a newly trained medical model
or a clinically validated replacement. The original checkpoint, exported weights,
browser cache identity and evaluation records remain available as the baseline.

## Artifacts and approval

- Weights: `mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC`, revision
  `9bd564b064631febf14deadcac492efb761d60c3`.
- Runtime: official WebLLM 0.2.80 Qwen2 1.5B q4f16_1 ctx4k cs1k WASM,
  pinned to `mlc-ai/binary-mlc-llm-libs` commit
  `6ed5b97c37f4cdc49d1a8044a339db5588176d7e`.
- Exact required model artifacts: 881,089,605 bytes, excluding app assets and
  transport overhead; displayed download offer rounds up to 0.9 GB.
- 30 weight shards, 311 parameters. Runtime parameter names/shapes/dtypes match
  the pinned manifest. Largest weight tensor is 116,686,848 bytes. Evidence and
  metadata/hash scope are in `model-tools/results/phone-candidate-artifacts.json`.
- The candidate uses a new model/consent identity. Earlier 3B or 750 MB approval
  cannot authorize it. Old cached files and preferences are not removed.
- The 4096-token context and complete reference passages remain. Prompt budgeting
  accounts conservatively for Qwen's NFC normalization without changing user text.

## Verification

109 frontend tests and 42 lifecycle cases pass. New cases cover migration from
the former 3B approval, paused state, interrupted journal and saved cache. That
state neither authorizes nor blocks Qwen, and is preserved after explicit new
approval. The checks also cover Qwen-sized binding/storage requirements and NFC
expansion within the prompt budget.

`verify-phone-candidate.mjs` exercised the actual built React app with real
hardware-GPU inference, hosted artifacts and a fresh isolated persistent profile:

- No model requests before approval. All 30 shard paths use the immutable revision.
- Initial download and preparation: 78.523 seconds on this Mac/network.
- Test-only worker prefixes constrained advertised adapter limits to the previous
  phone report. Real native GPU devices granted 256 MiB buffers/bindings. Original
  worker bytes and instrumentation hashes are recorded separately.
- After two generated EN/ES answers, the full browser exited and the owned app
  server stopped. Browser transport was blocked before reopening.
- Reopening reached saved readiness in 2.420 seconds. An uncached external fetch
  failed with `ERR_INTERNET_DISCONNECTED`; service-worker control was confirmed.
  Chrome's `navigator.onLine` remained true and is recorded honestly.
- Two fresh offline EN/ES questions and all 20 frozen bilingual development cases
  generated responses. No inference POST, later weight download, page error or
  instrumentation error occurred. All 24 raw answers/prompts/timings are retained.

This proves desktop runtime mechanics under the recorded native buffer limits.
It does not reproduce iOS process-memory limits, physical airplane mode, medical
accuracy, translation quality or unseen-case performance. No new training ran.
Raw evidence: `phone-candidate-results.json`. The existing 3B profile was untouched.

An exploratory review already found unacceptable medical-answer failures,
including inappropriate infant guidance, an infant refusal in Spanish and a
Spanish refusal despite a matching burn reference. Runtime completion is not
an accuracy pass. This candidate is a user-approved compatibility experiment;
it must not be represented as reliable first-aid care. The focused review and
additional triage flags are in `evaluations/results/qwen-phone-smoke-review.json`.

## Next acceptance gate

The published candidate needs one physical iPhone test: approve its 0.9 GB
download, reach “Ready without internet”, then reopen with Wi-Fi and mobile data
off and ask a fresh question. Physical Android support remains to be tested.
If that succeeds, compare source coverage/adherence and review errors before
fine-tuning. The existing six-guide offline retrieval is retained; the staged
accuracy plan is in `evaluations/README.md`.
