const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

async function writeProject(filePath, text) {
  // Replace only after the entire project has been written, preserving symlink targets.
  let target = filePath;
  let mode = 0o666;
  try {
    target = await fs.realpath(filePath);
    await fs.access(target, fs.constants.W_OK);
    mode = (await fs.stat(target)).mode;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temp = path.join(path.dirname(target), `.chrona-${randomUUID()}.tmp`);
  const file = await fs.open(temp, "wx", mode);
  try {
    try {
      await file.writeFile(text, "utf8");
    } finally {
      await file.close();
    }
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

function installProjectFiles(ipcMain, BrowserWindow, dialog) {
  const selectedPaths = new WeakMap();
  const filters = [{ name: "Chrona project", extensions: ["json"] }];
  function context(event) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || event.senderFrame !== event.sender.mainFrame) throw new Error("Invalid project window");
    if (!selectedPaths.has(win)) selectedPaths.set(win, new Set());
    return { win, paths: selectedPaths.get(win) };
  }
  ipcMain.handle("project:open", async (event) => {
    const { win, paths } = context(event);
    const choice = await dialog.showOpenDialog(win, { filters, properties: ["openFile"] });
    if (choice.canceled) return null;
    const filePath = choice.filePaths[0];
    const text = await fs.readFile(filePath, "utf8");
    paths.add(filePath);
    return { name: path.basename(filePath), path: filePath, text };
  });
  ipcMain.handle("project:save", async (event, { currentPath, saveAs, name, text }) => {
    const { win, paths } = context(event);
    if (currentPath && !paths.has(currentPath)) throw new Error("Select the project file first");
    let filePath = currentPath;
    if (!filePath || saveAs) {
      const choice = await dialog.showSaveDialog(win, {
        filters, defaultPath: currentPath || path.basename(name),
      });
      if (choice.canceled) return null;
      filePath = choice.filePath;
    }
    await writeProject(filePath, text);
    paths.add(filePath);
    return { name: path.basename(filePath), path: filePath };
  });
}
module.exports = { installProjectFiles };
