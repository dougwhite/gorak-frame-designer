const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const syncFs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
test("desktop host checks both baselines and saves only the opened documents", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-host-"));
  const uri = path.join(directory, "example.wml"),
    companion = path.join(directory, "example.w4gl");
  const wml = '<frame><topform width="1000" height="1000"/></frame>',
    metadata =
      '[framesource]\nwindowwidth = "1000"\n\n===\n// script remains opaque';
  await fs.writeFile(uri, wml);
  await fs.writeFile(companion, metadata);
  const handlers = {},
    events = {},
    window = {
      webContents: { mainFrame: {}, on: () => {} },
      setTitle: () => {},
    };
  const electron = {
    ipcMain: {
      handle: (key, fn) => (handlers[key] = fn),
      on: (key, fn) => (events[key] = fn),
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [uri] }),
    },
  };
  const context = {
    module: { exports: {} },
    require: (name) =>
      name === "electron"
        ? electron
        : name === "./image-assets.cjs"
          ? require("../electron/image-assets.cjs")
          : require(name),
    process: { argv: [] },
    Buffer,
  };
  vm.runInNewContext(
    syncFs.readFileSync(path.resolve("electron/document-host.cjs"), "utf8"),
    context,
  );
  context.module.exports(window);
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  };
  const loaded = await handlers["frame:open"](event);
  assert.equal(loaded.metadata.text, metadata);
  await assert.rejects(
    () => handlers["frame:save"](event, path.join(directory, "other.wml"), wml),
    /matching/,
  );
  await fs.writeFile(companion, metadata + "\nexternal");
  await assert.rejects(
    () =>
      handlers["frame:save"](event, uri, wml.replace("1000", "2000"), metadata),
    /Companion changed/,
  );
  assert.equal(await fs.readFile(uri, "utf8"), wml);
  await fs.writeFile(companion, metadata);
  await handlers["frame:save"](
    event,
    uri,
    wml.replace("1000", "2000"),
    metadata.replace("1000", "2000"),
  );
  assert.equal(await fs.readFile(uri, "utf8"), wml.replace("1000", "2000"));
  assert.equal(
    await fs.readFile(companion, "utf8"),
    metadata.replace("1000", "2000"),
  );
  await assert.rejects(
    () => handlers["frame:open"]({ sender: {}, senderFrame: {} }),
    /Invalid host/,
  );
  await fs.rm(directory, { recursive: true });
});
