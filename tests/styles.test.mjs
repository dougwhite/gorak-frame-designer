import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStyles, styleEntries, mergeStyles } from "../src/styles.ts";
test("stock palette retains native groups and duplicate style slots", () => {
  const entries = styleEntries([]);
  assert.equal(entries.length, 34);
  assert.equal(resolveStyles([]).group_order.length, 30);
  assert.deepEqual(
    entries.filter((e) => e.kind === "entryfield").map((e) => e.group),
    ["entryfield", "entryfield:2"],
  );
  assert.deepEqual(
    entries.filter((e) => e.kind === "stackfield").map((e) => e.slot),
    ["style1", "style2"],
  );
});
test("named per-layer overrides preserve entry count and nested resource properties", () => {
  const layers = [
    {
      origin: "Project",
      defaults: {
        groups: { stackfield: { styles: { style2: { outlinecolor: "29" } } } },
      },
    },
    {
      origin: "Frame",
      defaults: {
        groups: {
          stackfield: {
            styles: { style2: { outlinecolor: "5", separatorwidth: "0" } },
          },
        },
      },
    },
  ];
  const entries = styleEntries(layers);
  assert.equal(entries.length, 34);
  assert.equal(entries.filter((e) => e.kind === "stackfield").length, 2);
  assert.equal(
    entries.find((e) => e.group === "stackfield" && e.slot === "style2").sample
      .outlinecolor,
    "5",
  );
  assert.ok(
    styleEntries([]).find((e) => e.kind === "palettefield").sample.valuelist,
  );
});
test("standalone roots ignore stock entries and reject missing slots instead of renumbering", () => {
  const root = {
    standalone: true,
    properties: {},
    group_order: ["neutral"],
    groups: {
      neutral: {
        properties: { clienttext: "neutral" },
        styles: { style1: { _type: "buttonfield", width: "10", height: "20" } },
      },
    },
  };
  assert.equal(styleEntries([{ origin: "Project", defaults: root }]).length, 1);
  const removed = { groups: { neutral: { styles: { style1: null } } } };
  assert.equal(
    styleEntries([
      { origin: "Project", defaults: root },
      { origin: "Frame", defaults: removed },
    ]).length,
    0,
  );
  assert.throws(
    () =>
      resolveStyles([
        {
          origin: "Project",
          defaults: {
            ...root,
            groups: {
              neutral: {
                properties: {},
                styles: { style2: { _type: "buttonfield" } },
              },
            },
          },
        },
      ]),
    /contiguous/,
  );
  assert.throws(
    () => resolveStyles([{ origin: "Old", defaults: { field_styles: [] } }]),
    /re-export/,
  );
});
test("null removals and native order hints preserve false, empty and insertion semantics", () => {
  const result = mergeStyles(
    { a: "1", b: "2", c: { value: "yes" } },
    { b: null, c: { value: "", flag: "0" }, d: "3", $before: { d: "c" } },
  );
  assert.deepEqual(Object.keys(result), ["a", "d", "c"]);
  assert.deepEqual(result.c, { value: "", flag: "0" });
  assert.throws(
    () => mergeStyles({ a: "1", b: "2" }, { $before: { a: "b", b: "a" } }),
    /Cyclic/,
  );
  assert.throws(() => mergeStyles({ a: "1" }, { $order: [] }), /order/);
});
