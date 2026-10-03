const { app, BrowserWindow, Menu } = require("electron");
const path = require("node:path");
const smoke = process.argv.includes("--smoke-test");
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
        require("./smoke.cjs"),
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
