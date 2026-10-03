import type { FrameField } from "./designer";
import { applyAppearance } from "./appearance";
const containers = new Set([
  "flexibleform",
  "subform",
  "stackfield",
  "matrixfield",
  "viewportfield",
  "tablefield",
  "columnfield",
  "tabfolder",
  "tabpage",
  "tabbar",
  "tablebody",
  "tableheader",
]);
/** Render source data using DOM text only. Runtime scripts and HTML are never evaluated. */
export function renderField(element: HTMLElement, field: FrameField): void {
  const props = field.properties;
  const bitmap = (image = field.bitmap, target: HTMLElement = element) => {
    if (!image) return false;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas
      .getContext("2d")
      ?.putImageData(
        new ImageData(
          new Uint8ClampedArray(image.rgba),
          canvas.width,
          canvas.height,
        ),
        0,
        0,
      );
    Object.assign(canvas.style, {
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "contain",
      flexShrink: "0",
    });
    canvas.setAttribute("aria-hidden", "true");
    target.append(canvas);
    return true;
  };
  const child = (text: string, style: Partial<CSSStyleDeclaration> = {}) => {
    const span = document.createElement("span");
    span.textContent = text;
    Object.assign(span.style, style);
    element.append(span);
    return span;
  };
  element.style.textAlign = "left";
  if (field.kind === "columnfield" && field.prototype) {
    element.style.border = "0";
    element.style.padding = "0";
    const height = Number(field.properties.visualrowheight) * 0.096;
    if (!Number.isFinite(height) || height <= 0) return;
    const count = Math.min(200, Math.ceil(field.height / height));
    for (let i = 0; i < count; i++) {
      const cell = document.createElement("span");
      Object.assign(cell.style, {
        position: "absolute",
        left: "0",
        top: `${i * height}px`,
        width: "100%",
        height: `${height}px`,
        overflow: "hidden",
        border: "1px solid currentColor",
        boxSizing: "border-box",
      });
      const props = field.prototype.properties;
      applyAppearance(cell, props);
      if (field.prototype.kind !== "unknown")
        renderField(cell, {
          ...field,
          kind: field.prototype.kind,
          properties: props,
          prototype: undefined,
          bitmap: undefined,
          label: props.textlabel ?? props.defaultstring ?? "",
          choices: field.prototype.choices,
          height,
        });
      element.append(cell);
    }
    return;
  }
  if (field.kind === "boxtrim") {
    if (props.outlinewidth === "0") element.style.border = "0";
    element.textContent = field.label;
    return;
  }
  if (field.kind === "tabfield") {
    element.style.border = "1px solid currentColor";
    element.style.textAlign = "center";
    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.style.alignItems = "center";
    element.style.justifyContent = "center";
    child(field.label);
    bitmap();
    const icon = element.querySelector("canvas");
    if (icon) {
      icon.style.width = "16px";
      icon.style.height = "16px";
    }
    return;
  }
  if (field.kind === "titletrim") {
    element.style.border = "0";
    element.style.background = "transparent";
    element.textContent = field.label;
    return;
  }
  if (field.kind === "palettefield") {
    element.style.display = "grid";
    element.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(100, Number(props.columns) || 1))},minmax(0,1fr))`;
    for (const choice of (field.choices ?? []).slice(0, 100)) {
      const cell = child(choice.bitmap ? "" : choice.label || choice.value, {
        border: "1px solid #777",
        textAlign: "center",
        display: "grid",
        placeItems: "center",
      });
      bitmap(choice.bitmap, cell);
    }
    element.setAttribute(
      "aria-description",
      "Palette values; bitmap previews require a decoded host image",
    );
    return;
  }
  if (field.kind === "controlbutton") {
    element.style.border = "1px solid #777";
    element.style.backgroundColor = "#ddd";
    element.style.textAlign = "center";
    child("▾", { fontSize: "10px", lineHeight: "12px" });
    return;
  }
  if (containers.has(field.kind)) {
    element.style.border =
      field.kind === "subform" && props.outlinewidth !== "0"
        ? "1px solid #777"
        : "0";
    if (props.bgpattern === "2") element.style.backgroundColor = "transparent";
    if (props.groupboxlabel)
      child(props.groupboxlabel, {
        position: "absolute",
        top: "0",
        left: "6px",
      });
    return;
  }
  if (field.kind === "segmentshape") {
    element.style.background = "transparent";
    element.style.border = "0";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(
      "viewBox",
      `0 0 ${Number(props.width)} ${Number(props.height)}`,
    );
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.width = "100%";
    svg.style.height = "100%";
    const line = document.createElementNS(svg.namespaceURI, "line");
    for (const point of [1, 2])
      for (const axis of ["x", "y"])
        line.setAttribute(
          `${axis}${point}`,
          String(
            Number(props[`point${point}${axis}`] ?? 0) -
              Number(props[axis === "x" ? "xleft" : "ytop"]),
          ),
        );
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(line);
    element.append(svg);
    return;
  }
  if (["rectangleshape", "ellipseshape"].includes(field.kind)) {
    element.style.border =
      props.linewidth === "0" ? "0" : "1px solid currentColor";
    if (props.bgpattern === "2") element.style.backgroundColor = "transparent";
    return;
  }
  if (["imagefield", "imagetrim"].includes(field.kind)) {
    if (bitmap()) {
      element.style.display = "grid";
      element.style.placeItems = "center";
      return;
    }
    if (field.kind === "imagefield") {
      element.style.border = "3px solid #111";
      element.style.boxSizing = "content-box";
      element.style.fontWeight = "bold";
    } else element.style.border = "0";
    element.style.textAlign = "center";
    child("Image", {
      display: "grid",
      placeItems: "center",
      width: "100%",
      height: "100%",
    });
    element.setAttribute(
      "aria-description",
      "Bitmap preview requires a decoded host image",
    );
    return;
  }
  if (["listfield", "radiofield", "optionfield"].includes(field.kind)) {
    const choices = field.choices ?? [],
      selected =
        props.defaultstring ||
        choices[Number(props.curenumindex ?? 1) - 1]?.value;
    if (field.kind === "optionfield") {
      const index = Number(props.curenumindex ?? 1) - 1;
      child(choices[index]?.label ?? "", { paddingLeft: "3px" });
      child("▾", { position: "absolute", right: "2px", top: "0" });
      return;
    }
    if (field.kind === "listfield") element.style.backgroundColor = "white";
    if (field.kind === "radiofield") {
      element.style.border =
        props.outlinewidth === "0" ? "0" : "1px solid currentColor";
      element.style.display = "flex";
      element.style.flexDirection =
        props.orientation === "2" ? "row" : "column";
      element.style.alignItems =
        props.orientation === "2" ? "center" : "flex-start";
      element.style.gap = "8px";
    }
    const rowHeight = Math.max(
        14,
        ((Number(props.typesize ?? 8) * 96) / 72) * 1.4,
      ),
      count = Math.min(50, Math.ceil(field.height / rowHeight));
    for (const choice of choices.slice(0, count)) {
      if (field.kind === "radiofield") {
        const row = child("", {
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          whiteSpace: "nowrap",
          height: `${rowHeight}px`,
        });
        const dot = document.createElement("span");
        Object.assign(dot.style, {
          display: "inline-block",
          width: "13px",
          height: "13px",
          borderRadius: "50%",
          border: `1px solid ${choice.value === selected ? "#0067c0" : "#777"}`,
          background:
            choice.value === selected
              ? "radial-gradient(circle,white 0 2px,#0067c0 3px)"
              : "#fafafa",
          flexShrink: "0",
        });
        row.append(dot, document.createTextNode(choice.label));
        continue;
      }
      const row = child(
        field.kind === "radiofield"
          ? `${choice.value === selected ? "◉" : "○"} ${choice.label}`
          : choice.label,
        { display: "block", height: `${rowHeight}px`, paddingLeft: "3px" },
      );
      if (field.kind === "listfield" && choice.value === selected) {
        row.style.background = "#0078d7";
        row.style.color = "white";
      }
    }
    return;
  }
  if (["scrollbarfield", "sliderfield", "barfield"].includes(field.kind)) {
    const vertical = props.orientation === "1",
      value = Number(props.defaultstring ?? 0),
      min = Number(props.minvalue ?? 0),
      max = Number(props.maxvalue ?? min);
    const fraction =
      max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
    if (field.kind === "barfield") {
      child("", {
        position: "absolute",
        left: "0",
        bottom: "0",
        width: `${vertical ? 100 : fraction * 100}%`,
        height: `${vertical ? fraction * 100 : 100}%`,
        background: "currentColor",
      });
      return;
    }
    element.style.background = "#ddd";
    element.style.border =
      field.kind === "sliderfield" ? "0" : "1px solid #888";
    if (field.kind === "scrollbarfield") {
      child(vertical ? "▲" : "◀", {
        position: "absolute",
        left: "0",
        top: "0",
      });
      child(vertical ? "▼" : "▶", {
        position: "absolute",
        right: "0",
        bottom: "0",
      });
    }
    const size = Number(props.elevatorsize ?? 20);
    child("", {
      position: "absolute",
      left: vertical
        ? "2px"
        : `${Math.max(12, fraction * (field.width - 24))}px`,
      top: vertical
        ? `${Math.max(12, fraction * (field.height - 24))}px`
        : "2px",
      width: vertical ? "calc(100% - 4px)" : `${size}%`,
      height: vertical ? `${size}%` : "calc(100% - 4px)",
      border: "1px solid #777",
      background: "#eee",
    });
    return;
  }
  if (field.kind === "treeviewfield" || field.kind === "listviewfield") {
    element.style.backgroundColor = "white";
    element.style.border = "1px solid #777";
    if (field.kind === "listviewfield" && props.hascolumnheaders !== "0") {
      const headers = document.createElement("span");
      Object.assign(headers.style, {
        display: "flex",
        height: "20px",
        background: "#eee",
        borderBottom: "1px solid #aaa",
      });
      for (const column of field.columns ?? []) {
        const cell = document.createElement("span");
        cell.textContent = column.label;
        Object.assign(cell.style, {
          flex: `0 0 ${(column.width * 96) / 1000}px`,
          padding: "3px",
          borderRight: "1px solid #aaa",
        });
        headers.append(cell);
      }
      element.append(headers);
    }
    for (const choice of (field.choices ?? []).slice(0, 50))
      child(choice.label, { display: "block" });
    return;
  }
  if (["buttonfield", "popupbutton"].includes(field.kind) && field.bitmap) {
    element.style.display = "flex";
    element.style.alignItems = "center";
    element.style.justifyContent = "center";
    if (props.buttonstyle === "2" && props.bgpattern === "-1") {
      element.style.background = "transparent";
      element.style.border = "0";
    }
    bitmap();
    if (props.buttonstyle !== "2" && props.hastextlabel !== "0")
      child(field.label);
    return;
  }
  element.textContent =
    field.kind === "togglefield"
      ? `${props.defaultstring === "1" ? "☒" : "☐"} ${field.label}`
      : field.label;
  if (["buttonfield", "popupbutton"].includes(field.kind))
    element.style.textAlign = "center";
}
