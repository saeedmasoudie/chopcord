import { useState, useEffect, useCallback } from "react";

export interface Settings {
  proxyEnabled: boolean;
  proxyUrl: string;
  dns: "cloudflare" | "google" | "none";
  offlineMode: boolean;
  activeProfile: string;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  showUpdateBadge: boolean;
  zeroTelemetry: boolean;
  encryptedStorage: boolean;
  blockTrackers: boolean;
  hardwareAccel: boolean;
  preloadAssets: boolean;
  reduceMotion: boolean;
  cacheSaving: boolean;
  lazyLoadImages: boolean;
  compressUploads: boolean;
}

const DEFAULTS: Settings = {
  proxyEnabled: false,
  proxyUrl: "http://127.0.0.1:8080",
  dns: "cloudflare",
  offlineMode: false,
  activeProfile: "Default",
  launchOnStartup: false,
  minimizeToTray: true,
  showUpdateBadge: true,
  zeroTelemetry: true,
  encryptedStorage: true,
  blockTrackers: true,
  hardwareAccel: true,
  preloadAssets: true,
  reduceMotion: false,
  cacheSaving: true,
  lazyLoadImages: true,
  compressUploads: false,
};

function localLoad(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("chopcord-settings") || "{}") };
  } catch { return DEFAULTS; }
}

function localSave(s: Settings) {
  localStorage.setItem("chopcord-settings", JSON.stringify(s));
}

export function useSettings() {
  const [settings, setSettingsRaw] = useState<Settings>(localLoad);
  const [loaded, setLoaded] = useState(false);

  // On mount, try to load from Electron disk (overrides localStorage)
  useEffect(() => {
    if (window.chopcord?.loadSettings) {
      window.chopcord.loadSettings().then((data) => {
        if (data && Object.keys(data).length > 0) {
          setSettingsRaw((prev) => ({ ...prev, ...data }));
        }
        setLoaded(true);
      });
    } else {
      setLoaded(true);
    }
  }, []);

  const setSettings = useCallback((updater: Partial<Settings> | ((prev: Settings) => Settings)) => {
    setSettingsRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      localSave(next);
      window.chopcord?.saveSettings?.(next);
      return next;
    });
  }, []);

  return { settings, setSettings, loaded };
}
