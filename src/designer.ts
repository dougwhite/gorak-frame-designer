import {
  propertyEdit,
  createField,
  deleteFields,
  selectionRoots,
  resolveProperties,
  type DefaultsLayer,
  type WmlDocument,
  type EditIntent,
} from "./wml";
import { metadataEdit, type FrameMetadata } from "./metadata";
import { WML_TO_CSS } from "./frame-model";
import { sourcePosition, segmentGeometry } from "./geometry";
import { outerPadding } from "./container-layout";
import { emptyFrameDefaults } from "./new-frame";
import {
  schema,
  enums,
  displayValue,
  inspectorNames,
  windowNames,
  windowKey,
  propertyKey,
  validateProperty,
} from "./inspector";
import type { PaletteTool } from "./palette";
import { applyAppearance } from "./appearance";
import {
  groupFields,
  ungroupField,
  reorderStack,
  type GroupKind,
} from "./grouping";
import type { FieldChoice } from "./choices";
import { renderField } from "./field-view";
import { pageVisible, fieldClip } from "./field-visibility";
import type { FieldBitmap } from "./bitmap";
export * from "./wml";
export * from "./metadata";
export { frameFromWml, WML_TO_CSS } from "./frame-model";
export interface FrameField {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  properties: Readonly<Record<string, string>>;
  parentId?: string;
  propertyOrigins?: Readonly<Record<string, string>>;
  source?: { start: number; end: number };
  choices?: readonly FieldChoice[];
  columns?: readonly { label: string; width: number }[];
  pageScopes?: readonly { folderId: string; index: number }[];
  tabTarget?: { folderId: string; index: number };
  bitmap?: FieldBitmap;
  selectedBitmap?: FieldBitmap;
  prototype?: {
    kind: string;
    properties: Readonly<Record<string, string>>;
    choices?: readonly FieldChoice[];
  };
}
export interface FrameDocument {
  uri: string;
  version: number;
  title: string;
  width: number;
  height: number;
  fields: readonly FrameField[];
  source?: WmlDocument;
  metadata?: FrameMetadata;
  formId?: string;
  formProperties?: Readonly<Record<string, string>>;
  formOrigins?: Readonly<Record<string, string>>;
  palette?: readonly PaletteTool[];
  defaults?: readonly DefaultsLayer[];
}
export class GorakFrameDesigner extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });
  #document?: FrameDocument;
  #selected?: string;
  #selection = new Set<string>();
  #tool = "0";
  #zoom = 1;
  #scroll = { left: 0, top: 0 };
  #inspectorScroll = 0;
  #filter = "All";
  #gestureActive = false;
  #scrollScheduled = false;
  #activePages = new Map<string, number>();
  set document(value: FrameDocument) {
    if (value.uri !== this.#document?.uri) {
      this.#activePages.clear();
      this.#selection.clear();
      this.#selected = undefined;
    }
    this.#document = value;
    this.#selection = new Set(
      [...this.#selection].filter((id) =>
        value.fields.some((f) => f.id === id),
      ),
    );
    if (!value.fields.some((f) => f.id === this.#selected))
      this.#selected = [...this.#selection].at(-1);
    this.#render();
  }
  get document(): FrameDocument | undefined {
    return this.#document;
  }
  get zoom(): number {
    return this.#zoom;
  }
  get selectedFieldId(): string | undefined {
    return this.#selected;
  }
  get selectedFieldIds(): readonly string[] {
    return [...this.#selection];
  }
  requestSourceNavigation(id = this.#selected): void {
    const doc = this.#document,
      field = doc?.fields.find((f) => f.id === id);
    if (doc && field?.source)
      this.#emit("source-navigation", {
        uri: doc.uri,
        version: doc.version,
        fieldId: field.id,
        range: field.source,
      });
  }
  selectFields(ids: readonly string[]): void {
    this.#selection = new Set(
      ids.filter((id) => this.#document?.fields.some((f) => f.id === id)),
    );
    this.#selected = [...this.#selection].at(-1);
    this.#tool = "0";
    this.#render();
    this.#emit("selection-change", {
      uri: this.#document?.uri,
      version: this.#document?.version,
      fieldId: this.#selected,
      fieldIds: [...this.#selection],
    });
  }
  deleteSelection(): void {
    const doc = this.#document;
    if (!doc?.source || !this.#selection.size) return;
    try {
      const intent = deleteFields(doc.source, [...this.#selection]);
      this.#selection.clear();
      this.#selected = undefined;
      this.#edit(intent);
    } catch (error) {
      this.#error(error);
    }
  }
  groupSelection(kind: GroupKind, orientation = 1): void {
    const doc = this.#document;
    if (!doc?.source) return;
    try {
      const members = doc.fields
        .filter((f) => this.#selection.has(f.id))
        .map((f) => ({
          id: f.id,
          x: Number(f.properties.xleft),
          y: Number(f.properties.ytop),
          width: Number(f.properties.width) + outerPadding(f.kind),
          height: Number(f.properties.height) + outerPadding(f.kind),
          properties: f.properties,
        }));
      const intent = groupFields(
        doc.source,
        members,
        kind,
        undefined,
        orientation,
      );
      this.#selection.clear();
      this.#selected = undefined;
      this.#edit(intent);
      const group = this.#document?.fields.find(
        (f) => f.kind === kind && !doc.fields.some((old) => old.id === f.id),
      );
      if (group) this.selectField(group.id);
    } catch (error) {
      this.#error(error);
    }
  }
  ungroupSelection(): void {
    const doc = this.#document,
      group = doc?.fields.find((f) => f.id === this.#selected);
    if (!doc?.source || !group || this.#selection.size !== 1) return;
    try {
      const children = doc.fields
        .filter((f) => f.parentId === group.id)
        .map((f) => ({
          id: f.id,
          x: Number(f.properties.xleft),
          y: Number(f.properties.ytop),
          width: f.width,
          height: f.height,
          properties: f.properties,
        }));
      const intent = ungroupField(
        doc.source,
        group.id,
        children,
        Number(group.properties.xleft),
        Number(group.properties.ytop),
      );
      this.#selection.clear();
      this.#selected = undefined;
      this.#edit(intent);
    } catch (error) {
      this.#error(error);
    }
  }
  selectField(id: string): void {
    for (const scope of this.#document?.fields.find((f) => f.id === id)
      ?.pageScopes ?? [])
      this.#activePages.set(scope.folderId, scope.index);
    const field = this.#document?.fields.find((f) => f.id === id);
    if (!field) return;
    const viewport = this.#root.querySelector<HTMLElement>(".viewport");
    if (viewport) {
      const x = field.x * this.#zoom + 48,
        y = field.y * this.#zoom + 64;
      if (
        x < viewport.scrollLeft ||
        x + field.width * this.#zoom >
          viewport.scrollLeft + viewport.clientWidth
      )
        viewport.scrollLeft = Math.max(0, x - 48);
      if (
        y < viewport.scrollTop ||
        y + field.height * this.#zoom >
          viewport.scrollTop + viewport.clientHeight
      )
        viewport.scrollTop = Math.max(0, y - 64);
    }
    this.#selected = id;
    this.#selection = new Set([id]);
    this.#tool = "0";
    this.#render();
    this.#emit("selection-change", {
      uri: this.#document!.uri,
      version: this.#document!.version,
      fieldId: id,
      fieldIds: [id],
    });
  }
  selectFrame(): void {
    this.#selected = undefined;
    this.#selection.clear();
    this.#render();
    this.#emit("selection-change", {
      uri: this.#document?.uri,
      version: this.#document?.version,
      fieldIds: [],
    });
  }
  connectedCallback(): void {
    this.tabIndex = 0;
    this.onkeydown = (event) => {
      if (
        event.key !== "Delete" ||
        event
          .composedPath()
          .some(
            (target) =>
              target instanceof HTMLInputElement ||
              target instanceof HTMLSelectElement ||
              target instanceof HTMLTextAreaElement,
          )
      )
        return;
      event.preventDefault();
      this.deleteSelection();
    };
    this.#render();
  }
  #emit(name: string, detail: unknown): void {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }
  #edit(intent: EditIntent): void {
    this.#emit("edit-intent", intent);
  }
  #error(error: unknown): void {
    this.#emit("designer-error", String(error));
  }
  #render(): void {
    const old = this.#root.querySelector(".viewport");
    if (old) this.#scroll = { left: old.scrollLeft, top: old.scrollTop };
    const oldProps = this.#root.querySelector(".properties");
    if (oldProps) this.#inspectorScroll = oldProps.scrollTop;
    this.#root.innerHTML = `<style>
   :host{display:block;height:100%;font:12px Arial,sans-serif;color:#dce3ee;background:#202733}*{box-sizing:border-box}button,input,select{font:inherit;color:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.4}
   main{display:grid;grid-template-columns:90px minmax(0,1fr) 310px;height:100%}.palette{border-right:1px solid #526074;background:#293341;padding:6px}.palette h3,.inspector h3{font-size:12px;font-weight:normal;margin:0 0 7px}.tools{display:grid;grid-template-columns:repeat(3,24px);gap:2px}.tool{height:25px;padding:0;border:1px solid #647185;border-radius:0;background:#e5e7e9;color:#10244b;font:bold 14px Arial}.tool[aria-pressed=true]{background:#9fcaff;border-color:#489dff;box-shadow:inset 0 0 0 1px #207de0}
   .workarea{position:relative;min-width:0;overflow:hidden}.zoomtools{position:absolute;z-index:5;left:16px;top:12px;display:flex;align-items:center;gap:3px;background:#303c4e;border:1px solid #536078;padding:3px;box-shadow:0 2px 6px #0003}.zoomtools button{width:26px;height:24px;padding:0;border:0;background:transparent;font-size:18px}.zoomtools button:hover{background:#526074}.zoomtools span{min-width:40px;text-align:center;font-size:11px}.viewport{height:100%;overflow:auto;padding:64px 48px;touch-action:none;background-color:#1e2530;background-image:radial-gradient(#52607466 .6px,transparent .6px);background-size:12px 12px}.extent{position:relative;min-width:100%;min-height:100%}.canvas{position:absolute;transform-origin:top left;box-shadow:0 4px 24px #0008;background:#f0f0f0;color:#111;outline:1px solid #9299a5}.surface{position:absolute;inset:0;overflow:hidden}.canvas.window-selected{outline:1px solid #56a0ff}
   .field{position:absolute;padding:0;border-radius:0;color:#111;font:11px Arial;white-space:nowrap;overflow:hidden;background:#f0f0f0;border:1px solid #111}.field.selected{outline:1px dotted #165da5;outline-offset:2px}.entryfield{background:white;text-align:left;box-sizing:content-box}.buttonfield{box-sizing:content-box;box-shadow:inset -1px -1px #777}.freetrim{background:transparent;border:0;text-align:left}.boxtrim{background:transparent;text-align:left}.ellipseshape{border-radius:50%;background:transparent}.linesegmentshape{border:0;border-top:1px solid #111;background:transparent}.togglefield{background:transparent;border:0;text-align:left}.unsupported{background:repeating-linear-gradient(45deg,#ddd,#ddd 4px,#eee 4px,#eee 8px);color:#555}.handle{position:absolute;width:7px;height:7px;background:#eff6ff;border:1px solid #216dcc;z-index:4;transform:translate(-50%,-50%);padding:0}.preview{position:absolute;border:1px dashed #216dcc;background:#499aff22;pointer-events:none}
   .inspector{display:flex;flex-direction:column;min-height:0;min-width:0;background:#293341;border-left:1px solid #526074}.inspector h3{padding:7px 7px 0}.selectors{padding:0 4px 3px;display:grid;grid-template-columns:2fr 1fr;gap:2px}.selectors .selection{grid-column:1/-1}.selectors select,.selectors input{height:21px;width:100%;min-width:0;border:1px solid #68758a;background:#202938;padding:1px 3px;border-radius:0}.properties{flex:1;overflow:auto;padding:2px 5px;background:#252e3b}.row{display:grid;grid-template-columns:46% 54%;min-height:18px;align-items:center}.row label{padding:1px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.value{min-width:0;width:100%;height:18px;padding:0 2px;background:transparent;border:1px solid transparent;border-radius:0;outline:0}.value:hover{border-color:#536078}.value:focus{background:#142237;border-color:#58a5ff}.value:disabled{color:#a9b4c6;opacity:1}.value option{background:#252e3b}.help{height:39px;padding:5px 7px;border-top:1px solid #526074;font-size:11px;color:#b3c1d5;overflow:hidden}
  </style><main><nav class="palette" aria-label="Field palette"><h3>Field Palette</h3><div class="tools"></div></nav><section class="workarea"><div class="zoomtools" aria-label="Zoom controls"><button data-action="out" aria-label="Zoom out" title="Zoom out">−</button><span></span><button data-action="in" aria-label="Zoom in" title="Zoom in">+</button><button data-action="reset" aria-label="Actual size" title="Actual size">⊙</button><button data-action="fit" aria-label="Fit frame" title="Fit frame">⛶</button></div><div class="viewport"><div class="extent"><div class="canvas"><div class="surface"></div></div></div></div></section><aside class="inspector"><h3>Property Inspector</h3><div class="selectors"><select class="selection" aria-label="Selected object"></select><input class="objectname" readonly aria-label="Object name"><select class="filter" aria-label="Property filter"><option>All</option><option>Appearance</option><option>Layout</option><option>Position and Size</option><option>Bias</option><option>Miscellaneous</option></select></div><div class="properties"></div><div class="help">Select a property to see its origin.</div></aside></main>`;
    const doc = this.#document;
    if (!doc) return;
    const viewport = this.#root.querySelector<HTMLElement>(".viewport")!;
    const canvas = this.#root.querySelector<HTMLElement>(".canvas")!;
    const surface = this.#root.querySelector<HTMLElement>(".surface")!;
    const extent = this.#root.querySelector<HTMLElement>(".extent")!;
    canvas.classList.toggle("window-selected", !this.#selected);
    Object.assign(canvas.style, {
      width: `${doc.width}px`,
      height: `${doc.height}px`,
      transform: `scale(${this.#zoom})`,
    });
    applyAppearance(canvas, doc.formProperties ?? {});
    extent.style.width = `${doc.width * this.#zoom + 24}px`;
    extent.style.height = `${doc.height * this.#zoom + 24}px`;
    this.#root.querySelector(".zoomtools span")!.textContent =
      `${Math.round(this.#zoom * 100)}%`;
    for (const button of this.#root.querySelectorAll<HTMLButtonElement>(
      "[data-action]",
    ))
      button.onclick = () => {
        const action = button.dataset.action;
        this.#zoom =
          action === "reset"
            ? 1
            : action === "fit"
              ? Math.max(
                  0.1,
                  Math.min(
                    4,
                    (viewport.clientWidth - 100) / doc.width,
                    (viewport.clientHeight - 130) / doc.height,
                  ),
                )
              : Math.max(
                  0.1,
                  Math.min(4, this.#zoom + (action === "in" ? 0.25 : -0.25)),
                );
        this.#render();
      };
    for (const tool of doc.palette ?? [
      { id: "0", label: "Select", icon: "↖" },
    ]) {
      const b = document.createElement("button");
      b.className = "tool";
      b.textContent = tool.icon;
      b.title =
        tool.label +
        (tool.className ? ` (${tool.className})` : "") +
        (tool.id !== "0" && !tool.kind
          ? " — definition not supported yet"
          : "");
      b.setAttribute(
        "aria-label",
        tool.label + (tool.className ? ` (${tool.className})` : ""),
      );
      b.setAttribute("aria-pressed", String(tool.id === this.#tool));
      b.disabled = tool.id !== "0" && !tool.kind;
      b.dataset.tool = tool.id;
      b.onclick = () => {
        this.#tool = tool.id;
        this.#render();
      };
      this.#root.querySelector(".tools")!.append(b);
    }
    const selected = doc.fields.find((f) => f.id === this.#selected);
    const pageFields = doc.fields.filter((f) => this.#pageVisible(f));
    const fieldsById = new Map(doc.fields.map((f) => [f.id, f]));
    const visible =
      pageFields.length <= 1000
        ? pageFields
        : pageFields
            .filter(
              (f) =>
                f.id === this.#selected ||
                (f.x + f.width >= (this.#scroll.left - 48) / this.#zoom &&
                  f.y + f.height >= (this.#scroll.top - 64) / this.#zoom &&
                  f.x <=
                    (this.#scroll.left + viewport.clientWidth) / this.#zoom &&
                  f.y <=
                    (this.#scroll.top + viewport.clientHeight) / this.#zoom),
            )
            .slice(0, 1000);
    for (const field of visible) {
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.field = field.id;
      el.className = `field ${field.kind}${this.#selection.has(field.id) ? " selected" : ""}`;
      el.title = `${field.name} (${field.kind.toUpperCase()})`;
      Object.assign(el.style, {
        left: `${field.x}px`,
        top: `${field.y}px`,
        width: `${field.width}px`,
        height: `${field.height}px`,
      });
      applyAppearance(el, field.properties);
      const tabActive =
        field.tabTarget &&
        (this.#activePages.get(field.tabTarget.folderId) ?? 0) ===
          field.tabTarget.index;
      renderField(
        el,
        tabActive && field.selectedBitmap
          ? { ...field, bitmap: field.selectedBitmap }
          : field,
      );
      const clip = fieldClip(field, fieldsById);
      if (clip) el.style.clipPath = clip;
      if (field.tabTarget) {
        const active =
          (this.#activePages.get(field.tabTarget.folderId) ?? 0) ===
          field.tabTarget.index;
        el.setAttribute("role", "tab");
        el.setAttribute("aria-selected", String(active));
        if (active) {
          el.style.fontWeight = "bold";
          el.style.borderBottomColor = "transparent";
        }
      }
      el.onpointerdown = (e) => {
        if (e.button !== 0 || e.altKey) return;
        e.stopPropagation();
        if (this.#tool !== "0") return;
        this.focus({ preventScroll: true });
        if (field.tabTarget && !e.ctrlKey && !e.shiftKey) {
          this.#activePages.set(
            field.tabTarget.folderId,
            field.tabTarget.index,
          );
          this.selectField(field.id);
          return;
        }
        if (e.ctrlKey) {
          field.parentId
            ? this.selectField(field.parentId)
            : this.selectFrame();
          return;
        }
        if (e.shiftKey) {
          const ids = new Set(this.#selection);
          ids.has(field.id) ? ids.delete(field.id) : ids.add(field.id);
          this.selectFields([...ids]);
          return;
        }
        if (!this.#selection.has(field.id)) {
          this.selectField(field.id);
        }
        this.#move(e, field);
      };
      surface.append(el);
    }
    if (selected && this.#selection.size === 1 && doc.source)
      this.#handles(
        canvas,
        selected.x,
        selected.y,
        selected.width,
        selected.height,
        (e, dir) => this.#resize(e, dir, selected),
      );
    else if (!selected && (doc.metadata || doc.source))
      this.#handles(canvas, 0, 0, doc.width, doc.height, (e, dir) =>
        this.#resize(e, dir),
      );
    surface.onpointerdown = (e) => {
      if (e.button !== 0 || e.altKey) return;
      const tool = doc.palette?.find((t) => t.id === this.#tool);
      if (tool?.kind) this.#create(e, tool);
      else if (e.target === surface) this.#marquee(e);
    };
    viewport.onpointerdown = (e) => {
      if (e.button !== 1 && !e.altKey) return;
      e.preventDefault();
      const { clientX: x, clientY: y } = e,
        left = viewport.scrollLeft,
        top = viewport.scrollTop;
      this.#gesture(
        e,
        (m) => {
          viewport.scrollLeft = left + x - m.clientX;
          viewport.scrollTop = top + y - m.clientY;
        },
        () => this.#render(),
      );
    };
    const selector = this.#root.querySelector<HTMLSelectElement>(".selection")!;
    const choices = doc.fields.slice(0, 1000);
    if (selected && !choices.includes(selected)) choices.push(selected);
    for (const [value, label] of [
      ["", doc.title.replace(/\.wml$/i, "")],
      ...choices.map((f) => [
        f.id,
        `${f.name || "(unnamed)"} (${f.kind.toUpperCase()})`,
      ]),
    ]) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      selector.append(o);
    }
    if (doc.fields.length > 1000) {
      const o = document.createElement("option");
      o.disabled = true;
      o.textContent = "More objects: select on canvas";
      selector.append(o);
    }
    selector.value = this.#selected ?? "";
    selector.onchange = () =>
      selector.value ? this.selectField(selector.value) : this.selectFrame();
    this.#root.querySelector<HTMLInputElement>(".objectname")!.value =
      this.#selection.size > 1
        ? `${this.#selection.size} fields`
        : (selected?.name ?? doc.title.replace(/\.wml$/i, ""));
    const filter = this.#root.querySelector<HTMLSelectElement>(".filter")!;
    filter.value = this.#filter;
    filter.onchange = () => {
      this.#filter = filter.value;
      this.#inspectorScroll = 0;
      this.#render();
    };
    this.#properties(selected);
    viewport.scrollLeft = this.#scroll.left;
    viewport.scrollTop = this.#scroll.top;
    viewport.onscroll = () => {
      if (
        doc.fields.length <= 1000 ||
        this.#gestureActive ||
        this.#scrollScheduled
      )
        return;
      this.#scrollScheduled = true;
      requestAnimationFrame(() => {
        this.#scrollScheduled = false;
        this.#render();
      });
    };
    this.#root.querySelector(".properties")!.scrollTop = this.#inspectorScroll;
  }
  #properties(field?: FrameField): void {
    const doc = this.#document!;
    const names = field
      ? inspectorNames(field.kind, field.properties)
      : windowNames;
    const list = this.#root.querySelector(".properties")!,
      help = this.#root.querySelector(".help")!;
    const geometry =
      /^(Abs|Outer|[XY]|Width|Height|Window(Width|Height|Left|Top)|AnchorPoint|Gravity)/;
    const appearance =
      /Color|Bitmap|Pattern|Style|Outline|TypeFace|TypeSize|IsBold|IsItalic|IsPlain|IsReverse/;
    for (const label of names) {
      if (
        (this.#filter === "Position and Size" && !geometry.test(label)) ||
        (this.#filter === "Appearance" && !appearance.test(label)) ||
        (this.#filter === "Layout" &&
          !/Anchor|Gravity|Margin|Lines|Chars|Alignment/.test(label)) ||
        (this.#filter === "Bias" && !/Bias/.test(label)) ||
        (this.#filter === "Miscellaneous" &&
          (geometry.test(label) ||
            appearance.test(label) ||
            /Bias|Anchor|Gravity|Margin|Lines|Chars|Alignment/.test(label)))
      )
        continue;
      const key = field ? propertyKey(label) : windowKey(label);
      const formKey = ["bgcolor", "bgpattern", "transparentcolor"].includes(
        key,
      );
      const props = field?.properties ?? (formKey ? doc.formProperties : {});
      let raw = field
        ? props?.[key]
        : formKey
          ? props?.[key]
          : doc.metadata?.attributes[key]?.value;
      let origin = field
        ? field.propertyOrigins?.[key]
        : formKey
          ? doc.formOrigins?.[key]
          : raw !== undefined
            ? "Frame metadata"
            : undefined;
      if (
        field &&
        raw === undefined &&
        [
          "entryfield",
          "buttonfield",
          "boxtrim",
          "imagefield",
          "imagetrim",
        ].includes(field.kind)
      ) {
        const padding = outerPadding(field.kind),
          outerWidth = Number(field.properties.width) + padding,
          outerHeight = Number(field.properties.height) + padding,
          absLeft = sourcePosition(field.x + 3),
          absTop = sourcePosition(field.y + 4);
        const derived: Record<string, string> = {
          outerwidth: String(outerWidth),
          outerheight: String(outerHeight),
          absxleft: String(absLeft),
          absxright: String(absLeft + outerWidth),
          absytop: String(absTop),
          absybottom: String(absTop + outerHeight),
        };
        raw = derived[key];
        if (raw !== undefined)
          origin = "Derived geometry (calibrated native controls)";
      }
      if (
        !field &&
        !doc.metadata &&
        ["windowwidth", "windowheight"].includes(key)
      ) {
        raw = String(
          Math.round(
            (key === "windowwidth" ? doc.width : doc.height) / WML_TO_CSS,
          ),
        );
        origin = "WML topform (no companion)";
      }
      const kind = field?.kind ?? "framesource";
      const node = doc.source?.nodes.find(
        (n) => n.id === (field?.id ?? doc.formId),
      );
      const explicit =
        field || formKey
          ? !!node?.attributes[key] ||
            !!node?.children.some(
              (child) => child.kind === key && child.value !== undefined,
            )
          : !!doc.metadata?.attributes[key];
      let inherited: string | undefined;
      if (
        !field &&
        !formKey &&
        doc.metadata?.attributes.templatename?.value === "empty_frame"
      ) {
        inherited = emptyFrameDefaults[key];
        if (raw === undefined && inherited !== undefined) {
          raw = inherited;
          origin = "empty_frame template default";
        }
      }
      if ((field || formKey) && node) {
        const attributes = { ...node.attributes };
        delete attributes[key];
        try {
          inherited = resolveProperties(
            {
              ...node,
              attributes,
              children: node.children.filter(
                (child) => child.kind !== key || child.value === undefined,
              ),
            },
            doc.defaults ?? [],
          )[key]?.value;
        } catch {
          /* Unknown native defaults stay unresolved. */
        }
      }
      const defaultLabel =
        inherited === undefined
          ? "(Native default — unresolved)"
          : `${displayValue(kind, key, inherited)} (Native default)`;
      const type = schema[kind]?.[key] ?? (formKey ? "xs:integer" : undefined);
      const editable =
        !!type &&
        !!doc.source &&
        !(field?.propertyOrigins?.[key] === "Native container layout") &&
        (field
          ? true
          : formKey ||
            !!doc.metadata ||
            ["windowwidth", "windowheight"].includes(key));
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("label");
      name.textContent = label;
      let control: HTMLInputElement | HTMLSelectElement;
      const boolean = type === "or_bool",
        choices = enums[key];
      if (boolean || choices) {
        const select = document.createElement("select");
        control = select;
        {
          const o = document.createElement("option");
          o.value = "__inherit__";
          o.textContent = defaultLabel;
          select.append(o);
        }
        for (const [v, text] of Object.entries(
          boolean ? { "0": "FALSE", "1": "TRUE" } : choices,
        )) {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = text;
          select.append(o);
        }
        if (
          raw !== undefined &&
          !Array.from(select.options).some((o) => o.value === raw)
        ) {
          const o = document.createElement("option");
          o.value = raw;
          o.textContent = raw;
          select.append(o);
        }
        select.value = explicit ? (raw ?? "__inherit__") : "__inherit__";
      } else {
        const input = document.createElement("input");
        control = input;
        input.value = raw === undefined ? "" : displayValue(kind, key, raw);
        input.placeholder = editable ? "(default)" : "(native / derived)";
        if (editable) {
          const datalist = document.createElement("datalist");
          datalist.id = `defaults-${key}`;
          const option = document.createElement("option");
          option.value = defaultLabel;
          datalist.append(option);
          row.append(datalist);
          input.setAttribute("list", datalist.id);
        }
      }
      control.className = "value";
      control.setAttribute("aria-label", key);
      control.disabled = !editable;
      const details = `${label} · ${origin ?? "Not supplied; native default unresolved"}${geometry.test(label) ? " · 1/1000 inch" : ""}${!editable ? " · read only" : ""}`;
      control.title = details;
      row.onpointerenter = () => {
        help.textContent = details;
      };
      control.onfocus = () => {
        help.textContent = details;
      };
      control.onchange = () => {
        try {
          const value =
            control.value === "__inherit__" || control.value === defaultLabel
              ? null
              : control.value;
          if (value !== null) validateProperty(kind, key, value);
          control.setCustomValidity("");
          if (field)
            this.#edit(propertyEdit(doc.source!, field.id, key, value));
          else if (formKey)
            this.#edit(propertyEdit(doc.source!, doc.formId!, key, value));
          else if (doc.metadata)
            this.#edit(metadataEdit(doc.metadata, { [key]: value }));
          else
            this.#edit(
              propertyEdit(
                doc.source!,
                doc.formId!,
                key === "windowwidth" ? "width" : "height",
                value,
              ),
            );
        } catch (error) {
          control.setCustomValidity(String(error));
          help.textContent = String(error);
          this.#error(error);
        }
      };
      row.append(name, control);
      list.append(row);
    }
  }
  #handles(
    parent: HTMLElement,
    x: number,
    y: number,
    w: number,
    h: number,
    start: (e: PointerEvent, dir: string) => void,
  ): void {
    for (const [dir, dx, dy] of [
      ["nw", 0, 0],
      ["n", 0.5, 0],
      ["ne", 1, 0],
      ["e", 1, 0.5],
      ["se", 1, 1],
      ["s", 0.5, 1],
      ["sw", 0, 1],
      ["w", 0, 0.5],
    ] as const) {
      const b = document.createElement("button");
      b.className = "handle";
      b.dataset.resize = dir;
      b.setAttribute("aria-label", `Resize ${dir}`);
      Object.assign(b.style, {
        left: `${x + w * dx}px`,
        top: `${y + h * dy}px`,
        cursor: `${dir}-resize`,
      });
      b.onpointerdown = (e) => {
        e.stopPropagation();
        if (e.button === 0) start(e, dir);
      };
      parent.append(b);
    }
  }
  #gesture(
    e: PointerEvent,
    move: (e: PointerEvent) => void,
    finish: (cancelled: boolean) => void,
  ): void {
    e.preventDefault();
    this.#gestureActive = true;
    const controller = new AbortController(),
      options = { signal: controller.signal };
    const end = (cancelled: boolean) => {
      controller.abort();
      this.#gestureActive = false;
      finish(cancelled);
    };
    window.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId === e.pointerId) move(event);
      },
      options,
    );
    window.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId === e.pointerId) end(false);
      },
      options,
    );
    window.addEventListener("pointercancel", () => end(true), options);
    window.addEventListener("blur", () => end(true), options);
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") end(true);
      },
      options,
    );
  }
  #geometry(field: FrameField, values: Record<string, number>): void {
    const doc = this.#document!;
    if (!doc.source) return;
    if (field.kind === "segmentshape")
      values = segmentGeometry(field.properties, values);
    const edits = Object.entries(values).flatMap(
      ([key, value]) =>
        propertyEdit(doc.source!, field.id, key, String(value)).edits,
    );
    this.#edit({ uri: doc.uri, version: doc.version, edits });
  }
  #marquee(e: PointerEvent): void {
    this.focus({ preventScroll: true });
    const doc = this.#document!,
      canvas = this.#root.querySelector<HTMLElement>(".canvas")!,
      bounds = canvas.getBoundingClientRect(),
      x = (e.clientX - bounds.left) / this.#zoom,
      y = (e.clientY - bounds.top) / this.#zoom,
      previous = [...this.#selection];
    const preview = document.createElement("div");
    preview.className = "preview";
    canvas.append(preview);
    let dx = 0,
      dy = 0;
    this.#gesture(
      e,
      (m) => {
        dx = (m.clientX - e.clientX) / this.#zoom;
        dy = (m.clientY - e.clientY) / this.#zoom;
        Object.assign(preview.style, {
          left: `${Math.min(x, x + dx)}px`,
          top: `${Math.min(y, y + dy)}px`,
          width: `${Math.abs(dx)}px`,
          height: `${Math.abs(dy)}px`,
        });
      },
      (cancelled) => {
        if (cancelled) {
          this.#render();
          return;
        }
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          this.selectFrame();
          return;
        }
        const left = Math.min(x, x + dx),
          top = Math.min(y, y + dy),
          right = Math.max(x, x + dx),
          bottom = Math.max(y, y + dy);
        const inside = doc.fields
          .filter(
            (f) =>
              this.#pageVisible(f) &&
              f.x >= left &&
              f.y >= top &&
              f.x + f.width <= right &&
              f.y + f.height <= bottom,
          )
          .map((f) => f.id);
        this.selectFields(
          e.shiftKey ? [...new Set([...previous, ...inside])] : inside,
        );
      },
    );
  }
  #pageVisible(field: FrameField): boolean {
    return pageVisible(field, this.#activePages);
  }
  #move(e: PointerEvent, _field: FrameField): void {
    if (!this.#document?.source) return;
    const doc = this.#document;
    const roots = selectionRoots(doc.source!, [...this.#selection]);
    const rootIds = new Set(roots.map((node) => node.id));
    const fields = doc.fields.filter((f) => rootIds.has(f.id));
    const flowParent = fields
      .map((f) => doc.fields.find((p) => p.id === f.parentId))
      .find((p) => p && ["stackfield", "matrixfield"].includes(p.kind));
    if (flowParent) {
      if (flowParent.kind !== "stackfield" || fields.length !== 1) {
        this.#error(
          Error(
            "Drag one stack child to reorder it; matrix cell movement is not yet supported",
          ),
        );
        return;
      }
      const siblings = doc.fields.filter((f) => f.parentId === flowParent.id),
        field = fields[0],
        horizontal = flowParent.properties.orientation === "2";
      let delta = 0;
      this.#gesture(
        e,
        (m) => {
          delta =
            ((horizontal ? m.clientX : m.clientY) -
              (horizontal ? e.clientX : e.clientY)) /
            this.#zoom;
        },
        (cancelled) => {
          if (cancelled || Math.abs(delta) <= 1) {
            this.#render();
            return;
          }
          const center =
            (horizontal
              ? field.x + field.width / 2
              : field.y + field.height / 2) + delta;
          const ordered = siblings.filter((f) => f.id !== field.id);
          const index = ordered.findIndex(
            (f) =>
              center < (horizontal ? f.x + f.width / 2 : f.y + f.height / 2),
          );
          ordered.splice(index < 0 ? ordered.length : index, 0, field);
          if (ordered.every((f, i) => f.id === siblings[i].id)) {
            this.#render();
            return;
          }
          try {
            this.#selection.clear();
            this.#selected = undefined;
            this.#edit(
              reorderStack(
                doc.source!,
                flowParent.id,
                ordered.map((f) => ({
                  id: f.id,
                  x: Number(f.properties.xleft),
                  y: Number(f.properties.ytop),
                  properties: f.properties,
                  width: Number(f.properties.width) + outerPadding(f.kind),
                  height: Number(f.properties.height) + outerPadding(f.kind),
                })),
                horizontal ? 2 : 1,
              ),
            );
            this.selectField(flowParent.id);
          } catch (error) {
            this.#error(error);
            this.#render();
          }
        },
      );
      return;
    }
    const byId = new Map(doc.source!.nodes.map((node) => [node.id, node]));
    const moving = doc.fields.filter((f) => {
      let node = byId.get(f.id);
      while (node) {
        if (rootIds.has(node.id)) return true;
        node = byId.get(node.parentId ?? "");
      }
      return false;
    });
    let dx = 0,
      dy = 0;
    const elements = new Map(
      Array.from(this.#root.querySelectorAll<HTMLElement>("[data-field]")).map(
        (el) => [el.dataset.field, el],
      ),
    );
    this.#gesture(
      e,
      (m) => {
        dx = (m.clientX - e.clientX) / this.#zoom;
        dy = (m.clientY - e.clientY) / this.#zoom;
        for (const field of moving) {
          const element = elements.get(field.id);
          if (!element) continue;
          Object.assign(element.style, {
            left: `${field.x + dx}px`,
            top: `${field.y + dy}px`,
          });
        }
      },
      (cancelled) => {
        if (!cancelled && (Math.abs(dx) > 1 || Math.abs(dy) > 1))
          this.#edit({
            uri: doc.uri,
            version: doc.version,
            edits: fields.flatMap((field) => {
              let values = {
                xleft: sourcePosition(
                  Number(field.properties.xleft) * WML_TO_CSS + dx,
                ),
                ytop: sourcePosition(
                  Number(field.properties.ytop) * WML_TO_CSS + dy,
                ),
              } as Record<string, number>;
              if (field.kind === "segmentshape")
                values = segmentGeometry(field.properties, values);
              return Object.entries(values).flatMap(
                ([key, value]) =>
                  propertyEdit(doc.source!, field.id, key, String(value)).edits,
              );
            }),
          });
        else this.#render();
      },
    );
  }
  #resize(e: PointerEvent, dir: string, field?: FrameField): void {
    const doc = this.#document!,
      x = field?.x ?? 0,
      y = field?.y ?? 0,
      w = field?.width ?? doc.width,
      h = field?.height ?? doc.height;
    const preview = document.createElement("div");
    preview.className = "preview";
    this.#root.querySelector(".canvas")!.append(preview);
    let nx = x,
      ny = y,
      nw = w,
      nh = h;
    const draw = () =>
      Object.assign(preview.style, {
        left: `${nx}px`,
        top: `${ny}px`,
        width: `${nw}px`,
        height: `${nh}px`,
      });
    draw();
    this.#gesture(
      e,
      (m) => {
        const dx = (m.clientX - e.clientX) / this.#zoom,
          dy = (m.clientY - e.clientY) / this.#zoom;
        nw = Math.max(
          8,
          w + (dir.includes("w") ? -dx : dir.includes("e") ? dx : 0),
        );
        nh = Math.max(
          8,
          h + (dir.includes("n") ? -dy : dir.includes("s") ? dy : 0),
        );
        if (field) {
          nx = dir.includes("w") ? x + w - nw : x;
          ny = dir.includes("n") ? y + h - nh : y;
        }
        draw();
      },
      (cancelled) => {
        if (cancelled) {
          this.#render();
          return;
        }
        if (field) {
          const values: Record<string, number> = {
            width: Math.round(nw / WML_TO_CSS),
            height: Math.round(nh / WML_TO_CSS),
          };
          if (nx !== x)
            values.xleft = Math.round(
              Number(field.properties.xleft) + (nx - x) / WML_TO_CSS,
            );
          if (ny !== y)
            values.ytop = Math.round(
              Number(field.properties.ytop) + (ny - y) / WML_TO_CSS,
            );
          this.#geometry(field, values);
        } else if (doc.metadata)
          this.#edit(
            metadataEdit(doc.metadata, {
              windowwidth: String(Math.round(nw / WML_TO_CSS)),
              windowheight: String(Math.round(nh / WML_TO_CSS)),
            }),
          );
        else if (doc.source)
          this.#edit({
            uri: doc.uri,
            version: doc.version,
            edits: [
              ...propertyEdit(
                doc.source,
                doc.formId!,
                "width",
                String(Math.round(nw / WML_TO_CSS)),
              ).edits,
              ...propertyEdit(
                doc.source,
                doc.formId!,
                "height",
                String(Math.round(nh / WML_TO_CSS)),
              ).edits,
            ],
          });
      },
    );
  }
  #create(e: PointerEvent, tool: PaletteTool): void {
    this.focus({ preventScroll: true });
    const doc = this.#document!;
    if (!doc.source || !tool.kind || !tool.properties) return;
    const canvas = this.#root.querySelector<HTMLElement>(".canvas")!,
      bounds = canvas.getBoundingClientRect(),
      x = (e.clientX - bounds.left) / this.#zoom,
      y = (e.clientY - bounds.top) / this.#zoom;
    const preview = document.createElement("div");
    preview.className = "preview";
    canvas.append(preview);
    let width = Number(tool.properties.width) * WML_TO_CSS,
      height = Number(tool.properties.height) * WML_TO_CSS;
    const draw = () =>
      Object.assign(preview.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
    draw();
    this.#gesture(
      e,
      (m) => {
        const dx = (m.clientX - e.clientX) / this.#zoom,
          dy = (m.clientY - e.clientY) / this.#zoom;
        if (dx > 4) width = dx;
        if (dy > 4) height = dy;
        draw();
      },
      (cancelled) => {
        this.#tool = "0";
        if (cancelled) {
          this.#render();
          return;
        }
        try {
          const synthetic = doc.uri.startsWith("synthetic:");
          const properties: Record<string, string> = synthetic
            ? { ...tool.properties }
            : {};
          if (tool.kind === "segmentshape")
            Object.assign(properties, {
              point1x: String(sourcePosition(x)),
              point1y: String(sourcePosition(y)),
              point2x: String(sourcePosition(x + Math.max(1, width - 2))),
              point2y: String(sourcePosition(y + Math.max(1, height - 2))),
            });
          this.#edit(
            createField(
              doc.source!,
              tool.kind!,
              synthetic ? undefined : tool.style,
              {
                xleft: sourcePosition(x),
                ytop: sourcePosition(y),
                width: Math.round(width / WML_TO_CSS),
                height: Math.round(height / WML_TO_CSS),
              },
              properties,
              tool.structured,
            ),
          );
          const created = this.#document?.fields.at(-1);
          if (created) this.selectField(created.id);
        } catch (error) {
          this.#error(error);
          this.#render();
        }
      },
    );
  }
}
if (!customElements.get("gorak-frame-designer"))
  customElements.define("gorak-frame-designer", GorakFrameDesigner);
