# KIT AI: next improvements

## Finish the intended model integration

1. Sign into the owner's `Pablo305` Hugging Face account and upload the repaired files from `huggingface-space/`.
2. Verify the Space finishes building and actually generates complete answers. A running UI is not evidence of working GPU inference. The previous public inference check failed with an error event.
3. Evaluate ordinary educational questions, relevant reference use, appropriate escalation, unsupported questions, misleading premises, and requests for diagnosis/prescribing. Compare the medical checkpoint against a baseline; do not assume fine-tuning improved it.
4. Document training data, method, licensing, and evaluation results in the model card. Consider clinician review before expanding health use cases.

## Highest-value product improvements

- **Reliable references first:** expand beyond the initial six guides using authoritative sources, age-specific scope, date checks and review ownership. The current summaries are source-checked, not clinically validated.
- **Offline preparation:** show storage availability, cache completion, model download size/progress, and a single readiness check before travel. Browsers can evict cached data.
- **Mobile device testing:** test real iPhone Safari and Android Chrome with the keyboard open, weak connectivity, low memory, installed PWA mode and a cold offline launch.
- **Model conversion:** if the specific medical model must run offline, recover the original unquantized/merged checkpoint, convert and quantize to MLC, then compile the matching runtime. Benchmark memory/latency on target phones before making it a default.
- **Reliable online serving:** measure ZeroGPU cold starts, quota failures and generation time. If those prevent the desired experience, price a dedicated inference endpoint before committing to paid hosting.
- **Privacy controls:** add explicit optional history retention, export and delete-all controls; review any future analytics or speech providers before sending health-related content.
- **Localization:** provide reviewed translations of guides before advertising multilingual first aid. English is the supported guide language in this iteration.

## Completed in this cleanup

- Guides remain accessible without WebGPU or any model download.
- Online mode names the intended medical model and explains Hugging Face transmission.
- Local mode labels the general-purpose model honestly and validates custom MLC configuration.
- Prompts answer ordinary general-health questions, include only relevant references and bound conversation size.
- Online requests have a deadline, stop action and actionable failure state.
- Mobile navigation, keyboard sizing, accessible composer and PWA assets improved.
- Chat history teardown/delete bugs fixed; storage failures do not silently erase saved history.
- Frontend dependency audit remediated without a forced major upgrade.

## What has not been established

A working live medical model, clinical accuracy, real-device performance across phones, a converted offline medical checkpoint, or deployment of the legacy backend. Treat these as explicit follow-up work rather than shipped capabilities.
