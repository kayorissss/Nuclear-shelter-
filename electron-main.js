// Electron Main Process (Frameless Bunker Window + Custom Icon + Native Window Controls)
const { app, BrowserWindow, session } = require("electron");
const path = require("path");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false, // Убирает стандартную белую рамку Windows!
    backgroundColor: "#070b08",
    title: "БУНКЕР «ЗАСЛОН-19»: ПЕПЕЛ УРАЛА",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Перехват команд кастомной рамки окна (/__win_cmd?act=min|max|close)
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["*://*/__win_cmd*"] },
    (details, callback) => {
      if (mainWindow) {
        if (details.url.includes("act=min")) {
          mainWindow.minimize();
        } else if (details.url.includes("act=max")) {
          if (mainWindow.isMaximized()) mainWindow.unmaximize();
          else mainWindow.maximize();
        } else if (details.url.includes("act=close")) {
          mainWindow.close();
        }
      }
      callback({ cancel: true });
    }
  );

  mainWindow.loadFile(path.join(__dirname, "public", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  app.quit();
});
