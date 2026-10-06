Use Node 24 and Git, on Windows or Linux:

```sh
npm ci
npm run compatibility:fetch
npm run test:compatibility
npm run verify
npm run test:desktop
```

The fetcher follows gorak-lsp-rs's merged compatibility fetch script. It fetches
only the explicit release tag into ignored `.ci/gorak`, prints and verifies its
resolved commit, and checks the upstream source_version. Tests require that
checkout to remain clean and at the pinned release. To override Git transport
settings locally, use Git's normal configuration/environment options.

Tests read the public release fixtures directly and edit only in memory. Coverage
is document/model compatibility, not Workbench visual parity. Embedded scripts
and events remain opaque source with preserved spans; event parsing and procedure
binding are outside the designer's API. The fixture has no comments; existing
`wml.test.mjs` cases separately verify comment preservation. The automated hidden
Electron smoke check is separate from manual native UI acceptance.


The certified source contract is 3 at `v0.1.0-alpha.1.dev.46`. Image coverage
includes application-relative PNGs, the checksum-verified public built-in catalog,
native masks and monochrome transparency, button/selected/tab/palette/ImageTrim
images, and frame/field background bitmaps. The model accepts host-decoded pixels
through the optional fourth `frameFromWml` argument; native filenames and resource
metadata stay authoritative source and are never opened as paths or URLs.

The desktop adapter reads only requested assets in the opened application's
`images/` directory. It rejects traversal and symlinks, with limits of 8 MB per
PNG, 1,048,576 pixels per image, 256 references and a 32 MB frame image budget.
`test:desktop` includes a separate end-to-end PNG/built-in/mask/background check
and verifies that edits and undo retain image references. It opens a frame-template
companion and checks metadata edits and undo. Synthetic LF/CRLF regressions
verify `[framesource]` / `[frametemplate]` source preservation and targeted geometry
and metadata edits.

| Evidence | Result | Limit |
| --- | --- | --- |
| Pinned public contract 3 fixtures | Model, source spans, targeted edits and built-in checksums verified | Synthetic source |
| Hidden Electron image smoke | PNG decoding, masks, background-pattern visibility and undo verified | Separate from visible Workbench acceptance |
| Isolated native palette-width edit | Push, compile and re-export preserved all image references and unrelated source bytes | Visible Workbench reopening remains separate |
| Private local reference comparison | Recorded only in ignored `.local/` | No private source or screenshots are bundled |

Toolbar/menu rendering, advanced background positioning/mapping and complete
Workbench visual parity remain unverified. Source-format compatibility does not
certify these native presentation behaviours.
