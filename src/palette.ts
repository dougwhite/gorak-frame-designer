import { type DefaultsLayer, type WmlDocument } from "./wml.ts";
import { styleEntries, sampleProperties } from "./styles.ts";
export interface PaletteTool {
  id: string;
  label: string;
  icon: string;
  kind?: string;
  className?: string;
  style?: number;
  properties?: Record<string, string>;
  structured?: Record<string, unknown>;
}
export const nativeClass = (kind: string): string =>
  (
    ({
      buttonfield: "ButtonField",
      entryfield: "EntryField",
      togglefield: "ToggleField",
      freetrim: "FreeTrim",
      boxtrim: "BoxTrim",
      radiofield: "RadioField",
      optionfield: "OptionField",
      listfield: "ListField",
      scrollbarfield: "ScrollbarField",
      sliderfield: "SliderField",
      barfield: "BarField",
      rectangleshape: "RectangleShape",
      segmentshape: "SegmentShape",
      ellipseshape: "EllipseShape",
      imagefield: "ImageField",
      imagetrim: "ImageTrim",
      matrixfield: "MatrixField",
      stackfield: "StackField",
      treeviewfield: "TreeviewField",
      subform: "SubForm",
      listviewfield: "ListViewField",
      tabfolder: "TabFolder",
      palettefield: "PaletteField",
      popupbutton: "PopupButton",
      controlbutton: "ControlButton",
    }) as Record<string, string>
  )[kind] ?? kind;
const tools: [string, string, string?][] = [
  ["Select", "↖"],
  ["Button", "OK", "buttonfield"],
  ["Entry", "ab", "entryfield"],
  ["Multiline entry", "a↵", "entryfield"],
  ["Toggle", "☒", "togglefield"],
  ["Text", "T", "freetrim"],
  ["Boxed text", "▣T", "boxtrim"],
  ["Radio", "◉", "radiofield"],
  ["Option", "▾", "optionfield"],
  ["List", "▤", "listfield"],
  ["Scroll bar", "↕", "scrollbarfield"],
  ["Slider", "⊢", "sliderfield"],
  ["Control button", "▦", "controlbutton"],
  ["Bar", "▦", "barfield"],
  ["Line", "╱", "segmentshape"],
  ["Rectangle", "▭", "rectangleshape"],
  ["Ellipse", "⬭", "ellipseshape"],
  ["Image", "▧", "imagefield"],
  ["Image trim", "▨", "imagetrim"],
  ["Palette", "⠿", "palettefield"],
  ["Popup button", "▱", "popupbutton"],
  ["Tree", "⌘", "treeviewfield"],
  ["Tab folder", "▰", "tabfolder"],
  ["List view", "▥", "listviewfield"],
];
// Composite creation needs separate Workbench experiments; retain its palette
// position, but do not silently emit an incomplete table/stack definition.
const creatable = new Set([
  "entryfield",
  "buttonfield",
  "togglefield",
  "freetrim",
  "boxtrim",
  "ellipseshape",
  "segmentshape",
  "rectangleshape",
  "scrollbarfield",
  "barfield",
  "sliderfield",
  "listfield",
  "optionfield",
  "radiofield",
  "treeviewfield",
  "listviewfield",
  "imagefield",
  "imagetrim",
  "controlbutton",
  "popupbutton",
  "palettefield",
]);
export function paletteFor(
  source: WmlDocument,
  layers: readonly DefaultsLayer[],
): PaletteTool[] {
  const entries = styleEntries(layers);
  return tools.map(([label, icon, kind], i) => {
    const tool: PaletteTool = {
      id: String(i),
      label,
      icon,
      className: kind ? nativeClass(kind) : undefined,
    };
    if (!kind || !creatable.has(kind)) return tool;
    const candidate = entries.find(
      (e) =>
        e.kind === kind &&
        (label === "Multiline entry"
          ? e.group === "entryfield:2"
          : e.group !== "entryfield:2"),
    );
    if (!candidate) return tool;
    const style = candidate.ordinal;
    try {
      const sample = sampleProperties(candidate.sample) as Record<
        string,
        unknown
      >;
      const values = Object.fromEntries(
        Object.entries(sample).filter(
          ([k, v]) =>
            typeof v === "string" &&
            !["type", "name", "script", "row", "column"].includes(k),
        ),
      ) as Record<string, string>;
      if (
        !Number.isFinite(Number(values.width)) ||
        !Number.isFinite(Number(values.height)) ||
        !values.width ||
        !values.height
      )
        return tool;
      const structured = Object.fromEntries(
        Object.entries(sample).filter(
          ([k, v]) => typeof v === "object" && v !== null,
        ),
      );
      if (typeof sample.script === "string") structured.script = sample.script;
      Object.assign(tool, { kind, style, properties: values, structured });
    } catch {
      /* An unavailable style stays disabled, rather than guessed. */
    }
    return tool;
  });
}
