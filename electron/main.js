const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const http = require('http');

// Disable sandbox for environments that require it (e.g. Docker, unprivileged Linux)
app.commandLine.appendSwitch('no-sandbox');

let mainWindow = null;
let serverCloseFn = null;
const SERVER_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HEALTH_URL = `http://localhost:${SERVER_PORT}/api/health`;

/**
 * Polls the backend health endpoint until it answers 200 OK or times out.
 */
function waitForServerReady(url, maxRetries = 40, intervalMs = 250) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts >= maxRetries) {
          reject(new Error(`Server responded with HTTP status ${res.statusCode}`));
        } else {
          setTimeout(check, intervalMs);
        }
      });

      req.on('error', (err) => {
        if (attempts >= maxRetries) {
          reject(new Error(`Timed out waiting for server ready: ${err.message}`));
        } else {
          setTimeout(check, intervalMs);
        }
      });
      req.setTimeout(1000, () => req.destroy());
    };
    check();
  });
}

/**
 * Resolves the server module path whether running from root development or packaged inside an ASAR / resource folder.
 */
function resolveServerModule() {
  const fs = require('fs');
  const candidatePaths = [
    path.join(__dirname, '../server/dist/index.js'),
    path.join(process.resourcesPath || '', 'server/dist/index.js'),
    path.join(process.resourcesPath || '', 'app/server/dist/index.js'),
    path.join(__dirname, 'server/dist/index.js'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, '../server/dist/index.js');
}

async function startBackendServer() {
  const serverPath = resolveServerModule();
  console.log('[Electron] Loading backend from:', serverPath);

  try {
    const serverModule = require(serverPath);
    if (typeof serverModule.startServer === 'function') {
      const { close } = await serverModule.startServer();
      serverCloseFn = close;
    } else {
      console.log('[Electron] Server module loaded without startServer export.');
    }
  } catch (err) {
    console.error('[Electron] Failed to start backend server:', err);
    throw err;
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'ClassCast',
  });

  try {
    await startBackendServer();
    console.log('[Electron] Waiting for server health check on port', SERVER_PORT);
    await waitForServerReady(HEALTH_URL);
    console.log('[Electron] Server ready, loading UI...');
    await mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  } catch (err) {
    console.error('[Electron] Startup failed:', err);
    dialog.showErrorBox(
      'ClassCast Startup Error',
      `Could not start or connect to the ClassCast server on port ${SERVER_PORT}:\n\n${err.message}\n\nPlease verify that port ${SERVER_PORT} is not already in use.`
    );
    app.quit();
    return;
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

let isQuitting = false;
async function cleanShutdown() {
  if (isQuitting) return;
  isQuitting = true;
  console.log('[Electron] Performing clean shutdown of backend server...');
  if (serverCloseFn) {
    try {
      await serverCloseFn();
    } catch (err) {
      console.error('[Electron] Error during server close:', err);
    }
  }
}

app.on('before-quit', async (e) => {
  if (serverCloseFn && !isQuitting) {
    e.preventDefault();
    await cleanShutdown();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
