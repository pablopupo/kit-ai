---
title: KIT AI Medical Reference
emoji: 🏥
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: 6.28.0
python_version: 3.10
app_file: app.py
pinned: false
license: mit
---

# KIT AI model service

This optional **online** service runs
[Pablo305/llama3-medical-3b-4bit](https://huggingface.co/Pablo305/llama3-medical-3b-4bit).
It is a Llama 3.2 3B checkpoint saved with bitsandbytes NF4 quantization. The
checkpoint is not a WebLLM/MLC browser model. Hosting the frontend on Vercel does
not host this GPU model or make its responses available offline.

The model card does not document its training dataset or a formal clinical
evaluation. Treat answers as experimental general information, not diagnosis or
clinically validated instructions. Do not describe the model or generated
knowledge as vetted until a qualified reviewer has verified it.

## Changes in this service

- Use Transformers 5, matching the checkpoint's `TokenizersBackend` tokenizer
  and `rope_parameters` configuration. The former Hub 0.24 pin prevented this.
- Pin the model revision so a model upload cannot silently change behavior.
- Apply the model's actual chat template with separate system and user messages.
- Keep complete generated answers, including later warning signs. Preferred
  sentence count is an instruction rather than destructive output truncation.
- Load the model at module startup, following ZeroGPU's CUDA placement guidance.
- Preserve the `/ask` API with three inputs: question, preferred sentence count,
  and maximum new tokens. The server validates limits, serializes model calls,
  bounds its queue, and marks token-limited answers as incomplete.

## Deploy to the existing Space

Use the existing ZeroGPU hardware; no paid upgrade is required for this demo.
Upload `app.py`, `prompting.py`, `requirements.txt`, and this `README.md` to
`Pablo305/offline-medical-assistant`. A Space commit triggers a rebuild. The
build and a successful real model request must be verified before enabling the
service in the frontend. These files have not automatically been uploaded.

Gradio 6 exposes its API under `/gradio_api`. The simplest stable integration is
the official Gradio client with `api_name="/ask"`. For HTTP integration, inspect
the running Space's `/config` and API documentation after the upgrade instead of
assuming the old Gradio 4 `/call/ask` URL remains valid.

ZeroGPU can queue, sleep, and exhaust its daily quota. Always keep the app's
downloaded first-aid reference content available when the service is unavailable.
Tell users when their questions leave the device and avoid submitting identifying
information. A server proxy must keep any HF token out of browser bundles.

## Local checks

The prompt/output regression tests require only Python and do not download model
weights or need a GPU:

```bash
python -m unittest discover -s huggingface-space -p 'test_*.py'
```

To run actual generation, install `requirements.txt` in a Linux environment with
a supported NVIDIA GPU and launch `app.py`. The initial startup downloads about
2.24 GB of weights. Running it locally on a Mac CPU is not this deployment path.

Before enabling online answers, test ordinary health questions, first-aid
questions, unsupported questions, follow-up behavior, a long answer, and service
errors. Clinical answer correctness needs a separate reviewed evaluation set;
the unit tests do not validate medical accuracy.

## References

- [Hugging Face chat templates](https://huggingface.co/docs/transformers/v5.0.0/chat_templating)
- [ZeroGPU model loading and quotas](https://huggingface.co/docs/hub/spaces-zerogpu)
- [WebLLM custom model format](https://llm.mlc.ai/docs/deploy/webllm.html)
