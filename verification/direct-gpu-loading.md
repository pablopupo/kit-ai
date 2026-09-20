# Load eligible saved weights directly into their GPU tensors

The getKey cache-check fix removed redundant shard reads, but the connected
physical iPhone still restarted during cached loading at 23/30 files. See
`iphone-startup-observations.json`. The next investigation found CPU tensor,
FFI staging and CPU-to-GPU copies in WebLLM 0.2.80's old loader.

## Change

The guarded build patch backports the eligible-record upload from
[Apache TVM #20166](https://github.com/apache/tvm/pull/20166), merge
`4e9a099d154d7c4644a40a1a9c00b8873226468e` (2026-08-23). Raw or raw-equivalent,
4-byte-aligned records go directly into fresh GPU tensors. Packed BF16 float32,
CPU/other devices, unaligned sizes and unknown formats retain the old decoder.
The data view is consumed synchronously before waiting for GPU completion.
Synchronization, cache insertion, error propagation and handle disposal remain.

The direct path validates bounds, shape and exact storage bytes. Because the
installed SDK reads the DLTensor offset incorrectly on wasm32, this bounded
backport reads both unsigned words at the aligned ABI offset locally and requires
zero. It does not change the SDK's general Tensor implementation. Layout tests
cover wasm32 padding, both offset words and wasm64.

All 311 pinned Qwen records qualify: 113 uint32 and 198 float16, total 868,547,584
bytes. They are marked f32-to-bf16, but that decoder transforms only float32;
these records are passed through unchanged. The rechecked pinned manifest
SHA-256 is `6d16a8936b1c9f372305064c4688eae17a609b62693f6782454d4fa2055c6e94`.
The model, weights, tokenizer, context, prompts and approval/cache identity stay
the same. The saved download is reused.

## Measured desktop comparison

`verify-direct-gpu-loading.mjs` uses independent clones of the same saved profile
and immutable build snapshots. Its recorded worker prefix observes native WASM
memory lengths and GPU writes. Adapter limits are constrained to the reported
phone values; real hardware devices grant 256 MiB buffer/binding limits. The
baseline already contains the getKey fix. Original worker and prefix hashes are
recorded separately; weights and the original profile are not modified.

| At model readiness | Before direct upload | After direct upload |
| --- | ---: | ---: |
| Model WASM linear memory | 353,370,112 bytes | 167,772,160 bytes |
| Tokenizer WASM linear memory | 66,584,576 bytes | 66,584,576 bytes |
| Initialization GPU writes | 313 | 313 |
| Initialization GPU write bytes | 868,547,592 | 868,547,592 |

The observed model WASM allocation is 185,597,952 bytes (177 MiB) smaller. This is
not total memory, physical RSS or a measured process-memory peak. Native upload
counts/sizes match, and the two builds each generated a fresh answer. The patched
browser fully exited, the app server stopped, and network transport was blocked
before reopening. It then generated new Spanish and English answers. An uncached
request failed with ERR_INTERNET_DISCONNECTED. No shard download, inference POST,
page error or observer error occurred. Raw outputs are runtime evidence, not
medical-quality passes. Evidence: `direct-gpu-loading-results.json`.

118 frontend tests and the production build pass. Independent review found no
remaining blocker after the ABI offset guard was corrected.

## Published build and physical iPhone

Code `5027de9` is live at https://kit-ai-pablopupo.vercel.app, deployment
`dpl_58rbhNishzdhQ8Hwr9o7QeKeUo4i`. Published entry, SDK and worker hashes
match the tested build. An isolated saved-public-app upgrade preserved download
consent and interrupted-startup recovery without downloading weights or starting
inference. Evidence: `direct-gpu-live-results.json`.

USB inspection of the owner's actual iPhone, Safari on iOS 26.0, observed all
30 saved shards and all 89 shader modules finish. The SDK reported readiness in
2.551 seconds, followed by the visible “Ready without internet” state and an
enabled input. This is one observation, not a loading-time benchmark. The saved
model was reused, and no model, context or GPU limits were changed for this test.

The owner then enabled Airplane Mode and turned Wi-Fi off. The inspected page
reported offline, and uncached requests failed. A fresh synthetic English
question generated a new answer. Reloading the physical page while still offline
also returned to readiness with the service worker controlling the page. A new
Spanish question then generated a Spanish reply with the interface language set
to Spanish. These synthetic thermometer questions test generation only; the
Spanish answer includes an overbroad statement about detecting illness. The
reload removed the temporary main-page initialization observer. This verifies
physical phone initialization and generation, not a full Safari process exit,
all iPhone models, Android support or medical reliability. Only synthetic test
conversations were read. Evidence: `iphone-startup-observations.json`.
