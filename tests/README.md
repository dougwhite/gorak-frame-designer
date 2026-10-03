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
