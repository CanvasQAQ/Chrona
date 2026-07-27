const { app, BrowserWindow, ipcMain, shell } = require("electron/main");
const path = require("node:path");

const isDevelopment = process.argv.includes("--dev");
const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";
const appIcon = path.join(__dirname, "..", "build", "icon.png");

function windowForEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.on("window:minimize", (event) => {
  windowForEvent(event)?.minimize();
});

ipcMain.on("window:toggle-maximize", (event) => {
  const window = windowForEvent(event);
  if (!window) return;
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

ipcMain.on("window:close", (event) => {
  windowForEvent(event)?.close();
});

ipcMain.handle("window:is-maximized", (event) => {
  return windowForEvent(event)?.isMaximized() ?? false;
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    title: "Chrona",
    frame: !isWindows,
    ...(isMac
      ? {
          titleBarStyle: "hidden",
          trafficLightPosition: { x: 18, y: 21 },
        }
      : {}),
    autoHideMenuBar: isWindows,
    backgroundColor: "#0b0c12",
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const sendMaximizedState = () => {
    if (!window.isDestroyed()) {
      window.webContents.send("window:maximized-changed", window.isMaximized());
    }
  };
  window.on("maximize", sendMaximizedState);
  window.on("unmaximize", sendMaximizedState);
  window.on("restore", sendMaximizedState);

  window.once("ready-to-show", () => window.show());

  if (isDevelopment) {
    window.loadURL("http://localhost:5173");
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  if (isMac && app.dock) app.dock.setIcon(appIcon);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
