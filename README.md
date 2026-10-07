# gorak frame designer

A web-based OpenROAD frame editor for [gorak](https://github.com/dougwhite/gorak), with an Electron shell and an embeddable web component.

**Early alpha.** Supports viewing and source-preserving editing of current gorak WML. Workbench parity and VS Code integration are still in progress.

## Development

Use Node.js 24 or later.

```sh
npm ci
npm run dev          # browser development
npm run desktop      # build and run Electron
npm run build        # browser shell and embeddable ES module
```

In Electron, use File → Open to load a `.wml` file. Keep its companion `.w4gl` and stylesheet files in the gorak project layout. Edits stay in memory until Ctrl+S. Older exports using `gorak_style` require re-exporting with current gorak.

## Tests

```sh
npm run verify      # behavioural tests, type checks and browser/library builds
npm run test:desktop
```

GitHub Actions runs both commands on Windows and Linux with Node.js 24 for pull
requests and pushes to `main`. On headless Linux, run the desktop smoke test with
`xvfb-run -a npm run test:desktop`. The smoke test does not establish Workbench parity.

## License

MIT. Copyright © 2026 Doug White.

Hosts can set `designer.readOnly = true` for viewer mode. It defaults to `false`; setting it back restores editing. Viewer mode hides the palette and resize handles, disables property editing, and blocks edit intents (including deletion, grouping and dragging). Selection, property inspection, zoom/pan and source navigation remain available. Changing modes cancels any active gesture. Hosts must also enforce their own write policy at the message boundary.
