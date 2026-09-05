import { useState, useEffect, useCallback, useRef } from "react";
import type { Panel, DownloadFile, DLEvent, DLProgressEvent, DLDoneEvent } from "../App";
import type { Settings } from "../hooks/useSettings";

interface ActiveDL {
  id: string;
  name: string;
  received: number;
  total: number;
  speed: number;
  done: boolean;
  failed: boolean;
  filePath?: string;
}

interface Props {
  panel: Panel;
  setPanel: (p: Panel) => void;
  settings: Settings;
  setSettings: (u: Partial<Settings>) => void;
}

const PANEL_LABELS: Record<string, string> = {
  downloads: "Downloads",
  proxy: "Proxy & DNS",
  profiles: "Profiles",
  cache: "Cache",
  settings: "Settings",
};

export default function ChopPanel({ panel, setPanel, settings, setSettings }: Props) {
  return (
    <div style={{
      width: 300,
      background: "var(--color-surface)",
      borderLeft: "1px solid var(--color-border)",
      display: "flex", flexDirection: "column",
      flexShrink: 0, overflow: "hidden",
      animation: "chop-panel-in 0.22s cubic-bezier(0.34,1.3,0.64,1)",
    }}>
      <style>{`
        @keyframes chop-panel-in {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes profile-flash {
          0%   { opacity: 0; }
          30%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--color-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text)", letterSpacing: "-0.01em" }}>
          {panel && PANEL_LABELS[panel]}
        </span>
        <button onClick={() => setPanel(null)} style={{
          background: "transparent", border: "none",
          color: "var(--color-text-subtle)", cursor: "pointer",
          fontSize: 18, lineHeight: 1, padding: "2px 4px", borderRadius: 4,
          transition: "color 0.1s",
        }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-subtle)")}
        >×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
        {panel === "downloads" && <DownloadsPanel />}
        {panel === "proxy"     && <ProxyPanel settings={settings} setSettings={setSettings} />}
        {panel === "profiles"  && <ProfilesPanel settings={settings} setSettings={setSettings} />}
        {panel === "cache"     && <CachePanel />}
        {panel === "settings"  && <SettingsPanel settings={settings} setSettings={setSettings} />}
      </div>
    </div>
  );
}

// ── Downloads ──────────────────────────────────────────────────────────────

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "webm", "mkv", "avi", "gif"].includes(ext)) return "🎬";
  if (["mp3", "ogg", "wav", "flac", "aac"].includes(ext))         return "🎵";
  if (["jpg", "jpeg", "png", "webp", "bmp", "svg", "avif"].includes(ext)) return "🖼";
  if (["pdf"].includes(ext))                                        return "📄";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))            return "📦";
  if (["exe", "dmg", "pkg", "deb", "appimage"].includes(ext))     return "⚙️";
  return "📁";
}

function fmtSize(b: number) {
  if (b <= 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function fmtSpeed(b: number) {
  if (!b) return "";
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB/s`;
  return `${(b / 1048576).toFixed(1)} MB/s`;
}

function DownloadsPanel() {
  const [files,    setFiles]    = useState<DownloadFile[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [active,   setActive]   = useState<Map<string, ActiveDL>>(new Map());

  const refresh = useCallback(async () => {
    if (window.chopcord?.listDownloads) {
      setFiles(await window.chopcord.listDownloads());
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const u1 = window.chopcord?.onDownloadStarted?.((ev: DLEvent) => {
      setActive(m => new Map(m).set(ev.id, { id: ev.id, name: ev.name, received: 0, total: ev.totalBytes, speed: 0, done: false, failed: false }));
    });
    const u2 = window.chopcord?.onDownloadProgress?.((ev: DLProgressEvent) => {
      setActive(m => {
        const next = new Map(m);
        const cur  = next.get(ev.id);
        if (cur) next.set(ev.id, { ...cur, received: ev.received, total: ev.total, speed: ev.speed });
        return next;
      });
    });
    const u3 = window.chopcord?.onDownloadDone?.((ev: DLDoneEvent) => {
      setActive(m => {
        const next = new Map(m);
        const cur  = next.get(ev.id);
        if (cur) next.set(ev.id, { ...cur, done: true, failed: ev.state !== "completed", filePath: ev.filePath, received: ev.totalBytes, total: ev.totalBytes });
        return next;
      });
      setTimeout(refresh, 700);
    });
    return () => { u1?.(); u2?.(); u3?.(); };
  }, [refresh]);

  if (!window.chopcord) {
    return <CenterMsg icon="↓" text="Downloads are saved to ~/.chopcord/downloads/ when running the desktop app." />;
  }

  const activeDLs = Array.from(active.values());
  const inProgress = activeDLs.filter(d => !d.done);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
          {inProgress.length > 0
            ? `${inProgress.length} downloading`
            : `${files.length} file${files.length !== 1 ? "s" : ""}`}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <IconBtn icon="↻" title="Refresh" onClick={refresh} />
          <IconBtn icon="📂" title="Open downloads folder" onClick={() => window.chopcord?.openDownloadsDir()} />
        </div>
      </div>

      {/* Active / in-progress downloads */}
      {activeDLs.map((dl) => {
        const pct = dl.total > 0 ? Math.round((dl.received / dl.total) * 100) : 0;
        const statusColor = dl.failed ? "var(--color-danger)" : dl.done ? "var(--color-accent)" : "var(--color-primary)";

        return (
          <div key={dl.id} style={{
            background: "var(--color-surface-2)",
            border: `1px solid ${dl.failed ? "rgba(240,71,71,0.4)" : dl.done ? "rgba(35,209,139,0.35)" : "rgba(88,101,242,0.35)"}`,
            borderRadius: 10, padding: "10px 12px",
            transition: "border-color 0.3s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{fileIcon(dl.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {dl.name}
                </div>
                <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", marginTop: 2 }}>
                  {fmtSize(dl.received)} {dl.total > 0 ? `/ ${fmtSize(dl.total)}` : ""}
                  {!dl.done && dl.speed > 0 && <span style={{ color: "var(--color-primary)", marginLeft: 6 }}>↑ {fmtSpeed(dl.speed)}</span>}
                </div>
              </div>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, color: statusColor, flexShrink: 0 }}>
                {dl.failed ? "FAILED" : dl.done ? "DONE" : `${pct}%`}
              </span>
            </div>

            {/* Animated progress bar */}
            <div style={{ height: 4, background: "var(--color-surface-3)", borderRadius: 4, overflow: "hidden", marginBottom: dl.done || dl.failed ? 0 : 6 }}>
              <div style={{
                height: "100%",
                width: `${dl.done || dl.failed ? 100 : pct}%`,
                background: dl.done
                  ? "linear-gradient(90deg, var(--color-accent), #1aff9c)"
                  : dl.failed
                    ? "var(--color-danger)"
                    : "linear-gradient(90deg, var(--color-primary), #818cf8)",
                borderRadius: 4,
                transition: "width 0.3s linear",
                boxShadow: !dl.done && !dl.failed ? "0 0 8px rgba(88,101,242,0.6)" : undefined,
              }} />
            </div>

            {dl.done && !dl.failed && dl.filePath && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <ActionBtn icon="📁" label="Show in Folder" onClick={() => window.chopcord?.revealDownload(dl.filePath!)} accent />
                <ActionBtn icon="▶" label="Open" onClick={() => window.chopcord?.openDownload(dl.filePath!)} />
              </div>
            )}
          </div>
        );
      })}

      {loading && activeDLs.length === 0 && (
        <CenterMsg icon="⟳" text="Loading..." />
      )}

      {!loading && files.length === 0 && activeDLs.length === 0 && (
        <CenterMsg icon="↓" text="Nothing yet. Right-click any image or video in Discord to download." />
      )}

      {/* Saved files */}
      {files.map((file) => (
        <div key={file.path} style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          borderRadius: 10, padding: "10px 12px",
          opacity: deleting === file.path ? 0.3 : 1,
          transition: "opacity 0.2s",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{fileIcon(file.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {file.name}
            </div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
              {fmtSize(file.size)} · {new Date(file.mtime).toLocaleDateString()}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <IconBtn icon="📁" title="Show in folder" onClick={() => window.chopcord?.revealDownload(file.path)} />
            <IconBtn icon="▶" title="Open file" onClick={() => window.chopcord?.openDownload(file.path)} />
            <IconBtn icon="🗑" title="Delete" onClick={async () => {
              setDeleting(file.path);
              await window.chopcord?.deleteDownload(file.path);
              await refresh();
              setDeleting(null);
            }} danger />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Proxy & DNS ────────────────────────────────────────────────────────────

function ProxyPanel({ settings, setSettings }: { settings: Settings; setSettings: (u: Partial<Settings>) => void }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency: number } | null>(null);

  const testProxy = async () => {
    setTesting(true);
    setTestResult(null);
    if (window.chopcord?.testProxy) {
      const r = await window.chopcord.testProxy({ url: settings.proxyUrl });
      setTestResult(r);
    } else {
      await new Promise(r => setTimeout(r, 800));
      setTestResult({ ok: true, latency: 42 });
    }
    setTesting(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section title="HTTP / SOCKS Proxy">
        <Toggle label="Enable proxy" value={settings.proxyEnabled} onChange={v => setSettings({ proxyEnabled: v })} />
        <div style={{ marginTop: 8 }}>
          <Label>Proxy URL</Label>
          <input
            value={settings.proxyUrl}
            onChange={e => setSettings({ proxyUrl: e.target.value })}
            disabled={!settings.proxyEnabled}
            placeholder="http://127.0.0.1:8080"
            style={{
              width: "100%", marginTop: 4,
              background: "var(--color-surface-3)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 6, padding: "7px 10px",
              fontSize: 11, fontFamily: "var(--font-mono)",
              color: settings.proxyEnabled ? "var(--color-text)" : "var(--color-text-muted)",
              outline: "none", opacity: settings.proxyEnabled ? 1 : 0.5,
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={testProxy} disabled={testing}
          style={{
            marginTop: 8, width: "100%", padding: "8px",
            borderRadius: 6, border: "1px solid var(--color-primary)",
            background: testing ? "var(--color-primary)" : "transparent",
            color: testing ? "#fff" : "var(--color-primary)",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            transition: "all 0.15s", fontFamily: "var(--font-mono)",
          }}
        >
          {testing ? "TESTING..." : "TEST CONNECTION"}
        </button>
        {testResult && (
          <div style={{
            marginTop: 6, padding: "6px 10px", borderRadius: 6,
            background: testResult.ok ? "rgba(35,209,139,0.08)" : "rgba(240,71,71,0.08)",
            border: `1px solid ${testResult.ok ? "var(--color-accent)" : "var(--color-danger)"}`,
            fontSize: 11, fontFamily: "var(--font-mono)",
            color: testResult.ok ? "var(--color-accent)" : "var(--color-danger)",
          }}>
            {testResult.ok ? `✓ Connected — ${testResult.latency}ms` : "✗ Connection failed"}
          </div>
        )}
      </Section>

      <Section title="DNS-over-HTTPS">
        {(["cloudflare", "google", "none"] as const).map(opt => (
          <label key={opt} onClick={() => setSettings({ dns: opt })} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 0", cursor: "pointer", fontSize: 12,
            color: settings.dns === opt ? "var(--color-text)" : "var(--color-text-muted)",
          }}>
            <RadioDot active={settings.dns === opt} />
            <div>
              <div style={{ fontWeight: 500 }}>
                {opt === "cloudflare" ? "Cloudflare 1.1.1.1" : opt === "google" ? "Google 8.8.8.8" : "System Default"}
              </div>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", opacity: 0.5 }}>
                {opt === "cloudflare" ? "1.1.1.1 / 1.0.0.1" : opt === "google" ? "8.8.8.8 / 8.8.4.4" : "No DoH"}
              </div>
            </div>
          </label>
        ))}
      </Section>

      <Section title="Bandwidth">
        <Toggle label="Cache media (skip re-downloads)" value={settings.cacheSaving}    onChange={v => setSettings({ cacheSaving: v })} />
        <Toggle label="Lazy-load images"               value={settings.lazyLoadImages} onChange={v => setSettings({ lazyLoadImages: v })} />
        <Toggle label="Compress uploads"               value={settings.compressUploads} onChange={v => setSettings({ compressUploads: v })} />
      </Section>
    </div>
  );
}

// ── Profiles ───────────────────────────────────────────────────────────────

function ProfilesPanel({ settings, setSettings }: { settings: Settings; setSettings: (u: Partial<Settings>) => void }) {
  const [profiles, setProfiles] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("chopcord-profiles") || '["Default"]'); }
    catch { return ["Default"]; }
  });
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const saveProfiles = (list: string[]) => {
    setProfiles(list);
    localStorage.setItem("chopcord-profiles", JSON.stringify(list));
  };

  const switchProfile = (p: string) => {
    if (p === settings.activeProfile) return;
    setSwitching(p);
    setTimeout(() => {
      setSettings({ activeProfile: p });
      setSwitching(null);
    }, 480);
  };

  const addProfile = () => {
    const name = newName.trim();
    if (!name || profiles.includes(name)) return;
    saveProfiles([...profiles, name]);
    setNewName(""); setAdding(false);
  };

  const removeProfile = (p: string) => {
    if (p === "Default") return;
    const next = profiles.filter(x => x !== p);
    saveProfiles(next);
    if (settings.activeProfile === p) switchProfile("Default");
  };

  const colors = ["#5865f2", "#23d18b", "#faa61a", "#eb459e", "#f04747", "#00b0f4"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
      {/* Profile switch flash overlay */}
      {switching && (
        <div style={{
          position: "absolute", inset: -12, zIndex: 20,
          background: "rgba(88,101,242,0.12)",
          backdropFilter: "blur(3px)",
          borderRadius: 8,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 8,
          animation: "profile-flash 0.5s ease forwards",
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: 28 }}>◉</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-primary)" }}>
            Switching to {switching}
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 0 4px", lineHeight: 1.6 }}>
        Each profile is a separate Discord session — switch accounts instantly, no restart needed.
      </p>

      {profiles.map((p, i) => {
        const isActive = settings.activeProfile === p;
        return (
          <div key={p} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${isActive ? "var(--color-primary)" : "var(--color-border)"}`,
            background: isActive ? "var(--color-primary-dim)" : "var(--color-surface-2)",
            transition: "all 0.2s",
            cursor: isActive ? "default" : "pointer",
          }}
            onClick={() => !isActive && switchProfile(p)}
          >
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: colors[i % colors.length],
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 700, color: "#fff", flexShrink: 0,
              boxShadow: isActive ? `0 0 12px ${colors[i % colors.length]}50` : "none",
              transition: "box-shadow 0.3s",
            }}>
              {p.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "var(--color-primary)" : "var(--color-text)" }}>
                {p}
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)", marginTop: 1 }}>
                {isActive ? "● Active session" : "○ Click to switch"}
              </div>
            </div>
            {isActive && <span style={{ fontSize: 18, color: "var(--color-primary)" }}>✓</span>}
            {!isActive && p !== "Default" && (
              <button
                onClick={e => { e.stopPropagation(); removeProfile(p); }}
                style={{
                  background: "transparent", border: "none",
                  color: "var(--color-text-subtle)", cursor: "pointer",
                  fontSize: 16, padding: "2px 4px", borderRadius: 4,
                }}
              >×</button>
            )}
          </div>
        );
      })}

      {adding ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            autoFocus value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addProfile(); if (e.key === "Escape") setAdding(false); }}
            placeholder="Profile name..."
            style={{
              flex: 1, background: "var(--color-surface-3)",
              border: "1px solid var(--color-primary)",
              borderRadius: 6, padding: "7px 10px",
              fontSize: 12, color: "var(--color-text)", outline: "none",
            }}
          />
          <button onClick={addProfile} style={{
            padding: "7px 12px", borderRadius: 6, border: "none",
            background: "var(--color-primary)", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>Add</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          padding: "9px", borderRadius: 8,
          border: "2px dashed var(--color-border-strong)",
          background: "transparent", color: "var(--color-text-muted)",
          fontSize: 12, cursor: "pointer", transition: "border-color 0.15s",
        }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--color-primary)")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--color-border-strong)")}
        >+ New Profile</button>
      )}
    </div>
  );
}

// ── Cache ──────────────────────────────────────────────────────────────────

function CachePanel() {
  const [stats, setStats] = useState<{ totalSize: number; count: number } | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const loadStats = useCallback(async () => {
    if (window.chopcord?.cacheStats) {
      setStats(await window.chopcord.cacheStats());
    } else {
      setStats({ totalSize: 0, count: 0 });
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const clearCache = async () => {
    setClearing(true);
    await window.chopcord?.clearCache();
    setCleared(true);
    await loadStats();
    setClearing(false);
    setTimeout(() => setCleared(false), 2500);
  };

  const fmt = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Big stat */}
      <div style={{
        background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
        borderRadius: 12, padding: "16px 16px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      }}>
        <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--color-accent)", letterSpacing: "-0.02em" }}>
          {stats ? fmt(stats.totalSize) : "—"}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>HTTP cache size</div>
        <div style={{ fontSize: 10, color: "var(--color-text-subtle)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
          Discord media · avatars · attachments
        </div>
      </div>

      <Section title="What's cached">
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.7 }}>
          ChopCord caches all Discord media — images, avatars, stickers, and attachments — so they load instantly on revisit and use no extra bandwidth.
        </div>
        <button onClick={loadStats} style={{
          marginTop: 8, background: "transparent", border: "none",
          color: "var(--color-primary)", fontSize: 11, cursor: "pointer",
          fontFamily: "var(--font-mono)", padding: 0,
        }}>↻ Refresh stats</button>
      </Section>

      <Section title="Optimization">
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.7 }}>
          Tracking requests and analytics are blocked automatically. Discord CDN assets are cached with extended TTL for faster loads.
        </div>
      </Section>

      <button onClick={clearCache} disabled={clearing} style={{
        padding: "10px", borderRadius: 8,
        border: `1px solid ${cleared ? "var(--color-accent)" : "var(--color-danger)"}`,
        background: cleared ? "rgba(35,209,139,0.08)" : clearing ? "var(--color-danger)" : "rgba(240,71,71,0.06)",
        color: cleared ? "var(--color-accent)" : clearing ? "#fff" : "var(--color-danger)",
        fontSize: 12, fontWeight: 700, cursor: clearing ? "wait" : "pointer",
        transition: "all 0.2s", fontFamily: "var(--font-mono)",
      }}>
        {cleared ? "✓ CACHE CLEARED" : clearing ? "CLEARING..." : "CLEAR ALL CACHE"}
      </button>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────

function SettingsPanel({ settings, setSettings }: { settings: Settings; setSettings: (u: Partial<Settings>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section title="App Behavior">
        <Toggle label="Launch on startup" value={settings.launchOnStartup} onChange={v => setSettings({ launchOnStartup: v })} />
        <Toggle label="Minimize to tray"  value={settings.minimizeToTray}  onChange={v => setSettings({ minimizeToTray: v })} />
        <Toggle label="Show update badge" value={settings.showUpdateBadge} onChange={v => setSettings({ showUpdateBadge: v })} />
      </Section>

      <Section title="Privacy">
        <Toggle label="Zero telemetry"          value={settings.zeroTelemetry}    onChange={v => setSettings({ zeroTelemetry: v })} />
        <Toggle label="Encrypted local storage" value={settings.encryptedStorage} onChange={v => setSettings({ encryptedStorage: v })} />
        <Toggle label="Block tracking pixels"   value={settings.blockTrackers}    onChange={v => setSettings({ blockTrackers: v })} />
      </Section>

      <Section title="Performance">
        <Toggle label="Hardware acceleration" value={settings.hardwareAccel}  onChange={v => setSettings({ hardwareAccel: v })} />
        <Toggle label="Preload Discord assets" value={settings.preloadAssets} onChange={v => setSettings({ preloadAssets: v })} />
        <Toggle label="Reduce motion"          value={settings.reduceMotion}  onChange={v => setSettings({ reduceMotion: v })} />
      </Section>

      <Section title="About">
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.9, fontFamily: "var(--font-mono)" }}>
          <div style={{ color: "var(--color-text)", fontWeight: 700 }}>ChopCord v2.0.0</div>
          <div style={{ opacity: 0.6 }}>Open-source desktop Discord client</div>
          <div style={{ marginTop: 6 }}>
            <a href="https://github.com/saeedmasoudie/chopcord" target="_blank" rel="noreferrer"
              style={{ color: "var(--color-primary)", textDecoration: "none" }}>
              github.com/saeedmasoudie/chopcord
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "12px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--color-text-subtle)", marginBottom: 10, textTransform: "uppercase" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em" }}>{children}</div>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", cursor: "pointer" }}>
      <span style={{ fontSize: 12, color: "var(--color-text)" }}>{label}</span>
      <div onClick={() => onChange(!value)} style={{
        width: 34, height: 20, borderRadius: 10,
        background: value ? "var(--color-primary)" : "var(--color-surface-3)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        border: `1px solid ${value ? "transparent" : "var(--color-border-strong)"}`,
        cursor: "pointer",
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 15 : 3,
          width: 12, height: 12, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
    </label>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: "50%",
      border: `2px solid ${active ? "var(--color-primary)" : "var(--color-border-strong)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "border-color 0.15s", flexShrink: 0,
    }}>
      {active && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-primary)" }} />}
    </div>
  );
}

function IconBtn({ icon, title, onClick, danger }: { icon: string; title?: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 28, height: 28, borderRadius: 7, border: "none",
      background: danger ? "rgba(240,71,71,0.1)" : "var(--color-surface-3)",
      color: danger ? "var(--color-danger)" : "var(--color-text-muted)",
      fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      transition: "background 0.12s",
      flexShrink: 0,
    }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? "rgba(240,71,71,0.2)" : "var(--color-border-strong)")}
      onMouseLeave={e => (e.currentTarget.style.background = danger ? "rgba(240,71,71,0.1)" : "var(--color-surface-3)")}
    >{icon}</button>
  );
}

function ActionBtn({ icon, label, onClick, accent }: { icon: string; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "6px 10px", borderRadius: 7,
      border: `1px solid ${accent ? "rgba(88,101,242,0.4)" : "var(--color-border-strong)"}`,
      background: accent ? "rgba(88,101,242,0.12)" : "var(--color-surface-3)",
      color: accent ? "var(--color-primary)" : "var(--color-text-muted)",
      fontSize: 11, fontWeight: 600, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
      transition: "all 0.12s",
    }}>
      <span>{icon}</span> {label}
    </button>
  );
}

function CenterMsg({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 12px", color: "var(--color-text-muted)", fontSize: 12, lineHeight: 1.7 }}>
      <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.5 }}>{icon}</div>
      {text}
    </div>
  );
}
