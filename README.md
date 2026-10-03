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
node --experimental-strip-types --test tests/*.test.mjs tests/*.test.cjs
npm run test:desktop
```

## License

MIT. Copyright © 2026 Doug White.
