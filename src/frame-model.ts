import type { FrameDocument, FrameField } from "./designer";
import {
  resolveProperties,
  nodeProperties,
  type WmlNode,
  type DefaultsLayer,
  type WmlDocument,
} from "./wml.ts";
import type { FrameMetadata } from "./metadata";
import { paletteFor } from "./palette.ts";
import { fieldChoices, fieldColumns } from "./choices.ts";
import { matrixLayout, outerPadding } from "./container-layout.ts";
import { nodeBitmap, type FrameImages } from "./images.ts";

/** Geometry is in thousandths of an inch; CSS reference pixels use 96 dpi. */
import { WML_TO_CSS, segmentGeometry } from "./geometry.ts";
export { WML_TO_CSS } from "./geometry.ts";
const visualKinds = new Set([
  "entryfield",
  "buttonfield",
  "freetrim",
  "boxtrim",
  "stackfield",
  "matrixfield",
  "flexibleform",
  "subform",
  "viewportfield",
  "tablefield",
  "columnfield",
  "listfield",
  "togglefield",
  "optionfield",
  "radiofield",
  "imagefield",
  "imagetrim",
  "segmentshape",
  "barfield",
  "scrollbarfield",
  "sliderfield",
  "treeviewfield",
  "listviewfield",
  "controlbutton",
  "popupbutton",
  "palettefield",
  "tabfolder",
  "ellipseshape",
  "rectangleshape",
  "tabpage",
  "tabbar",
  "tabfield",
  "tablebody",
  "tableheader",
  "titletrim",
]);
export function frameFromWml(
  source: WmlDocument,
  layers: readonly DefaultsLayer[],
  metadata?: FrameMetadata,
  images: FrameImages = {},
): FrameDocument {
  const form = source.root.children.find((node) => node.kind === "topform");
  if (!form) throw Error("Frame has no topform");
  const formProperties = resolveProperties(form, layers);
  const number = (value: string | undefined, property: string): number => {
    if (value === undefined) return 0; // Native omitted geometry is zero, never palette geometry.
    const parsed = Number(value);
    if (!value.trim() || !Number.isFinite(parsed))
      throw Error(`Invalid ${property}`);
    return parsed;
  };
  const fields: FrameField[] = [];
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const visit = (
    node: WmlNode,
    parent: FrameField | undefined,
    context: Record<string, unknown>,
    scopes: readonly { folderId: string; index: number }[],
    folder?: FrameField,
    index = 0,
  ): void => {
    const kind =
      node.kind === "viewfield" && parent?.kind === "viewportfield"
        ? (node.attributes.type?.value ?? "unknown")
        : node.kind === "row" && folder
          ? context.type === "tabfield"
            ? "tabfield"
            : "tabpage"
          : node.kind;
    if (!visualKinds.has(kind)) {
      if (["tabpagearray", "tabfieldarray"].includes(node.kind) && parent) {
        const folderOwner =
          parent.kind === "tabfolder"
            ? parent
            : fields.find((f) => f.id === parent.parentId);
        const rows = object(context).row;
        node.children
          .filter((c) => c.kind === "row")
          .forEach((child, i) =>
            visit(
              child,
              parent,
              {
                ...object(Array.isArray(rows) ? rows[i] : undefined),
                type: node.kind === "tabfieldarray" ? "tabfield" : "tabpage",
              },
              scopes,
              folderOwner,
              i,
            ),
          );
      }
      return;
    }
    const viewNode = {
      ...node,
      kind: kind === "titletrim" ? "freetrim" : kind,
    };
    const resolved = resolveProperties(viewNode, layers);
    for (const key of ["xleft", "ytop"])
      if (!resolved[key])
        resolved[key] = { value: "0", origin: "Native omitted coordinate" };
    if (
      ["tabpage", "tabfield", "tabbar", "tablebody", "tableheader"].includes(
        kind,
      )
    )
      for (const key of ["xleft", "ytop"])
        if (!node.attributes[key])
          resolved[key] = { value: "0", origin: "Native component origin" };
    const properties = Object.fromEntries(
      Object.entries(resolved).map(([k, p]) => [k, p.value]),
    );
    const pageScopes =
      kind === "tabpage" && folder
        ? [...scopes, { folderId: folder.id, index }]
        : scopes;
    const bitmapNode = node.children.find((c) =>
      ["bitmaplabel", "bitmap", "image", "normalbitmap"].includes(c.kind),
    );
    const bitmap = nodeBitmap(bitmapNode, images);
    const selectedBitmap = nodeBitmap(
      node.children.find((c) => c.kind === "selectedbitmap"),
      images,
    );
    const field: FrameField = {
      id: node.id,
      parentId: parent?.id,
      kind,
      name: properties.name ?? "",
      x:
        number(properties.xleft, `${node.id}.xleft`) * WML_TO_CSS +
        (parent?.x ?? 0),
      y:
        number(properties.ytop, `${node.id}.ytop`) * WML_TO_CSS +
        (parent?.y ?? 0),
      width: number(properties.width, `${node.id}.width`) * WML_TO_CSS,
      height: number(properties.height, `${node.id}.height`) * WML_TO_CSS,
      label: properties.textlabel ?? properties.stringvalue ?? "",
      properties,
      propertyOrigins: Object.fromEntries(
        Object.entries(resolved).map(([k, p]) => [k, p.origin]),
      ),
      source: { start: node.start, end: node.end },
      choices: [
        "listfield",
        "optionfield",
        "radiofield",
        "listviewfield",
        "palettefield",
      ].includes(kind)
        ? fieldChoices(node, layers, images)
        : undefined,
      columns:
        kind === "listviewfield" ? fieldColumns(node, layers) : undefined,
      pageScopes: pageScopes.length ? pageScopes : undefined,
      tabTarget:
        kind === "tabfield" && folder
          ? { folderId: folder.id, index }
          : undefined,
      backgroundBitmap: nodeBitmap(
        node.children.find((c) => c.kind === "bgbitmap"),
        images,
      ),
      bitmap,
      selectedBitmap,
    };
    if (field.width < 0 || field.height < 0)
      throw Error("Negative field dimensions");
    fields.push(field);
    if (kind === "columnfield") {
      const proto = node.children.find((c) => c.kind === "protofield");
      if (proto) {
        const keys = Object.keys(proto.attributes);
        const protoKind =
          proto.attributes.type?.value ??
          (keys.some((k) =>
            ["charsperline", "lines", "formatstring", "inputmasking"].includes(
              k,
            ),
          )
            ? "entryfield"
            : keys.some((k) => ["onvalue", "offvalue"].includes(k))
              ? "togglefield"
              : proto.children.some((c) => c.kind === "valuelist")
                ? "optionfield"
                : keys.includes("textlabel")
                  ? "buttonfield"
                  : "unknown");
        const props = nodeProperties(proto);
        field.prototype = {
          kind: protoKind,
          properties: props,
          choices: fieldChoices(proto, layers, images),
        };
      }
    }
    const defaults: Record<string, unknown> = {};
    for (const child of node.children)
      visit(child, field, object(defaults[child.kind]), pageScopes);
  };
  for (const node of form.children) visit(node, undefined, {}, []);
  const childrenByParent = new Map<string, FrameField[]>();
  for (const field of fields)
    if (field.parentId) {
      const children = childrenByParent.get(field.parentId) ?? [];
      children.push(field);
      childrenByParent.set(field.parentId, children);
    }
  const shiftDescendants = (id: string, dx: number, dy: number): void => {
    for (const child of childrenByParent.get(id) ?? []) {
      child.x += dx;
      child.y += dy;
      shiftDescendants(child.id, dx, dy);
    }
  };
  // TabField's stored square bounds describe its label object. TabBar controls
  // the displayed tab size; native exports include the four-pixel tab outline.
  for (const bar of fields.filter((f) => f.kind === "tabbar")) {
    const folder = fields.find((f) => f.id === bar.parentId);
    if (!folder) continue;
    const tabWidth = bar.width + 4;
    bar.width = folder.width;
    for (const tab of childrenByParent.get(bar.id) ?? []) {
      if (tab.kind !== "tabfield") continue;
      tab.width = tabWidth;
      tab.height = bar.height;
      tab.properties = {
        ...bar.properties,
        ...tab.properties,
        typesize: bar.properties.typesize,
        typeface: bar.properties.typeface,
      };
    }
  }
  for (const body of fields.filter((f) => f.kind === "tablebody")) {
    const columns = childrenByParent.get(body.id) ?? [];
    const rowHeight = Math.max(
      0,
      ...columns.map(
        (f) =>
          Number(f.prototype?.properties.height ?? 0) +
          outerPadding(f.prototype?.kind ?? ""),
      ),
    );
    for (const column of columns)
      if (column.prototype)
        column.properties = {
          ...column.properties,
          visualrowheight: String(rowHeight),
        };
  }
  for (const parent of fields) {
    if (!["stackfield", "matrixfield"].includes(parent.kind)) continue;
    const children = childrenByParent.get(parent.id) ?? [];
    if (!children.length) continue;
    const horizontal = parent.properties.orientation === "2";
    const cells = children.map((child, index) => ({
      id: child.id,
      row:
        parent.kind === "matrixfield"
          ? Number(child.properties.row ?? 1)
          : horizontal
            ? 1
            : index + 1,
      column:
        parent.kind === "matrixfield"
          ? Number(child.properties.column ?? 1)
          : horizontal
            ? index + 1
            : 1,
      width: Number(child.properties.width) + outerPadding(child.kind),
      height: Number(child.properties.height) + outerPadding(child.kind),
      gravity: Number(child.properties.gravity ?? -1),
    }));
    const layout = matrixLayout(
      cells,
      parent.kind === "matrixfield"
        ? Number(parent.properties.columns)
        : horizontal
          ? children.length
          : 1,
      parent.kind === "matrixfield"
        ? Number(parent.properties.rows)
        : horizontal
          ? 1
          : children.length,
      Number(
        parent.properties.childgravity ??
          (parent.kind === "stackfield" ? 9 : 18),
      ),
      Object.fromEntries(
        ["left", "right", "top", "bottom"].map((side) => [
          side,
          Math.round(
            Number(parent.properties[`child${side}margin`] ?? 0) * WML_TO_CSS,
          ) / WML_TO_CSS,
        ]),
      ) as { left: number; right: number; top: number; bottom: number },
      { width: parent.width / WML_TO_CSS, height: parent.height / WML_TO_CSS },
    );
    for (const child of children) {
      const position = layout.positions.get(child.id)!;
      const x = parent.x + position.x * WML_TO_CSS,
        y = parent.y + position.y * WML_TO_CSS;
      shiftDescendants(child.id, x - child.x, y - child.y);
      child.x = x;
      child.y = y;
      child.properties = {
        ...child.properties,
        ...(child.kind === "segmentshape"
          ? Object.fromEntries(
              Object.entries(
                segmentGeometry(child.properties, {
                  xleft: position.x,
                  ytop: position.y,
                }),
              ).map(([key, value]) => [key, String(value)]),
            )
          : {}),
        xleft: String(position.x),
        ytop: String(position.y),
      };
      child.propertyOrigins = {
        ...child.propertyOrigins,
        xleft: "Native container layout",
        ytop: "Native container layout",
      };
    }
  }
  return {
    uri: source.uri,
    version: source.version,
    title: source.uri.split(/[\\/]/).at(-1) ?? "Frame",
    width:
      number(
        metadata?.attributes.windowwidth?.value ?? formProperties.width?.value,
        "window.width",
      ) * WML_TO_CSS,
    height:
      number(
        metadata?.attributes.windowheight?.value ??
          formProperties.height?.value,
        "window.height",
      ) * WML_TO_CSS,
    fields,
    backgroundBitmap: nodeBitmap(
      form.children.find((c) => c.kind === "bgbitmap"),
      images,
    ),
    source,
    metadata,
    formId: form.id,
    formProperties: Object.fromEntries(
      Object.entries(formProperties).map(([k, p]) => [k, p.value]),
    ),
    formOrigins: Object.fromEntries(
      Object.entries(formProperties).map(([k, p]) => [k, p.origin]),
    ),
    palette: paletteFor(source, layers),
    defaults: layers,
  };
}
