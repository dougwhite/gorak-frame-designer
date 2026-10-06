const fs = require("node:fs/promises");
const path = require("node:path");
const { inflateSync } = require("node:zlib");
const { createHash } = require("node:crypto");
const catalog = require("../src/builtin-images.json");

/** Read only explicitly referenced PNGs. Never follow a native source filename. */
async function imageBytes(folder, src) {
  let file, expected;
  if (typeof src !== "string") throw Error("Invalid image reference");
  if (src.startsWith("builtin:")) {
    const entry = Object.hasOwn(catalog, src.slice(8))
      ? catalog[src.slice(8)]
      : undefined;
    if (!entry) throw Error("Unknown built-in image");
    file = path.join(__dirname, "../src/builtin-images", entry.file);
    expected = entry.sha256;
  } else {
    const parts = src.split("/");
    if (
      parts.length < 2 ||
      parts[0] !== "images" ||
      parts.some((p) => !p || p === "." || p === "..") ||
      /[:\\]/.test(src) ||
      !src.endsWith(".png")
    )
      throw Error("Image reference must stay inside application images/");
    file = folder;
    for (const part of parts) {
      file = path.join(file, part);
      if ((await fs.lstat(file)).isSymbolicLink())
        throw Error("Symlinked image asset");
    }
  }
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 8_000_000)
    throw Error("Image exceeds 8 MB");
  const data = await fs.readFile(file);
  if (expected && createHash("sha256").update(data).digest("hex") !== expected)
    throw Error("Built-in image checksum mismatch");
  if (
    data.length > 8_000_000 ||
    data.length < 33 ||
    data.toString("ascii", 12, 16) !== "IHDR" ||
    data.readUInt32BE(8) !== 13 ||
    !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Expected PNG image");
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20);
  if (!width || !height || width * height > 1_048_576)
    throw Error("Image exceeds pixel bounds");
  return data;
}

function decodeMask(width, height, mask) {
  if (mask == null) return;
  if (typeof mask !== "string" || mask.length > 1_000_000)
    throw Error("Invalid image mask");
  const match = /^(\d+)x(\d+):([A-Za-z0-9+/]+={0,2})$/.exec(mask);
  if (!match || Number(match[1]) !== width || Number(match[2]) !== height)
    throw Error("Image mask dimensions differ");
  const compressed = Buffer.from(match[3], "base64");
  if (compressed.toString("base64") !== match[3])
    throw Error("Invalid image mask encoding");
  const stride = Math.ceil(width / 8);
  const { buffer: bits, engine } = inflateSync(compressed, {
    maxOutputLength: stride * height,
    info: true,
  });
  if (
    bits.length !== stride * height ||
    engine.bytesWritten !== compressed.length
  )
    throw Error("Invalid image mask length");
  return Uint8Array.from({ length: width * height }, (_, i) =>
    bits[Math.floor(i / width) * stride + ((i % width) >> 3)] &
    (128 >> ((i % width) & 7))
      ? 1
      : 0,
  );
}

async function loadImages(folder, references) {
  if (!Array.isArray(references) || references.length > 256)
    throw Error("Too many image references");
  const images = {},
    decoded = new Map();
  let bytes = 0;
  for (const reference of references) {
    if (!Array.isArray(reference) || reference.length !== 3)
      throw Error("Invalid image request");
    const [src, mask, flags] = reference;
    const key = JSON.stringify([src, mask ?? undefined, flags ?? undefined]);
    if (Object.hasOwn(images, key)) continue;
    let bitmap = decoded.get(src);
    if (!bitmap) {
      const png = await imageBytes(folder, src);
      bitmap = {
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
        png,
      };
      decoded.set(src, bitmap);
    }
    bytes += bitmap.width * bitmap.height * 5 + bitmap.png.length;
    if (bytes > 32_000_000) throw Error("Frame images exceed 32 MB");
    const transparent = decodeMask(bitmap.width, bitmap.height, mask);
    const effectiveFlags =
      flags ??
      (bitmap.png[24] === 1 && bitmap.png[25] === 0 ? "2" : mask ? "12" : "4");
    images[key] = { ...bitmap, transparent, flags: effectiveFlags };
  }
  return images;
}
module.exports = { imageBytes, decodeMask, loadImages };
