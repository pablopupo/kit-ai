# Offline refresh repair — 2026-09-18

The owner reported that Kit opened and finished loading its assistant on iPhone
Chrome, but refreshing in airplane mode showed the browser's no-connection page.
The previous published site did contain the latest changes. Desktop inference
tests had not established reliable physical-phone reopening.

## Reproduced defect

On the previous live deployment, failing just the large assistant JavaScript
request prevented the entire service worker installation. The online app remained
usable, a precache container existed, but no worker controlled the page and an
offline refresh failed. The unblocked control passed. The model-ready message was
independent of this installation and could promise saved files prematurely.
See [before evidence](before-offline-refresh.json).

This is a demonstrated code defect matching the failure class, **not proof of
the exact cause on the owner's phone**. A screenshot cannot establish storage
eviction, a particular embedded browser, or a universal Chrome/iPhone limitation.
An install-time rejected promise discards a worker, and Workbox precaching runs
during installation. [Chrome lifecycle](https://developer.chrome.com/docs/workbox/service-worker-lifecycle),
[Workbox precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching).

## Changed behavior

- The small app and guides save first, independently of both large assistant
  JavaScript files. The unused legacy medical JSON pack is excluded.
- The assistant requires a separate one-time download choice (roughly 750 MB),
  followed by successful app saving. Existing users confirm once under the new
  setting; cached model files are reused. Known data-saving connections still
  defer automatic downloads. Unknown network type is not called Wi-Fi.
- Saved status requires page control and successful cache matches for every
  required app file. Offline-answer status also requires saved runtime files,
  initialized inference and the model library's cache check. Cached data may
  still be removed later; these are current checks, not a durability guarantee.
- Failed registration/install or incomplete app saving is visible and retryable.
  Missing app files are repaired by installing the current worker with a
  repair-specific query parameter. This forces installation instead of reviving
  an unchanged active worker, and avoids mixing new HTML into old revision keys.
  The normal worker URL remains `/sw.js`; model/chat data is not cleared.
- Pause cancels pending runtime fetches through a request-specific worker message.
- Normal English/Spanish screens use plain language. Model/hardware/cache metrics
  are removed; privacy/provider details and support reports are expandable.
  People can test the saved guides without downloading the assistant.

## Verification

`npm test`: **55 tests pass**. Production build passes. New tests cover cache
completeness, controller requirements, registration failure, revision-safe repair,
and prompt cancellation of runtime preparation.

[Desktop Chrome evidence](chrome-offline-refresh.json), at a 390-pixel viewport:

1. Fresh EN/ES visits save the app with zero large assistant/model requests before
   consent; both refresh offline without page errors or horizontal overflow.
2. After explicit consent, an actual assistant-runtime request is blocked. Saving
   answers fails visibly; the app and guides still reopen offline.
3. Deleting the cached HTML is detected. Retry installs the worker again, restores
   completeness and allows another offline refresh.
4. Blocking worker registration shows a save failure, without a saved claim.
   Unblocking and retrying recovers.

[Desktop WebKit 26.5 evidence](webkit-offline-refresh.json): EN/ES fresh visits
save successfully, make zero large downloads, and reopen their translated guides
after the HTTP origin server is stopped. No page errors, failed requests or
horizontal overflow were observed. Playwright's network-offline switch produced
an internal error even for an independent one-page vanilla-worker fixture, so the
stopped-server test was used instead. `navigator.onLine` remains true in that
test; it verifies unavailable-origin reopening, not an airplane-mode indicator.

These are desktop browser tests. The repaired version still needs a physical
iPhone Chrome/Safari and Android Chrome retest: open online, wait for guides to
be saved, turn off both Wi-Fi and mobile data, then refresh and fully reopen.
Test assistant preparation separately after the one-time download choice. Browser
storage is best-effort unless persistence is granted, and even browser-engine
support alone does not establish phone memory capacity or model quality.
[WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).
