import { structuredDefaults, type DefaultsLayer, type WmlNode } from "./wml.ts";
import { decodeBitmap, type FieldBitmap } from "./bitmap.ts";
export interface FieldChoice {
  label: string;
  value: string;
  bitmap?: FieldBitmap;
}
const bitmapProperty = (encoded: string): Partial<FieldChoice> => {
  const bitmap = decodeBitmap(encoded);
  return bitmap ? { bitmap } : {};
};
export function fieldColumns(
  node: WmlNode,
  layers: readonly DefaultsLayer[],
): readonly { label: string; width: number }[] {
  const explicit = node.children.find((c) => c.kind === "colattributes");
  const rows = explicit
    ? explicit.children
        .filter((c) => c.kind === "row")
        .map((c) =>
          Object.fromEntries(
            Object.entries(c.attributes).map(([key, value]) => [
              key,
              value.value,
            ]),
          ),
        )
    : ((
        structuredDefaults(node, layers).colattributes as
          { row?: Record<string, unknown>[] } | undefined
      )?.row ?? []);
  return Array.isArray(rows)
    ? rows.slice(0, 100).map((row) => ({
        label: String(row.headertext ?? ""),
        width: Number(row.columnwidth ?? 0),
      }))
    : [];
}
export function fieldChoices(
  node: WmlNode,
  layers: readonly DefaultsLayer[],
): readonly FieldChoice[] {
  const explicit = node.children.find((c) => c.kind === "valuelist");
  if (explicit) {
    const items =
      explicit.children.find((c) => c.kind === "choiceitems")?.children ?? [];
    return items
      .filter((c) => c.kind === "row")
      .slice(0, 10000)
      .map((c) => ({
        label:
          c.attributes.enumdisplay?.value ?? c.attributes.enumtext?.value ?? "",
        value: c.attributes.enumvalue?.value ?? "",
        ...bitmapProperty(
          c.children.find((n) => n.kind === "enumbitmap")?.attributes
            .obj_encoded?.value ?? "",
        ),
      }));
  }
  if (Object.hasOwn(node.attributes, "valuelist")) return [];
  const list = structuredDefaults(node, layers).valuelist as
    { choiceitems?: { row?: Record<string, unknown>[] } } | undefined;
  const rows = list?.choiceitems?.row;
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 10000).map((row) => ({
    label: String(row.enumdisplay ?? row.enumtext ?? ""),
    value: String(row.enumvalue ?? ""),
    ...bitmapProperty(
      String(
        (row.enumbitmap as { obj_encoded?: string } | undefined)?.obj_encoded ??
          "",
      ),
    ),
  }));
}
