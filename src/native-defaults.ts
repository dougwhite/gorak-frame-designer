// Scalar class defaults confirmed in the native inspector and Actian class reference.
// Explicit WML overrides these; unknown defaults stay unresolved.
const image: Readonly<Record<string, string>> = {
  displaypolicy: "1",
  bmpdisplaybehavior: "0",
  declared: "1",
  isnullable: "1",
  ispropoptinherited: "0",
  isreverse: "0",
  requirerealfield: "0",
  tabseqnum: "0",
  anchorpoint: "0",
  outlinestyle: "-1",
  outlinewidth: "-1",
};
export function nativeDefaults(kind: string): Readonly<Record<string, string>> {
  // Workbench table exports omit zero column offsets; columns are not palette tools.
  if (kind === "columnfield") return { xleft: "0", ytop: "0" };
  if (kind === "imagefield") return image;
  if (kind === "imagetrim") return { ...image, displaypolicy: "2" };
  if (kind === "stackfield")
    return {
      childgravity: "9",
      orientation: "1",
      ismovebounded: "1",
      isresizebounded: "0",
      childbottommargin: "0",
      childleftmargin: "0",
      childrightmargin: "0",
      childtopmargin: "0",
      separatorwidth: "0",
      separatorstyle: "-1",
    };
  if (kind === "matrixfield")
    return {
      childgravity: "18",
      collapsepolicy: "3",
      ismovebounded: "1",
      isresizebounded: "1",
      childbottommargin: "0",
      childleftmargin: "0",
      childrightmargin: "0",
      childtopmargin: "0",
    };
  return {};
}
