# Working on gorak frame designer

Build a modern HTML frame designer matching OpenROAD Workbench frame semantics, with zoom/pan and excellent source navigation. Clean, small, maintainable code is the standard. This repository owns the designer, not the language server or extension.

## Boundaries and architecture

- `src/designer.ts`: host-neutral custom element and typed document/selection contract. No Node, Electron, VS Code, filesystem or database dependencies here. Geometry conversion belongs in the document model.
- `src/main.ts`: browser/Electron development harness. `electron/main.cjs`: sandboxed desktop shell. `dist-library/`: includable ES module build.
- Build a separate source-preserving WML/document model. WML and companion metadata remain authoritative. Use targeted, version-checked text edits, not whole-file XML serialization. Preserve scripts, comments, unknown structures and selectors.
- Resolve native palette styles stock → project → application → frame. Stylesheets never supply existing field state. Preserve native `fieldstyle` independently; reject retired `gorak_style` source. Show known native defaults and property origins; leave unknown defaults unresolved.
- Establish typed properties, enum meanings, units and class inheritance using Actian documentation and isolated Workbench experiments. The CLI schema is reconstruction evidence, not a complete designer specification.
- Hosts supply documents/defaults and selection requests. Designer emits edit intentions, source-navigation and selection events. Field identity must handle nested/unnamed fields. Keep source locations and document versions.
- Later VS Code integration: default WML custom editor; quick source/designer toggle; field-definition navigation reveals/selects the visual field. Preserve valid ordinary LSP source locations. Do not alter sibling repositories without a specific integration task.
- Keep desktop renderer sandboxed, with no Node integration. Add only narrowly scoped IPC when needed. Parse source as data; never execute embedded scripts or HTML.

## Development sequence

1. If present, read ignored `.local/SETUP.md` for local development instructions.
2. Calibrate a read-only WML viewer against Workbench: dimensions/units, fonts, colours, borders, nesting; then zoom/pan, hierarchy, inspector and navigation.
3. Add source-preserving geometry/property editing and undo/redo through a host adapter.
4. Add supported field creation/deletion/duplication, alignment, tab order, menus and tablefields.
5. Integrate the component into the extension via a separate reviewed change.

Validate one property or operation at a time: Workbench save → gorak pull → inspect source delta → designer comparison → edit → gorak push/compile → Workbench reopen → re-export. Distinguish observed behaviour from assumptions. Use an evidence matrix; do not claim full Workbench parity from a visual approximation.

## Privacy and testing

- `test-project/` is an ignored, separate local gorak repository. `.local/` contains private machine instructions/evidence. Neither belongs in public Git history.
- The private reference corpus outside this repository is read-only analysis material. Never copy its code, names, screenshots, data, connection details or derived source fragments into tracked files. Author neutral synthetic cases independently.
- No remote publication until explicit authorization and a complete privacy review. Keep README brief. MIT copyright Doug White.
- Run `npm run build` and `npm run test:desktop` after changes, plus focused behavioural tests for new logic. Native UI acceptance is separate from the hidden Electron smoke test.
- Prioritise Citrix: lazy loading, bounded data, no full-workspace scan for a frame, one undoable edit per gesture, virtualized large controls. Measure memory and responsiveness.
