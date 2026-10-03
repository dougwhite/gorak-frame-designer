import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWml } from "../src/wml.ts";
import { frameFromWml } from "../src/frame-model.ts";
import { pageVisible, fieldClip } from "../src/field-visibility.ts";

test("tab-page wrappers retain parents, offsets and nested visibility without editing source", () => {
  const source =
    '<frame><topform width="4000" height="3000"><tabfolder xleft="100" ytop="200" width="2000" height="1500"><tabbar width="300" height="200"><tabfieldarray><row width="500" height="500" textlabel="First"/><row xleft="342" width="500" height="500" textlabel="Second"/></tabfieldarray></tabbar><tabpagearray><row ytop="220" width="2000" height="1280"><entryfield name="a" xleft="20" ytop="30" width="100" height="100"/></row><row ytop="220" width="2000" height="1280"><entryfield name="b" xleft="20" ytop="30" width="100" height="100"/></row></tabpagearray></tabfolder></topform></frame>';
  const doc = parseWml("neutral", 1, source),
    model = frameFromWml(doc, []);
  const folder = model.fields.find((f) => f.kind === "tabfolder"),
    a = model.fields.find((f) => f.name === "a"),
    b = model.fields.find((f) => f.name === "b");
  assert.equal(model.fields.find((f) => f.id === a.parentId).kind, "tabpage");
  assert.equal(a.x, 120 * 0.096);
  assert.equal(a.y, 450 * 0.096);
  assert.equal(pageVisible(a, new Map()), true);
  assert.equal(pageVisible(b, new Map()), false);
  assert.equal(pageVisible(b, new Map([[folder.id, 1]])), true);
  assert.equal(doc.text, source);
  const tabs = model.fields.filter((f) => f.kind === "tabfield");
  assert.equal(tabs[0].height, 200 * 0.096);
  assert.equal(tabs[0].width, 300 * 0.096 + 4);
  assert.deepEqual(tabs[1].tabTarget, { folderId: folder.id, index: 1 });
});

test("existing composite properties never inherit stylesheet samples", () => {
  const source =
    '<frame><topform width="3000" height="2000"><tabfolder width="1000" height="800"><tabbar width="250" height="150" bgcolor="5"/><tabpagearray><row ytop="170" width="900" height="600"/></tabpagearray></tabfolder></topform></frame>';
  const doc = parseWml("neutral", 1, source);
  const layers = [
    {
      origin: "Frame",
      defaults: {
        groups: {
          tabfolder: {
            styles: { style1: { tabbar: { height: "900", bgcolor: "4" } } },
          },
        },
      },
    },
  ];
  const bar = frameFromWml(doc, layers).fields.find((f) => f.kind === "tabbar");
  assert.equal(bar.height, 150 * 0.096);
  assert.equal(bar.properties.bgcolor, "5");
  assert.equal(doc.text, source);
});

test("explicit prototype types are retained even when scalar properties are indistinguishable", () => {
  const doc = parseWml(
    "neutral",
    1,
    '<frame><topform width="1000" height="1000"><tablefield width="800" height="800"><tablebody width="800" height="700"><columnfield width="300" height="700"><protofield type="buttonfield" width="300" height="100"/></columnfield></tablebody></tablefield></topform></frame>',
  );
  assert.equal(
    frameFromWml(doc, []).fields.find((f) => f.kind === "columnfield").prototype
      .kind,
    "buttonfield",
  );
});

test("clipping intersects enclosing pages while leaving ordinary layout containers open", () => {
  const page = {
    id: "page",
    kind: "tabpage",
    x: 10,
    y: 20,
    width: 100,
    height: 80,
  };
  const child = {
    id: "child",
    kind: "entryfield",
    parentId: "page",
    x: 0,
    y: 30,
    width: 150,
    height: 100,
  };
  assert.equal(
    fieldClip(child, new Map([["page", page]])),
    "inset(0px 40px 30px 10px)",
  );
  assert.equal(
    fieldClip(
      { ...child, x: 20, width: 30, height: 20 },
      new Map([["page", page]]),
    ),
    undefined,
  );
});
