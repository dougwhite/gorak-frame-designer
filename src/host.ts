import {
  GorakFrameDesigner,
  frameFromWml,
  parseWml,
  applyIntent,
  parseMetadata,
  applyMetadata,
  type WmlDocument,
  type FrameMetadata,
  type DefaultsLayer,
  type EditIntent,
} from "./designer";
import "./shell.css";
import { newFrameSource } from "./new-frame";
interface OpenedFile {
  uri: string;
  text: string;
  layers: DefaultsLayer[];
  metadata?: { uri: string; text: string };
}
declare global {
  interface Window {
    frameHost?: {
      open(): Promise<OpenedFile | null>;
      initial(): Promise<OpenedFile | null>;
      save(uri: string, text: string, metadata?: string): Promise<void>;
      create(text: string, metadata: string): Promise<OpenedFile | null>;
      title(value: string): void;
    };
  }
}
// Independently authored neutral examples and styles; no database is bundled.
const sample = `<frame><topform width="6500" height="4000"><freetrim name="heading" xleft="250" ytop="250" width="3500" height="400" stringvalue="Example frame"/><entryfield name="example_value" xleft="250" ytop="950" width="2400" height="330" datatype="varchar(40)"/><buttonfield name="example_button" xleft="250" ytop="1500" width="1500" height="375" textlabel="Example button"/></topform></frame>`;
const sampleLayers: DefaultsLayer[] = [];
let current = parseWml("synthetic:example.wml", 1, sample),
  metadata: FrameMetadata | undefined,
  layers = sampleLayers;
let saved = { text: current.text, metadata: undefined as string | undefined };
type Snapshot = { text: string; metadata?: string };
const undo: Snapshot[] = [],
  redo: Snapshot[] = [];
const designer = new GorakFrameDesigner();
const menu = document.createElement("nav");
menu.className = "menubar";
menu.setAttribute("aria-label", "Editor menu");
const status = document.createElement("div");
status.className = "status";
status.setAttribute("role", "status");
status.hidden = true;
const snapshot = (): Snapshot => ({
  text: current.text,
  metadata: metadata?.text,
});
const dirty = () =>
  current.text !== saved.text || metadata?.text !== saved.metadata;
function fail(error: unknown): void {
  status.textContent = String(error);
  status.hidden = false;
}
function show(next: WmlDocument, nextMetadata = metadata): void {
  const frame = frameFromWml(next, layers, nextMetadata);
  current = next;
  metadata = nextMetadata;
  designer.document = frame;
  const title = `${frame.title}${dirty() ? " *" : ""} — gorak frame designer`;
  document.title = title;
  window.frameHost?.title(title);
  undoButton.disabled = !undo.length;
  redoButton.disabled = !redo.length;
  status.hidden = true;
}
function remember(stack: Snapshot[], value: Snapshot): void {
  stack.push(value);
  let bytes = stack.reduce(
    (sum, s) => sum + s.text.length + (s.metadata?.length ?? 0),
    0,
  );
  while (stack.length > 1 && (stack.length > 100 || bytes > 8_000_000)) {
    const old = stack.shift()!;
    bytes -= old.text.length + (old.metadata?.length ?? 0);
  }
}
function load(opened: OpenedFile): void {
  const next = parseWml(opened.uri, current.version + 1, opened.text);
  const nextMetadata = opened.metadata
    ? parseMetadata(
        opened.metadata.uri,
        (metadata?.version ?? 0) + 1,
        opened.metadata.text,
      )
    : undefined;
  frameFromWml(next, opened.layers, nextMetadata);
  layers = opened.layers;
  saved = { text: next.text, metadata: nextMetadata?.text };
  undo.length = redo.length = 0;
  metadata = nextMetadata;
  show(next, nextMetadata);
}
const file = document.createElement("input");
file.type = "file";
file.accept = ".wml";
file.hidden = true;
file.onchange = async () => {
  try {
    const f = file.files?.[0];
    if (f) {
      if (f.size > 8_000_000) throw Error("WML exceeds 8 MB");
      load({ uri: f.name, text: await f.text(), layers: [] });
    }
  } catch (e) {
    fail(e);
  } finally {
    file.value = "";
  }
};
function commitInput(): void {
  const input = designer.shadowRoot?.activeElement;
  (input as HTMLElement | undefined)?.blur();
  if (
    (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) &&
    !input.checkValidity()
  )
    throw Error(input.validationMessage);
}
async function open(): Promise<void> {
  commitInput();
  if (
    dirty() &&
    !window.confirm("Discard unsaved edits and open another frame?")
  )
    return;
  if (window.frameHost) {
    const opened = await window.frameHost.open();
    if (opened) load(opened);
  } else file.click();
}
let saving = false;
async function save(): Promise<void> {
  commitInput();
  if (saving) return;
  saving = true;
  const state = snapshot(),
    uri = current.uri;
  try {
    if (window.frameHost) {
      if (uri.startsWith("synthetic:")) {
        const opened = await window.frameHost.create(
          state.text,
          state.metadata ??
            '[framesource]\nwindowwidth = "6500"\nwindowheight = "4000"\n\n===\n',
        );
        if (opened) load(opened);
        return;
      }
      await window.frameHost.save(uri, state.text, state.metadata);
    } else {
      for (const [name, text] of [
        [current.uri.split(/[\\/]/).at(-1), state.text],
        [metadata?.uri.split(/[\\/]/).at(-1), state.metadata],
      ]) {
        if (!name || text === undefined) continue;
        const url = URL.createObjectURL(
            new Blob([text], { type: "text/plain" }),
          ),
          link = document.createElement("a");
        link.href = url;
        link.download = String(name).replace("synthetic:", "");
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
    if (current.uri === uri) {
      saved = { text: state.text, metadata: state.metadata };
      show(current);
    }
  } finally {
    saving = false;
  }
}
function history(from: Snapshot[], to: Snapshot[]): void {
  commitInput();
  const state = from.at(-1);
  if (!state) return;
  const next = parseWml(current.uri, current.version + 1, state.text),
    nextMetadata =
      metadata && state.metadata !== undefined
        ? parseMetadata(metadata.uri, metadata.version + 1, state.metadata)
        : undefined;
  frameFromWml(next, layers, nextMetadata);
  remember(to, snapshot());
  from.pop();
  metadata = nextMetadata;
  show(next, nextMetadata);
}
function action(
  parent: HTMLElement,
  label: string,
  handler: () => void | Promise<void>,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = async () => {
    try {
      await handler();
    } catch (e) {
      fail(e);
    }
    if (parent instanceof HTMLDetailsElement) parent.open = false;
  };
  parent.append(b);
  return b;
}
function group(label: string): HTMLDetailsElement {
  const details = document.createElement("details"),
    summary = document.createElement("summary");
  summary.textContent = label;
  details.append(summary);
  details.addEventListener("toggle", () => {
    if (details.open)
      for (const other of menu.querySelectorAll("details"))
        if (other !== details) other.open = false;
  });
  menu.append(details);
  return details;
}
const fileMenu = group("File");
action(fileMenu, "New Frame", () => {
  commitInput();
  if (
    dirty() &&
    !window.confirm("Discard unsaved edits and create a new frame?")
  )
    return;
  load({
    uri: "synthetic:untitled.wml",
    text: newFrameSource().text,
    metadata: {
      uri: "synthetic:untitled.w4gl",
      text: newFrameSource().metadata,
    },
    layers: sampleLayers,
  });
});
action(fileMenu, "Open…", open);
action(fileMenu, "Save    Ctrl+S", save);
const editMenu = group("Edit");
const undoButton = action(editMenu, "Undo    Ctrl+Z", () =>
  history(undo, redo),
);
const redoButton = action(editMenu, "Redo    Ctrl+Y", () =>
  history(redo, undo),
);
const viewMenu = group("View");
action(viewMenu, "Select Window", () => designer.selectFrame());
const groupMenu = group("Group");
action(groupMenu, "Flexible Form", () =>
  designer.groupSelection("flexibleform"),
);
action(groupMenu, "Subform", () => designer.groupSelection("subform"));
action(groupMenu, "Ungroup", () => designer.ungroupSelection());
action(groupMenu, "Stack Field (vertical)", () =>
  designer.groupSelection("stackfield"),
);
action(groupMenu, "Stack Field (horizontal)", () =>
  designer.groupSelection("stackfield", 2),
);
for (const label of ["Tablefield", "Matrixfield", "Viewport"]) {
  const b = action(groupMenu, label, () => {});
  b.disabled = true;
  b.title = "Composite grouping requires additional Workbench validation";
}
const closeMenus = () => {
  for (const details of menu.querySelectorAll("details")) details.open = false;
};
window.addEventListener("pointerdown", (event) => {
  if (!event.composedPath().includes(menu)) closeMenus();
});
window.addEventListener("focusin", (event) => {
  if (!event.composedPath().includes(menu)) closeMenus();
});
window.addEventListener("blur", closeMenus);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenus();
});
designer.addEventListener("edit-intent", (event) => {
  try {
    const intent = (event as CustomEvent<EditIntent>).detail;
    const next =
      intent.uri === current.uri ? applyIntent(current, intent) : current;
    const nextMetadata =
      metadata && intent.uri === metadata.uri
        ? applyMetadata(metadata, intent)
        : metadata;
    if (next === current && nextMetadata === metadata)
      throw Error("Edit targets another document");
    if (next.text === current.text && nextMetadata?.text === metadata?.text)
      return;
    frameFromWml(next, layers, nextMetadata);
    remember(undo, snapshot());
    redo.length = 0;
    show(next, nextMetadata);
  } catch (e) {
    fail(e);
  }
});
designer.addEventListener("designer-error", (e) =>
  fail((e as CustomEvent).detail),
);
window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (!["s", "z", "y", "o"].includes(key)) return;
  event.preventDefault();
  try {
    if (key === "s") void save().catch(fail);
    else if (key === "o") void open().catch(fail);
    else if (key === "y" || event.shiftKey) history(redo, undo);
    else history(undo, redo);
  } catch (e) {
    fail(e);
  }
});
window.addEventListener("beforeunload", (event) => {
  if (dirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
document.body.append(menu, file, designer, status);
show(current);
window.frameHost
  ?.initial()
  .then((opened) => {
    if (opened) load(opened);
  })
  .catch(fail);
