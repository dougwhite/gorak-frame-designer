import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetadata, metadataEdit, applyMetadata } from "../src/metadata.ts";
import {
  parseWml,
  createField,
  applyIntent,
  propertyEdit,
} from "../src/wml.ts";
import { frameFromWml, WML_TO_CSS } from "../src/frame-model.ts";

test("window dimensions edit only companion values, retaining source and comments", () => {
  const source =
    '[framesource]\r\nwindowwidth = "4719" # keep\r\nwindowheight = "3688"\r\n\r\n===\r\ninitialize() = { /* opaque */ }\r\n';
  const doc = parseMetadata("example.w4gl", 8, source);
  const next = applyMetadata(
    doc,
    metadataEdit(doc, { windowwidth: "5000", windowheight: "4000" }),
  );
  assert.equal(
    next.text,
    source.replace("4719", "5000").replace("3688", "4000"),
  );
  assert.throws(
    () => applyMetadata(next, metadataEdit(doc, { windowwidth: "1" })),
    /Stale/,
  );
  const added = applyMetadata(doc, metadataEdit(doc, { istitled: "0" }));
  assert.equal(added.attributes.istitled.value, "0");
  assert.ok(added.text.endsWith("initialize() = { /* opaque */ }\r\n"));
});
test("palette creation expands an empty topform and preserves names and materializes Unique Style", () => {
  for (const source of [
    '<frame><!--keep--><topform width="1000" height="1000"/></frame>',
    '<frame><topform><entryfield name="field1"/><script><![CDATA[a < b]]></script></topform></frame>',
  ]) {
    const doc = parseWml("example.wml", 1, source),
      next = applyIntent(
        doc,
        createField(doc, "entryfield", 2, {
          xleft: 50,
          ytop: 60,
          width: 200,
          height: 100,
        }),
      );
    const field = next.nodes.filter((n) => n.kind === "entryfield").at(-1);
    assert.equal(
      field.parentId,
      next.nodes.find((n) => n.kind === "topform").id,
    );
    assert.equal(field.attributes.fieldstyle.value, "0");
    assert.equal(field.attributes.designbias.value, "3");
    assert.equal(
      field.attributes.name.value,
      source.includes("field1") ? "field2" : "field1",
    );
    if (source.includes("CDATA"))
      assert.ok(next.text.includes("<script><![CDATA[a < b]]></script>"));
    else assert.ok(next.text.includes("<!--keep-->"));
  }
});
test("new standalone fields materialize neutral defaults without repository selectors", () => {
  const doc = parseWml("synthetic:new", 1, "<frame><topform/></frame>");
  const next = applyIntent(
    doc,
    createField(
      doc,
      "buttonfield",
      undefined,
      { xleft: 1, ytop: 2, width: 100, height: 100 },
      { textlabel: "Neutral & safe" },
    ),
  );
  assert.equal(next.nodes.at(-1).attributes.textlabel.value, "Neutral & safe");
  assert.equal(next.nodes.at(-1).attributes.gorak_style, undefined);
  assert.throws(
    () => createField(doc, "buttonfield", 1, { width: -1 }),
    /geometry/,
  );
});

test("frame-template companion dimensions and targeted edits preserve the component type and opaque source", () => {
  const text =
    '<frame><!--keep layout--><topform width="1000" height="1000"><bgbitmap src="images/art.png" path="original.bmp" native-t7="7"/><buttonfield name="action" xleft="200" width="1400"><bitmaplabel src="builtin:pal_icon2"/><script><![CDATA[on click = { /* opaque */ }]]></script></buttonfield></topform></frame>';
  for (const newline of ["\n", "\r\n"]) {
    const companion = [
      "# keep metadata",
      "[frametemplate]",
      'windowwidth = "6000" # keep width',
      'windowheight = "3000"',
      "[taggedvalues]",
      'note = "opaque"',
      "",
      "===",
      "initialize() = { /* [framesource] remains script data */ }",
      "",
    ].join(newline);
    const doc = parseWml("template.wml", 4, text);
    const metadata = parseMetadata("template.w4gl", 8, companion);
    const frame = frameFromWml(doc, [], metadata);
    assert.equal(frame.width, 6000 * WML_TO_CSS);
    assert.equal(frame.height, 3000 * WML_TO_CSS);
    const field = frame.fields.find((f) => f.name === "action");
    const next = applyIntent(doc, propertyEdit(doc, field.id, "xleft", "450"));
    assert.equal(next.text, text.replace('xleft="200"', 'xleft="450"'));
    assert.equal(metadata.text, companion);
    const resized = applyMetadata(
      metadata,
      metadataEdit(metadata, { windowwidth: "6500" }),
    );
    assert.equal(
      resized.text,
      companion.replace('windowwidth = "6000"', 'windowwidth = "6500"'),
    );
    assert.equal(frameFromWml(next, [], resized).width, 6500 * WML_TO_CSS);
    assert.equal(frameFromWml(next, [], resized).fields[0].x, 450 * WML_TO_CSS);
    assert.throws(
      () =>
        applyMetadata(resized, metadataEdit(metadata, { windowheight: "1" })),
      /Stale/,
    );
    const added = applyMetadata(
      metadata,
      metadataEdit(metadata, { istitled: "0" }),
    );
    assert.equal(
      added.text,
      companion.replace(
        newline + "[taggedvalues]",
        newline + 'istitled = "0"' + newline + "[taggedvalues]",
      ),
    );
  }
});
