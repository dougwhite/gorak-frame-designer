import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldColor, applyAppearance } from "../src/appearance.ts";
test("tagged RGB keeps channel order and refuses untagged or invalid values", () => {
  assert.equal(fieldColor(String(0x1000000 + 0x332211)), "#112233");
  assert.equal(fieldColor(String(0x1000000 + 0xabcdef)), "#efcdab");
  for (const value of ["NaN", "-1", "1.2", "999999999"])
    assert.equal(fieldColor(value), undefined);
  assert.equal(fieldColor("91"), "transparent");
});
test("clear patterns and zero outlines remain clear after colour application", () => {
  const element = { style: {} };
  applyAppearance(element, {
    bgcolor: "6",
    bgpattern: "2",
    outlinewidth: "0",
    typesize: "9",
  });
  assert.equal(element.style.backgroundColor, "transparent");
  assert.equal(element.style.borderWidth, "0");
  assert.equal(element.style.fontSize, "12px");
});
