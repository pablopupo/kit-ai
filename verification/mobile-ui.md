# Mobile scrolling and softer Kit UI

## Design intent

Follow the owner's original Kit screenshot: retain the coral logo, a mint frame,
white rounded main panel and pill navigation. Use the existing locally hosted
Nunito for reading and Varela Round for guide/settings headings. Keep text left
aligned, familiar and readable; no additional animation or downloads.

Palette: mint `#E0F5F3`, white `#FFFFFF`, coral `#FF8A8A`, pale blush `#FFF0F1`,
dark teal `#17695F`, slate `#1E293B`. Pastel backgrounds carry the original Kit
personality; darker text/control colors retain contrast. Large panel curves,
smaller message corners and pill controls have distinct roles.

```
Phone reading             Phone chat                 Desktop
[coral logo | saved]       [coral logo | saved]       [mint nav] [rounded white panel]
(white reading page)      (scrolling conversation)   [        ] [                  ]
  native page scroll      [pill message composer]   [        ] [                  ]
[persistent pill nav]     [pill nav / keyboard]      [        ] [__________________]
```

## Changes and regression checks

The previous phone layout confined all reading to a smaller inner scroller.
Swipes on its surrounding chrome could not scroll the page. Guides, articles,
settings and history now use native document scrolling on phones; desktop keeps
its bounded layout. Guide and tab navigation reset the correct scroll position.

Chat has one scroll area and keeps the composer available. New answer content
follows the bottom only when the reader is already there; it no longer calls
`scrollIntoView` for every token. Reading older text preserves its position.
A focused phone chat responds to the keyboard's visual viewport, including its
top offset. Normal toolbar movement and page zoom do not trigger that adjustment.
Bottom navigation hides while the keyboard needs that space.

Guide items, settings controls, conversation bubbles and navigation use the
original softer palette and rounded shapes. Primary navigation and settings controls have at least 44px targets,
input text stays at least 16px, reduced motion is respected and dark appearance
is retained. No changes to guide content, model choice or download consent.

## Verification

- All 55 frontend tests and the production build pass.
- The browser harness and JSON evidence alongside this file cover English and
  Spanish, guides/articles/settings/long history, a 60-message synthetic chat,
  preserving reading position while answer content grows, following at the
  bottom, narrow/landscape/short viewports and simulated keyboard geometry.
- Chrome uses synthesized touch gestures. Desktop WebKit uses wheel/geometry
  checks at phone widths; it is not a physical iPhone test.
- The offline refresh regression suite also passes: EN/ES first visits with zero
  large requests before consent, offline reload, failed assistant download,
  missing saved HTML repair, and worker registration failure/retry.

Content-growth and keyboard cases are synthetic browser tests. Physical iPhone
Safari/Chrome and Android Chrome scrolling, keyboard panning and momentum still
need device verification; these checks do not claim otherwise.

To rerun, start the built frontend preview on port 4184 and run
`node verification/verify-mobile-layout.mjs` with Playwright and its browsers
available. `PLAYWRIGHT_MODULE` can select an existing installation;
`CHROME_EXECUTABLE_PATH`, `KIT_TEST_URL`, `KIT_TEST_ENGINE` and `KIT_ARTIFACT_DIR`
can override the browser, target and evidence destination. The harness uses
synthetic conversations and disables online answers and large downloads.

The additional appearance check covers Chromium/WebKit at 320px and 390px in
both languages: dark/read-aloud switch behavior, visible keyboard focus,
48×44px switch targets, a 48px native language selector, an empty chat starting
at the top, visible composer, no horizontal overflow and unchanged consent.
