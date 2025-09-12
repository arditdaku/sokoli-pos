const { app, BrowserWindow, ipcMain } = require("electron/main");
const path = require("path");
// Epson printer integration
require(path.join(__dirname, "./epson-printer.js"));

let authWindow;
let mainWindow;

const createAuthWindow = () => {
  authWindow = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    resizable: false,
    icon: null, // You can add an icon path here
    titleBarStyle: 'default',
  });

  authWindow.loadFile(path.join(__dirname, 'login.html'));

  authWindow.on('closed', () => {
    authWindow = null;
  });
};

const createMainWindow = (workerName = 'Admin') => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: null, // You can add an icon path here
    titleBarStyle: "default",
  });

  mainWindow.loadFile("index.html", { query: { worker: workerName } });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  createAuthWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAuthWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.on('login-success', (event, workerName) => {
  if (authWindow) {
    authWindow.close();
  }
  createMainWindow(workerName);
});

ipcMain.on('logout', () => {
  if (mainWindow) {
    mainWindow.close();
  }
  createAuthWindow();
});
