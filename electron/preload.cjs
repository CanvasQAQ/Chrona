const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chronaAgent", {
  getStatus: () => ipcRenderer.invoke("agent:status"),
  setEnabled: (enabled) => ipcRenderer.invoke("agent:set-enabled", enabled),
  onStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("agent:status", handler);
    return () => ipcRenderer.removeListener("agent:status", handler);
  },
  onRequest: (listener) => {
    const handler = (_event, request) => listener(request);
    ipcRenderer.on("agent:request", handler);
    return () => ipcRenderer.removeListener("agent:request", handler);
  },
  respond: (id, result) => ipcRenderer.send("agent:response", id, result),
});

contextBridge.exposeInMainWorld("chronaWindow", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onMaximizedChange: (listener) => {
    const handler = (_event, maximized) => listener(maximized);
    ipcRenderer.on("window:maximized-changed", handler);
    return () => ipcRenderer.removeListener("window:maximized-changed", handler);
  },
});
