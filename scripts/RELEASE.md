# Library release

Run `npm ci`, `npm run compatibility:fetch`, `npm run test:compatibility`,
`npm run verify`, and `npm run test:desktop` (Linux: prefix the last command
with `xvfb-run -a`). Then run `npm run release:package`.

`release/gorak-frame-designer-<version>.tgz` contains a `package/` directory
with the browser ES module, declarations, runtime assets, a library-only
manifest, LICENSE and third-party notices. `release/SHA256SUMS` verifies it.
The script inspects the build inventory and extracted files, imports the
custom element with browser globals, and compiles a consumer under Bundler
and NodeNext without skipping declaration checks. Packaging does not build;
use a fresh build. Unexpected output or unlicensed bundled modules fail closed.

Hosts should pin the tag and checksum, extract and bundle the library into
their browser/webview build, and retain both notice files. Import the package
in a browser environment; it registers `gorak-frame-designer`. Node itself
needs DOM globals. Runtime field bitmap data is supplied by the host.

After review and merge, update both package version fields and the lockfile
root version for each release, then push the matching `v<version>` tag.
Following gorak-lsp-rs, CI tests compatibility, builds and smoke-tests Electron
on Windows and Linux. Only after both pass does one Linux runner build,
package and validate the archive. Tag/version mismatch fails packaging.
The tag workflow creates the GitHub prerelease with the archive and checksums;
do not create an empty release first. No npm publication is performed.
