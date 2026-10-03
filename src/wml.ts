/** Source-preserving WML data. Offsets are UTF-16, matching VS Code text documents. */
import { nativeDefaults } from "./native-defaults.ts";
export interface Span {
  start: number;
  end: number;
}
export interface Attribute extends Span {
  value: string;
  valueSpan: Span;
  quote: string;
}
export interface WmlNode extends Span {
  id: string;
  kind: string;
  parentId?: string;
  openEnd: number;
  value?: string;
  contentSpan?: Span;
  insertAt: number;
  attributes: Record<string, Attribute>;
  children: WmlNode[];
}
export interface WmlDocument {
  uri: string;
  version: number;
  text: string;
  root: WmlNode;
  nodes: readonly WmlNode[];
}
export interface TextEdit extends Span {
  text: string;
  expected: string;
}
export interface EditIntent {
  uri: string;
  version: number;
  edits: readonly TextEdit[];
}
export type Defaults = Record<string, unknown>;
export interface DefaultsLayer {
  origin: string;
  defaults: Defaults;
}
export interface Property {
  value: string;
  origin: string;
}
/** Existing structured field properties come from WML only. */
export function structuredDefaults(
  _node: WmlNode,
  _layers: readonly DefaultsLayer[],
): Record<string, unknown> {
  return {};
}
const decode = (value: string): string =>
  value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (_, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        if (
          !Number.isInteger(code) ||
          code <= 0 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        )
          throw Error("Invalid XML character");
        return String.fromCodePoint(code);
      }
      return (
        { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<
          string,
          string
        >
      )[entity.toLowerCase()];
    },
  );
const encode = (value: string, quote: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, quote === '"' ? "&quot;" : '"')
    .replace(/'/g, quote === "'" ? "&apos;" : "'")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#9;");

export function parseWml(
  uri: string,
  version: number,
  text: string,
): WmlDocument {
  if (text.length > 8_000_000)
    throw Error("WML exceeds the 8 MB document limit");
  const nodes: WmlNode[] = [],
    stack: WmlNode[] = [];
  const ordinals = new Map<string, number>();
  let root: WmlNode | undefined,
    offset = 0;
  while (offset < text.length) {
    const start = text.indexOf("<", offset);
    if (start < 0) {
      if (!stack.length && text.slice(offset).trim())
        throw Error("Text outside frame");
      break;
    }
    if (!stack.length && text.slice(offset, start).trim())
      throw Error("Text outside frame");
    if (
      text.startsWith("<!--", start) ||
      text.startsWith("<![CDATA[", start) ||
      text.startsWith("<?", start)
    ) {
      const marker = text.startsWith("<!--", start)
        ? "-->"
        : text.startsWith("<?", start)
          ? "?>"
          : "]]>";
      const end = text.indexOf(marker, start + 2);
      if (end < 0) throw Error("Unterminated WML comment or data");
      offset = end + marker.length;
      continue;
    }
    if (text.startsWith("<!", start))
      throw Error("DTD and external entities are unsupported");
    let end = start + 1,
      quote = "";
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end === text.length) throw Error("Unterminated WML tag");
    const tag = text.slice(start, end + 1),
      closing = /^<\/([\w:.-]+)\s*>$/.exec(tag);
    if (closing) {
      const node = stack.pop();
      if (!node || node.kind !== closing[1])
        throw Error("Mismatched WML closing tag");
      node.end = end + 1;
      if (!node.children.length && node.kind !== "script") {
        node.contentSpan = { start: node.openEnd, end: start };
        node.value = decode(
          text
            .slice(node.openEnd, start)
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, v: string) => v)
            .replace(
              /<\?ingres_invalidxmlchar\s+(\d+)\s*\?>/g,
              (_, n: string) => String.fromCodePoint(Number(n)),
            ),
        );
      }
    } else {
      const name = /^<([a-zA-Z_][\w:.-]*)/.exec(tag);
      if (!name) throw Error("Invalid WML element");
      if (nodes.length >= 50_000 || stack.length >= 128)
        throw Error("WML structure limit exceeded");
      const parent = stack.at(-1),
        ordinalKey = `${parent?.id ?? ""}/${name[1]}`;
      const ordinal = ordinals.get(ordinalKey) ?? 0;
      ordinals.set(ordinalKey, ordinal + 1);
      const node: WmlNode = {
        id: `${ordinalKey}[${ordinal}]`,
        kind: name[1],
        parentId: parent?.id,
        start,
        end: end + 1,
        openEnd: end + 1,
        insertAt: end - (tag.endsWith("/>") ? 1 : 0),
        attributes: Object.create(null),
        children: [],
      };
      let cursor = name[0].length;
      const attrs = /\s+([a-zA-Z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/gy;
      while (cursor < tag.length) {
        attrs.lastIndex = cursor;
        const match = attrs.exec(tag);
        if (!match) break;
        if (Object.hasOwn(node.attributes, match[1]))
          throw Error("Duplicate WML attribute");
        const valueStart = start + match.index + match[0].indexOf(match[2]) + 1;
        node.attributes[match[1]] = {
          start: start + match.index,
          end: start + attrs.lastIndex,
          value: decode(match[3]),
          quote: match[2],
          valueSpan: { start: valueStart, end: valueStart + match[3].length },
        };
        if (match[1] === "gorak_style")
          throw Error(
            "Retired gorak_style format; re-export with current gorak",
          );
        cursor = attrs.lastIndex;
      }
      if (!/^\s*\/?\>$/.test(tag.slice(cursor)))
        throw Error("Invalid WML attributes");
      if (parent) parent.children.push(node);
      else {
        if (root) throw Error("Multiple WML roots");
        root = node;
      }
      nodes.push(node);
      if (!tag.endsWith("/>")) stack.push(node);
    }
    offset = end + 1;
  }
  if (!root || root.kind !== "frame" || stack.length)
    throw Error("Expected a complete WML frame");
  return { uri, version, text, root, nodes };
}

export function resolveProperties(
  node: WmlNode,
  layers: readonly DefaultsLayer[],
): Record<string, Property> {
  const result: Record<string, Property> = {
    ...Object.fromEntries(
      Object.entries(nativeDefaults(node.kind)).map(([key, value]) => [
        key,
        { value, origin: "Native class default" },
      ]),
    ),
  };
  delete result.name;
  // Native XML omits default gravity; palette samples are never consulted.
  // Confirmed against the native inspector: absent gravity is FA_DEFAULT (-1).
  if (
    node.kind !== "topform" &&
    !node.attributes.gravity &&
    (node.attributes.xleft || node.attributes.ytop)
  ) {
    result.gravity = {
      value: "-1",
      origin: "OpenROAD positioned-field default",
    };
  }
  for (const [key, value] of Object.entries(nodeProperties(node)))
    result[key] = { value, origin: "WML" };
  return result;
}

export function propertyEdit(
  doc: WmlDocument,
  fieldId: string,
  key: string,
  value: string | null,
): EditIntent {
  if (!/^[a-zA-Z_][\w:.-]*$/.test(key) || key === "gorak_style")
    throw Error("Invalid or protected property");
  const node = doc.nodes.find((n) => n.id === fieldId);
  if (!node) throw Error("Field no longer exists");
  const attr = node.attributes[key];
  const child = node.children.find(
    (c) => c.kind === key && c.value !== undefined && c.kind !== "script",
  );
  let span: Span, replacement: string;
  if (child) {
    const span =
      value === null
        ? { start: child.start, end: child.end }
        : child.contentSpan!;
    return {
      uri: doc.uri,
      version: doc.version,
      edits: [
        {
          ...span,
          expected: doc.text.slice(span.start, span.end),
          text:
            value === null
              ? ""
              : encode(value, '"').replace(
                  /[\x00-\x08\x0b\x0c\x0e-\x1f]/g,
                  (c) => `<?ingres_invalidxmlchar ${c.charCodeAt(0)}?>`,
                ),
        },
      ],
    };
  }
  if (value === null) {
    if (!attr) return { uri: doc.uri, version: doc.version, edits: [] };
    span = attr;
    replacement = "";
  } else if (attr) {
    span = attr.valueSpan;
    replacement = encode(value, attr.quote);
  } else {
    span = { start: node.insertAt, end: node.insertAt };
    replacement = ` ${key}="${encode(value, '"')}"`;
  }
  return {
    uri: doc.uri,
    version: doc.version,
    edits: [
      {
        ...span,
        text: replacement,
        expected: doc.text.slice(span.start, span.end),
      },
    ],
  };
}

/** Creation inserts one new element; existing fields, scripts and unknown source stay untouched. */
export function createField(
  doc: WmlDocument,
  kind: string,
  style: number | undefined,
  geometry: Record<string, number>,
  defaults: Readonly<Record<string, string>> = {},
  structured: Readonly<Record<string, unknown>> = {},
): EditIntent {
  if (!/^[a-z]+$/.test(kind)) throw Error("Invalid field class");
  const form = doc.root.children.find((node) => node.kind === "topform");
  if (!form) throw Error("No topform");
  const names = new Set(doc.nodes.map((node) => node.attributes.name?.value));
  let ordinal = 1;
  while (names.has(`field${ordinal}`)) ordinal++;
  for (const [key, value] of Object.entries(geometry))
    if (
      !["xleft", "ytop", "width", "height"].includes(key) ||
      !Number.isInteger(value) ||
      Math.abs(value) > 1_000_000 ||
      (["width", "height"].includes(key) && value < 1)
    )
      throw Error("Invalid field geometry");
  const values: Record<string, string> = {
    ...(kind === "palettefield" ? { curenumindex: "1" } : {}),
    ...defaults,
    name: `field${ordinal}`,
    designbias: "3",
    ...Object.fromEntries(
      Object.entries(geometry).map(([k, v]) => [k, String(v)]),
    ),
  };
  delete values.gorak_style;
  for (const key of Object.keys(values))
    if (!/^[a-z][a-z0-9_]*$/.test(key))
      throw Error("Invalid creation property");
  // Placement/customisation materialises Unique Style; no compression selector.
  if (style !== undefined) values.fieldstyle = "0";
  const newline = doc.text.includes("\r\n") ? "\r\n" : "\n";
  const indent = /^[ \t]*/.exec(
    doc.text.slice(doc.text.lastIndexOf("\n", form.start) + 1, form.start),
  )![0];
  const element = `${indent}  <${kind}${Object.entries(values)
    .map(([k, v]) => ` ${k}="${encode(v, '"')}"`)
    .join("")}${
    Object.keys(structured).length
      ? `>${Object.entries(structured)
          .map(([key, value]) => structuredMarkup(key, value))
          .join("")}</${kind}>`
      : "/>"
  }`;
  if (form.end === form.openEnd) {
    const start = form.insertAt;
    return {
      uri: doc.uri,
      version: doc.version,
      edits: [
        {
          start,
          end: form.openEnd,
          expected: doc.text.slice(start, form.openEnd),
          text: `>${newline}${element}${newline}${indent}</topform>`,
        },
      ],
    };
  }
  const closing = doc.text.lastIndexOf("</", form.end - 1);
  const lineStart = doc.text.lastIndexOf("\n", closing) + 1;
  const start =
    doc.text.slice(lineStart, closing).trim() === "" ? lineStart : closing;
  return {
    uri: doc.uri,
    version: doc.version,
    edits: [{ start, end: start, expected: "", text: `${element}${newline}` }],
  };
}

/** Only supported structured palette properties are materialized for a new field. */
export function structuredMarkup(
  key: string,
  value: unknown,
  depth = 0,
): string {
  if (depth > 128 || !/^[a-z][a-z0-9_]*$/.test(key))
    throw Error("Invalid structured creation data");
  if (typeof value === "string") {
    if (value.length > 1_000_000) throw Error("Structured value too large");
    if (key === "script")
      return `<script><![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]></script>`;
    return `<${key}>${encode(value, '"').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (c) => `<?ingres_invalidxmlchar ${c.charCodeAt(0)}?>`)}</${key}>`;
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected structured object");
  const attrs: string[] = [],
    children: string[] = [];
  const data = value as Record<string, unknown>;
  if (key === "childfields" || key === "childmenufields") {
    const rows = data.row;
    if (!Array.isArray(rows)) throw Error("Expected native child rows");
    return rows
      .map((row) => {
        if (!row || typeof row !== "object" || typeof row.type !== "string")
          throw Error("Child field needs its native type");
        return structuredMarkup(row.type, row, depth + 1);
      })
      .join("");
  }
  for (const [name, item] of Object.entries(data)) {
    if (name === "type" && key !== "protofield") continue;
    if (!/^[a-z][a-z0-9_]*$/.test(name))
      throw Error("Invalid creation property");
    if (typeof item === "string") attrs.push(` ${name}="${encode(item, '"')}"`);
    else if (Array.isArray(item)) {
      if (item.length > 10000) throw Error("Too many structured rows");
      children.push(
        ...item.map((row) => structuredMarkup(name, row, depth + 1)),
      );
    } else children.push(structuredMarkup(name, item, depth + 1));
  }
  return `<${key}${attrs.join("")}${children.length ? `>${children.join("")}</${key}>` : "/>"}`;
}

export function applyIntent(doc: WmlDocument, intent: EditIntent): WmlDocument {
  if (doc.uri !== intent.uri || doc.version !== intent.version)
    throw Error("Stale document edit");
  let text = doc.text,
    boundary = text.length;
  for (const edit of [...intent.edits].sort((a, b) => b.start - a.start)) {
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > boundary ||
      text.slice(edit.start, edit.end) !== edit.expected
    )
      throw Error("Invalid or overlapping source edit");
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    boundary = edit.start;
  }
  return parseWml(doc.uri, doc.version + 1, text);
}

/** Selected ancestors already own their descendants; remove each subtree once. */
export function selectionRoots(
  doc: WmlDocument,
  ids: readonly string[],
): WmlNode[] {
  const selected = new Set(ids);
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  return ids
    .map((id) => {
      const node = byId.get(id);
      if (!node || node.kind === "topform" || node === doc.root)
        throw Error("Selection is not a field");
      return node;
    })
    .filter((node, index, all) => {
      if (all.indexOf(node) !== index) return false;
      let parent = byId.get(node.parentId ?? "");
      while (parent) {
        if (selected.has(parent.id)) return false;
        parent = byId.get(parent.parentId ?? "");
      }
      return true;
    });
}

export function deleteFields(
  doc: WmlDocument,
  ids: readonly string[],
): EditIntent {
  return {
    uri: doc.uri,
    version: doc.version,
    edits: selectionRoots(doc, ids).map((node) => ({
      start: node.start,
      end: node.end,
      expected: doc.text.slice(node.start, node.end),
      text: "",
    })),
  };
}

/** Scalar property elements (including invalid-XML-character PIs) remain source-addressable. */
export function nodeProperties(node: WmlNode): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(node.attributes).map(([k, a]) => [k, a.value]),
    ),
    ...Object.fromEntries(
      node.children
        .filter((c) => c.kind !== "script" && c.value !== undefined)
        .map((c) => [c.kind, c.value!]),
    ),
  };
}
