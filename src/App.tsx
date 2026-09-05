import { useState, useRef, useEffect, useCallback } from "react";
import SplashScreen from "./components/SplashScreen";
import ChopPanel from "./components/ChopPanel";
import { useConnection } from "./hooks/useConnection";
import { useSettings } from "./hooks/useSettings";

export type Panel = "downloads" | "proxy" | "profiles" | "cache" | "settings" | null;
export type ConnectionStatus = "online" | "offline" | "connecting";

declare global {
  interface Window {
    chopcord?: {
      __chopCordShell: true;
      discordPreloadPath: string;
      minimize: () => void;
      maximize: () => void;
      close:    () => void;
      loadSettings: () => Promise<Record<string, unknown>>;
      saveSettings: (data: unknown) => Promise<{ ok: boolean }>;
      setProxy:  (opts: { enabled: boolean; url: string }) => Promise<{ ok: boolean }>;
      testProxy: (opts: { url: string }) => Promise<{ ok: boolean; latency: number }>;
      ping:      () => Promise<{ online: boolean; latency: number }>;
      listDownloads:    () => Promise<DownloadFile[]>;
      openDownload:     (p: string) => Promise<void>;
      revealDownload:   (p: string) => Promise<void>;
      deleteDownload:   (p: string) => Promise<{ ok: boolean }>;
      openDownloadsDir: () => Promise<void>;
      downloadURL:      (u: string) => Promise<{ ok: boolean }>;
      cacheStats: () => Promise<{ totalSize: number; count: number }>;
      clearCache: () => Promise<{ ok: boolean }>;
      onLoginState:       (cb: (v: boolean)                           => void) => () => void;
      onDownloadStarted:  (cb: (v: DLEvent)                           => void) => () => void;
      onDownloadProgress: (cb: (v: DLProgressEvent)                   => void) => () => void;
      onDownloadDone:     (cb: (v: DLDoneEvent)                       => void) => () => void;
    };
  }
}

export interface DownloadFile {
  name: string; size: number; path: string; mtime: number;
}
export interface DLEvent         { id: string; name: string; totalBytes: number }
export interface DLProgressEvent { id: string; name: string; received: number; total: number; speed: number }
export interface DLDoneEvent     { id: string; name: string; filePath: string; state: string; totalBytes: number }

// Evaluated once at module load — always correct in Electron because the
// preload runs synchronously before any JS in the renderer executes.
const isElectron         = typeof window !== "undefined" && !!window.chopcord;
const discordPreloadPath = window.chopcord?.discordPreloadPath ?? "";

export default function App() {
  const [splashDone,    setSplashDone]    = useState(false);
  const [activePanel,   setActivePanel]   = useState<Panel>(null);
  const [loggedIn,      setLoggedIn]      = useState<boolean | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);
  const [isOffline,     setIsOffline]     = useState(false);
  // Re-check after mount in case the module-level constant ran before the preload settled
  const [electronReady, setElectronReady] = useState(isElectron);
  const webviewRef = useRef<HTMLElement | null>(null);
  // Stable handler refs so the callback ref can use them without stale closures
  const ipcHandlerRef = useRef<((e: any) => void) | null>(null);

  useEffect(() => {
    setElectronReady(!!window.chopcord);
  }, []);

  const { status: connection } = useConnection();
  const { settings, setSettings, loaded } = useSettings();

  // Auto offline mode — when connection drops, go offline; recover when back
  useEffect(() => {
    if (connection === "offline") setIsOffline(true);
    if (connection === "online")  setIsOffline(false);
  }, [connection]);

  // Listen for login state events from main process
  useEffect(() => {
    return window.chopcord?.onLoginState?.((v) => setLoggedIn(v));
  }, []);

  // Download toast
  useEffect(() => {
    const unsub = window.chopcord?.onDownloadDone?.((info) => {
      if (info.state === "completed") {
        setToast(`↓ Saved: ${info.name}`);
        setTimeout(() => setToast(null), 4000);
      }
    });
    return unsub;
  }, []);

  // Apply proxy on change
  useEffect(() => {
    if (!loaded) return;
    window.chopcord?.setProxy({ enabled: settings.proxyEnabled, url: settings.proxyUrl });
  }, [settings.proxyEnabled, settings.proxyUrl, loaded]);

  // Always-current IPC handler (avoids stale closure in callback ref)
  ipcHandlerRef.current = (e: any) => {
    const { channel, args } = e;
    if (channel === "chopcord:download" && args?.[0]) {
      window.chopcord?.downloadURL(args[0]);
    }
    if (channel === "chopcord:panel") {
      setActivePanel(args?.[0] ?? null);
    }
  };

  // Callback ref — attaches events the moment the webview node is in the DOM
  const attachWebview = useCallback((node: HTMLElement | null) => {
    const prev = webviewRef.current as any;
    if (prev) {
      prev.__cc_onNav   && prev.removeEventListener("did-navigate",    prev.__cc_onNav);
      prev.__cc_onLoad  && prev.removeEventListener("did-finish-load", prev.__cc_onLoad);
      prev.__cc_onIpc   && prev.removeEventListener("ipc-message",     prev.__cc_onIpc);
    }

    webviewRef.current = node;
    if (!node) return;
    const wv = node as any;

    const onNav = (e: any) => {
      const url: string = e.url || "";
      setLoggedIn(!url.includes("/login") && !url.includes("/register"));
    };
    const onLoad = () => {
      wv.executeJavaScript?.("window.location.pathname").then((p: string) => {
        setLoggedIn(!p.startsWith("/login") && !p.startsWith("/register"));
      }).catch(() => {});
    };
    const onIpc = (e: any) => ipcHandlerRef.current?.(e);

    wv.__cc_onNav  = onNav;
    wv.__cc_onLoad = onLoad;
    wv.__cc_onIpc  = onIpc;

    wv.addEventListener("did-navigate",    onNav);
    wv.addEventListener("did-finish-load", onLoad);
    wv.addEventListener("ipc-message",     onIpc);
  }, []);

  // Sync active panel indicator back into the webview sidebar
  const notifyWebviewPanel = useCallback((panel: Panel) => {
    const wv = webviewRef.current as any;
    wv?.send?.("chopcord:panel-changed", panel);
  }, []);

  const handleSetPanel = useCallback((panel: Panel) => {
    setActivePanel(panel);
    notifyWebviewPanel(panel);
  }, [notifyWebviewPanel]);

  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />;

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        width: "100vw", height: "100vh",
        background: "var(--color-background)",
        fontFamily: "var(--font-ui)",
        overflow: "hidden",
        animation: "chop-fadein 0.35s ease",
      }}
    >
      <style>{`
        @keyframes chop-fadein {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chop-toast-in {
          from { opacity: 0; transform: translateY(8px) translateX(-50%); }
          to   { opacity: 1; transform: translateY(0)  translateX(-50%); }
        }
      `}</style>

      {/* Title bar — app chrome in Electron, minimal site nav on landing page */}
      {electronReady ? (
        <TitleBar
          connection={connection}
          proxyEnabled={settings.proxyEnabled}
          setProxyEnabled={(v) => setSettings({ proxyEnabled: v })}
          isOffline={isOffline}
          electronReady={electronReady}
          activeProfile={settings.activeProfile}
          activePanel={activePanel}
          setActivePanel={handleSetPanel}
        />
      ) : (
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 28px", height: 52, flexShrink: 0,
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ChopLogo size={22} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--color-text)", letterSpacing: "-0.02em" }}>
              Chop<span style={{ color: "var(--color-primary)" }}>Cord</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href="https://github.com/saeedmasoudie/chopcord" target="_blank" rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 13, fontWeight: 600,
                color: "var(--color-text-muted)", textDecoration: "none",
                padding: "5px 10px", borderRadius: 7,
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--color-text)"; e.currentTarget.style.background = "var(--color-surface-2)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.background = "transparent"; }}
            >
              GitHub
            </a>
            <a href="https://github.com/saeedmasoudie/chopcord/releases" target="_blank" rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 13, fontWeight: 700,
                background: "var(--color-primary)", color: "#fff", textDecoration: "none",
                padding: "6px 14px", borderRadius: 8,
                boxShadow: "0 2px 10px rgba(88,101,242,0.35)",
              }}
            >
              Download
            </a>
          </div>
        </nav>
      )}

      {/* Main layout */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
          {electronReady ? (
            <webview
              ref={attachWebview as any}
              src="https://discord.com/app"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
              partition={`persist:chopcord-${settings.activeProfile.toLowerCase().replace(/\s+/g, "-")}`}
              preload={discordPreloadPath}
              useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
              allowpopups={true as any}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}>
              <LandingPage />
            </div>
          )}

          {isOffline && electronReady && (
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              zIndex: 100,
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8,
              background: "rgba(250,166,26,0.12)",
              borderBottom: "1px solid rgba(250,166,26,0.35)",
              backdropFilter: "blur(4px)",
              padding: "6px 16px",
              fontSize: 12, fontWeight: 600, color: "#faa61a",
              fontFamily: "var(--font-mono)",
              animation: "chop-fadein 0.2s ease",
              pointerEvents: "none",
            }}>
              <span style={{ fontSize: 10 }}>●</span>
              You are offline — browsing cached content
            </div>
          )}
        </div>

        {activePanel && (
          <ChopPanel
            panel={activePanel}
            setPanel={handleSetPanel}
            settings={settings}
            setSettings={setSettings}
          />
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%",
          transform: "translateX(-50%)",
          background: "var(--color-surface-3)",
          border: "1px solid var(--color-accent)",
          color: "var(--color-accent)",
          fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600,
          padding: "8px 18px", borderRadius: 8,
          zIndex: 9999, pointerEvents: "none",
          animation: "chop-toast-in 0.2s ease",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Title bar ──────────────────────────────────────────────────────────────

const TOOLS: { id: Panel; icon: string; label: string }[] = [
  { id: "downloads", icon: "↓", label: "Downloads" },
  { id: "cache",     icon: "⬡", label: "Cache"     },
  { id: "proxy",     icon: "⇌", label: "Proxy"     },
  { id: "profiles",  icon: "◉", label: "Profiles"  },
  { id: "settings",  icon: "⊙", label: "Settings"  },
];

function TitleBar({ connection, proxyEnabled, setProxyEnabled, isOffline, electronReady, activeProfile, activePanel, setActivePanel }: {
  connection: ConnectionStatus;
  proxyEnabled: boolean;
  setProxyEnabled: (v: boolean) => void;
  isOffline: boolean;
  electronReady: boolean;
  activeProfile: string;
  activePanel: Panel;
  setActivePanel: (p: Panel) => void;
}) {
  const connColor = connection === "online" ? "var(--color-accent)" : connection === "connecting" ? "var(--color-warning)" : "var(--color-danger)";

  return (
    <div
      style={{
        height: 44, background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        display: "flex", alignItems: "center",
        paddingLeft: 14, paddingRight: 10, gap: 0,
        flexShrink: 0, userSelect: "none",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Logo + name */}
      <ChopLogo size={16} />
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", letterSpacing: "-0.01em", marginLeft: 7 }}>
        Chop<span style={{ color: "var(--color-primary)" }}>Cord</span>
      </span>

      {/* Connection dot — no ping text, just status */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 14 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: connColor,
          boxShadow: connection === "online" ? `0 0 5px ${connColor}` : undefined,
          transition: "background 0.4s, box-shadow 0.4s",
        }} />
        {isOffline && (
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-warning)", fontWeight: 600 }}>
            OFFLINE
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Tool buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {/* Proxy quick-toggle */}
        <button
          onClick={() => setProxyEnabled(!proxyEnabled)}
          title={proxyEnabled ? "Proxy ON — click to disable" : "Proxy OFF — click to enable"}
          style={{
            height: 28, padding: "0 10px", borderRadius: 6, border: "none", cursor: "pointer",
            background: proxyEnabled ? "rgba(88,101,242,0.18)" : "transparent",
            color: proxyEnabled ? "var(--color-primary)" : "var(--color-text-subtle)",
            fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em", transition: "all 0.15s",
            outline: proxyEnabled ? "1px solid rgba(88,101,242,0.4)" : "1px solid transparent",
          }}
        >
          PROXY {proxyEnabled ? "ON" : "OFF"}
        </button>

        <div style={{ width: 1, height: 18, background: "var(--color-border)", margin: "0 6px" }} />

        {/* Profile chip */}
        <button
          onClick={() => setActivePanel(activePanel === "profiles" ? null : "profiles")}
          title="Profiles"
          style={{
            height: 28, padding: "0 10px", borderRadius: 6, border: "none", cursor: "pointer",
            background: activePanel === "profiles" ? "var(--color-surface-3)" : "transparent",
            color: "var(--color-text-muted)", fontSize: 12,
            display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
            outline: activePanel === "profiles" ? "1px solid var(--color-border-strong)" : "1px solid transparent",
          }}
        >
          <span style={{ fontSize: 13 }}>◉</span>
          <span style={{ fontWeight: 600, fontSize: 11 }}>{activeProfile}</span>
        </button>

        <div style={{ width: 1, height: 18, background: "var(--color-border)", margin: "0 6px" }} />

        {/* Icon tool buttons */}
        {TOOLS.filter(t => t.id !== "profiles").map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActivePanel(activePanel === tool.id ? null : tool.id)}
            title={tool.label}
            style={{
              width: 32, height: 32, borderRadius: 7, border: "none", cursor: "pointer",
              background: activePanel === tool.id ? "var(--color-primary-dim)" : "transparent",
              color: activePanel === tool.id ? "var(--color-primary)" : "var(--color-text-subtle)",
              fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
              outline: activePanel === tool.id ? "1px solid rgba(88,101,242,0.3)" : "1px solid transparent",
            }}
            onMouseEnter={e => { if (activePanel !== tool.id) (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-3)"; }}
            onMouseLeave={e => { if (activePanel !== tool.id) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            {tool.icon}
          </button>
        ))}

        <div style={{ width: 1, height: 18, background: "var(--color-border)", margin: "0 4px" }} />
        <WindowControls active={electronReady} />
      </div>
    </div>
  );
}

// ── Window Controls ────────────────────────────────────────────────────────

function WindowControls({ active }: { active: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const btns = [
    {
      label: "Minimize",
      action: () => window.chopcord?.minimize(),
      icon: (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <line x1="1" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: "Maximize",
      action: () => window.chopcord?.maximize(),
      icon: (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        </svg>
      ),
    },
    {
      label: "Close",
      action: () => window.chopcord?.close(),
      close: true,
      icon: (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
  ];

  return (
    <>
      <style>{`
        .wc-winwrap { display:flex; align-items:stretch; margin-left:8px; height:100%; }
        .wc-win {
          width:46px; height:100%; min-height:32px;
          border:none; padding:0;
          background: transparent;
          display:flex; align-items:center; justify-content:center;
          color: rgba(255,255,255,0.45);
          transition: background 0.12s ease, color 0.1s ease;
          cursor:pointer; flex-shrink:0;
          -webkit-app-region: no-drag;
        }
        .wc-win svg { display:block; transition: opacity 0.1s ease; }
        .wc-win:hover {
          background: rgba(255,255,255,0.11);
          color: #ffffff;
        }
        .wc-win:active {
          background: rgba(255,255,255,0.18);
          color: #ffffff;
        }
        .wc-close:hover {
          background: #c42b1c;
          color: #ffffff;
        }
        .wc-close:active {
          background: #a32013;
          color: #ffffff;
        }
      `}</style>
      <div className="wc-winwrap">
        {btns.map((btn, i) => (
          <button
            key={i}
            className={`wc-win${btn.close ? " wc-close" : ""}`}
            onClick={active ? btn.action : undefined}
            title={btn.label}
            style={{ opacity: active ? 1 : 0.3, cursor: active ? "pointer" : "default" }}
          >
            {btn.icon}
          </button>
        ))}
      </div>
    </>
  );
}

// ── Browser fallback ───────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "↓",
    title: "Download Manager",
    desc: "Intercepts every file, image, and video link. Progress bars, folder reveal, one-click open — all built in.",
    color: "#5865f2",
  },
  {
    icon: "⇌",
    title: "Proxy & DNS",
    desc: "Route traffic through any SOCKS5 or HTTP proxy. Switch DNS to Cloudflare or Google with one click.",
    color: "#23d18b",
  },
  {
    icon: "📡",
    title: "Offline Mode",
    desc: "Lose your connection? ChopCord skips Discord's loading screen and lets you scroll cached content.",
    color: "#faa61a",
  },
  {
    icon: "⬡",
    title: "Smart Cache",
    desc: "Images and videos you've seen are cached locally. Bandwidth saved, load times cut.",
    color: "#5865f2",
  },
  {
    icon: "◉",
    title: "Multi-Profile",
    desc: "Switch between Discord accounts or identities instantly — each profile keeps its own session.",
    color: "#23d18b",
  },
  {
    icon: "🎨",
    title: "Custom Theme",
    desc: "ChopCord's dark theme is injected directly into Discord's UI. Clean, minimal, fast.",
    color: "#f04747",
  },
];

function LandingPage() {
  return (
    <div style={{
      flex: 1, overflowY: "auto", overflowX: "hidden",
      background: "var(--color-background)",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @keyframes lp-float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes lp-in {
          from { opacity:0; transform:translateY(18px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .feature-card:hover {
          border-color: rgba(88,101,242,0.35) !important;
          background: rgba(88,101,242,0.06) !important;
          transform: translateY(-2px);
        }
        .dl-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .dl-btn:active { transform: translateY(0); }
      `}</style>

      {/* Hero */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "72px 40px 56px",
        animation: "lp-in 0.6s ease both",
        position: "relative", overflow: "hidden",
      }}>
        {/* Glow blobs */}
        <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 500, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(88,101,242,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ animation: "lp-float 4s ease-in-out infinite", marginBottom: 28 }}>
          <ChopLogo size={72} />
        </div>

        <h1 style={{ margin: "0 0 10px", fontSize: 52, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--color-text)", lineHeight: 1.1, textAlign: "center" }}>
          Chop<span style={{ color: "var(--color-primary)" }}>Cord</span>
        </h1>
        <p style={{ margin: "0 0 8px", fontSize: 18, color: "var(--color-text-muted)", fontWeight: 400, textAlign: "center", maxWidth: 480, lineHeight: 1.6 }}>
          The Discord desktop client that puts you in control.
        </p>
        <p style={{ margin: "0 0 36px", fontSize: 13, color: "var(--color-text-subtle)", fontFamily: "var(--font-mono)", textAlign: "center" }}>
          Open source · Privacy-first · Windows / macOS / Linux
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <a
            href="https://github.com/saeedmasoudie/chopcord/releases"
            target="_blank"
            rel="noreferrer"
            className="dl-btn"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "var(--color-primary)", color: "#fff",
              padding: "11px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
              textDecoration: "none", transition: "opacity 0.15s, transform 0.15s",
              boxShadow: "0 4px 20px rgba(88,101,242,0.4)",
            }}
          >
            ↓  Download for Desktop
          </a>
          <a
            href="https://github.com/saeedmasoudie/chopcord"
            target="_blank"
            rel="noreferrer"
            className="dl-btn"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "var(--color-surface-3)", color: "var(--color-text)",
              padding: "11px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
              textDecoration: "none", transition: "opacity 0.15s, transform 0.15s",
              border: "1px solid var(--color-border-strong)",
            }}
          >
            ⭐  View on GitHub
          </a>
        </div>

        {/* Terminal launch hint */}
        <div style={{
          marginTop: 28, background: "var(--color-surface-2)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: 10, padding: "10px 20px",
          fontFamily: "var(--font-mono)", fontSize: 12,
          color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ color: "var(--color-text-subtle)" }}>or run locally →</span>
          <span style={{ color: "var(--color-accent)" }}>npm run chopcord:dev</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: "100%", height: 1, background: "var(--color-border)" }} />

      {/* Features grid */}
      <div style={{ padding: "52px 40px 64px", display: "flex", flexDirection: "column", alignItems: "center", animation: "lp-in 0.6s 0.15s ease both" }}>
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.16em", color: "var(--color-text-subtle)", marginBottom: 12, textTransform: "uppercase" }}>
          Everything you need
        </div>
        <h2 style={{ margin: "0 0 40px", fontSize: 30, fontWeight: 700, color: "var(--color-text)", letterSpacing: "-0.02em", textAlign: "center" }}>
          Discord — your way
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16, width: "100%", maxWidth: 900,
        }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="feature-card"
              style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 14, padding: "22px 22px",
                transition: "border-color 0.2s, background 0.2s, transform 0.2s",
                cursor: "default",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${f.color}18`,
                border: `1px solid ${f.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, marginBottom: 14,
              }}>
                {f.icon}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid var(--color-border)",
        padding: "20px 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ChopLogo size={14} />
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>ChopCord v2.0 · by saeedmasoudie</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {[
            ["GitHub", "https://github.com/saeedmasoudie/chopcord"],
            ["Releases", "https://github.com/saeedmasoudie/chopcord/releases"],
            ["Issues", "https://github.com/saeedmasoudie/chopcord/issues"],
          ].map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: "var(--color-text-subtle)", textDecoration: "none", transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-muted)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-subtle)")}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChopLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 2v20M3 7l9 5 9-5" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.4" />
    </svg>
  );
}
