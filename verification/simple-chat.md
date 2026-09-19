# One offline AI chat

Published at [Kit AI](https://kit-ai-pablopupo.vercel.app/) in Vercel deployment
`dpl_FbxruYYgfySeUGBGLN2n3mU1S8uN`, main bundle `index-aFo-3uUA.js`.

Kit now opens directly into chat, including links that used to open the separate
medical trial. The header contains the logo/new-conversation action, one readiness
status, and a menu for conversations, first-aid notes and settings. There is no
bottom navigation, model selector or diagnostic panel in the main conversation.

The first setup card asks for the 1.83 GB download and disappears when saving is
complete. Readiness requires the selected engine to initialize and the app,
runtime and model files to be saved. Saving guides alone cannot show AI readiness.
The original main chat hid its download offer once the small app was saved;
that condition has been removed. Failed or unavailable generation never inserts
a guide as an assistant answer. Older guide entries remain readable as collapsed
notes without deleting history.

The main chat uses the published medical checkpoint at revision
`34f6aa7d8fb5608dc2585e6660b982610ca4bc28`. Previous medical-trial approval and
cached weights are reused; the older 750 MB approval does not authorize this
download. A ready local model takes priority even while connected. If it is not
ready, an online answer is available only when connected and permitted by the
existing setting. Only prior online turns can accompany an online request. A
failed local question is never retried online; an online failure can move to
the local model once it becomes ready. Reference retrieval remains inside the
prompt, with source links collapsed below answers.

Pause persists across reopening, interrupted preparation can resume on reconnect,
and explicit repair rechecks missing app/runtime/model files. Typed drafts survive
secondary navigation within the current app session. Stopping an answer discards
its incomplete fragment; the original question stays in the conversation.

## Checks

- 88 service/utility tests and the production build pass.
- `verify-offline-assistant-lifecycle.mjs` mounts the real hook under React
  StrictMode with mocked GPU/storage/SDK calls. Its 25 cases cover consent reuse,
  pause/reconnect, cancellation, exact model selection, generation recovery and
  ready-but-incompletely-saved repairs. This is lifecycle evidence, not inference.
- `verify-simple-chat.mjs` runs the real interface with a controlled assistant
  fixture in Chromium and WebKit, English and Spanish, portrait and landscape.
  It covers one setup card, minimal ready state, streaming/follow-ups, reading
  position, accessible composer, menu navigation, stop/retry and collapsed older
  guide notes. Results are in `simple-chat-results.json`; screenshots were
  visually inspected. These are desktop browser tests, not physical phones.
- Three additional UI regressions pass in each browser/language/orientation case:
  unsent draft survives Settings/back, paused saved-model loading can resume while
  offline, and a failed online answer retries through a newly ready local model
  without another user-message entry.
- The real built main chat reused the previously downloaded 3B model on desktop
  Chrome/Apple Metal. Initial cached readiness took 5.68 seconds; after complete
  browser exit and stopping the app server, the new chat reopened from saved files
  in 4.59 seconds and generated a fresh answer in 0.835 seconds. Browser transport
  was blocked and an uncached external request failed. There were zero model shard
  requests, inference POSTs or page errors in the passing run. `navigator.onLine`
  remained true under Chrome emulation and is retained honestly in the report.
- The first upgrade attempt served the old cached app, and a second harness
  attempt waited indefinitely on worker activation. Those interruptions remain in
  `cachedModelAttempts`, separate from the passing run. After the new service
  worker saved the current build, an ordinary page load opened the simplified
  chat. Existing users should refresh after the new app finishes updating.
- Live production checks pass in four fresh profiles (English/Spanish × normal
  root/former trial URL): same current main bundle, exactly one approval card,
  zero model requests or POSTs before approval, no page errors or horizontal
  overflow. These checks did not approve another download.

The checkpoint still has known medical-answer errors, including the previously
recorded infant-choking failure. Integrating its runtime does not establish
medical accuracy. The short experimental notice remains visible, with details
under Settings. Physical iPhone/Android inference and broader clinical evaluation
remain unverified; no new training or untested replacement model was introduced.
