import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { checkout, verifyCheckout } from "../scripts/compatibility-pin.mjs";
import { parseWml, propertyEdit, applyIntent } from "../src/wml.ts";
import { frameFromWml, WML_TO_CSS } from "../src/frame-model.ts";
import { parseMetadata } from "../src/metadata.ts";
import { resolveStyles } from "../src/styles.ts";

// Fail closed: missing, modified or wrong-release fixtures must never skip tests.
verifyCheckout();
const project = `${checkout}/compatibility/project`;
const read = (path) => readFileSync(`${project}/${path}`, "utf8");
const source = read("example/panel.wml");
const companion = read("example/panel.w4gl");
const layers = [
  ["Project", "field_defaults.json"],
  ["Application", "example/field_defaults.json"],
  ["Frame", "example/panel.fielddefaults.json"],
].map(([origin, path]) => ({ origin, defaults: JSON.parse(read(path)) }));
const doc = parseWml(
  pathToFileURL(`${project}/example/panel.wml`).href,
  1,
  source,
);
const metadata = parseMetadata(
  pathToFileURL(`${project}/example/panel.w4gl`).href,
  1,
  companion,
);
const frame = frameFromWml(doc, layers, metadata);
const field = (name) => {
  const found = frame.fields.find((f) => f.name === name);
  assert.ok(found, `Missing fixture field ${name}`);
  return found;
};

test("release frame loads explicit geometry and table hierarchy", () => {
  assert.equal(frame.uri, doc.uri);
  assert.equal(frame.version, 1);
  assert.equal(frame.width, 6000 * WML_TO_CSS);
  assert.equal(frame.height, 3000 * WML_TO_CSS);
  assert.deepEqual(
    frame.fields.map((f) => [f.kind, f.name]),
    [
      ["entryfield", "quantity"],
      ["entryfield", "nullable_default"],
      ["entryfield", "specified_default"],
      ["buttonfield", "calculate"],
      ["tablefield", "results"],
      ["tablebody", ""],
      ["columnfield", "amount"],
      ["viewportfield", "preview"],
      ["flexibleform", "content"],
    ],
  );
  const body = frame.fields.find((f) => f.kind === "tablebody");
  assert.equal(body.parentId, field("results").id);
  assert.equal(field("amount").parentId, body.id);
  assert.equal(field("quantity").parentId, undefined);
  assert.equal(new Set(frame.fields.map((f) => f.id)).size, 9);
  assert.deepEqual(
    [
      field("quantity").x,
      field("quantity").y,
      field("quantity").width,
      field("quantity").height,
    ],
    [200, 200, 1400, 300].map((n) => n * WML_TO_CSS),
  );
});

test("explicit field state includes integer types and native style identity", () => {
  assert.equal(field("quantity").properties.datatype, "integer");
  assert.equal(field("quantity").properties.defaultstring, "before\u0007after");
  assert.equal(field("quantity").properties.fieldstyle, "0");
  assert.equal(field("calculate").properties.fieldstyle, "1");
  assert.equal(field("calculate").label, "Calculate");
  assert.equal(field("results").properties.fieldstyle, "0");
  assert.equal(field("amount").prototype.kind, "entryfield");
  assert.deepEqual(field("amount").prototype.properties, {
    type: "entryfield",
    name: "amount",
    datatype: "integer",
    width: "1000",
    fieldstyle: "0",
  });
});

test("native palette layers resolve while existing button state retains WML origin", () => {
  const colour = (count) =>
    resolveStyles(layers.slice(0, count)).groups.buttonfield.styles.style1
      .bgcolor;
  assert.deepEqual([colour(1), colour(2), colour(3)], ["6", "7", "8"]);
  assert.equal(field("calculate").properties.bgcolor, "6");
  for (const key of ["bgcolor", "textlabel", "fieldstyle", "width"])
    assert.equal(field("calculate").propertyOrigins[key], "WML");
  assert.equal(field("quantity").propertyOrigins.datatype, "WML");
});

test("navigation spans retain field definitions and opaque embedded event source", () => {
  for (const f of frame.fields) {
    const node = doc.nodes.find((n) => n.id === f.id);
    assert.deepEqual(f.source, { start: node.start, end: node.end });
    assert.ok(
      source.slice(f.source.start, f.source.end).startsWith(`<${node.kind}`),
    );
    if (f.name) {
      const span = node.attributes.name.valueSpan;
      assert.equal(source.slice(span.start, span.end), f.name);
    }
  }
  const button = doc.nodes.find((n) => n.id === field("calculate").id);
  const script = button.children.find((n) => n.kind === "script");
  assert.ok(script);
  const eventSource = source.slice(
    script.openEnd,
    script.end - "</script>".length,
  );
  assert.match(eventSource, /^<!\[CDATA\[on click =/);
  assert.match(
    eventSource,
    /quantity = CALLPROC score\(capsules = quantity\);/,
  );
  assert.ok(source.slice(button.start, button.end).includes(eventSource));
  assert.equal(frame.metadata, metadata);
  assert.equal(metadata.attributes.windowwidth.value, "6000");
  assert.equal(metadata.attributes.windowheight.value, "3000");
  assert.equal(metadata.text, companion);
  assert.match(companion, /current_count = counter;/);
});

test("one versioned property edit preserves every unrelated fixture byte", () => {
  const button = field("calculate");
  const node = doc.nodes.find((n) => n.id === button.id);
  const span = node.attributes.textlabel.valueSpan;
  const intent = propertyEdit(doc, button.id, "textlabel", "Calculate total");
  assert.equal(intent.edits.length, 1);
  const next = applyIntent(doc, intent);
  assert.equal(
    next.text,
    source.slice(0, span.start) + "Calculate total" + source.slice(span.end),
  );
  assert.equal(next.version, 2);
  assert.equal(
    frameFromWml(next, layers, metadata).fields.find((f) => f.id === button.id)
      .label,
    "Calculate total",
  );
  assert.throws(() => applyIntent(next, intent), /Stale/);
  assert.equal(
    applyIntent(next, propertyEdit(next, button.id, "textlabel", "Calculate"))
      .text,
    source,
  );
  assert.equal(read("example/panel.wml"), source);
  assert.equal(read("example/panel.w4gl"), companion);
});

test("contract 3 background references retain native metadata through geometry edits", () => {
  const image = doc.nodes.find((n) => n.kind === "bgbitmap");
  assert.equal(image.attributes.src.value, "images/badge.png");
  assert.equal(image.attributes.path.value, "art/badge.png");
  const pixels = { width: 2, height: 2, rgba: new Uint8ClampedArray(16) };
  const key = JSON.stringify(["images/badge.png", undefined, undefined]);
  assert.equal(
    frameFromWml(doc, layers, metadata, { [key]: pixels }).backgroundBitmap,
    pixels,
  );
  const next = applyIntent(
    doc,
    propertyEdit(doc, field("quantity").id, "width", "1500"),
  );
  assert.ok(next.text.includes(source.slice(image.start, image.end)));
});

test("packaged built-in image identities match the certified gorak release", () => {
  const catalog = JSON.parse(readFileSync("src/builtin-images.json", "utf8"));
  assert.deepEqual(
    catalog,
    JSON.parse(
      readFileSync(
        `${checkout}/src/gorak/templates/builtin_images.json`,
        "utf8",
      ),
    ),
  );
  for (const entry of Object.values(catalog))
    assert.equal(
      createHash("sha256")
        .update(readFileSync(`src/builtin-images/${entry.file}`))
        .digest("hex"),
      entry.sha256,
    );
});

test("candidate default modes and typed viewport retain WML identity", () => {
  assert.equal(field("quantity").properties.defaultvalue, undefined);
  assert.equal(field("nullable_default").properties.defaultvalue, "2");
  assert.equal(field("specified_default").properties.defaultvalue, "3");
  assert.equal(field("specified_default").properties.defaultstring, "7");
  assert.equal(field("content").parentId, field("preview").id);
  const content = field("content");
  assert.equal(content.width, 1400 * WML_TO_CSS);
  assert.equal(content.propertyOrigins.ismovebounded, "WML");
  const next = applyIntent(doc, propertyEdit(doc, content.id, "width", "1300"));
  assert.equal(
    next.text,
    source.replace(
      'name="content" width="1400"',
      'name="content" width="1300"',
    ),
  );
});

test("published absent stylesheet frame loads without inheriting a creation palette", () => {
  const source = parseWml("unstyled.wml", 1, read("example/unstyled.wml"));
  const metadata = parseMetadata(
    "unstyled.w4gl",
    1,
    read("example/unstyled.w4gl"),
  );
  const frame = frameFromWml(
    source,
    [
      ...layers.slice(0, 2),
      {
        origin: "Frame",
        defaults: JSON.parse(read("example/unstyled.fielddefaults.json")),
      },
    ],
    metadata,
  );
  assert.equal(frame.source, source);
  assert.equal(frame.fields.length, 0);
  assert.deepEqual(
    [frame.width, frame.height],
    [2000, 1000].map((n) => n * WML_TO_CSS),
  );
  assert.equal(
    frame.palette.some((tool) => tool.kind),
    false,
  );
  const next = applyIntent(
    source,
    propertyEdit(source, frame.formId, "width", "2200"),
  );
  assert.equal(next.text, source.text.replace('width="2000"', 'width="2200"'));
  assert.equal(frameFromWml(next, [], metadata).width, 2200 * WML_TO_CSS);
});
