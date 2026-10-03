const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("frameHost", {
  open: () => ipcRenderer.invoke("frame:open"),
  initial: () => ipcRenderer.invoke("frame:initial"),
  save: (uri, text, metadata) =>
    ipcRenderer.invoke("frame:save", uri, text, metadata),
  create: (text, metadata) =>
    ipcRenderer.invoke("frame:create", text, metadata),
  title: (value) => ipcRenderer.send("frame:title", value),
});
