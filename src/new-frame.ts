/** Native empty_frame scaffolding, verified through isolated import/re-export. */
export function newFrameSource(
  width = 6500,
  height = 4000,
): { text: string; metadata: string } {
  const biases = [
    "designbias",
    "trimbias",
    "updatebias",
    "querybias",
    "readbias",
    "user1bias",
    "user2bias",
    "user3bias",
  ]
    .map((key) => ` ${key}="16384"`)
    .join("");
  return {
    text: `<frame>\n  <startmenu bgcolor="2" fgcolor="1"${biases}/>\n  <topform bgcolor="70" width="23999" height="24000" designbias="16" readbias="16" outlinewidth="0" isresizebounded="1" transparentcolor="91"/>\n</frame>\n`,
    metadata: `[framesource]\ntemplatename = "empty_frame"\nwindowwidth = "${width}"\nwindowheight = "${height}"\n\n===\n\ninitialize()=\ndeclare\n\nenddeclare\n{\n\n}\n`,
  };
}
/** Observed template defaults; other templates remain unresolved unless the host supplies them. */
export const emptyFrameDefaults: Readonly<Record<string, string>> = {
  hasscrollbars: "0",
  hasstatusbar: "0",
  isautosized: "0",
  isbordered: "1",
  isclosable: "1",
  ismaximizable: "1",
  ismaximized: "0",
  isminimizable: "1",
  isnullable: "0",
  ispopup: "0",
  isresizeable: "0",
  istitled: "1",
  istoolwindow: "0",
  istopmost: "0",
  curmode: "2",
  windowxleft: "0",
  windowytop: "0",
};
