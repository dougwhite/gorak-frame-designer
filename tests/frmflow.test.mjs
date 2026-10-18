import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseWml,
  propertyEdit,
  applyIntent,
  createField,
  deleteFields,
} from "../src/wml.ts";
import { frameFromWml, WML_TO_CSS } from "../src/frame-model.ts";

const graph = readFileSync(
  new URL("fixtures/frmflow.xml", import.meta.url),
  "utf8",
).trimEnd();
const form = `<topform width="4000" height="2000"><entryfield name="caption" xleft="100" ytop="200" width="1200" height="300"/><buttonfield name="search" width="800" height="300" textlabel="Search"/></topform>`;
const parse = (flow) =>
  parseWml("order_search.wml", 7, `<frame>\n${form}\n${flow}\n</frame>`);
const flowText = (doc) => {
  const flow = doc.root.children.find((n) => n.kind === "frmflow");
  return flow ? doc.text.slice(flow.start, flow.end) : undefined;
};
const fields = (doc) => frameFromWml(doc, []).fields;

test("populated frmflow query and nested frame remain metadata, with source-addressable references", () => {
  const doc = parse(graph);
  assert.deepEqual(
    fields(doc).map((f) => [f.kind, f.name]),
    [
      ["entryfield", "caption"],
      ["buttonfield", "search"],
    ],
  );
  assert.equal(doc.root.children.filter((n) => n.kind === "frame").length, 0);
  assert.equal(doc.nodes.filter((n) => n.kind === "frame").length, 2);
  assert.equal(
    doc.nodes.find((n) => n.kind === "expression").value,
    "trim(inventory.caption) + ' Größe & Maß '\n+ string(orders.quantity) + ' <ready>'",
  );
  assert.deepEqual(
    doc.nodes
      .filter((n) => n.attributes.oidref)
      .map((n) => n.attributes.oidref.value),
    ["22", "21", "32", "31", "22", "21"],
  );
  assert.equal(flowText(doc), graph);
});

test("property, geometry, creation, deletion and direct source edits preserve unrelated frmflow bytes", () => {
  let doc = parse(graph);
  const button = fields(doc).find((f) => f.name === "search");
  doc = applyIntent(
    doc,
    propertyEdit(doc, button.id, "textlabel", "Find Größe"),
  );
  assert.equal(fields(doc).find((f) => f.id === button.id).label, "Find Größe");
  const entry = fields(doc).find((f) => f.name === "caption");
  doc = applyIntent(doc, propertyEdit(doc, entry.id, "xleft", "350"));
  assert.equal(fields(doc).find((f) => f.id === entry.id).x, 350 * WML_TO_CSS);
  assert.equal(flowText(doc), graph);
  const beforeCreation = doc.text;
  doc = applyIntent(
    doc,
    createField(doc, "freetrim", undefined, {
      xleft: 0,
      ytop: 0,
      width: 500,
      height: 100,
    }),
  );
  assert.equal(fields(doc).length, 3);
  assert.equal(flowText(doc), graph);
  const created = fields(doc).find((f) => f.name === "field1");
  doc = applyIntent(doc, deleteFields(doc, [created.id]));
  assert.equal(fields(doc).length, 2);
  assert.equal(flowText(doc), graph);
  // A direct source edit changes only the selected graph expression.
  const start = doc.text.indexOf("orders.quantity * 2");
  doc = applyIntent(doc, {
    uri: doc.uri,
    version: doc.version,
    edits: [
      {
        start,
        end: start + 19,
        expected: "orders.quantity * 2",
        text: "orders.quantity * 3",
      },
    ],
  });
  assert.equal(
    flowText(doc),
    graph.replace("orders.quantity * 2", "orders.quantity * 3"),
  );
  assert.ok(beforeCreation.includes(graph));
});

for (const flow of [
  "",
  "<frmflow/>",
  "<frmflow><row_class>menufield</row_class></frmflow>",
  "<frmflow>legacy &amp; scalar</frmflow>",
])
  test(`absent, empty, typed-empty and scalar frmflow survive edits: ${flow || "absent"}`, () => {
    const doc = parse(flow);
    assert.equal(fields(doc).length, 2);
    const field = fields(doc)[0];
    const next = applyIntent(doc, propertyEdit(doc, field.id, "width", "1500"));
    assert.equal(next.text, doc.text.replace('width="1200"', 'width="1500"'));
    assert.equal(flowText(next), flow || undefined);
    assert.equal(fields(next)[0].width, 1500 * WML_TO_CSS);
  });
