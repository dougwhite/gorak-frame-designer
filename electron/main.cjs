const { app, BrowserWindow, Menu } = require("electron");
const path = require("node:path");
const imageSmoke = process.argv.includes("--image-smoke-test");
const smoke = imageSmoke || process.argv.includes("--smoke-test");
if (smoke)
  app.setPath(
    "userData",
    path.join(__dirname, "../.local/electron-smoke-profile"),
  );
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    show: !smoke,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: smoke,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  if (imageSmoke) {
    const fs = require("node:fs"),
      { deflateSync } = require("node:zlib");
    const folder = path.join(__dirname, "../.local/image-smoke"),
      images = path.join(folder, "images");
    fs.mkdirSync(images, { recursive: true });
    fs.copyFileSync(
      path.join(
        __dirname,
        "../.ci/gorak/compatibility/project/example/images/badge.png",
      ),
      path.join(images, "badge.png"),
    );
    const mask = "2x2:" + deflateSync(Buffer.from([128, 0])).toString("base64");
    const file = path.join(folder, "image-smoke.wml");
    fs.writeFileSync(
      file,
      `<frame><!-- 😀 --><topform width="5000" height="3000" bgpattern="9"><bgbitmap src="images/badge.png"/><buttonfield name="action" width="1400" height="300" textlabel="Run"><bitmaplabel src="images/badge.png"/><selectedbitmap src="images/badge.png" mask="${mask}"/></buttonfield><palettefield name="choices" ytop="500" width="1400" height="300"><valuelist><choiceitems><row enumvalue="1"><enumdisplay><![CDATA[ &amp; ]]></enumdisplay><enumbitmap src="builtin:pal_icon2"/></row><row/></choiceitems></valuelist></palettefield><viewportfield name="preview" ytop="900" width="1400" height="500"><viewfield type="flexibleform" name="content" width="1400" height="500"><freetrim name="literal_é" width="800" height="200"><textlabel><![CDATA[ &amp; ]]></textlabel></freetrim></viewfield></viewportfield><segmentshape name="zero" width="0" height="0"/></topform></frame>`,
    );
    fs.writeFileSync(
      file.slice(0, -4) + ".w4gl",
      '[frametemplate]\nwindowwidth = "5000" # preserve\nwindowheight = "3000"\n\n[taggedvalues]\nnote = "opaque"\n\n===\ninitialize() = { /* preserved script */ }\n',
    );
    fs.writeFileSync(
      file.slice(0, -4) + ".fielddefaults.json",
      '{"absent":true}',
    );
    process.argv.push("--open", file);
  }
  require("./document-host.cjs")(window);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  try {
    await window.loadFile(path.join(__dirname, "../dist/index.html"));
    if (smoke) {
      const result = await window.webContents.executeJavaScript(
        require(imageSmoke ? "./image-smoke.cjs" : "./smoke.cjs"),
      );
      if (result.startsWith("FAIL:")) throw Error(result);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const screenshot = await window.webContents.capturePage();
      require("node:fs").mkdirSync(path.join(__dirname, "../.local"), {
        recursive: true,
      });
      require("node:fs").writeFileSync(
        path.join(__dirname, "../.local/smoke.png"),
        screenshot.toPNG(),
      );
      console.log(result);
      app.exit(0);
    }
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
app.on("window-all-closed", () => app.quit());
