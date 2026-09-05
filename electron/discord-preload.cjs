/* ============================================================
   ChopCord — Discord Webview Preload
   Runs inside discord.com's page context.
   ============================================================ */
const { ipcRenderer } = require("electron");

// ── 1. Suppress passkey / WebAuthn prompts ────────────────────
try {
  const _create = navigator.credentials.create.bind(navigator.credentials);
  const _get    = navigator.credentials.get.bind(navigator.credentials);
  Object.defineProperty(navigator, "credentials", {
    value: {
      ...navigator.credentials,
      create: (o) => o?.publicKey ? Promise.reject(new DOMException("Not allowed", "NotAllowedError")) : _create(o),
      get:    (o) => o?.publicKey ? Promise.reject(new DOMException("Not allowed", "NotAllowedError")) : _get(o),
    },
    writable: false, configurable: false,
  });
} catch (_) {}

// ── 1b. Suppress Discord's reconnecting / connection-lost UI ──
// Override navigator.onLine so Discord thinks it's always online,
// and intercept online/offline events so Discord never shows its overlay.
try {
  Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true });
  window.addEventListener("offline", (e) => { e.stopImmediatePropagation(); }, true);
  // Also hide any overlay Discord inserts after page load via a MutationObserver
} catch (_) {}

// ── 2. Styles ─────────────────────────────────────────────────
const style = document.createElement("style");
style.textContent = `
  /* ── Hide Discord native download / install app buttons ── */
  [class*="downloadLink"],
  [class*="nativeLink-"],
  [class*="downloadApp"],
  a[href*="/download"],
  [aria-label="Download Apps"],
  [aria-label="Download apps"] {
    display: none !important;
  }

  /* ── Hide Discord's reconnecting / connection lost overlays ── */
  [class*="connectionError"],
  [class*="reconnecting"],
  [class*="noInternet"],
  [class*="offline"],
  [aria-label*="connecting" i],
  [aria-label*="reconnect" i] {
    display: none !important;
  }

  /* ── ChopCord injected sidebar buttons ── */
  .cc-sidebar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
  }
  .cc-sep {
    width: 32px; height: 1px;
    background: rgba(255,255,255,0.08);
    margin: 4px 0;
  }
  .cc-tool {
    width: 48px; height: 48px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.55);
    font-size: 18px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: border-radius 0.15s, background 0.12s, color 0.12s;
    position: relative;
  }
  .cc-tool:hover {
    border-radius: 30%;
    background: rgba(88,101,242,0.18);
    color: #5865f2;
  }
  .cc-tool.cc-active {
    border-radius: 30%;
    background: rgba(88,101,242,0.22);
    color: #5865f2;
  }
  .cc-tool-tip {
    position: absolute;
    left: 58px;
    background: #18182c;
    border: 1px solid rgba(88,101,242,0.4);
    color: #e2e2f0;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 5px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 99999;
    font-family: 'Outfit', system-ui, sans-serif;
  }
  .cc-tool:hover .cc-tool-tip { opacity: 1; }

  /* Download badge on tool button */
  .cc-badge {
    position: absolute;
    top: 2px; right: 2px;
    min-width: 16px; height: 16px;
    border-radius: 8px;
    background: #5865f2;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px;
    font-family: 'JetBrains Mono', monospace;
    border: 2px solid var(--background-primary, #313338);
    pointer-events: none;
  }
`;
document.head.appendChild(style);

// ── 3. Inject ChopCord buttons into Discord's guild list ──────
const TOOLS = [
  { id: "downloads", icon: "↓",  label: "Downloads"  },
  { id: "proxy",     icon: "⇌",  label: "Proxy & DNS" },
  { id: "profiles",  icon: "◉",  label: "Profiles"   },
  { id: "cache",     icon: "⬡",  label: "Cache"      },
  { id: "settings",  icon: "⊙",  label: "Settings"   },
];

let activePanel = null;
let sidebarEl   = null;

function buildSidebar() {
  const wrap = document.createElement("div");
  wrap.className = "cc-sidebar";
  wrap.id = "chopcord-sidebar";

  const sep = document.createElement("div");
  sep.className = "cc-sep";
  wrap.appendChild(sep);

  for (const tool of TOOLS) {
    const btn = document.createElement("button");
    btn.className = "cc-tool";
    btn.dataset.panel = tool.id;

    const tip = document.createElement("span");
    tip.className = "cc-tool-tip";
    tip.textContent = tool.label;
    btn.appendChild(tip);

    const icon = document.createElement("span");
    icon.textContent = tool.icon;
    btn.appendChild(icon);

    if (tool.id === "downloads") {
      const badge = document.createElement("span");
      badge.className = "cc-badge";
      badge.id = "cc-dl-badge";
      badge.style.display = "none";
      btn.appendChild(badge);
    }

    btn.addEventListener("click", () => {
      const panel = btn.dataset.panel;
      const next  = activePanel === panel ? null : panel;
      activePanel = next;
      // Update active states
      wrap.querySelectorAll(".cc-tool").forEach((b) => b.classList.remove("cc-active"));
      if (next) btn.classList.add("cc-active");
      ipcRenderer.sendToHost("chopcord:panel", next);
    });

    wrap.appendChild(btn);
  }

  return wrap;
}

// Track active downloads count for badge
let activeDownloadCount = 0;
function updateDownloadBadge(delta) {
  activeDownloadCount = Math.max(0, activeDownloadCount + delta);
  const badge = document.getElementById("cc-dl-badge");
  if (!badge) return;
  if (activeDownloadCount > 0) {
    badge.style.display = "flex";
    badge.textContent = String(activeDownloadCount);
  } else {
    badge.style.display = "none";
  }
}

ipcRenderer.on("download:started",  () => updateDownloadBadge(+1));
ipcRenderer.on("download:done",     () => updateDownloadBadge(-1));

// Find Discord's guild nav and mount our sidebar at the bottom
function mountSidebar() {
  if (document.getElementById("chopcord-sidebar")) return; // already mounted

  // Discord's guild list is a <nav> element
  const nav = document.querySelector("nav[aria-label*='erver']") // "Servers sidebar"
    || document.querySelector("[class*='guilds-']");
  if (!nav) return;

  sidebarEl = buildSidebar();
  nav.appendChild(sidebarEl);
}

// ── 4. Intercept Discord's "open in browser" CDN links ────────
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a) return;
  const href = a.href || "";
  if (
    (href.includes("cdn.discordapp.com") || href.includes("media.discordapp.net")) &&
    a.target === "_blank"
  ) {
    e.preventDefault();
    e.stopImmediatePropagation();
    triggerDownload(href);
  }
}, true);

// ── 5. Media download — fixed-position overlay (no DOM wrapping) ─

function isDownloadableUrl(s) {
  if (!s || typeof s !== "string") return false;
  if (s.startsWith("blob:") || s.startsWith("data:") || s.startsWith("chrome-extension:")) return false;
  return s.startsWith("http");
}

function getMediaSrc(el) {
  for (const s of [el.currentSrc, el.src, el.getAttribute("src"), el.dataset.src, el.getAttribute("data-src")]) {
    if (isDownloadableUrl(s)) return s;
  }
  return null;
}

function fmtBytes(b) { return b < 1048576 ? (b/1024).toFixed(0)+"KB" : (b/1048576).toFixed(1)+"MB"; }
function fmtSpeed(b) { return b < 1048576 ? (b/1024).toFixed(0)+"KB/s" : (b/1048576).toFixed(1)+"MB/s"; }

// Downloaded filename → filePath
const downloadedPaths = new Map();
ipcRenderer.invoke("downloads:list").then((files) => {
  for (const f of files || []) downloadedPaths.set(f.name.toLowerCase(), f.path);
}).catch(() => {});

// Active download state for the overlay
let overlayDownloadId = null;
let overlayFill       = null;
let overlayPctEl      = null;
let overlaySizeEl     = null;

ipcRenderer.on("download:started", (_, ev) => { updateDownloadBadge(+1); });

ipcRenderer.on("download:progress", (_, ev) => {
  if (!overlayFill) return;
  const pct = ev.total > 0 ? Math.round((ev.received / ev.total) * 100) : 0;
  overlayFill.style.width = pct + "%";
  if (overlayPctEl)  overlayPctEl.textContent  = pct + "%";
  if (overlaySizeEl) overlaySizeEl.textContent = ev.total > 0
    ? fmtBytes(ev.total) + (ev.speed > 0 ? " · " + fmtSpeed(ev.speed) : "") : "";
});

ipcRenderer.on("download:done", (_, ev) => {
  updateDownloadBadge(-1);
  if (ev.state === "completed") {
    downloadedPaths.set(ev.name.toLowerCase(), ev.filePath);
    showToast("Downloaded: " + ev.name);
    // Switch overlay to folder state
    const bar = document.getElementById("cc-ov-bar");
    if (bar) setBarFolder(bar, ev.filePath);
  }
  overlayDownloadId = null;
  overlayFill = overlayPctEl = overlaySizeEl = null;
});

// ── Build overlay DOM (created once, appended to body) ─────────
function buildOverlay() {
  const ov = document.createElement("div");
  ov.id = "cc-overlay";
  ov.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "pointer-events:none",
    "display:none",
    "border-radius:6px",
    "overflow:hidden",
  ].join(";");

  const bar = document.createElement("div");
  bar.id = "cc-ov-bar";
  bar.style.cssText = [
    "position:absolute",
    "bottom:0","left:0","right:0",
    "padding:32px 10px 10px",
    "background:linear-gradient(to top,rgba(0,0,0,0.82) 0%,transparent 100%)",
    "display:flex","align-items:flex-end","gap:8px",
    "pointer-events:all",
  ].join(";");

  ov.appendChild(bar);
  document.body.appendChild(ov);
  return ov;
}

function setBarIdle(bar, src, urlName) {
  bar.innerHTML = "";
  const btn = makeOvBtn(downloadedPaths.has(urlName) ? "📁 Already downloaded" : "⬇  Download");
  if (downloadedPaths.has(urlName)) {
    btn.style.background = "rgba(35,209,139,0.88)";
    btn.onclick = (e) => { e.stopPropagation(); ipcRenderer.invoke("downloads:reveal", downloadedPaths.get(urlName)); };
  } else {
    btn.onclick = (e) => { e.stopPropagation(); startOverlayDownload(bar, src); };
  }
  bar.appendChild(btn);
}

function setBarProgress(bar) {
  bar.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.cssText = "flex:1;display:flex;flex-direction:column;gap:5px;min-width:0;";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;justify-content:space-between;font:700 11px/1 system-ui,sans-serif;color:#fff;";
  overlayPctEl  = document.createElement("span"); overlayPctEl.textContent  = "Starting…";
  overlaySizeEl = document.createElement("span"); overlaySizeEl.style.opacity = "0.65";
  row.appendChild(overlayPctEl);
  row.appendChild(overlaySizeEl);

  const track = document.createElement("div");
  track.style.cssText = "height:4px;background:rgba(255,255,255,0.18);border-radius:3px;overflow:hidden;";
  overlayFill = document.createElement("div");
  overlayFill.style.cssText = "height:100%;width:0%;border-radius:3px;transition:width 0.2s linear;background:linear-gradient(90deg,#5865f2,#818cf8);box-shadow:0 0 6px rgba(88,101,242,0.7);";
  track.appendChild(overlayFill);

  wrap.appendChild(row);
  wrap.appendChild(track);
  bar.appendChild(wrap);
}

function setBarFolder(bar, filePath) {
  bar.innerHTML = "";
  const btn = makeOvBtn("📁  Show in Folder");
  btn.style.background = "rgba(35,209,139,0.88)";
  btn.onmouseenter = () => btn.style.background = "rgba(35,209,139,1)";
  btn.onmouseleave = () => btn.style.background = "rgba(35,209,139,0.88)";
  btn.onclick = (e) => { e.stopPropagation(); ipcRenderer.invoke("downloads:reveal", filePath); };
  bar.appendChild(btn);
}

function makeOvBtn(label) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = [
    "display:inline-flex","align-items:center","gap:6px",
    "padding:7px 14px",
    "border-radius:6px","border:1px solid rgba(255,255,255,0.18)",
    "background:rgba(88,101,242,0.9)","color:#fff",
    "font:700 12px/1 system-ui,sans-serif",
    "cursor:pointer",
    "transition:background 0.12s,transform 0.1s",
    "flex-shrink:0",
  ].join(";");
  btn.onmouseenter = () => btn.style.transform = "scale(1.04)";
  btn.onmouseleave = () => btn.style.transform = "scale(1)";
  btn.onmousedown  = () => btn.style.transform = "scale(0.96)";
  btn.onmouseup    = () => btn.style.transform = "scale(1.04)";
  return btn;
}

function startOverlayDownload(bar, src) {
  setBarProgress(bar);
  ipcRenderer.invoke("downloads:url", src).then((res) => {
    if (res && res.id) overlayDownloadId = res.id;
    if (res && !res.ok) {
      bar.innerHTML = "<span style='color:#f04747;font:700 11px/1 system-ui'>Download failed</span>";
      overlayFill = overlayPctEl = overlaySizeEl = null;
    }
  }).catch((err) => {
    console.warn("[CC] download error:", err);
    bar.innerHTML = "<span style='color:#f04747;font:700 11px/1 system-ui'>Error: " + err.message + "</span>";
    overlayFill = overlayPctEl = overlaySizeEl = null;
  });
}

// ── Hover tracking ─────────────────────────────────────────────
let currentTarget = null; // { el, src, type }
let overlayEl = null;

function positionOverlay() {
  if (!currentTarget || !overlayEl) return;
  const rect = currentTarget.el.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) { overlayEl.style.display = "none"; return; }
  overlayEl.style.display  = "block";
  overlayEl.style.left     = rect.left   + "px";
  overlayEl.style.top      = rect.top    + "px";
  overlayEl.style.width    = rect.width  + "px";
  overlayEl.style.height   = rect.height + "px";
}

function showOverlayFor(el, src, type) {
  if (!overlayEl) overlayEl = buildOverlay();
  currentTarget = { el, src, type };
  positionOverlay();

  const bar = document.getElementById("cc-ov-bar");
  if (!bar) return;

  // Only reset bar if not mid-download
  if (!overlayFill) {
    const urlName = decodeURIComponent(src.split("/").pop()?.split("?")[0] || "").toLowerCase();
    setBarIdle(bar, src, urlName);
  }
}

function hideOverlay(e) {
  const related = e.relatedTarget;
  if (related && (overlayEl?.contains(related) || related.closest?.("#cc-overlay"))) return;
  if (!related || (!currentTarget?.el.contains(related) && !overlayEl?.contains(related))) {
    if (!overlayFill) { // don't hide during active download
      if (overlayEl) overlayEl.style.display = "none";
      currentTarget = null;
    }
  }
}

document.addEventListener("mouseover", (e) => {
  const vid = e.target.closest("video");
  const img = !vid && e.target.closest("img:not([src*='emoji']):not([src*='avatar']):not([src*='icons']):not([width='16']):not([width='20']):not([width='24'])");

  const el  = vid || img;
  if (!el || el.closest(".cc-sidebar") || el.closest("#cc-overlay")) return;

  const src = getMediaSrc(el);
  if (!src) return;

  showOverlayFor(el, src, vid ? "video" : "image");
}, true);

document.addEventListener("mouseout", hideOverlay, true);

window.addEventListener("scroll", positionOverlay, true);
window.addEventListener("resize", positionOverlay);

// ── 6. MutationObserver — sidebar only, no media wrapping needed ─
const observer = new MutationObserver(() => { mountSidebar(); });

function boot() {
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    mountSidebar();
  } else {
    setTimeout(boot, 80);
  }
}
boot();

// ── 7. Let React shell update active panel highlight ──────────
ipcRenderer.on("chopcord:panel-changed", (_, panel) => {
  activePanel = panel;
  const sidebar = document.getElementById("chopcord-sidebar");
  if (!sidebar) return;
  sidebar.querySelectorAll(".cc-tool").forEach((b) => {
    b.classList.toggle("cc-active", b.dataset.panel === panel);
  });
});

// ── 8. Expose for context-menu calls ─────────────────────────
window.__chopcordDownload = (url) => ipcRenderer.sendToHost("chopcord:download", url);
