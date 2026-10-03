import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// Node supports erasable TypeScript; the source model has no DOM or host dependencies.
import {
  parseWml,
  propertyEdit,
  applyIntent,
  resolveProperties,
  deleteFields,
} from "../src/wml.ts";
test("multi-field deletion removes selected subtrees once and preserves outside source", () => {
  const source =
    '<frame><topform><!--before--><subform name="group"><entryfield name="child"/><script><![CDATA[a < b]]></script></subform><!--between--><buttonfield name="b"/><unknown/></topform></frame>';
  const doc = parseWml("test", 8, source),
    group = doc.nodes.find((n) => n.kind === "subform"),
    child = doc.nodes.find((n) => n.kind === "entryfield"),
    button = doc.nodes.find((n) => n.kind === "buttonfield");
  const intent = deleteFields(doc, [group.id, child.id, button.id, button.id]);
  assert.equal(intent.edits.length, 2);
  assert.equal(
    applyIntent(doc, intent).text,
    "<frame><topform><!--before--><!--between--><unknown/></topform></frame>",
  );
  assert.throws(() => deleteFields(doc, [doc.root.id]), /not a field/);
});
const text = `<?xml version="1.0"?>\r\n<frame><!--keep--><topform width='1000' height="1000"><entryfield name="same" xleft='12' unknown="a &amp; b"/><flexibleform><entryfield name="same"/><entryfield/><script><![CDATA[if a < b then;]]></script></flexibleform></topform></frame>\r\n`;
test("targeted edits retain all unrelated bytes, quote styles and nested identity", () => {
  const doc = parseWml("test", 4, text),
    entry = doc.nodes.find((n) => n.kind === "entryfield");
  assert.equal(entry.attributes.unknown.value, "a & b");
  assert.equal(new Set(doc.nodes.map((n) => n.id)).size, doc.nodes.length);
  const next = applyIntent(doc, propertyEdit(doc, entry.id, "xleft", "25"));
  assert.equal(next.text, text.replace("xleft='12'", "xleft='25'"));
  assert.equal(next.version, 5);
  assert.throws(
    () => applyIntent(next, propertyEdit(doc, entry.id, "xleft", "50")),
    /Stale/,
  );
});
test("insertion, escaping and reset do not serialize comments, unknown attributes or scripts", () => {
  const doc = parseWml("test", 1, text),
    entry = doc.nodes.find((n) => n.kind === "entryfield");
  const next = applyIntent(
    doc,
    propertyEdit(doc, entry.id, "textlabel", '"a&<\n'),
  );
  assert.equal(
    next.nodes.find((n) => n.id === entry.id).attributes.textlabel.value,
    '"a&<\n',
  );
  assert.equal(
    applyIntent(next, propertyEdit(next, entry.id, "textlabel", null)).text,
    doc.text,
  );
});
const styles = (origin, entries) => ({
  origin,
  defaults: {
    field_styles: entries.map(([type, group, properties]) => ({
      type,
      group,
      properties,
    })),
  },
});
test("existing fields preserve native style state and ignore stylesheet values", () => {
  const layers = [
    {
      origin: "Frame",
      defaults: {
        groups: {
          entryfield: {
            styles: { style1: { height: "700", width: "800", bgcolor: "6" } },
          },
        },
      },
    },
  ];
  const doc = parseWml(
    "neutral",
    1,
    '<frame><entryfield fieldstyle="0" width="99"/><entryfield fieldstyle="2"/><entryfield/></frame>',
  );
  assert.deepEqual(resolveProperties(doc.nodes[1], layers).width, {
    value: "99",
    origin: "WML",
  });
  assert.equal(resolveProperties(doc.nodes[1], layers).height, undefined);
  assert.equal(resolveProperties(doc.nodes[1], layers).fieldstyle.value, "0");
  assert.equal(resolveProperties(doc.nodes[2], layers).fieldstyle.value, "2");
  assert.equal(resolveProperties(doc.nodes[3], layers).fieldstyle, undefined);
  const reset = applyIntent(
    doc,
    propertyEdit(doc, doc.nodes[1].id, "width", null),
  );
  assert.equal(resolveProperties(reset.nodes[1], layers).width, undefined);
});
test("retired gorak selectors fail closed with re-export guidance", () => {
  for (const n of ["1", "2", "0", "x"])
    assert.throws(
      () =>
        parseWml(
          "neutral",
          1,
          `<frame><entryfield gorak_style="${n}"/></frame>`,
        ),
      /Retired.*re-export/,
    );
});
test("invalid XML character properties are read and edited without losing surrounding bytes", () => {
  const text =
    "<frame><entryfield><defaultstring>before<?ingres_invalidxmlchar 7?>after</defaultstring><script><![CDATA[a < b]]></script></entryfield><!--keep--></frame>";
  const doc = parseWml("neutral", 1, text),
    field = doc.nodes[1];
  assert.equal(
    resolveProperties(field, []).defaultstring.value,
    "before\x07after",
  );
  const next = applyIntent(
    doc,
    propertyEdit(doc, field.id, "defaultstring", "new\x07value"),
  );
  assert.equal(
    next.text,
    text.replace(
      "before<?ingres_invalidxmlchar 7?>after",
      "new<?ingres_invalidxmlchar 7?>value",
    ),
  );
  assert.equal(
    resolveProperties(next.nodes[1], []).defaultstring.value,
    "new\x07value",
  );
});
test("table columns inherit omitted zero offsets while explicit source and defaults win", () => {
  const doc = parseWml(
    "test",
    1,
    '<frame><topform><tablefield><tablebody><columnfield width="500" height="1000"/><columnfield xleft="500" width="500" height="1000"/></tablebody></tablefield></topform></frame>',
  );
  const columns = doc.nodes.filter((n) => n.kind === "columnfield");
  const first = resolveProperties(columns[0], []),
    second = resolveProperties(columns[1], []);
  assert.deepEqual(first.xleft, { value: "0", origin: "Native class default" });
  assert.equal(first.ytop.value, "0");
  assert.deepEqual(second.xleft, { value: "500", origin: "WML" });
  assert.equal(second.ytop.value, "0");
  assert.equal(
    resolveProperties(columns[0], [
      styles("Frame", [["columnfield", "column", { ytop: "10" }]]),
    ]).ytop.value,
    "0",
  );
});
test("malformed markup and unsafe external entities are refused", () => {
  for (const invalid of [
    "<frame>",
    "<frame><x></frame>",
    '<frame a="1" a="2"/>',
    '<!DOCTYPE frame SYSTEM "x"><frame/>',
    "<frame><x a=no/></frame>",
  ])
    assert.throws(() => parseWml("t", 1, invalid));
});
test("overlapping and mismatched source edits cannot apply", () => {
  const doc = parseWml("t", 1, "<frame/>");
  assert.throws(() =>
    applyIntent(doc, {
      uri: "t",
      version: 1,
      edits: [{ start: 1, end: 3, expected: "xx", text: "a" }],
    }),
  );
  assert.throws(() =>
    applyIntent(doc, {
      uri: "t",
      version: 1,
      edits: [
        { start: 1, end: 3, expected: "fr", text: "a" },
        { start: 2, end: 4, expected: "ra", text: "b" },
      ],
    }),
  );
});
test("bounded large-document parse performance", () => {
  const source =
    "<frame><topform>" +
    '<entryfield name="sample"/>'.repeat(10_000) +
    "</topform></frame>";
  const start = performance.now(),
    doc = parseWml("large", 1, source);
  assert.equal(doc.nodes.length, 10_002);
  console.log(
    `10,000 fields: ${Math.round(performance.now() - start)} ms; heap ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
  );
});

test("positioned fields suppress palette cell alignment while explicit gravity wins", () => {
  const layers = [
    styles("Repository", [
      ["buttonfield", "button", { gravity: "17", width: "10" }],
    ]),
  ];
  const doc = parseWml(
    "test",
    1,
    '<frame><buttonfield xleft="100"/><buttonfield xleft="100" gravity="18"/></frame>',
  );
  assert.deepEqual(resolveProperties(doc.nodes[1], layers).gravity, {
    value: "-1",
    origin: "OpenROAD positioned-field default",
  });
  assert.deepEqual(resolveProperties(doc.nodes[2], layers).gravity, {
    value: "18",
    origin: "WML",
  });
});
