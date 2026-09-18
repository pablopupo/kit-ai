# KIT AI: next improvements

## Improve model quality and reliability

The next experiment is now recorded: 20 EN/ES cases, a local float export, MLC
weight conversion, an original-NF4 versus float parity check, and six reruns after
retrieval improvements. The original checkpoint reproduced an unsafe infant
answer; conversion did not introduce that failure. Further model work must address
accuracy and source adherence, not just willingness to answer. The recovered
historical prompt also failed the selected difficult cases.

The current release has automatic offline preparation, one Ask Kit flow and full
English/Spanish UI, guides and search. It prefers the owner's fine-tuned online
model when connected. The browser model is still a separate experimental model.
The owner chose to retain generated answers rather than replace offline chat with
guide-only answers. On devices where generation cannot run, guides remain the
fallback.

Real Apple Metal testing established cache reuse and offline generation. It also
reproduced medical refusals in the browser Llama. Qwen 0.6B and 1.7B were compared
on identical English/Spanish cut and burn prompts; 1.7B improved but still missed
warning signs and added unsupported statements. Do not equate fewer refusals with
better medical reliability. Keep these as evaluation candidates.

No training notebook or dataset was found in the public Hugging Face inventory or
nine reachable repository revisions. The config suggests an Unsloth export. The
original inference prompt was recovered and preserved; Colab/Drive or private files
may still contain the training recipe. See [the learning plan](evaluations/README.md).


The repaired Hugging Face Space is deployed on its existing ZeroGPU hardware. On
2026-09-18, the intended model answered a scrape-care question through the live
mobile frontend and a first-aid-kit question through the official Gradio client.
The latter request took 17.24 seconds. Neither returned a blanket refusal.

1. Evaluate ordinary educational questions, relevant reference use, appropriate escalation, unsupported questions, misleading premises, follow-ups, and requests for diagnosis/prescribing. Compare the medical checkpoint against a baseline; do not assume fine-tuning improved it.
2. Check completeness against the reference guides. The scrape smoke response answered cleaning steps but did not repeat all dressing and warning-sign guidance from the source. A successful request is not proof of a complete or accurate answer.
3. Document training data, method, licensing, and evaluation results in the model card. Consider clinician review before expanding health use cases.

## Highest-value product improvements

- **Reliable references first:** expand beyond the initial six guides using authoritative sources, age-specific scope, date checks and review ownership. The current summaries are source-checked, not clinically validated. Add retrieval tests for ambiguous queries and follow-ups; current matching is lexical, not semantic.
- **Offline preparation:** show storage availability, cache completion, model download size/progress, and a single readiness check before travel. Browsers can evict cached data.
- **Device check shipped:** `/#device-check` guides setup and a real offline reopen, runs a fresh synthetic local response, and exports metadata without conversations. Physical iPhone Safari/Chrome and Android Chrome testing is still needed.
- **Mobile device testing:** test real iPhone Safari and Android Chrome with the keyboard open, weak connectivity, low memory, installed PWA mode and a cold offline launch.
- **Model conversion completed for evaluation:** the saved medical checkpoint now has an MLC conversion using a matching existing runtime. Recover the original adapters/merged float training artifacts if possible, and benchmark memory/latency on target phones before considering this model as a default. The current evaluation found serious answer-quality failures.
- **Reliable online serving:** measure ZeroGPU cold starts, quota failures and generation time. If those prevent the desired experience, price a dedicated inference endpoint before committing to paid hosting.
- **Privacy controls:** add explicit optional history retention, export and delete-all controls; review any future analytics or speech providers before sending health-related content.
- **Localization review:** English and Spanish are now implemented. Obtain qualified review of both the guide translations and generated medical answers before expanding languages.

## Completed in this cleanup

- Guides remain accessible without WebGPU or any model download.
- Connected requests use the intended medical model and explain Hugging Face transmission; device-only history is excluded.
- Model details explain the distinct browser and fine-tuned server models; automatic routing removes the chat mode selector.
- Prompts request useful general-health answers, include relevant complete references, preserve questions and bound UTF-8 context. Actual behavior still depends on the model.
- Online requests have a deadline, stop action and actionable failure state.
- Mobile navigation, keyboard sizing, accessible composer and PWA assets improved.
- Chat history teardown/delete bugs fixed; storage failures do not silently erase saved history.
- Frontend dependency audit remediated without a forced major upgrade.
- Original pink logo restored; its accessible plus starts a new chat and clears the draft.
- Personal Vercel site deployed; repaired Hugging Face model service passed live inference checks.

## What has not been established

Clinical accuracy, real-device performance across phones, production deployment
of the converted medical checkpoint, or deployment of the legacy backend remain
unestablished. MLC conversion now exists as a separate evaluation artifact.

- Current checks: 49 frontend tests, four Hugging Face prompt tests and four conversion-configuration tests pass. Browser tests cover offline EN/ES guides and chat fallback, pause/resume, preferences, responsive layouts and the device-check flow. The deployed device-check page passed English/Spanish offline reload and report checks at a 390-pixel viewport. Desktop checks do not establish physical phone support.
