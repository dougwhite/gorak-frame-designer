import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWml, applyIntent } from "../src/wml.ts";
import { groupFields, ungroupField, reorderStack } from "../src/grouping.ts";
test("grouping and ungrouping translate SegmentShape parent-coordinate endpoints", () => {
  const doc = parseWml(
    "test",
    1,
    '<frame><topform><segmentshape xleft="100" ytop="200" width="200" height="100" point1x="100" point1y="200" point2x="300" point2y="300"/><buttonfield xleft="400" ytop="200"/></topform></frame>',
  );
  const [line, button] = doc.nodes.filter((n) =>
    ["segmentshape", "buttonfield"].includes(n.kind),
  );
  const next = applyIntent(
    doc,
    groupFields(
      doc,
      [
        { id: line.id, x: 100, y: 200, width: 200, height: 100 },
        { id: button.id, x: 400, y: 200, width: 100, height: 100 },
      ],
      "flexibleform",
    ),
  );
  const group = next.nodes.find((n) => n.kind === "flexibleform"),
    segment = group.children[0];
  assert.equal(segment.attributes.point1x.value, "0");
  assert.equal(segment.attributes.point2y.value, "100");
  const restored = applyIntent(
    next,
    ungroupField(
      next,
      group.id,
      group.children.map((n) => ({
        id: n.id,
        x: Number(n.attributes.xleft.value),
        y: Number(n.attributes.ytop.value),
        width: 100,
        height: 100,
      })),
      100,
      200,
    ),
  );
  const points = restored.nodes.find(
    (n) => n.kind === "segmentshape",
  ).attributes;
  assert.equal(points.point1x.value, "100");
  assert.equal(points.point2y.value, "300");
});
test("group/ungroup retain child scripts, native style state, comments and unknown source", () => {
  const text =
    '<frame><topform><!--before--><entryfield name="a" xleft="100" ytop="200" fieldstyle="2" mystery="stay"><script><![CDATA[a < b;]]></script></entryfield><!--between--><buttonfield name="b" xleft="400" ytop="500"/><opaque/></topform></frame>';
  const doc = parseWml("test", 3, text),
    fields = doc.nodes.filter((n) =>
      ["entryfield", "buttonfield"].includes(n.kind),
    );
  const grouped = applyIntent(
    doc,
    groupFields(
      doc,
      fields.map((f, i) => ({
        id: f.id,
        x: i ? 400 : 100,
        y: i ? 500 : 200,
        width: 200,
        height: 100,
      })),
      "flexibleform",
      1,
    ),
  );
  assert.ok(
    grouped.text.includes(
      'fieldstyle="2" mystery="stay"><script><![CDATA[a < b;]]></script>',
    ),
  );
  assert.ok(grouped.text.includes("<!--between--><opaque/>"));
  assert.ok(grouped.text.includes('xleft="0" ytop="0"'));
  const parent = grouped.nodes.find((n) => n.kind === "flexibleform");
  const ungrouped = applyIntent(
    grouped,
    ungroupField(
      grouped,
      parent.id,
      parent.children.map((n) => ({
        id: n.id,
        x: Number(n.attributes.xleft.value),
        y: Number(n.attributes.ytop.value),
        width: 200,
        height: 100,
      })),
      100,
      200,
    ),
  );
  assert.ok(ungrouped.text.includes('xleft="100" ytop="200" fieldstyle="2"'));
  assert.ok(ungrouped.text.includes('xleft="400" ytop="500"'));
  assert.ok(!ungrouped.text.includes("<flexibleform"));
});
test("group rejects mixed parents and ungroup protects parent-owned scripts", () => {
  const doc = parseWml(
    "test",
    1,
    "<frame><topform><entryfield/><subform><buttonfield/><script><![CDATA[owned]]></script></subform></topform></frame>",
  );
  const entries = doc.nodes.filter((n) =>
    ["entryfield", "buttonfield"].includes(n.kind),
  );
  assert.throws(
    () =>
      groupFields(
        doc,
        entries.map((n) => ({ id: n.id, x: 0, y: 0, width: 10, height: 10 })),
        "subform",
      ),
    /same parent/,
  );
  const group = doc.nodes.find((n) => n.kind === "subform");
  assert.throws(
    () =>
      ungroupField(
        doc,
        group.id,
        [{ id: entries[1].id, x: 0, y: 0, width: 10, height: 10 }],
        0,
        0,
      ),
    /lose/,
  );
});
test("native vertical stack grouping packs outer sizes and anchors children at top left", () => {
  const doc = parseWml(
    "test",
    1,
    '<frame><topform><entryfield name="a" xleft="323" ytop="313"/><buttonfield name="b" xleft="323" ytop="781"/></topform></frame>',
  );
  const fields = doc.nodes.filter((n) =>
    ["entryfield", "buttonfield"].includes(n.kind),
  );
  const next = applyIntent(
    doc,
    groupFields(
      doc,
      [
        { id: fields[0].id, x: 323, y: 313, width: 2375, height: 198 },
        { id: fields[1].id, x: 323, y: 781, width: 1521, height: 344 },
      ],
      "stackfield",
      1,
    ),
  );
  const group = next.nodes.find((n) => n.kind === "stackfield");
  assert.equal(group.attributes.height.value, "542");
  assert.equal(group.attributes.width.value, "2375");
  assert.equal(group.attributes.childgravity, undefined);
  assert.equal(group.attributes.orientation, undefined);
  assert.equal(group.children[1].attributes.xleft.value, "0");
  assert.equal(group.children[1].attributes.ytop.value, "198");
});
test("stack reorder packs unequal children while preserving scripts and interstitial comments", () => {
  const doc = parseWml(
    "test",
    7,
    '<frame><topform><stackfield><entryfield name="a"/><!----><buttonfield name="b" ytop="198"><script><![CDATA[b < a;]]></script></buttonfield></stackfield></topform></frame>',
  );
  const parent = doc.nodes.find((n) => n.kind === "stackfield"),
    [a, b] = parent.children;
  const intent = reorderStack(doc, parent.id, [
    { id: b.id, width: 1521, height: 344 },
    { id: a.id, width: 2375, height: 198 },
  ]);
  const next = applyIntent(doc, intent),
    children = next.nodes.find((n) => n.kind === "stackfield").children;
  assert.equal(children[0].attributes.name.value, "b");
  assert.equal(children[1].attributes.ytop.value, "344");
  assert.ok(next.text.includes("<script><![CDATA[b < a;]]></script>"));
  assert.ok(next.text.includes("<!---->"));
  assert.throws(() => applyIntent({ ...doc, version: 8 }, intent), /Stale/);
  assert.throws(
    () => reorderStack(doc, parent.id, [{ id: b.id, width: 10, height: 10 }]),
    /unsupported/,
  );
});
