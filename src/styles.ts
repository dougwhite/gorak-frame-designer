// Stock palette from https://github.com/dougwhite/gorak (MIT), templates/native_styles.json.
// Historical bitmap directory names are stripped; inline pixels are retained.
import stock from "./stock-styles.json" with { type: "json" };
export type StyleObject = Record<string, unknown>;
export interface StylesLayer {
  origin: string;
  defaults: StyleObject;
}
const object = (v: unknown): v is StyleObject =>
  !!v && typeof v === "object" && !Array.isArray(v);
const own = (o: StyleObject, k: string, v: unknown) =>
  Object.defineProperty(o, k, {
    value: v,
    writable: true,
    enumerable: true,
    configurable: true,
  });
/** Named stylesheet resolution; these values never cascade into existing fields. */
export function mergeStyles(
  parent: StyleObject,
  delta: StyleObject,
  depth = 0,
): StyleObject {
  if (depth > 128) throw Error("Stylesheet nesting limit exceeded");
  let result: StyleObject = structuredClone(parent);
  for (const [key, value] of Object.entries(delta)) {
    if (["$order", "$before"].includes(key)) continue;
    if (value === null) {
      if (!Object.hasOwn(result, key))
        throw Error("Cannot remove absent stylesheet property");
      delete result[key];
    } else
      own(
        result,
        key,
        object(value)
          ? mergeStyles(
              object(result[key]) ? result[key] : {},
              value,
              depth + 1,
            )
          : structuredClone(value),
      );
  }
  if (delta.$before !== undefined) {
    if (!object(delta.$before))
      throw Error("Invalid stylesheet insertion hints");
    const pending = new Map(Object.entries(delta.$before));
    const order = Object.keys(result);
    for (const [key, target] of pending)
      if (
        typeof target !== "string" ||
        key === target ||
        !Object.hasOwn(result, key) ||
        !Object.hasOwn(result, target)
      )
        throw Error("Invalid stylesheet insertion hint");
    while (pending.size) {
      const ready = [...pending].filter(
        ([, target]) => !pending.has(target as string),
      );
      if (!ready.length) throw Error("Cyclic stylesheet insertion hints");
      for (const [key, target] of ready) {
        pending.delete(key);
        order.splice(order.indexOf(key), 1);
        order.splice(order.indexOf(target as string), 0, key);
      }
    }
    result = Object.fromEntries(order.map((k) => [k, result[k]]));
  }
  if (delta.$order !== undefined) {
    const order = delta.$order;
    if (
      !Array.isArray(order) ||
      order.some((k) => typeof k !== "string") ||
      new Set(order).size !== order.length ||
      order.length !== Object.keys(result).length ||
      order.some((k) => !Object.hasOwn(result, k))
    )
      throw Error("Invalid stylesheet property order");
    result = Object.fromEntries(order.map((k) => [k, result[k]]));
  }
  return result;
}
export function numberedSlots(v: unknown, prefix: string): string[] {
  if (!object(v)) throw Error("Expected numbered stylesheet slots");
  const names = Array.from(
    { length: Object.keys(v).length },
    (_, i) => `${prefix}${i + 1}`,
  );
  if (names.some((n) => !Object.hasOwn(v, n)))
    throw Error("Stylesheet slots must be contiguous");
  return names;
}
export function resolveStyles(layers: readonly StylesLayer[]): StyleObject {
  let result: StyleObject = structuredClone(stock);
  delete result.standalone;
  for (const [index, { origin, defaults }] of layers.entries()) {
    if (object(defaults) && Object.hasOwn(defaults, "absent")) {
      if (
        origin !== "Frame" ||
        index !== layers.length - 1 ||
        defaults.absent !== true ||
        Object.keys(defaults).length !== 1
      )
        throw Error(
          "Only a final Frame stylesheet can contain only absent: true",
        );
      // A native absent frame stylesheet opts out of parent palette inheritance.
      return { absent: true };
    }
    if (
      !object(defaults) ||
      Object.keys(defaults).some(
        (k) =>
          ![
            "standalone",
            "properties",
            "group_order",
            "groups",
            "$before",
            "$order",
          ].includes(k),
      )
    )
      throw Error(
        "Unsupported stylesheet format; re-export with current gorak",
      );
    const { standalone, ...values } = defaults;
    if (standalone !== undefined && standalone !== true)
      throw Error("standalone must be true");
    result =
      standalone === true
        ? structuredClone(values)
        : mergeStyles(result, values);
  }
  const order = result.group_order,
    groups = result.groups;
  if (
    !Array.isArray(order) ||
    !object(groups) ||
    order.some((k) => typeof k !== "string") ||
    new Set(order).size !== order.length ||
    order.length !== Object.keys(groups).length ||
    order.some((k) => !Object.hasOwn(groups, k))
  )
    throw Error("Invalid native stylesheet group order");
  for (const k of order) {
    const group = groups[k];
    if (!object(group) || !object(group.properties) || !object(group.styles))
      throw Error("Invalid native stylesheet group");
    for (const slot of numberedSlots(group.styles, "style")) {
      const sample = group.styles[slot];
      if (!object(sample) || typeof sample._type !== "string")
        throw Error("Native stylesheet sample requires a type");
    }
  }
  return result;
}
export interface StyleEntry {
  group: string;
  slot: string;
  ordinal: number;
  kind: string;
  sample: StyleObject;
}
export function styleEntries(layers: readonly StylesLayer[]): StyleEntry[] {
  const sheet = resolveStyles(layers);
  if (sheet.absent === true) return [];
  const groups = sheet.groups as Record<string, { styles: StyleObject }>;
  return (sheet.group_order as string[]).flatMap((group) =>
    numberedSlots(groups[group].styles, "style").map((slot, i) => {
      const sample = groups[group].styles[slot] as StyleObject;
      return {
        group,
        slot,
        ordinal: i + 1,
        kind: String(sample._type),
        sample,
      };
    }),
  );
}
/** Adapt native sample objects to creation data, preserving typed rows/attributes. */
export function sampleProperties(value: unknown, depth = 0): unknown {
  if (depth > 128) throw Error("Stylesheet sample nesting limit exceeded");
  if (!object(value)) return value;
  const result: StyleObject = {};
  if (typeof value._type === "string") result.type = value._type;
  if (object(value._attributes))
    for (const [k, v] of Object.entries(value._attributes)) own(result, k, v);
  if (value._text !== undefined) return value._text;
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith("_") || k.startsWith("$")) continue;
    own(
      result,
      k,
      k === "row"
        ? numberedSlots(v, "row").map((slot) =>
            sampleProperties((v as StyleObject)[slot], depth + 1),
          )
        : sampleProperties(v, depth + 1),
    );
  }
  return result;
}
