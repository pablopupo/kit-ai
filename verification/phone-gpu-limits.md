# Medical model GPU limit correction

Published on 2026-09-19 at [Kit AI](https://kit-ai-pablopupo.vercel.app/),
deployment `dpl_DuBgCwKJk7yKYzvkKXkjzuvMvXyw`, from correction commit `c4185cf`.
The live main bundle is `index-vwvTw2c3.js`. Its served inference worker hash
matches the original worker used in the constrained-GPU test exactly. Fresh
English/Spanish live checks show the download offer, no model request before
approval, no page errors and no horizontal overflow. The production build also
includes extra unused CSS utilities discovered in the new regression test file;
the GPU worker is byte-identical to the verified worker. See
`phone-gpu-limits-live-results.json`.

## Reported failure

The owner's iPhone help report on 2026-09-19 showed the small app saved, but
`status: unsupported`, `reason: storage-binding-limit`, and no saved model.
Its adapter advertised 429,496,728 bytes for both `maxBufferSize` and
`maxStorageBufferBindingSize`, with `shader-f16`, 32,768 bytes of workgroup
storage, and 44 storage buffers per stage.

WebLLM 0.2.80 requested only 134,217,728 bytes for storage bindings on adapters
below 1 GiB. The converted model's largest tensor is 197,001,216 bytes. The
preflight accurately mirrored that request, but the request unnecessarily
excluded this adapter. This is a specific software limit-selection failure,
not evidence that this iPhone can or cannot sustain the whole model in memory.

## Change

`frontend/build/webllmGpuLimitsPatch.js` changes only the pinned SDK's smaller
storage-binding fallback, requesting at most 256 MiB and never more than either
advertised buffer limit. The larger-adapter 1 GiB path is unchanged. The Vite
plugin applies to both application and worker builds, and fails on an unexpected
SDK version or replacement count. No browser globals are patched in the product.

The compatibility worker uses the same bounded calculation and still requests a
real GPU device, verifies its granted limits and features, and destroys it before
model initialization. Insufficient adapters remain unsupported. The same model,
immutable revision, consent, cache keys, context window, and generated-answer
behavior are retained.

The compiled `model.wasm` uses a 1,024-token prefill chunk. The old `128` runtime
option does not override compiled metadata in WebLLM 0.2.80. Its largest declared
temporary workspace is 96,468,992 bytes; neither this nor the per-buffer limit
establishes sufficient total working memory on a phone.

## Verification

The regression tests execute the actual installed SDK's transformed device
request and compare it with preflight for the reported phone limits, smaller
adapters, and the unchanged desktop path. All 96 frontend tests pass.

`verify-phone-gpu-limits.mjs` runs the current built app with a recorded test-only
prefix on GPU worker responses from an owned local server. It lowers only the
adapter's advertised limits; the native GPU device, allocations and inference
are real. Original worker and prefix hashes are recorded. A copy-on-write clone
of the isolated saved-model profile keeps the original profile untouched. The
clone caches the instrumented workers for offline restart; it must not later be
mistaken for an unmodified production profile. The initial unsuccessful CDP
instrumentation attempt is retained separately, not counted as a model failure.

The passing run in `phone-gpu-limits-results.json` established:

- A fresh profile with the phone's buffer limits offers the 1.83 GB approval
  button, with no model files requested before approval.
- The actual inference worker requests and receives native 268,435,456-byte
  buffer and binding limits; its largest allocation is 197,001,216 bytes.
- The already saved pinned 3B model initializes in 7.954 seconds and generates
  English and Spanish answers locally.
- After full browser exit and app-server shutdown, blocked network transport
  still permits app/model reopening in 5.281 seconds and fresh Spanish and
  English answers. An uncached external request independently fails. Chrome's
  network flag remains true under this emulation and is recorded unchanged.
- No weight-shard request, inference POST, page error or instrumentation error
  occurs in the passing run. Raw synthetic answers remain in the report.

A constrained desktop GPU test can verify real generation under those limits.
It cannot reproduce iOS memory pressure, WebKit behavior, thermal limits, or
physical airplane mode. Fresh offline answers on the owner's iPhone and on an
Android phone remain required. Successful generation is also separate from
medical accuracy; prior evaluation failures remain open.

For the physical retest, open Kit while connected, let the small update save,
then close and reopen it in the same browser. Approve the download on Wi-Fi if
offered. Wait for “Ready without internet,” enable airplane mode with Wi-Fi off,
reopen Kit and ask a fresh synthetic question. Do not clear browser storage:
that would remove saved files and require another download.

WebGPU validates against the **requested device limits**, not the adapter's
maximum: [WebGPU required limits](https://www.w3.org/TR/webgpu/#dom-gpudevicedescriptor-requiredlimits).
