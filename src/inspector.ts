import schemaData from "./property-types.json";
export const schema = schemaData as Record<string, Record<string, string>>;
// Native inspector names. The scalar CLI schema only supplements other classes.
const common =
  "AbsXLeft AbsXRight AbsYBottom AbsYTop AllBias AnchorPoint BgBitmap BgColor BgDisplayPolicy BgPattern ClientText ControlField Cursor DataType Declared DefaultString DefaultValue FgColor Field_Template FocusBehavior Gravity Height IsBold IsItalic IsNullable IsPlain IsPropOptInherited IsReverse LayerSequence MouseDownText MouseMoveText Name OuterHeight OuterWidth OutlineColor OutlineStyle OutlineWidth QueryBias ReadBias RequireRealField TabSeqNum TaggedValues TextAlignment TextDisplayBehavior ToolTipText TypeFace TypeFaceName TypeSize UpdateBias User1Bias User2Bias User3Bias Width XAnchorPoint XLeft XRight YAnchorPoint YBottom YTop";
const button =
  common +
  " BitmapLabel BmpDisplayBehavior ButtonStyle DefaultButton IsAutoSized TextLabel";
const entry =
  common.replace(" TextAlignment TextDisplayBehavior", "") +
  " BottomInnerMargin CharsPerLine ExactWidth ForceCase FormatString InputMasking IsMandatory IsMultiLine IsPassword LeftInnerMargin Lines MaxCharacters RightInnerMargin TopInnerMargin UseWidestCharacter WidestCharacterWidth";
// ImageField inspector captured in Workbench; these classes omit text/font rows.
const image =
  common
    .split(" ")
    .filter(
      (name) =>
        ![
          "DataType",
          "DefaultString",
          "DefaultValue",
          "IsBold",
          "IsItalic",
          "IsPlain",
          "TextAlignment",
          "TextDisplayBehavior",
          "TypeFace",
          "TypeFaceName",
          "TypeSize",
        ].includes(name),
    )
    .join(" ") + " BmpDisplayBehavior DisplayPolicy";
export const windowNames =
  "BgBitmap BgColor BgPattern CurMode DataType HasScrollBars HasStatusBar IsAutoSized IsBordered IsClosable IsMaximizable IsMaximized IsMinimizable IsNullable IsPopup IsResizeable IsTitled IsToolWindow IsTopmost SetupName StatusText TaggedValues TemplateName TransparentColor VersShortRemarks WindowHeight WindowIcon WindowPlacement WindowTitle WindowWidth WindowLeft WindowTop".split(
    " ",
  );
const labelMap = new Map(
  [
    ...button.split(" "),
    ...entry.split(" "),
    ...windowNames,
    ..."DesignBias TrimBias DisplayPolicy BgGradient HorizontalDistribution VerticalDistribution HorizontalChildOrder VerticalChildOrder IsArray International FieldStyle StyleClass IsMandatory LineWidth LineStyle Protoname ImageWidth ImageHeight Bitmap ImagePosition HasScrollBars HasColumnHeaders HasLines HasButtons IsExpanded RootNode IndentWidth FullRowSelect LargeImageWidth LargeImageHeight SmallImageWidth SmallImageHeight MinimumWidth CurEnumIndex ExactWidth EditLabel SelectionStyle Orientation MinValue MaxValue Increment PageIncrement Value SliderSize ShowValue IsReadOnly IsEditable EnumList ValueList Columns Rows ChildFields TabFolderStyle TabLocation TabWidth TabHeight CurPage MinimumHeight BorderStyle SelectionPolicy AllowSelect".split(
      " ",
    ),
  ].map((n) => [n.replace("_", "").toLowerCase(), n.replace("_", " ")]),
);
for (const name of "AllowLabelEdit AlwaysHighlighted ChildBottomMargin ChildGravity ChildLeftMargin ChildRightMargin ChildTopMargin CollapsePolicy ColSeparatorColor ColSeparatorStyle ColSeparatorWidth ColumnHeightCompressed ColumnResizable Columns ColumnsDisplayed ColumnWidthCompressed DesignOps DisplayValues DragItem ElevatorSize ExactHeight ExactNodeHeight ExitBehavior FgPattern GenField GridLineColor GridX GridY GroupBoxLabel GrowFrom HasCellAttributes HasCheckBoxes HasHeader HasHeaderButtons HasHorizontalScrollBar HasImageAndText HasIndicator HasRootLine HasScrollBar HasSingleCharFind HideHorizontalScrollBar HorizontalChildDistribution HorizontalDistributionGap ImageAlignment Indent InnerShadowWidth IsExtraColumn IsGridOn IsHighlighted IsMoveBounded IsResizeBounded IsShadowed IsUnderlined LabelBias NoMargins NumVisibleRows OnTextLabel PageSize Point1X Point1Y Point2X Point2Y PopupAlignment QueryOps ReadOps RightClickBehavior RowSeparatorColor RowSeparatorStyle RowSeparatorWidth ScrollingChangesSelection SelBgColor SelectionType SelFgColor SelNoFocusBgColor SelNoFocusFgColor SeparatorColor SeparatorMoving SeparatorStyle SeparatorWidth ShowSelection SizeToFit StepSize StringValue Style TickIntervals TrimOps UpdateOps User1Ops User2Ops User3Ops VerticalChildDistribution VerticalDistributionGap VisibleRows WindowXLeft WindowYTop XOffset YOffset".split(
  " ",
))
  labelMap.set(name.toLowerCase(), name);
export function propertyName(key: string): string {
  return labelMap.get(key) ?? key;
}
export function inspectorNames(
  kind: string,
  properties: Readonly<Record<string, string>>,
): string[] {
  const observed =
    kind === "buttonfield"
      ? button
      : kind === "entryfield"
        ? entry
        : ["imagefield", "imagetrim"].includes(kind)
          ? image + (kind === "imagetrim" ? " Image" : "")
          : "";
  return [
    ...new Set(
      observed
        ? observed.split(" ").map((n) => n.replace("_", " "))
        : [
            ...Object.keys(properties)
              .filter((k) => k !== "gorak_style")
              .map(propertyName),
            ...Object.keys(schema[kind] ?? {}).map(propertyName),
          ],
    ),
  ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
export const windowKey = (label: string): string =>
  (
    ({ WindowLeft: "windowxleft", WindowTop: "windowytop" }) as Record<
      string,
      string
    >
  )[label] ?? label.toLowerCase();
export const propertyKey = (label: string): string =>
  label === "DefaultButton"
    ? "isdefaultbutton"
    : label.replaceAll(" ", "").toLowerCase();
// Actian Language Reference System Constants. Unknown values retain their number.
const color = {
  "1": "CC_FOREGROUND",
  "2": "CC_BACKGROUND",
  "4": "CC_BLACK",
  "5": "CC_WHITE",
  "6": "CC_RED",
  "7": "CC_GREEN",
  "8": "CC_BLUE",
  "9": "CC_YELLOW",
  "10": "CC_CYAN",
  "11": "CC_MAGENTA",
  "12": "CC_BROWN",
  "13": "CC_ORANGE",
  "14": "CC_PURPLE",
  "15": "CC_GRAY",
  "70": "CC_SYS_BTNFACE",
  "71": "CC_SYS_BTNSHADOW",
  "72": "CC_SYS_BTNTEXT",
  "75": "CC_SYS_HIGHLIGHT",
  "76": "CC_SYS_HIGHLIGHTTEXT",
  "84": "CC_SYS_WINDOW",
  "86": "CC_SYS_WINDOWTEXT",
  "91": "CC_TRANSPARENT",
};
export const enums: Record<string, Record<string, string>> = {
  displaypolicy: {
    "1": "DP_CLIP_IMAGE",
    "2": "DP_AUTOSIZE_FIELD",
    "3": "DP_SCALE_IMAGE_H",
    "4": "DP_SCALE_IMAGE_W",
    "5": "DP_SCALE_IMAGE_HW",
  },
  bmpdisplaybehavior: {
    "0": "BDB_OPAQUE",
    "1": "BDB_TRANSPARENT",
    "2": "BDB_3DMAPPED",
  },
  collapsepolicy: {
    "0": "CP_NONE",
    "1": "CP_ROWS",
    "2": "CP_COLUMNS",
    "3": "CP_BOTH",
  },
  orientation: { "-1": "FO_DEFAULT", "1": "FO_VERTICAL", "2": "FO_HORIZONTAL" },
  bgcolor: color,
  fgcolor: color,
  outlinecolor: color,
  transparentcolor: color,
  anchorpoint: {
    "0": "AP_NONE",
    "9": "AP_TOPLEFT",
    "10": "AP_TOPCENTER",
    "12": "AP_TOPRIGHT",
    "17": "AP_CENTERLEFT",
    "18": "AP_CENTER",
    "20": "AP_CENTERRIGHT",
    "33": "AP_BOTTOMLEFT",
    "34": "AP_BOTTOMCENTER",
    "36": "AP_BOTTOMRIGHT",
  },
  focusbehavior: {
    "1": "FT_NOSETVALUE",
    "2": "FT_SETVALUE",
    "3": "FT_TAKEFOCUS",
    "4": "FT_TABTO",
  },
  bgpattern: {
    "-1": "FP_DEFAULT",
    "1": "FP_SOLID",
    "2": "FP_CLEAR",
    "3": "FP_HORIZONTAL",
    "4": "FP_VERTICAL",
    "5": "FP_CROSSHATCH",
    "6": "FP_SHADE",
    "7": "FP_LIGHTSHADE",
    "8": "FP_DARKSHADE",
    "9": "FP_BITMAP",
  },
  bgdisplaypolicy: {
    "-1": "BDP_DEFAULT",
    "1": "BDP_FIXED",
    "2": "BDP_RELATIVE",
  },
  outlinestyle: {
    "-1": "OS_DEFAULT",
    "1": "OS_SOLID",
    "2": "OS_SHADOW",
    "3": "OS_3D",
    "4": "OS_STANDARD",
    "5": "OS_RAISED",
    "6": "OS_SUNKEN",
  },
  outlinewidth: {
    "-1": "LW_DEFAULT",
    "0": "LW_NOLINE",
    "1": "LW_MINIMUM",
    "2": "LW_VERYTHIN",
    "3": "LW_THIN",
    "4": "LW_MIDDLE",
    "5": "LW_THICK",
    "6": "LW_MAXIMUM",
    "7": "LW_EXTRATHIN",
  },
  forcecase: { "1": "FC_NONE", "2": "FC_UPPER", "3": "FC_LOWER" },
  curmode: {
    "2": "FM_UPDATE",
    "3": "FM_QUERY",
    "4": "FM_READ",
    "5": "FM_USER1",
    "6": "FM_USER2",
    "7": "FM_USER3",
  },
  defaultvalue: { "1": "DV_SYSTEM", "2": "DV_NULL", "3": "DV_STRING" },
  gravity: {
    "-1": "FA_DEFAULT",
    "0": "FA_NONE",
    "9": "FA_TOPLEFT",
    "10": "FA_TOPCENTER",
    "12": "FA_TOPRIGHT",
    "17": "FA_CENTERLEFT",
    "18": "FA_CENTER",
    "20": "FA_CENTERRIGHT",
    "33": "FA_BOTTOMLEFT",
    "34": "FA_BOTTOMCENTER",
    "36": "FA_BOTTOMRIGHT",
  },
};
enums.childgravity = enums.gravity;
export function displayValue(kind: string, key: string, value: string): string {
  if (
    schema[kind]?.[key] === "or_bool" ||
    (/^is|^has/.test(key) && ["0", "1"].includes(value))
  )
    return value === "1" ? "TRUE" : value === "0" ? "FALSE" : value;
  return enums[key]?.[value] ?? value;
}
export function validateProperty(
  kind: string,
  key: string,
  value: string,
): void {
  const type = schema[kind]?.[key];
  if (type === "or_bool" && !["0", "1"].includes(value))
    throw Error("Choose TRUE or FALSE");
  if (type?.includes("Integer") || type === "xs:integer") {
    if (
      !/^-?\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Math.abs(Number(value)) > 1_000_000 ||
      (type.includes("nonNegative") && Number(value) < 0)
    )
      throw Error("Expected an integer in the supported range");
  }
  if (
    ["width", "height", "windowwidth", "windowheight"].includes(key) &&
    (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1_000_000)
  )
    throw Error("Size must be between 1 and 1,000,000");
  if (
    ["or_idname", "or_idname_qual"].includes(type) &&
    !/^[A-Za-z_][\w.]*$/.test(value)
  )
    throw Error("Invalid field name");
}
