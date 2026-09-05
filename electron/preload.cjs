// ChopCord preload — contextIsolation: false, direct window assignment.
// contextBridge is avoided here because it doesn't reliably handle
// functions-returning-functions across the isolation boundary in all Electron builds.
const { ipcRenderer } = require("electron");
const path = require("path");

function toFileUrl(p) {
  const s = p.replace(/\\/g, "/");
  return s.startsWith("/") ? "file://" + s : "file:///" + s;
}

window.chopcord = {
  __chopCordShell: true,

  discordPreloadPath: toFileUrl(path.join(__dirname, "discord-preload.cjs")),

  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close:    () => ipcRenderer.send("window:close"),

  // Settings
  loadSettings: ()     => ipcRenderer.invoke("settings:load"),
  saveSettings: (data) => ipcRenderer.invoke("settings:save", data),

  // Proxy
  setProxy:  (opts) => ipcRenderer.invoke("proxy:set",  opts),
  testProxy: (opts) => ipcRenderer.invoke("proxy:test", opts),

  // Connection
  ping: () => ipcRenderer.invoke("connection:ping"),

  // Downloads
  listDownloads:    ()  => ipcRenderer.invoke("downloads:list"),
  openDownload:     (p) => ipcRenderer.invoke("downloads:open",       p),
  revealDownload:   (p) => ipcRenderer.invoke("downloads:reveal",     p),
  deleteDownload:   (p) => ipcRenderer.invoke("downloads:delete",     p),
  openDownloadsDir: ()  => ipcRenderer.invoke("downloads:open-folder"),
  downloadURL:      (u) => ipcRenderer.invoke("downloads:url",        u),

  // Cache
  cacheStats: () => ipcRenderer.invoke("cache:stats"),
  clearCache: () => ipcRenderer.invoke("cache:clear"),

  // Push events main → renderer
  onLoginState: (cb) => {
    const fn = (_, v) => cb(v);
    ipcRenderer.on("discord:login-state", fn);
    return () => ipcRenderer.off("discord:login-state", fn);
  },
  onDownloadStarted: (cb) => {
    const fn = (_, v) => cb(v);
    ipcRenderer.on("download:started", fn);
    return () => ipcRenderer.off("download:started", fn);
  },
  onDownloadProgress: (cb) => {
    const fn = (_, v) => cb(v);
    ipcRenderer.on("download:progress", fn);
    return () => ipcRenderer.off("download:progress", fn);
  },
  onDownloadDone: (cb) => {
    const fn = (_, v) => cb(v);
    ipcRenderer.on("download:done", fn);
    return () => ipcRenderer.off("download:done", fn);
  },
};
