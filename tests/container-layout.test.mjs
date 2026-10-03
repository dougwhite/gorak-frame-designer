import { test } from "node:test";
import assert from "node:assert/strict";
import { matrixLayout, outerPadding } from "../src/container-layout.ts";
test("native unequal EntryField/ButtonField matrix bounds and centering match Workbench", () => {
  const cells = [
    { id: "entry", row: 1, column: 1, width: 2375, height: 198 },
    { id: "button", row: 2, column: 1, width: 1521, height: 344 },
  ];
  const layout = matrixLayout(cells, 1, 2);
  assert.equal(layout.width, 2375);
  assert.equal(layout.height, 542);
  assert.deepEqual(layout.positions.get("entry"), { x: 0, y: 0 });
  assert.deepEqual(layout.positions.get("button"), { x: 427, y: 198 });
  const stack = matrixLayout(cells, 1, 2, 9);
  assert.deepEqual(stack.positions.get("button"), { x: 0, y: 198 });
  assert.equal(outerPadding("imagefield"), 63);
  assert.equal(outerPadding("imagetrim"), 0);
});
test("matrix rejects malformed cells before allocating invalid layout positions", () => {
  for (const row of [NaN, 1.5, 0, 3])
    assert.throws(
      () =>
        matrixLayout(
          [{ id: "a", row, column: 1, width: 10, height: 10 }],
          1,
          2,
        ),
      /outside/,
    );
  for (const width of [NaN, Infinity, -1])
    assert.throws(
      () =>
        matrixLayout([{ id: "a", row: 1, column: 1, width, height: 10 }], 1, 1),
      /size/,
    );
});
test("each flow cell includes margins and child gravity overrides the parent", () => {
  const cells = [
    { id: "a", row: 1, column: 1, width: 100, height: 40, gravity: 9 },
    { id: "b", row: 2, column: 1, width: 60, height: 20, gravity: 20 },
  ];
  const layout = matrixLayout(
    cells,
    1,
    2,
    18,
    { left: 5, right: 7, top: 3, bottom: 4 },
    { width: 150, height: 100 },
  );
  assert.deepEqual(layout.positions.get("a"), { x: 5, y: 3 });
  assert.deepEqual(layout.positions.get("b"), { x: 83, y: 50 });
  assert.equal(layout.height, 74);
  assert.equal(layout.width, 150);
});
