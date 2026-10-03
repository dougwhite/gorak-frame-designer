import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sourcePosition,
  WML_TO_CSS,
  segmentGeometry,
} from "../src/geometry.ts";
test("horizontal segments move without dividing by their zero height", () => {
  assert.deepEqual(
    segmentGeometry(
      {
        xleft: "0",
        ytop: "100",
        width: "200",
        height: "0",
        point1x: "0",
        point1y: "100",
        point2x: "200",
        point2y: "100",
      },
      { xleft: 50, ytop: 200 },
    ),
    {
      xleft: 50,
      ytop: 200,
      point1x: 50,
      point1y: 200,
      point2x: 250,
      point2y: 200,
    },
  );
});
test("new field positions match the observed native integer-pixel grid and remain stable", () => {
  for (const [input, expected] of [
    [2050, 2052],
    [3850, 3854],
    [5650, 5646],
    [1350, 1354],
    [2450, 2448],
    [3550, 3552],
    [4650, 4646],
  ]) {
    const result = sourcePosition(input * WML_TO_CSS);
    assert.equal(result, expected);
    assert.equal(sourcePosition(result * WML_TO_CSS), result);
  }
});
