import type { Attribute, EditIntent } from "./wml";
/** Only scalar frame metadata is interpreted; scripts and other TOML sections remain opaque. */
export interface FrameMetadata {
  uri: string;
  version: number;
  text: string;
  attributes: Record<string, Attribute>;
  insertAt: number;
}
export function parseMetadata(
  uri: string,
  version: number,
  text: string,
): FrameMetadata {
  if (text.length > 8_000_000) throw Error("Companion metadata exceeds 8 MB");
  const header = /^\[(?:framesource|frametemplate)\][ \t]*\r?$/m.exec(text);
  if (!header)
    throw Error("Companion source has no framesource or frametemplate section");
  const start = header.index + header[0].length;
  const remainder = text.slice(start),
    next = /^[ \t]*(?:\[|===)/m.exec(remainder);
  const end = next ? start + next.index : text.length;
  const attributes: Record<string, Attribute> = Object.create(null);
  const rows =
    /^([a-zA-Z_][\w]*)[ \t]*=[ \t]*("(?:\\.|[^"\\])*"|'[^']*'|[^#\r\n]+?)[ \t]*(?:#.*)?\r?$/gm;
  const section = text.slice(start, end);
  for (const match of section.matchAll(rows)) {
    const raw = match[2],
      valueStart =
        start + match.index! + match[0].indexOf(raw, match[1].length);
    if (attributes[match[1]]) throw Error("Duplicate frame metadata property");
    const value = raw.startsWith('"')
      ? JSON.parse(raw)
      : raw.startsWith("'")
        ? raw.slice(1, -1)
        : raw.trim();
    attributes[match[1]] = {
      start: start + match.index!,
      end: start + match.index! + match[0].length,
      value: String(value),
      valueSpan: { start: valueStart, end: valueStart + raw.length },
      quote: "",
    };
  }
  return { uri, version, text, attributes, insertAt: end };
}
export function metadataEdit(
  doc: FrameMetadata,
  values: Record<string, string | null>,
): EditIntent {
  const edits = [],
    additions = [];
  for (const [key, value] of Object.entries(values)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key))
      throw Error("Invalid metadata property");
    const attr = doc.attributes[key];
    if (value === null) {
      if (attr)
        edits.push({
          start: attr.start,
          end: attr.valueSpan.end,
          expected: doc.text.slice(attr.start, attr.valueSpan.end),
          text: "",
        });
    } else if (attr)
      edits.push({
        ...attr.valueSpan,
        expected: doc.text.slice(attr.valueSpan.start, attr.valueSpan.end),
        text: JSON.stringify(value),
      });
    else additions.push(`${key} = ${JSON.stringify(value)}`);
  }
  if (additions.length) {
    const newline = doc.text.includes("\r\n") ? "\r\n" : "\n";
    edits.push({
      start: doc.insertAt,
      end: doc.insertAt,
      expected: "",
      text:
        (doc.insertAt > 0 && doc.text[doc.insertAt - 1] !== "\n"
          ? newline
          : "") +
        additions.join(newline) +
        newline,
    });
  }
  return { uri: doc.uri, version: doc.version, edits };
}
export function applyMetadata(
  doc: FrameMetadata,
  intent: EditIntent,
): FrameMetadata {
  if (intent.uri !== doc.uri || intent.version !== doc.version)
    throw Error("Stale metadata edit");
  let text = doc.text,
    boundary = text.length;
  for (const edit of [...intent.edits].sort((a, b) => b.start - a.start)) {
    if (
      edit.start < 0 ||
      edit.end > boundary ||
      edit.end < edit.start ||
      text.slice(edit.start, edit.end) !== edit.expected
    )
      throw Error("Invalid metadata edit");
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    boundary = edit.start;
  }
  return parseMetadata(doc.uri, doc.version + 1, text);
}
