# KIT AI: next improvements

## Improve model quality and reliability

The repaired Hugging Face Space is deployed on its existing ZeroGPU hardware. On
2026-09-18, the intended model answered a scrape-care question through the live
mobile frontend and a first-aid-kit question through the official Gradio client.
The latter request took 17.24 seconds. Neither returned a blanket refusal.

1. Evaluate ordinary educational questions, relevant reference use, appropriate escalation, unsupported questions, misleading premises, follow-ups, and requests for diagnosis/prescribing. Compare the medical checkpoint against a baseline; do not assume fine-tuning improved it.
2. Check completeness against the reference guides. The scrape smoke response answered cleaning steps but did not repeat all dressing and warning-sign guidance from the source. A successful request is not proof of a complete or accurate answer.
3. Document training data, method, licensing, and evaluation results in the model card. Consider clinician review before expanding health use cases.

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
- Original pink logo restored; its accessible plus starts a new chat and clears the draft.
- Personal Vercel site deployed; repaired Hugging Face model service passed live inference checks.

## What has not been established

Clinical accuracy, real-device performance across phones, a converted offline medical checkpoint, or deployment of the legacy backend. Treat these as explicit follow-up work rather than shipped capabilities.
