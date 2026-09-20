# Load eligible saved weights directly into their GPU tensors

The getKey cache-check fix removed redundant shard reads, but the connected
physical iPhone still restarted during cached loading at23/30 files. See
`iphone-startup-observations.json`. The next investigation found CPU tensor,
FFI staging and CPU-to-GPU copies in WebLLM0.2.80's old loader.

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

All311 pinned Qwen records qualify:113 uint32 and198 float16, total868,547,584
bytes. They are marked f32-to-bf16, but that decoder transforms only float32;
these records are passed through unchanged. The rechecked pinned manifest
SHA-256 is `6d16a8936b1c9f372305064c4688eae17a609b62693f6782454d4fa2055c6e94`.
The model, weights, tokenizer, context, prompts and approval/cache identity stay
the same. The saved download is reused.

## Measured desktop comparison

`verify-direct-gpu-loading.mjs` uses independent clones of the same saved profile
and immutable build snapshots. Its recorded worker prefix observes native WASM
memory lengths and GPU writes. Adapter limits are constrained to the reported
phone values; real hardware devices grant256MiB buffer/binding limits. The
baseline already contains the getKey fix. Original worker and prefix hashes are
recorded separately; weights and the original profile are not modified.

| At model readiness | Before direct upload | After direct upload |
| --- | ---: | ---: |
| Model WASM linear memory | 353,370,112 bytes | 167,772,160 bytes |
| Tokenizer WASM linear memory | 66,584,576 bytes | 66,584,576 bytes |
| Initialization GPU writes | 313 | 313 |
| Initialization GPU write bytes | 868,547,592 | 868,547,592 |

The observed model WASM allocation is185,597,952 bytes (177MiB) smaller. This is
not total memory, physical RSS or a measured process-memory peak. Native upload
counts/sizes match, and the two builds each generated a fresh answer. The patched
browser fully exited, the app server stopped, and network transport was blocked
before reopening. It then generated new Spanish and English answers. An uncached
request failed with ERR_INTERNET_DISCONNECTED. No shard download, inference POST,
page error or observer error occurred. Raw outputs are runtime evidence, not
medical-quality passes. Evidence: `direct-gpu-loading-results.json`.

118 frontend tests and the production build pass. Physical iPhone opening and
offline inference with this direct-upload build still require a connected test.
