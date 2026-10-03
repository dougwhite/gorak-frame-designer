import type { FrameField } from "./designer";

export function pageVisible(
  field: FrameField,
  active: ReadonlyMap<string, number>,
): boolean {
  return (field.pageScopes ?? []).every(
    (scope) => scope.index === (active.get(scope.folderId) ?? 0),
  );
}

/** Flat rendering retains source identities; clipping follows visual parent bounds. */
export function fieldClip(
  field: FrameField,
  fields: ReadonlyMap<string, FrameField>,
): string | undefined {
  let left = field.x,
    top = field.y,
    right = field.x + field.width,
    bottom = field.y + field.height;
  let parentId = field.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = fields.get(parentId);
    if (!parent) break;
    if (["tabpage", "viewportfield", "tablebody"].includes(parent.kind)) {
      left = Math.max(left, parent.x);
      top = Math.max(top, parent.y);
      right = Math.min(right, parent.x + parent.width);
      bottom = Math.min(bottom, parent.y + parent.height);
    }
    parentId = parent.parentId;
  }
  const inset = [
    Math.max(0, top - field.y),
    Math.max(0, field.x + field.width - right),
    Math.max(0, field.y + field.height - bottom),
    Math.max(0, left - field.x),
  ];
  return inset.some((v) => v > 0)
    ? `inset(${inset.map((v) => `${v}px`).join(" ")})`
    : undefined;
}
