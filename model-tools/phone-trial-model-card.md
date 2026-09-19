---
license: llama3.2
language:
  - en
  - es
base_model: Pablo305/llama3-medical-3b-4bit
pipeline_tag: text-generation
tags:
  - mlc
  - webllm
  - experimental
---

# Llama 3.2 3B Kit Medical — browser experiment

**Built with Llama. For development and evaluation, not patient care.**

This is a browser-format conversion of [Pablo305/llama3-medical-3b-4bit](https://huggingface.co/Pablo305/llama3-medical-3b-4bit), source revision `df5aa311d5b017bdd4d1719c50c5d7a1dd1fa37b`. No further training was performed, and the original repository was not changed. The original training notebook and dataset have not been recovered.

**Known limitations:** synthetic first-aid tests produced serious errors, including unsafe infant choking guidance, as well as inconsistent Spanish answers. These problems also occurred in the original checkpoint. A working download or plausible answer does not establish medical accuracy. This model is not clinically validated.

## Conversion and runtime

The original bitsandbytes NF4 checkpoint was reconstructed to FP16 and converted with MLC to `q4f16_1`: 58 shards, 283 tensors, 1,807,423,488 weight bytes. The complete browser download, including tokenizer, configuration and runtime, is approximately **1.83 GB**. Requantization can change answers; it does not restore information lost in earlier quantization.

The included `model.wasm` is the official WebLLM 0.2.80 library `Llama-3.2-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`, SHA-256 `34de0d60ab598c6a85ae882b48474f250193076f902057a21070bb2daae96d5b`. Use context 4096 and prefill 128. `shader-f16` and sufficient WebGPU device limits are required. Runtime memory is estimated at roughly 2.3 GB; actual phone memory availability is not measurable by this check.

Desktop Chrome on Apple Metal successfully loaded this conversion, generated answers, and reopened fully offline for a fresh Spanish answer. **Physical iPhone and Android generation has not yet been verified.**

The WebLLM 0.2.80 runtime falls back to a 128 MiB storage binding when the adapter does not allow a 1 GiB binding. That fallback is smaller than this model's 197,001,216-byte embedding tensor. A generic “WebGPU available” check is insufficient.

## Reproducibility

[Kit-AI conversion scripts and evidence](https://github.com/pablopupo/kit-ai/tree/improve-kit-ai/model-tools) record source hashes, tensor checks, prompt template parity and raw browser outputs. A single original-NF4 versus FP16 comparison had identical first-step logits and generated tokens; this is not a general equivalence claim.

Use an immutable Hugging Face commit in the model URL and a distinct model ID. Browser caching is subject to storage eviction. Obtain specific consent before the large download.

Llama 3.2 terms are included in `LICENSE` and `NOTICE`; the MLC runtime uses Apache 2.0 (`RUNTIME-LICENSE`).
