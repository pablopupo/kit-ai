# Reproduce the desktop browser conversion check

This harness checks whether the converted medical 3B checkpoint can load,
generate and reopen from browser cache. It is **not a phone test or medical
validation**. The saved infant answers contain dangerous advice. Do not use the
generated output as first-aid instructions or switch the production model based
on this mechanics test.

The recorded result is `evaluations/results/medical-3b-mlc-browser.json`.
It records the model/config/runtime hashes, exact messages, browser arguments,
GPU features, storage, timings, responses and request counts. The final run used
Chrome 153 on Apple Metal 3 with no software/fallback adapter, no unsafe WebGPU
or SwiftShader flags, and the Chrome sandbox enabled.

## Requirements

- A Mac with Google Chrome at its standard Applications path and working WebGPU
  with `shader-f16`. This script is deliberately limited to the measured Mac
  setup; do not present its result as iPhone/Android support.
- Node, Python 3, the frontend dependencies, and Playwright available to Node.
  `KIT_PLAYWRIGHT_MODULE` can point to an already installed Playwright module;
  otherwise normal package resolution is used. No browser installation is needed
  because the harness uses the existing Chrome executable.
- The completed conversion under `KIT_MODEL_WORK_DIR/mlc-q4f16_1`, including all
  shards, tokenizer and the repaired/preserved chat configuration. The default
  work directory is the `model-conversion` sibling of this repository. Follow
  the conversion documentation first; this harness does not download weights.
- Roughly 2 GB of additional browser storage. Keep port 4190 free for this
  experiment's local server.

From the repository root, prepare the assets:

```sh
node model-tools/browser-eval/prepare.mjs
```

Preparation uses the installed WebLLM 0.2.80, verifies the official compiled
runtime against the recorded SHA256, bundles a client and worker, and derives
four messages from the frozen float-baseline inputs through the current Space's
`prompting.build_messages(..., 8)`. It does not modify the converted model.

Run the test; it starts and owns its local server:

```sh
node model-tools/browser-eval/run.mjs
```

Set `KIT_MODEL_WORK_DIR` if using another work directory. `KIT_BROWSER_OUTPUT` optionally chooses the report file; by default
each run creates a timestamped JSON in `evaluations/results` so the recorded
result is preserved. The Playwright import can be configured, for example, with
`KIT_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs`.

## What happens

The harness uses its own `browser-profile` inside the model work directory.
It clears storage **only for this isolated profile's localhost:4190 origin** to
measure a cold load. The page never initializes the model merely by opening;
the harness explicitly invokes initialization. The model weights come only
from localhost; the runtime was prepared earlier from the official MLC URL.

Four independent EN/ES cases use the frozen pre-retrieval-fix inputs, the current
Space system prompt, temperature 0, repetition penalty 1.1 and a 512-token limit.
They compare the MLC browser output to the saved local float answer without
assuming numerical or clinical parity. The model uses a 4096 context and 128-token
prefill chunks. Greedy decoding does not guarantee equality across runtimes.

After generation, the harness closes Chrome and independently confirms that
the Chrome process identified by this isolated profile has exited. It then
stops only its own server child, confirms that child's exit, and reopens the
profile with browser networking disabled. It checks that
the service worker restores the shell and that IndexedDB restores the model,
then generates a new Spanish answer. The recorded final run reloaded the model
in 3.408 seconds with no shard requests; the only failed request was a favicon.
The 5.704-second cold load was from localhost, **not an Internet-download or
phone-speed estimate**. Browser storage can still be evicted later.

If another service is using port 4190, startup fails without terminating it.
There is no listener lookup or arbitrary PID termination. Playwright teardown
is bounded; a close timeout alone never counts as browser exit. The process
check must confirm exit or the run fails without claiming an offline restart.
Inspect `browserCloseConfirmations` and `automationNotes` for these details. The source
harness never enables unsafe GPU flags and records the actual Chrome command
line in both phases. The earlier exploratory attempt inherited a Playwright
SwiftShader flag despite selecting Metal; the final recorded run explicitly
removed it and repeated both phases.

The initial ad hoc scripts were copied here after the successful run, with paths
made configurable and lifecycle handling strengthened. The raw evidence is
preserved unchanged and predates those harness lifecycle changes. No additional
model inference was performed with the relocated entry points. Syntax and
lightweight lifecycle checks cover owned-server termination, protection of an
unrelated listener, and fail-closed browser-exit reporting:

```sh
node --test model-tools/browser-eval/lifecycle.test.mjs
```
