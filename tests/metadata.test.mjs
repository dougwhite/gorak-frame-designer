import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetadata, metadataEdit, applyMetadata } from "../src/metadata.ts";
import { parseWml, createField, applyIntent } from "../src/wml.ts";
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
