import type { WmlNode } from "./wml";
import { decodeBitmap, type FieldBitmap } from "./bitmap.ts";

/** Hosts resolve source references to bounded pixels; source filenames are never URLs. */
export type FrameImages = Readonly<Record<string, FieldBitmap>>;
export function imageKey(node: WmlNode): string {
  return JSON.stringify([
    node.attributes.src?.value,
    node.attributes.mask?.value,
    node.attributes["native-flags"]?.value,
  ]);
}
export function nodeBitmap(
  node: WmlNode | undefined,
  images: FrameImages = {},
): FieldBitmap | undefined {
  if (!node) return;
  if (node.attributes.src) return images[imageKey(node)];
  const encoded = node.attributes.obj_encoded?.value;
  return encoded ? decodeBitmap(encoded) : undefined;
}

/** A native monochrome image uses black foreground and clear background. */
export function applyImageTransparency(
  rgba: Uint8ClampedArray,
  flags?: string,
  transparent?: Uint8Array,
): void {
  for (let i = 0; i < rgba.length; i += 4) {
    if (flags === "2") {
      rgba[i + 3] = rgba[i] < 128 ? 255 : 0;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
    }
    if (transparent?.[i / 4]) rgba[i + 3] = 0;
  }
}
