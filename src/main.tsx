import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Renderer-level fallback bootstrap for window.chopcord — runs before React mounts.
const _w = window as any;
if (!_w.chopcord && typeof _w.require === "function") {
  try {
    const { ipcRenderer } = _w.require("electron");
    const path = _w.require("path");

    const eDir: string =
      _w.process?.env?.CHOPCORD_ELECTRON_DIR ||
      path.join(_w.process?.cwd?.() || ".", "electron");

    const toFileUrl = (p: string) => {
      const s = p.replace(/\\/g, "/");
      return s.startsWith("/") ? "file://" + s : "file:///" + s;
    };

    _w.chopcord = {
      __chopCordShell: true,
      discordPreloadPath: toFileUrl(path.join(eDir, "discord-preload.cjs")),

      minimize: () => ipcRenderer.send("window:minimize"),
      maximize: () => ipcRenderer.send("window:maximize"),
      close:    () => ipcRenderer.send("window:close"),

      loadSettings: ()     => ipcRenderer.invoke("settings:load"),
      saveSettings: (d: any) => ipcRenderer.invoke("settings:save", d),

      setProxy:  (o: any) => ipcRenderer.invoke("proxy:set",  o),
      testProxy: (o: any) => ipcRenderer.invoke("proxy:test", o),
      ping:      ()       => ipcRenderer.invoke("connection:ping"),

      listDownloads:    ()  => ipcRenderer.invoke("downloads:list"),
      openDownload:     (p: string) => ipcRenderer.invoke("downloads:open",       p),
      revealDownload:   (p: string) => ipcRenderer.invoke("downloads:reveal",     p),
      deleteDownload:   (p: string) => ipcRenderer.invoke("downloads:delete",     p),
      openDownloadsDir: ()  => ipcRenderer.invoke("downloads:open-folder"),
      downloadURL:      (u: string) => ipcRenderer.invoke("downloads:url",        u),

      cacheStats: () => ipcRenderer.invoke("cache:stats"),
      clearCache: () => ipcRenderer.invoke("cache:clear"),

      onLoginState: (cb: (v: boolean) => void) => {
        const fn = (_: any, v: any) => cb(v);
        ipcRenderer.on("discord:login-state", fn);
        return () => ipcRenderer.off("discord:login-state", fn);
      },
      onDownloadStarted: (cb: (v: any) => void) => {
        const fn = (_: any, v: any) => cb(v);
        ipcRenderer.on("download:started", fn);
        return () => ipcRenderer.off("download:started", fn);
      },
      onDownloadProgress: (cb: (v: any) => void) => {
        const fn = (_: any, v: any) => cb(v);
        ipcRenderer.on("download:progress", fn);
        return () => ipcRenderer.off("download:progress", fn);
      },
      onDownloadDone: (cb: (v: any) => void) => {
        const fn = (_: any, v: any) => cb(v);
        ipcRenderer.on("download:done", fn);
        return () => ipcRenderer.off("download:done", fn);
      },
    };
  } catch (_) {
    // Not in desktop app — running in browser preview
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
