# iPhone saving support — 2026-09-19

The owner supplied a screenshot of the current published layout with “Kit cannot
save in this browser.” The matching code displayed this before registration if
the service-worker API was absent or the context was not secure. It then wrongly
instructed the owner to wait for saving to finish.

An explicitly shared device report showed a secure context, no registered or
controlling worker and no app-cache containers. Existing model containers and a
positive WebGPU check did not establish complete model files or successful
inference. The user-agent marker indicated a Google app browsing window. This
explains why treating every phone-looking browser window as equivalent was wrong.
The raw report and browser fingerprint are not committed here.

The browser identity is a help-text hint only. Kit checks the actual APIs; it
never rejects a browser because of its name. Missing service-worker access means
the website cannot install its offline navigation handler in that context.
Opening the canonical link in Safari/Chrome directly is the recovery experiment.
It is not a promise that inference will work on that phone.

## Implementation

- Safe capability reads distinguish insecure/unknown contexts, missing APIs and
  blocked property access. Access exceptions no longer crash app startup or
  the diagnostic screen. Main-thread cache availability is metadata only;
  complete app saving is still determined by the service worker.
- Save and registration failures retain allowlisted categories, without arbitrary
  exception strings, request URLs or private messages. Ready clears old failures.
- Unsupported saving gets truthful English/Spanish text, retry and recovery help.
  Google-app windows with unavailable saving get specific open-in-browser copy
  and a copy-link button. Denied clipboard access exposes a manually copyable URL.
- The phone check avoids impossible download/reopen/test steps when saving is
  unavailable and presents optional support reporting. Reports include app state
  and capability flags; browser identity remains opt-in, chats remain excluded,
  and nothing is transmitted automatically.
- Guides and connected chat remain usable. Large downloads still require consent
  and a successfully saved app. Downloads need not carry to another browser.

## Evidence and limits

65 frontend tests pass, including missing/blocked API recovery, denied storage,
registration retry, cache repair, cancellation and export allowlists. Production
build passes. The portable `verify-save-support.mjs` harness and
`save-support-results.json` cover 12 simulated Chrome/WebKit × English/Spanish ×
missing API/blocked getter/insecure-context cases: correct help and report reason,
no contradictory wait text, usable chat, no errors or unsolicited heavy downloads.
Additional checks confirm a GSA marker with available APIs is not blocked, and
clipboard denial exposes the link, in both engines. The earlier offline refresh
regressions still pass, including failed downloads and missing-cache repair.

These reproduce the application's response to the reported missing capability;
they are not physical iPhone verification. The owner was asked to open Safari
itself, paste the site address and verify guides finish saving before retrying
without connectivity. App saving and generated answers require separate checks.

## Primary references

- [Chrome iOS user-agent documentation](https://chromium.googlesource.com/chromium/src.git/+/HEAD/docs/ios/user_agent.md)
- [Google app: open a page in another browser](https://support.google.com/websearch/answer/7013866?co=GENIE.Platform%3DiOS&hl=en)
- [Chrome on iPhone: add a web app to the Home Screen](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=en)
- [Apple browser app capabilities](https://developer.apple.com/documentation/xcode/preparing-your-app-to-be-the-default-browser)
