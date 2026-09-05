const { app, BrowserWindow, ipcMain, session, shell, net, Menu } = require("electron");
const path = require("path");
const https = require("https");
const fs = require("fs");
const os = require("os");

const isDev = process.env.NODE_ENV === "development";
// Expose electron dir to renderer so it can self-bootstrap window.chopcord if needed
process.env.CHOPCORD_ELECTRON_DIR = __dirname;

let mainWindow = null;
let discordWebContents = null;
let pendingDownloadId = null;

// ── App data paths ──────────────────────────────────────────────────────────
const dataRoot = path.join(os.homedir(), ".chopcord");
const settingsPath = path.join(dataRoot, "settings.json");
const downloadsDir = path.join(dataRoot, "downloads");
const cacheDir = path.join(dataRoot, "cache");

for (const dir of [dataRoot, downloadsDir, cacheDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(data) {
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
}

// ── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#08080d",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: false,
      nodeIntegration: true,   // lets renderer self-setup if preload misses
      webviewTag: true,
      webSecurity: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:" + (process.env.PORT || 5173));
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.webContents.setZoomFactor(1.0);
  });

  mainWindow.webContents.on("will-attach-webview", (_, webPreferences) => {
    webPreferences.preload = path.join(__dirname, "discord-preload.cjs");
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = false;
  });

  mainWindow.webContents.on("did-attach-webview", (_, wc) => {
    discordWebContents = wc;

    wc.on("did-finish-load", () => {
      injectDiscordCSS(wc);
      wc.executeJavaScript(`window.location.pathname`).then((pathname) => {
        const loggedIn = !pathname.startsWith("/login") && !pathname.startsWith("/register");
        mainWindow?.webContents.send("discord:login-state", loggedIn);
      }).catch(() => {});
    });

    wc.on("did-navigate", (_, url) => {
      const loggedIn = !url.includes("/login") && !url.includes("/register");
      mainWindow?.webContents.send("discord:login-state", loggedIn);
      // If Discord navigated away from the app (offline "did you know" page etc.), redirect back
      if (url && url.startsWith("https://discord.com") &&
          !url.includes("/channels/") && !url.includes("/app") &&
          !url.includes("/login") && !url.includes("/register") &&
          !url.includes("/oauth2")) {
        setTimeout(() => wc.loadURL("https://discord.com/app"), 500);
      }
    });

    wc.on("will-navigate", (event, url) => {
      // Block navigation away from discord.com entirely (ads, external links handled by setWindowOpenHandler)
      if (!url.startsWith("https://discord.com") && !url.startsWith("https://discordapp.com")) {
        event.preventDefault();
      }
    });

    wc.on("did-navigate-in-page", () => {
      setTimeout(() => injectDiscordCSS(wc), 300);
    });

    // ── Right-click context menu with Download option for media ──
    wc.on("context-menu", (_, params) => {
      const menuItems = [];

      if (params.mediaType === "image" && params.srcURL) {
        menuItems.push({
          label: "Download Image",
          click: () => downloadURL(params.srcURL, wc.session),
        });
        menuItems.push({
          label: "Copy Image URL",
          click: () => { require("electron").clipboard.writeText(params.srcURL); },
        });
        menuItems.push({ type: "separator" });
      }

      if (params.mediaType === "video" && params.srcURL) {
        menuItems.push({
          label: "Download Video",
          click: () => downloadURL(params.srcURL, wc.session),
        });
        menuItems.push({ type: "separator" });
      }

      if (params.linkURL && params.linkURL.includes("cdn.discordapp.com")) {
        menuItems.push({
          label: "Download File",
          click: () => downloadURL(params.linkURL, wc.session),
        });
        menuItems.push({ type: "separator" });
      }

      if (params.isEditable) {
        menuItems.push({ role: "cut" }, { role: "copy" }, { role: "paste" });
      } else if (params.selectionText) {
        menuItems.push({ role: "copy" });
      }

      menuItems.push(
        { type: "separator" },
        { label: "Reload Discord", click: () => wc.reload() },
        { label: "DevTools (Discord)", click: () => wc.openDevTools() },
      );

      Menu.buildFromTemplate(menuItems).popup({ window: mainWindow });
    });

    // ── Intercept all downloads → save to ChopCord downloads dir with progress ──
    wc.session.on("will-download", (_, item) => {
      const ext  = path.extname(item.getFilename()) || "";
      const base = path.basename(item.getFilename(), ext);
      let dest   = path.join(downloadsDir, item.getFilename());
      let n = 1;
      while (fs.existsSync(dest)) dest = path.join(downloadsDir, `${base}_${n++}${ext}`);

      item.setSavePath(dest);
      const id   = pendingDownloadId || Date.now().toString();
      pendingDownloadId = null;
      const name = path.basename(dest);

      const sendAll = (channel, data) => {
        mainWindow?.webContents.send(channel, data);
        // Also send directly to the webview so the in-frame UI can update
        try { wc.send(channel, data); } catch (_) {}
      };

      sendAll("download:started", { id, name, totalBytes: item.getTotalBytes() });

      item.on("updated", (__, state) => {
        if (state === "progressing") {
          const received = item.getReceivedBytes();
          const total    = item.getTotalBytes();
          const speed    = item.getCurrentBytesPerSecond?.() ?? 0;
          sendAll("download:progress", { id, name, received, total, speed });
        }
      });

      item.on("done", (__, state) => {
        sendAll("download:done", {
          id, name, filePath: dest, state,
          totalBytes: item.getTotalBytes(),
        });
      });
    });

    wc.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith("https://discord.com")) {
        shell.openExternal(url);
        return { action: "deny" };
      }
      return { action: "allow" };
    });
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── Download helper ──────────────────────────────────────────────────────────
function downloadURL(url) {
  if (discordWebContents) {
    discordWebContents.downloadURL(url);
  }
}

// ── CSS injection ────────────────────────────────────────────────────────────
async function injectDiscordCSS(wc) {
  const css = require("./discord-css.cjs");
  try { await wc.insertCSS(css); } catch (_) {}
}

// ── IPC: window controls ─────────────────────────────────────────────────────
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());

// ── IPC: settings ────────────────────────────────────────────────────────────
ipcMain.handle("settings:load", () => loadSettings());
ipcMain.handle("settings:save", (_, data) => { saveSettings(data); return { ok: true }; });

// ── IPC: proxy ───────────────────────────────────────────────────────────────
ipcMain.handle("proxy:set", async (_, { enabled, url }) => {
  const ses = session.defaultSession;
  if (enabled && url) {
    await ses.setProxy({ proxyRules: url });
  } else {
    await ses.setProxy({ mode: "direct" });
  }
  return { ok: true };
});

ipcMain.handle("proxy:test", async (_, { url }) => {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get({ host: "discord.com", path: "/", timeout: 5000 }, (res) => {
      resolve({ ok: res.statusCode < 500, latency: Date.now() - start, status: res.statusCode });
      res.destroy();
    });
    req.on("error", () => resolve({ ok: false, latency: -1 }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, latency: -1 }); });
  });
});

// ── IPC: connection ping ─────────────────────────────────────────────────────
ipcMain.handle("connection:ping", async () => {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get({ host: "discord.com", path: "/", timeout: 4000 }, (res) => {
      resolve({ online: true, latency: Date.now() - start });
      res.destroy();
    });
    req.on("error", () => resolve({ online: false, latency: -1 }));
    req.on("timeout", () => { req.destroy(); resolve({ online: false, latency: -1 }); });
  });
});

// ── IPC: downloads ───────────────────────────────────────────────────────────
ipcMain.handle("downloads:url", (event, url) => {
  return new Promise((resolve) => {
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return resolve({ ok: false, error: "Invalid URL" }); }

    const ext      = path.extname(parsedUrl.pathname) || "";
    const base     = path.basename(parsedUrl.pathname, ext) || "download";
    const safeName = base.replace(/[^a-z0-9_\-\.]/gi, "_") + ext;
    let dest       = path.join(downloadsDir, safeName);
    let n = 1;
    while (fs.existsSync(dest)) dest = path.join(downloadsDir, base.replace(/[^a-z0-9_\-\.]/gi, "_") + `_${n++}` + ext);

    const id   = Date.now().toString();
    const name = path.basename(dest);

    const sendAll = (channel, data) => {
      try { mainWindow?.webContents.send(channel, data); } catch (_) {}
      try { event.sender.send(channel, data); } catch (_) {}
    };

    sendAll("download:started", { id, name, totalBytes: 0 });

    const proto = parsedUrl.protocol === "https:" ? require("https") : require("http");
    const req = proto.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://discord.com/",
      },
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        ipcMain.emit("downloads:url:redirect", event, res.headers.location, dest, id, name, sendAll, resolve);
        return;
      }
      if (res.statusCode !== 200) {
        resolve({ ok: false, error: `HTTP ${res.statusCode}` });
        sendAll("download:done", { id, name, state: "failed", totalBytes: 0 });
        return;
      }

      const total = parseInt(res.headers["content-length"] || "0", 10);
      sendAll("download:started", { id, name, totalBytes: total });

      let received = 0;
      let lastSent = 0;
      const startTime = Date.now();
      const stream = fs.createWriteStream(dest);

      res.on("data", (chunk) => {
        stream.write(chunk);
        received += chunk.length;
        const now = Date.now();
        if (now - lastSent > 150) { // throttle to ~6 updates/sec
          const elapsed = (now - startTime) / 1000;
          const speed = elapsed > 0 ? Math.round(received / elapsed) : 0;
          sendAll("download:progress", { id, name, received, total, speed });
          lastSent = now;
        }
      });

      res.on("end", () => {
        stream.end();
        resolve({ ok: true, id, name });
        sendAll("download:done", { id, name, filePath: dest, state: "completed", totalBytes: received });
      });

      res.on("error", (err) => {
        stream.destroy();
        try { fs.unlinkSync(dest); } catch (_) {}
        resolve({ ok: false, error: err.message });
        sendAll("download:done", { id, name, state: "failed", totalBytes: 0 });
      });
    });

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
      sendAll("download:done", { id, name, state: "failed", totalBytes: 0 });
    });

    req.setTimeout(30000, () => { req.destroy(); });
  });
});

ipcMain.handle("downloads:list", () => {
  try {
    const files = fs.readdirSync(downloadsDir).map((f) => {
      const full = path.join(downloadsDir, f);
      const stat = fs.statSync(full);
      return { name: f, size: stat.size, path: full, mtime: stat.mtimeMs };
    });
    return files.sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
});

ipcMain.handle("downloads:open", (_, filePath) => {
  shell.openPath(filePath);
});

ipcMain.handle("downloads:reveal", (_, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle("downloads:delete", (_, filePath) => {
  try { fs.unlinkSync(filePath); return { ok: true }; } catch { return { ok: false }; }
});

ipcMain.handle("downloads:open-folder", () => {
  shell.openPath(downloadsDir);
});

// Check if a URL (by path, ignoring auth query params) was already downloaded
ipcMain.handle("downloads:check-url", (_, url) => {
  try {
    const urlPath = new URL(url).pathname;
    const fileName = path.basename(urlPath);
    const files = fs.readdirSync(downloadsDir);
    // Match by original filename or with numeric suffix (_1, _2...)
    const base = path.basename(fileName, path.extname(fileName));
    const ext  = path.extname(fileName);
    const match = files.find(f => f === fileName || f.match(new RegExp(`^${base}(_\\d+)?${ext.replace(".", "\\.")}$`)));
    if (match) {
      return { exists: true, filePath: path.join(downloadsDir, match), name: match };
    }
    return { exists: false };
  } catch { return { exists: false }; }
});

// ── IPC: cache stats ─────────────────────────────────────────────────────────
ipcMain.handle("cache:stats", async () => {
  try {
    const size = await session.defaultSession.getCacheSize();
    return { totalSize: size, count: -1 };
  } catch { return { totalSize: 0, count: 0 }; }
});

ipcMain.handle("cache:clear", async () => {
  try {
    await session.defaultSession.clearCache();
    return { ok: true };
  } catch { return { ok: false }; }
});

// ── Tracking / analytics domains to block for privacy + bandwidth savings ────
const BLOCKED_HOSTS = new Set([
  "sentry.io", "o0.ingest.sentry.io",
  "discord-attachments-uploads-prd.storage.googleapis.com",
  "hog.us.posthog.com", "us.posthog.com",
  "datadoghq.com", "rum.browser-intake-datadoghq.com",
  "click.discord.com",
  "tracking.discordapp.com",
  "discordapp.net",  // analytics subdomain (NOT cdn.discordapp.com)
]);

function isBlockedUrl(url) {
  try {
    const host = new URL(url).hostname;
    for (const b of BLOCKED_HOSTS) if (host === b || host.endsWith("." + b)) return true;
  } catch {}
  return false;
}

// ── Spoof UA so Discord loads the full web app ────────────────────────────────
app.whenReady().then(() => {
  // Larger disk cache (256 MB) for faster media loads
  app.commandLine.appendSwitch("disk-cache-size", String(256 * 1024 * 1024));

  const ses = session.defaultSession;

  // Block tracking domains — save bandwidth, improve privacy
  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    if (isBlockedUrl(details.url)) {
      callback({ cancel: true });
    } else {
      callback({});
    }
  });

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["User-Agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    // Strip tracking headers
    delete details.requestHeaders["X-Discord-Locale"];
    callback({ requestHeaders: details.requestHeaders });
  });

  createWindow();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
