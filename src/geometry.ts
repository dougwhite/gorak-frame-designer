/** Calibrated OpenROAD placement grid: integer CSS reference pixels at 96 dpi. */
export const WML_TO_CSS = 96 / 1000;
export const sourcePosition = (cssPixels: number): number =>
  Math.round(Math.round(cssPixels) / WML_TO_CSS);
/** Segment endpoints are parent coordinates, so they move/scale with their bounds. */
export function segmentGeometry(
  properties: Readonly<Record<string, string>>,
  values: Record<string, number>,
): Record<string, number> {
  const result = { ...values };
  for (const [axis, position, size] of [
    ["x", "xleft", "width"],
    ["y", "ytop", "height"],
  ] as const) {
    const before = Number(properties[position]),
      after = values[position] ?? before,
      scale =
        values[size] === undefined || Number(properties[size]) === 0
          ? 1
          : values[size] / Number(properties[size]);
    for (const point of [1, 2]) {
      const key = `point${point}${axis}`;
      if (properties[key] !== undefined)
        result[key] = Math.round(
          after + (Number(properties[key]) - before) * scale,
        );
    }
  }
  return result;
}
