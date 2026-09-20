# Clear preparation feedback and interrupted-startup recovery

The owner's subsequent iPhone report passed the GPU device check and reported
cached model files, while Safari displayed “A problem repeatedly occurred.”
The last report was `loading`; it is not a browser crash log and does not prove
an out-of-memory cause. Physical iPhone inference remains unverified.

## Changes

- Preparation shows an immediate activity indicator in English/Spanish. Only
  measured downloads have a percentage. Reading saved weights and preparing GPU
  pipelines are an “Opening Kit” phase, so SDK progress resets cannot appear as
  a stalled or restarted download. A delayed explanation appears after 20 seconds;
  Pause remains available, and reduced-motion preferences are respected.
- A small local journal records only an attempt owner and an allowlisted stage
  during initialization or generation. An unfinished attempt pauses the next
  startup until an explicit retry. It survives a hard document reload, contains
  no questions, and never deletes model files. Browser storage denial is reported
  as a guard that could not be saved. An interrupted attempt does not prove a
  crash: closing or refreshing during work can also leave the marker.
- Reconnect cannot automatically retry a failed opening, including a reconnect
  queued before the failure arrived. Opening errors offer an explicit retry even
  offline. Worker errors and unreadable worker messages reject initialization
  instead of leaving its promise pending indefinitely.
- A guarded WebLLM 0.2.80 build patch passes an exact byte view to the decoder
  instead of first copying the entire tensor. The decoder still synchronously
  copies into its own argument storage. This avoids one 197,001,216-byte
  temporary JavaScript allocation for the largest tensor; it is not a measurement
  of total or peak process memory.
- On devices using 256 MiB or smaller binding limits, GPU pipeline compilation
  runs serially. Larger-device concurrency is unchanged. This bounds simultaneous
  compiler work but cannot remove the model's resident weights or establish a
  numerical reduction in peak memory.

The same checkpoint, published revision, 1.83 GB approval, cache keys, 4096-token
context and prompts remain. The ignored JavaScript prefill override was removed;
the compiled library still uses 1024. No smaller model, retraining, or new remote
service is part of this release.

## Evidence

- 106 frontend tests pass, including execution of the actual installed SDK's
  patched tensor-loading and compilation methods with synthetic dependencies.
- 40 real React StrictMode lifecycle cases pass with fake model/GPU dependencies.
  They include hard reloads during loading/generation, explicit cached offline
  retry, consent preservation, pause/retry races, and phase changes. See
  `offline-assistant-lifecycle-results.json`.
- Four desktop Chromium/WebKit × English/Spanish setup UI cases pass with
  synthetic state, including the delayed hint and reduced motion. Screenshots
  were visually inspected. See `setup-feedback-results.json`.
- The production build ran the actual saved medical model on a native hardware
  GPU with 256 MiB buffer limits, generating four English/Spanish answers.
  Full browser exit, stopped app server and blocked transport preceded two of
  those answers. Initialization took 4.868 seconds; offline reopening took 4.639
  seconds. No weight-shard request, inference POST or page error occurred. See
  `startup-memory-results.json`, produced by `verify-phone-gpu-limits.mjs` with
  `KIT_PHONE_GPU_OUTPUT` set to that new report.

That harness uses explicitly recorded test-only worker instrumentation and a
clone of the isolated cached profile. It verifies real native limits/inference,
not iOS process-memory limits or physical airplane mode. Earlier verification
reports are retained. The physical phone still needs a fresh test; the 3B model
may remain too large. Model-answer accuracy is a separate unresolved concern.

## Published verification

Code commit `ac6c58d` was deployed to
https://kit-ai-pablopupo.vercel.app/ as
`dpl_12v9NViHYy4ZJbpNpvz4eHvYrnfc`. The public entry bundle is
`/assets/index-CuuMYpLq.js`. The published inference worker SHA-256 matches the
worker used in the real saved-model test above:
`a3ff8e69a272a2ed732c56f3ee34a32a08edd108250d001c0e8baafdb3f5103d`.

Four fresh public-origin contexts passed English/Spanish consent and synthetic
interrupted-startup checks at a 390 × 844 viewport. The interrupted visit stayed
blocked after a reconnect event and offered an explicit retry. No model runtime,
external request, inference POST, page error or horizontal overflow occurred.
The English interruption screen was visually inspected. This check did not
download weights or simulate a real iPhone crash. See
`startup-recovery-live-results.json` and `verify-startup-recovery-live.mjs`.
