import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBitmap } from "../src/bitmap.ts";
const encoded = (w, h, type, palette, pixels, mask = "-1") =>
  `12:bitmapobject 0 1 9 0 0: 0 1 2 0 ${w} ${h} ${type} ${palette.length / 4} ${palette.join(" ")} ${type === 2 ? Math.ceil(w / 8) * h : w * h} ${pixels} 0 0 0 0 0 ${mask} 0 0 0 0 -1: -1:`;
test("indexed colours and bit masks decode as data without opening file handles", () => {
  const image = decodeBitmap(
    encoded(2, 1, 12, [10, 20, 30, 0, 40, 50, 60, 0], "0001", "1 80"),
  );
  assert.deepEqual([...image.rgba], [30, 20, 10, 0, 60, 50, 40, 255]);
  assert.equal(decodeBitmap(encoded(8, 1, 2, [], "01")).rgba[3], 255);
});
test("native short and extended runs are bounded and can cross source line wraps", () => {
  assert.equal(
    decodeBitmap(encoded(3, 1, 12, [0, 0, 0, 0], "r000")).rgba.length,
    12,
  );
  assert.equal(
    decodeBitmap(encoded(47, 1, 12, [0, 0, 0, 0], "R12\nf00")).rgba.length,
    188,
  );
  assert.equal(
    decodeBitmap(encoded(300, 1, 12, [0, 0, 0, 0], "R22c0100")).rgba.length,
    1200,
  );
  for (const pixels of ["rfff", "R6ffffff00", "ff", "zz", "r"])
    assert.equal(
      decodeBitmap(encoded(3, 1, 12, [0, 0, 0, 0], pixels)),
      undefined,
    );
  assert.equal(decodeBitmap(encoded(100000, 100000, 12, [], "")), undefined);
});
