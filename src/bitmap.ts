/** Data-only subset of native BitmapObject serialization. File handles are ignored. */
export interface FieldBitmap {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}
export function decodeBitmap(encoded: string): FieldBitmap | undefined {
  if (encoded.length > 1024 * 1024) return;
  let offset = 0;
  const skip = () => {
    while (/\s/.test(encoded[offset] ?? "") && offset < encoded.length)
      offset++;
  };
  const integer = () => {
    skip();
    const match = /^-?\d+/.exec(encoded.slice(offset));
    if (!match) throw Error("Missing integer");
    offset += match[0].length;
    return Number(match[0]);
  };
  const literal = (nullable = false) => {
    const length = integer();
    if (
      encoded[offset++] !== ":" ||
      length < (nullable ? -1 : 0) ||
      length > 65536
    )
      throw Error("Invalid literal");
    if (length === -1) return "";
    const value = encoded.slice(offset, offset + length);
    if (value.length !== length) throw Error("Truncated literal");
    offset += length;
    return value;
  };
  const hex = (count: number) => {
    let value = "";
    for (let i = 0; i < count; i++) {
      skip();
      const char = encoded[offset++];
      if (!char || !/[0-9a-fA-F]/.test(char)) throw Error("Invalid hex");
      value += char;
    }
    return parseInt(value, 16);
  };
  const bytes = (length: number) => {
    if (length === -1) return new Uint8Array();
    if (!Number.isInteger(length) || length < 0 || length > 4 * 1024 * 1024)
      throw Error("Bitmap too large");
    const result = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      skip();
      let count = 1;
      if (encoded[offset] === "r") {
        offset++;
        count = hex(1) + 3;
      } else if (encoded[offset] === "R") {
        offset++;
        const size = hex(1);
        if (size < 1 || size > 4) throw Error("Invalid run");
        count = 0;
        for (let i = 0; i < size; i++) count += hex(2) * 256 ** i;
      }
      const value = hex(2);
      if (count < 1 || written + count > length)
        throw Error("Invalid run length");
      result.fill(value, written, written + count);
      written += count;
    }
    return result;
  };
  try {
    if (literal() !== "bitmapobject") return;
    for (let i = 0; i < 4; i++) integer();
    literal(); // Source file name is neither opened nor exposed.
    for (let i = 0; i < 4; i++) integer();
    const width = integer(),
      height = integer(),
      type = integer(),
      colors = integer();
    if (
      width < 1 ||
      height < 1 ||
      width > 2048 ||
      height > 2048 ||
      width * height > 1024 * 1024 ||
      colors < 0 ||
      colors > 256
    )
      return;
    const palette = Array.from({ length: colors }, () =>
      Array.from({ length: 4 }, integer),
    );
    if (palette.some((p) => p.some((c) => c < 0 || c > 255))) return;
    const pixels = bytes(integer());
    for (let i = 0; i < 5; i++) integer();
    const mask = bytes(integer());
    for (let i = 0; i < 4; i++) integer();
    literal(true);
    literal(true);
    skip();
    if (offset !== encoded.length) return;
    const channels = type === 12 ? pixels.length / (width * height) : 0;
    const stride = type === 2 ? Math.ceil(width / 8) : width * channels;
    if (type === 12 && ![1, 3, 4].includes(channels)) return;
    if (![2, 12].includes(type) || pixels.length !== stride * height) return;
    const maskStride = Math.ceil(width / 8);
    if (mask.length && mask.length !== maskStride * height) return;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        if (type === 2) {
          const bit = (pixels[y * stride + (x >>> 3)] >>> (x & 7)) & 1;
          rgba[at] = rgba[at + 1] = rgba[at + 2] = 0;
          rgba[at + 3] = bit ? 255 : 0;
        } else if (channels === 1) {
          const color = palette[pixels[y * stride + x]];
          if (!color) return;
          rgba.set([color[2], color[1], color[0], 255], at);
        } else {
          const pixel = y * stride + x * channels;
          rgba.set(
            [
              pixels[pixel + 2],
              pixels[pixel + 1],
              pixels[pixel],
              channels === 4 ? pixels[pixel + 3] : 255,
            ],
            at,
          );
        }
        if (mask.length && mask[y * maskStride + (x >>> 3)] & (128 >>> (x & 7)))
          rgba[at + 3] = 0;
      }
    return { width, height, rgba };
  } catch {
    return;
  }
}
