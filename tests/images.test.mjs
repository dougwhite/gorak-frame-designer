import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, copyFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { parseWml, applyIntent, propertyEdit } from "../src/wml.ts";
import { frameFromWml } from "../src/frame-model.ts";
import { imageKey, applyImageTransparency } from "../src/images.ts";
const require = createRequire(import.meta.url);
const {
  loadImages,
  imageBytes,
  decodeMask,
} = require("../electron/image-assets.cjs");

test("image references supply buttons, selections, choices and backgrounds without changing source", () => {
  const text =
    '<frame><!--preserve--><topform width="2000" height="1000"><bgbitmap src="images/art.png" path="original.bmp" native-t7="7"/><buttonfield name="action" textlabel="Run"><bitmaplabel src="builtin:pal_icon2"/><selectedbitmap src="images/art.png" mask="opaque"/></buttonfield><imagetrim><image src="images/art.png"/></imagetrim><subform><bgbitmap src="images/art.png"/></subform><palettefield><valuelist><choiceitems><row enumvalue="1"><enumbitmap src="builtin:pal_icon2"/></row></choiceitems></valuelist></palettefield></topform></frame>';
  const doc = parseWml("neutral.wml", 5, text);
  const normal = {
    width: 1,
    height: 1,
    rgba: new Uint8ClampedArray([20, 30, 40, 255]),
  };
  const selected = { ...normal, rgba: new Uint8ClampedArray([0, 0, 0, 0]) };
  const images = Object.fromEntries(
    doc.nodes
      .filter((n) => n.attributes.src)
      .map((n) => [imageKey(n), n.attributes.mask ? selected : normal]),
  );
  const frame = frameFromWml(doc, [], undefined, images);
  assert.equal(frame.backgroundBitmap, normal);
  assert.equal(frame.fields.find((f) => f.kind === "imagetrim").bitmap, normal);
  const button = frame.fields.find((f) => f.kind === "buttonfield");
  assert.equal(button.bitmap, normal);
  assert.equal(button.selectedBitmap, selected);
  assert.equal(
    frame.fields.find((f) => f.kind === "subform").backgroundBitmap,
    normal,
  );
  assert.equal(
    frame.fields.find((f) => f.kind === "palettefield").choices[0].bitmap,
    normal,
  );
  const next = applyIntent(
    doc,
    propertyEdit(doc, button.id, "textlabel", "Go"),
  );
  assert.equal(next.text, text.replace('textlabel="Run"', 'textlabel="Go"'));
  assert.equal(
    frameFromWml(doc, []).fields.find((f) => f.kind === "buttonfield").bitmap,
    undefined,
  );
});

test("PNG loading is bounded, deduplicated, verifies built-ins and refuses escaped filenames", async () => {
  const folder = await mkdtemp(join(tmpdir(), "frame-images-"));
  try {
    await mkdir(join(folder, "images"));
    await copyFile(
      "src/builtin-images/pal_icon2.png",
      join(folder, "images/art.png"),
    );
    const refs = [
      ["images/art.png", null, null],
      ["builtin:pal_icon2", null, null],
      ["images/art.png", null, null],
    ];
    const images = await loadImages(folder, refs);
    assert.equal(Object.keys(images).length, 2);
    assert.deepEqual(
      images[JSON.stringify(refs[0])].png,
      images[JSON.stringify(refs[1])].png,
    );
    for (const src of [
      "../art.png",
      "images/../art.png",
      "images\\art.png",
      "https://example.org/a.png",
      "builtin:missing",
      "images//art.png",
      "images/./art.png",
    ])
      await assert.rejects(() => imageBytes(folder, src));
    await writeFile(join(folder, "images/bad.png"), "not an image");
    await assert.rejects(() => imageBytes(folder, "images/bad.png"), /PNG/);
    await assert.rejects(
      () => loadImages(folder, Array(257).fill(refs[0])),
      /Too many/,
    );
  } finally {
    await rm(folder, { recursive: true });
  }
});

test("native masks preserve MSB-first transparency and reject wrong dimensions or oversized inflation", () => {
  const bitmap = () => ({
    width: 9,
    height: 1,
    rgba: new Uint8ClampedArray(36).fill(255),
  });
  const mask = "9x1:" + deflateSync(Buffer.from([128, 128])).toString("base64");
  const result = bitmap();
  applyImageTransparency(result.rgba, undefined, decodeMask(9, 1, mask));
  assert.equal(result.rgba[3], 0);
  assert.equal(result.rgba[7], 255);
  assert.equal(result.rgba[35], 0);
  assert.throws(
    () => decodeMask(9, 1, mask.replace("9x1", "8x1")),
    /dimensions/,
  );
  assert.throws(() =>
    decodeMask(
      9,
      1,
      "9x1:" + deflateSync(Buffer.alloc(100)).toString("base64"),
    ),
  );
  const mono = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  applyImageTransparency(mono, "2");
  assert.deepEqual([...mono], [0, 0, 0, 255, 0, 0, 0, 0]);
});
