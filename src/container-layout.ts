import { WML_TO_CSS } from "./geometry.ts";
export interface Cell {
  id: string;
  row: number;
  column: number;
  width: number;
  height: number;
  gravity?: number;
}
export interface CellLayout {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}
/** Native default matrix layout, calibrated using unequal EntryField/ButtonField cells. */
export function matrixLayout(
  cells: readonly Cell[],
  columns: number,
  rows: number,
  gravity = 18,
  margins = { left: 0, right: 0, top: 0, bottom: 0 },
  bounds?: { width: number; height: number },
): CellLayout {
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 1 ||
    rows < 1 ||
    columns > 10000 ||
    rows > 10000
  )
    throw Error("Invalid matrix dimensions");
  if (
    !Object.values(margins).every((v) => Number.isFinite(v) && v >= 0) ||
    (bounds &&
      !Object.values(bounds).every((v) => Number.isFinite(v) && v >= 0))
  )
    throw Error("Invalid container margins or bounds");
  const widths = Array(columns).fill(0),
    heights = Array(rows).fill(0);
  for (const cell of cells) {
    if (
      !Number.isInteger(cell.row) ||
      !Number.isInteger(cell.column) ||
      cell.row < 1 ||
      cell.row > rows ||
      cell.column < 1 ||
      cell.column > columns
    )
      throw Error("Matrix cell outside rows/columns");
    if (![cell.width, cell.height].every((v) => Number.isFinite(v) && v >= 0))
      throw Error("Invalid matrix cell size");
    widths[cell.column - 1] = Math.max(
      widths[cell.column - 1],
      cell.width + margins.left + margins.right,
    );
    heights[cell.row - 1] = Math.max(
      heights[cell.row - 1],
      cell.height + margins.top + margins.bottom,
    );
  }
  if (bounds && columns === 1) widths[0] = Math.max(widths[0], bounds.width);
  if (bounds && rows === 1) heights[0] = Math.max(heights[0], bounds.height);
  const prefix = (values: number[]) => {
    let sum = 0;
    return values.map((value) => {
      const before = sum;
      sum += value;
      return before;
    });
  };
  const xs = prefix(widths),
    ys = prefix(heights),
    positions = new Map<string, { x: number; y: number }>();
  for (const cell of cells) {
    const w = widths[cell.column - 1],
      h = heights[cell.row - 1];
    const alignment =
      cell.gravity === undefined || cell.gravity === -1
        ? gravity
        : cell.gravity;
    const horizontal =
        (alignment & 7) === 1 ? 0 : (alignment & 7) === 4 ? 1 : 0.5,
      vertical = (alignment & 56) === 8 ? 0 : (alignment & 56) === 32 ? 1 : 0.5;
    positions.set(cell.id, {
      x:
        xs[cell.column - 1] +
        margins.left +
        Math.round(
          (w - cell.width - margins.left - margins.right) * horizontal,
        ),
      y:
        ys[cell.row - 1] +
        margins.top +
        Math.round((h - cell.height - margins.top - margins.bottom) * vertical),
    });
  }
  return {
    positions,
    width: widths.reduce((a, b) => a + b, 0),
    height: heights.reduce((a, b) => a + b, 0),
  };
}
export function outerPadding(kind: string): number {
  return ["entryfield", "buttonfield", "boxtrim"].includes(kind)
    ? Math.round(2 / WML_TO_CSS)
    : kind === "imagefield"
      ? Math.round(6 / WML_TO_CSS)
      : 0;
}
