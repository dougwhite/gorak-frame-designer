import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWml, createField, applyIntent } from "../src/wml.ts";
import { fieldChoices } from "../src/choices.ts";
import { styleEntries, sampleProperties } from "../src/styles.ts";
test("stock choice creation materializes complete source without subsequent stylesheet dependence", () => {
  const sample = sampleProperties(
    styleEntries([]).find((e) => e.kind === "optionfield").sample,
  );
  const doc = parseWml("neutral", 1, "<frame><topform/></frame>");
  const created = applyIntent(
    doc,
    createField(
      doc,
      "optionfield",
      1,
      { xleft: 0, ytop: 0, width: 100, height: 100 },
      {},
      { valuelist: sample.valuelist },
    ),
  );
  const field = created.nodes.find((n) => n.kind === "optionfield");
  assert.equal(field.attributes.fieldstyle.value, "0");
  assert.equal(fieldChoices(field, []).length, 3);
  assert.deepEqual(
    fieldChoices(field, [
      {
        origin: "Frame",
        defaults: {
          groups: { optionfield: { styles: { style1: { valuelist: null } } } },
        },
      },
    ]),
    fieldChoices(field, []),
  );
});
test("inline bitmap strings and opaque scripts remain source data during creation", () => {
  const payload = 'opaque\n" <tag> & data',
    doc = parseWml("neutral", 1, "<frame><topform/></frame>");
  const next = applyIntent(
    doc,
    createField(
      doc,
      "palettefield",
      1,
      { xleft: 0, ytop: 0, width: 100, height: 100 },
      {},
      {
        valuelist: {
          choiceitems: {
            row: [{ enumvalue: "1", enumbitmap: { obj_encoded: payload } }],
          },
        },
        script: "if a < b; ]]> opaque",
      },
    ),
  );
  assert.equal(
    next.nodes.find((n) => n.kind === "enumbitmap").attributes.obj_encoded
      .value,
    payload,
  );
  assert.equal(
    next.nodes.some((n) => n.kind === "tag"),
    false,
  );
  assert.ok(next.text.includes("]]]]><![CDATA[>"));
});
