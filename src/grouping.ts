import {
  propertyEdit,
  selectionRoots,
  type EditIntent,
  type WmlDocument,
  type WmlNode,
} from "./wml.ts";
export interface GroupMember {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: Readonly<Record<string, string>>;
}
function positionEdits(
  doc: WmlDocument,
  node: WmlNode,
  member: GroupMember,
  x: number,
  y: number,
) {
  const values: Record<string, number> = {
    xleft: Math.round(x),
    ytop: Math.round(y),
  };
  if (node.kind === "segmentshape") {
    const props = {
      ...Object.fromEntries(
        Object.entries(node.attributes).map(([key, attr]) => [key, attr.value]),
      ),
      ...member.properties,
    };
    for (const [axis, before, after] of [
      ["x", member.x, x],
      ["y", member.y, y],
    ] as const)
      for (const point of [1, 2]) {
        const key = `point${point}${axis}`,
          value = Number(props[key]);
        if (props[key] === undefined || !Number.isFinite(value))
          throw Error("Segment endpoints require authoritative defaults");
        values[key] = Math.round(value + after - before);
      }
  }
  return Object.entries(values).flatMap(
    ([key, value]) => propertyEdit(doc, node.id, key, String(value)).edits,
  );
}
export type GroupKind = "flexibleform" | "subform" | "stackfield";
/** Move whole child source between stack slots; comments between slots remain untouched. */
export function reorderStack(
  doc: WmlDocument,
  parentId: string,
  members: readonly GroupMember[],
  orientation = 1,
): EditIntent {
  const parent = doc.nodes.find((n) => n.id === parentId);
  if (parent?.kind !== "stackfield") throw Error("Select a stack field child");
  const ids = new Set(members.map((m) => m.id));
  if (
    ids.size !== members.length ||
    parent.children.length !== members.length ||
    parent.children.some((n) => !ids.has(n.id))
  )
    throw Error("Stack contains unsupported child source");
  if (
    members.some(
      (m) => ![m.width, m.height].every((v) => Number.isFinite(v) && v >= 0),
    )
  )
    throw Error("Invalid stack dimensions");
  let cursor = 0;
  const texts = members.map((member) => {
    const node = parent.children.find((n) => n.id === member.id)!;
    let text = doc.text.slice(node.start, node.end);
    const edits = positionEdits(
      doc,
      node,
      member,
      orientation === 2 ? cursor : 0,
      orientation === 2 ? 0 : cursor,
    );
    cursor += orientation === 2 ? member.width : member.height;
    for (const edit of edits.sort((a, b) => b.start - a.start))
      text =
        text.slice(0, edit.start - node.start) +
        edit.text +
        text.slice(edit.end - node.start);
    return text;
  });
  return {
    uri: doc.uri,
    version: doc.version,
    edits: parent.children.map((node, index) => ({
      start: node.start,
      end: node.end,
      expected: doc.text.slice(node.start, node.end),
      text: texts[index],
    })),
  };
}
/** Wrap original child source, changing only its coordinates. Unknown child data remains opaque. */
export function groupFields(
  doc: WmlDocument,
  members: readonly GroupMember[],
  kind: GroupKind,
  style?: number,
  orientation = 1,
): EditIntent {
  const nodes = selectionRoots(
    doc,
    members.map((m) => m.id),
  ).sort((a, b) =>
    kind === "stackfield"
      ? members.find((m) => m.id === a.id)!.y -
          members.find((m) => m.id === b.id)!.y ||
        members.find((m) => m.id === a.id)!.x -
          members.find((m) => m.id === b.id)!.x
      : a.start - b.start,
  );
  if (nodes.length < 2) throw Error("Select at least two sibling fields");
  if (nodes.some((n) => n.parentId !== nodes[0].parentId))
    throw Error("Group fields with the same parent");
  const selected = nodes.map((n) => members.find((m) => m.id === n.id)!);
  if (
    selected.some(
      (m) => !m || ![m.x, m.y, m.width, m.height].every(Number.isFinite),
    )
  )
    throw Error("Invalid group geometry");
  const x = Math.min(...selected.map((m) => m.x)),
    y = Math.min(...selected.map((m) => m.y));
  const width =
      kind === "stackfield"
        ? orientation === 2
          ? selected.reduce((total, m) => total + m.width, 0)
          : Math.max(...selected.map((m) => m.width))
        : Math.max(...selected.map((m) => m.x + m.width)) - x,
    height =
      kind === "stackfield"
        ? orientation === 2
          ? Math.max(...selected.map((m) => m.height))
          : selected.reduce((total, m) => total + m.height, 0)
        : Math.max(...selected.map((m) => m.y + m.height)) - y;
  let cursor = 0;
  const names = new Set(doc.nodes.map((n) => n.attributes.name?.value));
  let ordinal = 1;
  while (names.has(`group${ordinal}`)) ordinal++;
  const children = nodes.map((node) => {
    const member = selected.find((m) => m.id === node.id)!;
    let text = doc.text.slice(node.start, node.end);
    const left =
        kind === "stackfield" ? (orientation === 2 ? cursor : 0) : member.x - x,
      top =
        kind === "stackfield" ? (orientation === 2 ? 0 : cursor) : member.y - y;
    if (kind === "stackfield")
      cursor += orientation === 2 ? member.width : member.height;
    const edits = positionEdits(doc, node, member, left, top);
    for (const edit of edits.sort((a, b) => b.start - a.start))
      text =
        text.slice(0, edit.start - node.start) +
        edit.text +
        text.slice(edit.end - node.start);
    return text;
  });
  const newline = doc.text.includes("\r\n") ? "\r\n" : "\n";
  const wrapper = `<${kind} name="group${ordinal}" xleft="${Math.round(x)}" ytop="${Math.round(y)}" width="${Math.round(width)}" height="${Math.round(height)}" designbias="2" outlinewidth="0"${kind === "stackfield" && orientation !== 1 ? ` orientation="${orientation}"` : ""} fieldstyle="0">${newline}${children.join(newline)}${newline}</${kind}>`;
  const insertion = Math.min(...nodes.map((n) => n.start));
  return {
    uri: doc.uri,
    version: doc.version,
    edits: nodes.map((n) => ({
      start: n.start,
      end: n.end,
      expected: doc.text.slice(n.start, n.end),
      text: n.start === insertion ? wrapper : "",
    })),
  };
}

/** An ungroup operation refuses to discard parent scripts or structured properties. */
export function ungroupField(
  doc: WmlDocument,
  id: string,
  children: readonly GroupMember[],
  parentX: number,
  parentY: number,
): EditIntent {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node || !["subform", "flexibleform", "stackfield"].includes(node.kind))
    throw Error("Select a subform, flexible form, or stack field");
  const childIds = new Set(children.map((c) => c.id));
  if (!node.children.length || node.children.some((c) => !childIds.has(c.id)))
    throw Error("Group contains non-field source; ungroup would lose it");
  let inner = doc.text.slice(
    node.openEnd,
    doc.text.lastIndexOf("</", node.end - 1),
  );
  const edits = node.children.flatMap((child) => {
    const member = children.find((c) => c.id === child.id)!;
    return positionEdits(
      doc,
      child,
      member,
      member.x + parentX,
      member.y + parentY,
    );
  });
  for (const edit of edits.sort((a, b) => b.start - a.start))
    inner =
      inner.slice(0, edit.start - node.openEnd) +
      edit.text +
      inner.slice(edit.end - node.openEnd);
  return {
    uri: doc.uri,
    version: doc.version,
    edits: [
      {
        start: node.start,
        end: node.end,
        expected: doc.text.slice(node.start, node.end),
        text: inner,
      },
    ],
  };
}
