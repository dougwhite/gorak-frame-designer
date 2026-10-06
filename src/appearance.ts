// Standard palette RGBs calibrated against OpenROAD's supplied wdepth8 table.
// System colours remain approximations of the host
// Windows theme; OpenROAD default-palette entries require supplied palette data.
const colors: Record<string, string> = {
  "1": "#000000",
  "2": "#ffffff",
  "4": "#000000",
  "5": "#ffffff",
  "6": "#800000",
  "7": "#008000",
  "8": "#000080",
  "9": "#808000",
  "10": "#008080",
  "11": "#800080",
  "12": "#400000",
  "13": "#c04000",
  "14": "#4000c0",
  "15": "#808080",
  "16": "#ff0000",
  "17": "#00ff00",
  "18": "#0000ff",
  "19": "#ffff00",
  "20": "#00ffff",
  "21": "#ff00ff",
  "22": "#804000",
  "23": "#ff8000",
  "24": "#8000ff",
  "25": "#a0a0a4",
  "26": "#ff8080",
  "27": "#c0dcc0",
  "28": "#a6caf0",
  "29": "#ffff80",
  "30": "#80ffff",
  "31": "#ff80ff",
  "32": "#dfa060",
  "33": "#ff8020",
  "34": "#c082ff",
  "35": "#c0c0c0",
  "70": "#f0f0f0",
  "71": "#808080",
  "72": "#000000",
  "73": "#ffffff",
  "74": "#6d6d6d",
  "75": "#0078d7",
  "76": "#ffffff",
  "84": "#ffffff",
  "86": "#000000",
  "83": "#ffffff",
  "87": "#696969",
  "88": "#e3e3e3",
  "89": "#000000",
  "90": "#ffffe1",
  "91": "transparent",
};
/** OpenROAD RGB values carry a tag above the Windows COLORREF (BGR) bytes. */
export function fieldColor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (colors[value]) return colors[value];
  const color = Number(value);
  if (!Number.isInteger(color) || color < 0x1000000 || color > 0x1ffffff)
    return undefined;
  return (
    "#" +
    [color & 255, (color >>> 8) & 255, (color >>> 16) & 255]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")
  );
}
export function applyAppearance(
  element: HTMLElement,
  properties: Readonly<Record<string, string>>,
): void {
  const background = fieldColor(properties.bgcolor),
    foreground = fieldColor(properties.fgcolor),
    outline = fieldColor(properties.outlinecolor);
  if (background) element.style.backgroundColor = background;
  if (foreground) element.style.color = foreground;
  if (outline) element.style.borderColor = outline;
  if (["2", "11"].includes(properties.bgpattern ?? ""))
    element.style.backgroundColor = "transparent";
  if (properties.outlinewidth === "0") element.style.borderWidth = "0";
  if (properties.typesize && Number(properties.typesize) > 0)
    element.style.fontSize = `${(Number(properties.typesize) * 96) / 72}px`;
  const fonts: Record<string, string> = {
    "0": "Tahoma, Arial, sans-serif",
    "1": "Arial, Helvetica, sans-serif",
    "2": '"Courier New", monospace',
    "3": '"Times New Roman", serif',
    "4": '"Century Schoolbook", serif',
    "5": '"Lucida Sans", sans-serif',
  };
  if (fonts[properties.typeface])
    element.style.fontFamily = fonts[properties.typeface];
  if (properties.typeface === "-9" && properties.typefacename)
    element.style.fontFamily = JSON.stringify(properties.typefacename);
  if (properties.isbold === "1") element.style.fontWeight = "bold";
  if (properties.isitalic === "1") element.style.fontStyle = "italic";
  if (properties.ismultiline === "1") element.style.whiteSpace = "pre-wrap";
}
