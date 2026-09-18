# Reproduce the local medical-model conversion

This is an **evaluation-only** conversion of the user's existing trained model.
It does not train, replace the base model, publish weights, or change KIT-AI's deployed model.

Source: `Pablo305/llama3-medical-3b-4bit`, pinned revision
`df5aa311d5b017bdd4d1719c50c5d7a1dd1fa37b`.
Original weight SHA-256:
`3b4d7cfdd49bd8beec234a293dc685233ea556f48414012b499ab4b7694388a8`.

## Observed result on 2026-09-18

- Mac M5 Max, 48 GiB unified memory, macOS 26.6.2; Python 3.12.12.
- Official bitsandbytes CPU NF4 dequantization succeeded. All 254 saved FP16
  tensors passed architecture/shape/dtype/finite-value checks. Original model
  weights are 2,242,762,528 bytes; the FP16 export is larger.
- MLC `q4f16_1` conversion succeeded: 58 weight shards, 283 tensors,
  **1,807,423,488 weight bytes**. The converter reported 2.297 GiB peak RAM and
  approximately 20 seconds for its conversion loop. These are conversion
  observations on this Mac, not browser/phone inference measurements.
- Every converted tensor name, shape and dtype matched the official
  `mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC` manifest. Rotary settings were
  preserved: theta 500000 and the complete original Llama 3 scaling object.
- The original checkpoint's fixed knowledge/date prefix was added to the MLC
  text template. Actual MLC and Hugging Face renderers produced identical text
  for English, Spanish and multi-turn fixtures. Tool-call/multimodal templates
  were not evaluated.
- Original NF4 CPU and saved FP16 CPU were compared using the frozen
  `infant-choking-en` input from
  `evaluations/results/app-inputs-before-retrieval.json`, the Space's
  `build_messages(..., 8)`, greedy decoding, repetition penalty 1.1 and a
  128-token ceiling. Their 472 input tokens matched. All 128,256 first-step
  logits matched exactly (maximum absolute difference 0). Generated token IDs
  also matched (115 generated tokens, including EOS). This is evidence for that conversion case, not general
  equivalence or clinical validation.
- **Both versions produced dangerous infant guidance.** This behavior therefore
  exists in the original checkpoint. Do not treat a successful format conversion
  as medical validation or readiness for deployment. The separate browser
  evaluation is recorded by the evaluation harness.

The actual artifacts and logs are outside Git at
`../model-conversion/` (a sibling of this repository):

- `source/`: untouched pinned download.
- `float-export/`: reconstructed FP16 weights/tokenizer/configuration.
- `mlc-q4f16_1/`: browser-format weights and configuration.
- `dequantization-provenance.json`, `mlc-provenance.json`: file sizes, hashes,
  source revision, versions and declared validation scope.
- `parity-infant-choking-en.json`, `template-validation.json`: raw comparisons.
- `logs/`: successful runs and the failed feasibility attempts below.

Small copies of the provenance, parity, template and tensor-schema reports are
tracked in [`results/`](results/), with a compact
[`conversion-summary.json`](results/conversion-summary.json). No weight shards,
environments, caches or native crash logs are tracked. The official comparison
manifest is pinned to revision `1e80abf71e3d17cd564e2d2b63caa15cb226018e`;
all 58 converted shard sizes and MD5 checksums also passed.

## Reproduction

Run from the repository root. Use a fresh experiment directory for a full rerun;
the scripts refuse to overwrite completed export directories. Allow sufficient
disk space for the 2.24 GB source, FP16 reconstruction, MLC output and environments.

```sh
CONVERSION_WORK="$(cd .. && pwd)/model-conversion"
uv venv --python 3.12 "$CONVERSION_WORK/dequant-env"
uv pip install --python "$CONVERSION_WORK/dequant-env/bin/python" -r model-tools/requirements-dequant.lock
HF_HOME="$CONVERSION_WORK/hf-cache" "$CONVERSION_WORK/dequant-env/bin/python" model-tools/convert_checkpoint.py --work-dir "$CONVERSION_WORK"

uv venv --python 3.12 "$CONVERSION_WORK/mlc-env"
uv pip install --python "$CONVERSION_WORK/mlc-env/bin/python" --prerelease allow --find-links https://mlc.ai/wheels -r model-tools/requirements-mlc.lock
```

The official macOS wheels tested here contain invalid ad-hoc signatures. Inspect
them with the first command below. If the same problem occurs, the second repairs
only copied MLC/TVM libraries inside the disposable environment. It does not
disable Gatekeeper, remove quarantine attributes or modify system libraries.

```sh
"$CONVERSION_WORK/mlc-env/bin/python" model-tools/repair_mlc_signatures.py
"$CONVERSION_WORK/mlc-env/bin/python" model-tools/repair_mlc_signatures.py --repair > "$CONVERSION_WORK/mlc-signatures.json"
"$CONVERSION_WORK/mlc-env/bin/python" model-tools/convert_mlc.py --work-dir "$CONVERSION_WORK"
```

`convert_mlc.py` verifies the float-export hashes, runs both MLC commands with
five-minute bounds, preserves/tests the chat template, validates rotary settings
and shard sizes, then records output hashes. `--validate-existing` performs only
the final validation/provenance step on an existing conversion.

```sh
"$CONVERSION_WORK/dequant-env/bin/python" -m unittest discover -s model-tools -p 'test_*.py' -v
"$CONVERSION_WORK/dequant-env/bin/python" model-tools/verify_parity.py --work-dir "$CONVERSION_WORK" --case-file evaluations/results/app-inputs-before-retrieval.json --case-id infant-choking-en --max-new-tokens 128
```

The parity test is a single CPU comparison, capped at 128 generated tokens. The
observed complete checks took about 96 seconds for NF4 and 41 seconds for FP16.
Without the case arguments, it compares one short, non-clinical forward pass.

## Browser integration for evaluation

The converted checkpoint passed a desktop Chrome/Apple Metal load, four generated
test answers and a full offline browser restart. The cached model initialized in
3.408 seconds and generated a fresh Spanish answer with no model-shard requests;
browser storage was about 1.86 GB. This is a runtime result, not a quality pass.
The infant answers remained unsafe. See the [browser harness](browser-eval/README.md)
for reproduction and the exact scope of the recorded evidence.

Serve `mlc-q4f16_1/` locally with CORS, and register a distinct model ID such as
`kit-ai-medical-3b-df5aa311-q4f16_1`. Keep the installed WebLLM 0.2.80 for a
controlled comparison. Its matching stock library URL is:

`https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`

Require `shader-f16`; use context 4096 and prefill 128. Tensor-schema compatibility
supports trying this existing library but does not replace actual inference
testing. No new WASM library was compiled in this experiment. No phone performance
claim follows from conversion on a desktop Mac.

## Feasibility failures and corrections

1. Transformers 5.17 `model.save_pretrained()` after NF4 dequantization raised
   `NotImplementedError` while reversing a loading conversion. The script now
   validates the float state and uses Hugging Face's `save_torch_model()` sharding
   utility; it copies the original tokenizer/template files unchanged.
2. Importing the latest official MLC wheels initially caused macOS
   `SIGKILL (Code Signature Invalid)`, `CODESIGNING / Invalid Page`. The signature
   inspection confirmed invalid bundled dylib signatures. Local ad-hoc re-signing
   resolved this failure, with before/after hashes recorded.
3. With TVM-FFI 0.1.14.post0, the nightly pair aborted inside
   `libtvm_runtime_extra.dylib`; the older official stable pair instead reported
   a missing `tvm::ffi::json::Stringify` symbol. Pinning **apache-tvm-ffi 0.1.13**
   resolved native import for the nightly pair. The stable environment was not
   used to produce the model.
4. The MLC wheel omitted its `psutil` dependency; it was installed explicitly.
5. NumPy 2.5.3 rejected MLC's TVM dtype during conversion (`Could not convert
   T.float16 to a NumPy dtype`). **NumPy 2.2.6** resolved this issue.

The successful lockfile records MLC 0.26.dev6, TVM 0.26.dev246, TVM-FFI 0.1.13,
NumPy 2.2.6 and the remaining resolved dependencies. No source build was needed.

NF4 dequantization reconstructs quantized values; it cannot restore information
lost during the original quantization. Requantizing to MLC may introduce further
differences. Recovering original adapters/merged float training artifacts is
still preferable for future exports.

Primary references: [MLC conversion](https://llm.mlc.ai/docs/compilation/convert_weights.html),
[WebLLM custom models](https://llm.mlc.ai/docs/deploy/webllm.html),
[bitsandbytes installation](https://huggingface.co/docs/bitsandbytes/main/en/installation),
[Hugging Face serialization](https://huggingface.co/docs/huggingface_hub/package_reference/serialization),
[original model](https://huggingface.co/Pablo305/llama3-medical-3b-4bit).
