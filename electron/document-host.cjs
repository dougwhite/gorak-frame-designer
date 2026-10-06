const { dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { loadImages } = require("./image-assets.cjs");
module.exports = (window) => {
  let opened,
    writing = false;
  const readBounded = async (file) => {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 8_000_000)
      throw Error("File exceeds the 8 MB limit");
    return fs.readFile(file, "utf8");
  };
  const validText = (text) => {
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 8_000_000)
      throw Error("Invalid document");
  };
  const authorize = (event) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw Error("Invalid host request");
  };
  const load = async (uri) => {
    uri = path.resolve(uri);
    if (path.extname(uri).toLowerCase() !== ".wml") throw Error("Expected WML");
    const text = await readBounded(uri),
      layers = [];
    for (const [origin, file] of [
      [
        "Repository",
        path.join(path.dirname(path.dirname(uri)), "field_defaults.json"),
      ],
      ["Application", path.join(path.dirname(uri), "field_defaults.json")],
      ["Frame", uri.slice(0, -4) + ".fielddefaults.json"],
    ]) {
      try {
        const defaults = JSON.parse(await readBounded(file));
        if (
          !defaults ||
          typeof defaults !== "object" ||
          Array.isArray(defaults)
        )
          throw Error("Invalid defaults");
        if (
          "field_styles" in defaults ||
          "common_model_container" in defaults ||
          "structure" in defaults
        )
          throw Error(
            "Retired stylesheet format; re-export with current gorak",
          );
        layers.push({ origin, defaults });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    let metadata;
    try {
      const file = uri.slice(0, -4) + ".w4gl",
        source = await readBounded(file);
      if (/^\s*\[.*field_defaults.*\]/im.test(source.split(/^===\s*$/m)[0]))
        throw Error("Inline field defaults require a frame sidecar");
      metadata = { uri: file, text: source };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    opened = { uri, text, metadata };
    return { uri, text, layers, metadata };
  };
  ipcMain.handle("frame:open", async (event) => {
    authorize(event);
    if (writing) throw Error("Save is in progress");
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "WML frames", extensions: ["wml"] }],
    });
    return result.canceled ? null : load(result.filePaths[0]);
  });
  ipcMain.handle("frame:initial", async (event) => {
    authorize(event);
    const i = process.argv.indexOf("--open");
    return i < 0 ? null : load(process.argv[i + 1]);
  });
  ipcMain.handle("frame:images", async (event, uri, references) => {
    authorize(event);
    if (!opened || uri !== opened.uri) throw Error("No matching open document");
    return loadImages(path.dirname(opened.uri), references);
  });
  ipcMain.on("frame:title", (event, title) => {
    authorize(event);
    if (typeof title === "string" && title.length < 512) window.setTitle(title);
  });
  ipcMain.handle("frame:save", async (event, uri, text, metadata) => {
    authorize(event);
    if (writing) throw Error("Save is in progress");
    if (!opened || uri !== opened.uri) throw Error("No matching open document");
    validText(text);
    if (metadata !== undefined) {
      validText(metadata);
      if (!opened.metadata) throw Error("No companion was opened");
    }
    writing = true;
    try {
      // Check every baseline before writing either document. The companion's scripts
      // are returned as opaque text and are never executed by this host.
      if ((await readBounded(uri)) !== opened.text)
        throw Error("WML changed on disk; reopen before saving");
      if (
        opened.metadata &&
        (await readBounded(opened.metadata.uri)) !== opened.metadata.text
      )
        throw Error("Companion changed on disk; reopen before saving");
      const writes = [];
      if (text !== opened.text) writes.push({ uri, text, before: opened.text });
      if (
        opened.metadata &&
        metadata !== undefined &&
        metadata !== opened.metadata.text
      )
        writes.push({
          uri: opened.metadata.uri,
          text: metadata,
          before: opened.metadata.text,
        });
      const completed = [];
      try {
        for (const file of writes) {
          await fs.writeFile(file.uri, file.text, "utf8");
          completed.push(file);
        }
      } catch (error) {
        for (const file of completed.reverse())
          await fs.writeFile(file.uri, file.before, "utf8");
        throw error;
      }
      opened.text = text;
      if (opened.metadata && metadata !== undefined)
        opened.metadata.text = metadata;
    } finally {
      writing = false;
    }
  });
  ipcMain.handle("frame:create", async (event, text, metadata) => {
    authorize(event);
    if (writing) throw Error("Save is in progress");
    validText(text);
    validText(metadata);
    const result = await dialog.showSaveDialog(window, {
      defaultPath: "untitled.wml",
      filters: [{ name: "WML frames", extensions: ["wml"] }],
    });
    if (result.canceled) return null;
    const uri = path.resolve(result.filePath);
    if (path.extname(uri).toLowerCase() !== ".wml")
      throw Error("Expected WML filename");
    const companion = uri.slice(0, -4) + ".w4gl";
    // New-frame creation never replaces existing source or an unseen companion.
    await fs.writeFile(uri, text, { encoding: "utf8", flag: "wx" });
    try {
      await fs.writeFile(companion, metadata, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      await fs.unlink(uri);
      throw error;
    }
    return load(uri);
  });
  window.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      buttons: ["Keep editing", "Discard edits"],
      defaultId: 0,
      cancelId: 0,
      message: "This frame has unsaved edits.",
    });
    if (choice === 1) event.preventDefault();
  });
};
