# Avoid loading weights merely to check saved files

The owner's smaller Qwen candidate still failed on iPhone at “Opening Kit…”.
The subsequent report showed an interrupted `model-loading` attempt, saved app
and runtime files, `offlineSaved: false`, and `check: null`. The journal stops a
new attempt before its compatibility check; it does not establish an OS-level
out-of-memory cause. Physical phone generation remains unverified.

## Finding and bounded fix

WebLLM 0.2.80's `ArtifactIndexedDBCache.hasAllKeys()` used `get()` for every weight
shard concurrently. `isUrlInDB()` also used `get()` before retrieving each payload.
The main app calls the SDK's model-presence check before initialization and after
the GPU model is resident. Consequently, existence checks deserialize substantial
model data without using it.

The pinned build transform changes those two existence queries to `getKey()`.
Actual data retrieval retains `get()`. The inline `url` key path means both
queries preserve the existing presence semantics, including records whose data
field is incomplete. Neither query validates artifact integrity. Version and
source-anchor guards fail the build when the expected SDK changes.

This keeps the model, weights, prompts, cache identity, approval and UI unchanged.
It does not require downloading weights again. Previous tensor-view and bounded
shader-compilation patches remain in place.

## Real saved-model comparison

`verify-cache-presence-reads.mjs` ran independent clones of the same closed,
previously approved Qwen profile. The original profile and weight stores were
preserved. The baseline and patched production assets were fixed snapshots.

Test-only listeners counted native IndexedDB requests in the main page and model
worker. They returned the original request unchanged and recorded only shard
paths and payload sizes. Worker prefixes and original-byte hashes are recorded
separately. GPU calls used the native hardware adapter without changed limits.
Only the assistant JavaScript cache in each clone was refreshed while startup
was paused; weights were neither cleared nor downloaded.

| During opening | Previous build | Patched build |
| --- | ---: | ---: |
| Page weight-payload reads | 60 | 0 |
| Worker weight-payload reads | 90 | 30 |
| Total returned weight bytes | 4,342,737,920 | 868,547,584 |
| Key-only queries | 0 | 120 |

This removes **3,474,190,336 cumulative bytes of redundant reads (80%)**. It is
not a measurement of simultaneous or peak RAM, and does not establish the cause
of the iPhone crash. Single-run desktop readiness observations were 2.660 seconds
before and 1.280 seconds after; these are not a statistical speed benchmark.

Both builds generated a fresh answer. The patched browser then fully exited,
the app server stopped, and network transport was blocked before reopening.
Readiness took 1.289 seconds, the same one-read-per-shard behavior held, and fresh
English/Spanish questions generated answers. An uncached external request failed
with `ERR_INTERNET_DISCONNECTED`; `navigator.onLine` remained true and is recorded
honestly. No weight request, inference POST, page error or observer error occurred.
The four raw synthetic answers remain observations, not medical-quality passes.

Evidence: `cache-presence-read-results.json`. Patched original worker SHA-256:
`329f8147c5f6db2803033e81d9e83977195d4a229e472d6cab0117133e7a3e56`.

## Other checks

- 113 frontend tests pass, including actual installed SDK method execution,
  presence/error cases, exact payload retrieval and runtime-drift guards.
- Native desktop WebKit 26.5 passed four before/after × window/worker cases,
  totaling 44 presence/value checks. Fresh binary/JSON writes and reads,
  missing/duplicate/empty keys and payload counts were checked without downloading
  a model. Evidence: `webkit-cache-presence-results.json`.
- The production build completes successfully.

Desktop WebKit storage behavior does not establish physical iPhone memory
capacity. The next acceptance check is loading this same saved model on the
connected phone, then generating a fresh answer after offline reopening.

## Published check

Code `a619664` is deployed to https://kit-ai-pablopupo.vercel.app/ as
`dpl_FLcw1u9qizpXgJ3qjK163ysgH9c3`. The public main bundle
(`/assets/index-Bp_fGlG_.js`), SDK and inference worker match the tested build.
An isolated browser with the saved previous public app updated on ordinary
reload. Its synthetic Qwen interruption and existing approval were preserved;
reconnect did not start a model. No external/model request, inference POST,
page error or horizontal overflow occurred. See `cache-presence-live-results.json`.
This public update check did not run the model or certify physical phone use.

## Connected iPhone follow-up

The owner connected the iPhone over USB and enabled Safari Web Inspector. The
phone was confirmed to run this deployed entry and inference worker. A retry
reused cached weights, reporting files 1 through 23 of 30 (79%, displayed 660 MB,
9 seconds elapsed), then no further progress. The owner confirmed that the page
returned to “Kit had trouble staying open”. This cache-check fix alone therefore
did not make the phone usable. No OS-level out-of-memory cause was established.
Only model-opening progress/error messages were observed; no conversation was
read. See `iphone-startup-observations.json`.
