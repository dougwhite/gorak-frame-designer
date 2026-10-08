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

/** Bounded PNG data resolved by a trusted host, including native transparency. */
export interface FrameImageAsset {
  width: number;
  height: number;
  png: Uint8Array | readonly number[];
  transparent?: Uint8Array | readonly number[];
  flags?: string;
}
export async function decodeFrameImages(
  assets: Readonly<Record<string, FrameImageAsset>>,
): Promise<FrameImages> {
  const entries = Object.entries(assets);
  if (entries.length > 256) throw Error("Too many image references");
  let bytes = 0;
  for (const [, asset] of entries) {
    if (
      !Number.isInteger(asset.width) ||
      !Number.isInteger(asset.height) ||
      asset.width <= 0 ||
      asset.height <= 0 ||
      asset.width * asset.height > 1_048_576 ||
      asset.png.length > 8_000_000
    )
      throw Error("Image exceeds bounds");
    if (
      asset.transparent &&
      asset.transparent.length !== asset.width * asset.height
    )
      throw Error("Image mask dimensions differ");
    bytes += asset.width * asset.height * 5 + asset.png.length;
    if (bytes > 32_000_000) throw Error("Frame images exceed 32 MB");
  }
  const images: Record<string, FieldBitmap> = {};
  for (const [key, asset] of entries) {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(asset.png)], { type: "image/png" }),
    );
    try {
      if (bitmap.width !== asset.width || bitmap.height !== asset.height)
        throw Error("Image dimensions differ");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Image canvas unavailable");
      context.drawImage(bitmap, 0, 0);
      const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      applyImageTransparency(
        rgba,
        asset.flags,
        asset.transparent ? new Uint8Array(asset.transparent) : undefined,
      );
      images[key] = { width: bitmap.width, height: bitmap.height, rgba };
    } finally {
      bitmap.close();
    }
  }
  return images;
}
