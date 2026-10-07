import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWml, propertyEdit, applyIntent } from "../src/wml.ts";
import { frameFromWml, WML_TO_CSS } from "../src/frame-model.ts";
import { parseMetadata, metadataEdit, applyMetadata } from "../src/metadata.ts";

// Independently authored consumer cases: no native application source.
const model = (text, layers = []) => {
  const doc = parseWml(
    "synthetic.wml",
    7,
    `<frame><topform>${text}</topform></frame>`,
  );
  return frameFromWml(doc, layers);
};

test("literal text tokens preserve whitespace and CDATA entity spellings", () => {
  const frame = model(
    `<freetrim><textlabel> &#32;<![CDATA[&amp;<?ingres_invalidxmlchar 7?>]]><!--ignored--><?opaque keep?>&#9;<?ingres_invalidxmlchar 7?>\n </textlabel></freetrim>`,
  );
  assert.equal(
    frame.fields[0].label,
    "  &amp;<?ingres_invalidxmlchar 7?>\t\x07\n ",
  );
  const doc = frame.source;
  const next = applyIntent(
    doc,
    propertyEdit(doc, frame.fields[0].id, "textlabel", " \t&<>\x07\n "),
  );
  assert.equal(frameFromWml(next, []).fields[0].label, " \t&<>\x07\n ");
});

test("absent, attribute-empty and element-empty defaults remain distinct and editable", () => {
  const frame = model(
    `<entryfield name="absent"/><entryfield name="attribute" defaultstring=""/><entryfield name="paired"><defaultstring></defaultstring></entryfield><entryfield name="closed"><defaultstring /></entryfield>`,
  );
  assert.equal(frame.fields[0].properties.defaultstring, undefined);
  for (const field of frame.fields.slice(1)) {
    assert.equal(field.properties.defaultstring, "");
    assert.equal(field.propertyOrigins.defaultstring, "WML");
    const next = applyIntent(
      frame.source,
      propertyEdit(frame.source, field.id, "defaultstring", " literal "),
    );
    assert.equal(
      frameFromWml(next, []).fields.find((f) => f.id === field.id).properties
        .defaultstring,
      " literal ",
    );
    const removed = applyIntent(
      frame.source,
      propertyEdit(frame.source, field.id, "defaultstring", null),
    );
    assert.equal(
      frameFromWml(removed, []).fields.find((f) => f.id === field.id).properties
        .defaultstring,
      undefined,
    );
  }
});

test("choice and column rows retain ordered empties, literal text and resource references", () => {
  const frame = model(
    `<listviewfield name="choices"><valuelist><choiceitems><row/><row enumtext="fallback"><enumdisplay><![CDATA[ &amp; ]]></enumdisplay><enumvalue>\t </enumvalue><enumbitmap src="images/neutral.png" native-t8="7"/></row><row enumdisplay="" enumtext="unused" enumvalue="last"/></choiceitems></valuelist><colattributes><row/><row columnwidth="240"><headertext>  heading\t</headertext></row><row headertext=""/></colattributes></listviewfield>`,
  );
  const field = frame.fields[0];
  assert.deepEqual(
    field.choices.map(({ label, value }) => ({ label, value })),
    [
      { label: "", value: "" },
      { label: " &amp; ", value: "\t " },
      { label: "", value: "last" },
    ],
  );
  assert.deepEqual(field.columns, [
    { label: "", width: 0 },
    { label: "  heading\t", width: 240 },
    { label: "", width: 0 },
  ]);
  const pixels = {
    width: 1,
    height: 1,
    rgba: new Uint8ClampedArray([1, 2, 3, 255]),
  };
  const rendered = frameFromWml(frame.source, [], undefined, {
    [JSON.stringify(["images/neutral.png", undefined, undefined])]: pixels,
  });
  assert.equal(rendered.fields[0].choices[1].bitmap, pixels);
  const next = applyIntent(
    frame.source,
    propertyEdit(frame.source, field.id, "name", "renamed"),
  );
  assert.equal(
    next.text,
    frame.source.text.replace('name="choices"', 'name="renamed"'),
  );
});

test("table prototypes expose scalar element state and ordered choices", () => {
  const frame = model(
    `<tablefield><tablebody><columnfield><protofield type="optionfield"><defaultstring><![CDATA[ &amp; ]]></defaultstring><valuelist><choiceitems><row/><row><enumdisplay>  pick  </enumdisplay><enumvalue> </enumvalue></row></choiceitems></valuelist></protofield></columnfield></tablebody></tablefield>`,
  );
  const prototype = frame.fields.find(
    (f) => f.kind === "columnfield",
  ).prototype;
  assert.equal(prototype.properties.defaultstring, " &amp; ");
  assert.deepEqual(
    prototype.choices.map((c) => c.label),
    ["", "  pick  "],
  );
});

test("zero-size shapes and unknown metadata survive targeted versioned geometry edits", () => {
  const frame = model(
    `<segmentshape name="line" xleft="40" ytop="20" width="0" height="0" point1x="40" point2x="40" point1y="20" point2y="20"><opaque><row/><row><payload><![CDATA[ &amp; ]]></payload></row></opaque></segmentshape><rectangleshape width="0" height="0"/>`,
    [
      {
        origin: "Project",
        defaults: {
          groups: { segmentshape: { styles: { style1: { width: "999" } } } },
        },
      },
      { origin: "Frame", defaults: { absent: true } },
    ],
  );
  for (const field of frame.fields)
    assert.deepEqual([field.width, field.height], [0, 0]);
  const shape = frame.fields[0],
    doc = frame.source;
  assert.equal(shape.x, 40 * WML_TO_CSS);
  const next = applyIntent(doc, propertyEdit(doc, shape.id, "xleft", "60"));
  assert.equal(next.text, doc.text.replace('xleft="40"', 'xleft="60"'));
  assert.equal(frameFromWml(next, []).fields[0].id, shape.id);
  assert.throws(
    () => applyIntent(next, propertyEdit(doc, shape.id, "xleft", "70")),
    /Stale/,
  );
});

test("companion edits leave native declarations, remarks and duplicate member tags opaque", () => {
  const text = `[framesource]\nwindowwidth = "1000"\nwindowheight = "600"\nunknown = { nested = ["", " literal "] }\n\n[framesource.attributes]\nplain = "PRIVATE varchar(20) DEFAULT '  '"\nstructured = { declaration = "PRIVATE integer DEFAULT 7", shortremark = " note ", taggedvalues = [{ name = "tag", value = "" }, { name = "tag", value = "two" }] }\n\n[framesource.methods]\nmethod = { declaration = "procedure()", remark = "opaque" }\n===\ninitialize = { /* keep */ }\n`;
  const metadata = parseMetadata("synthetic.w4gl", 2, text);
  const frame = frameFromWml(model("<entryfield/>").source, [], metadata);
  assert.equal(frame.width, 1000 * WML_TO_CSS);
  const next = applyMetadata(
    metadata,
    metadataEdit(metadata, { windowwidth: "1200" }),
  );
  assert.equal(
    next.text,
    text.replace('windowwidth = "1000"', 'windowwidth = "1200"'),
  );
  assert.equal(frameFromWml(frame.source, [], next).width, 1200 * WML_TO_CSS);
  assert.throws(
    () => applyMetadata(next, metadataEdit(metadata, { windowwidth: "1400" })),
    /Stale/,
  );
});
