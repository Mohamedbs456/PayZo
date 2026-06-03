const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const http = require("node:http");
const sirv = require("sirv");

const PORT = 5174;
const ORIGIN = `http://localhost:${PORT}`;

let server = null;

function startStaticServer() {
  const distDir = path.join(app.getAppPath(), "dist");
  const handler = sirv(distDir, { single: true, dev: false });
  server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });

  // Packaged: serve the built dist over http://localhost:5174 so the app's
  // origin matches the Keycloak web-origin + backend CORS allowlists. Dev: the
  // Vite dev server already owns that port.
  if (app.isPackaged) {
    await startStaticServer();
  }
  await win.loadURL(ORIGIN);
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (server) server.close();
  if (process.platform !== "darwin") app.quit();
});
