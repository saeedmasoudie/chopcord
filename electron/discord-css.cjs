/* ============================================================
   ChopCord — Discord CSS Injection
   Injected into discord.com via insertCSS() in Electron
   ============================================================ */
module.exports = `

/* ── Fonts ─────────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

*, *::before, *::after {
  font-family: 'Outfit', 'gg sans', 'Noto Sans', system-ui, sans-serif !important;
}
code, pre, [class*="codeBlock"], [class*="markup"] code {
  font-family: 'JetBrains Mono', 'Consolas', monospace !important;
}

/* ── Color tokens ──────────────────────────────────────────── */
:root {
  --c-bg:        #08080d;
  --c-surf:      #0f0f16;
  --c-surf2:     #161620;
  --c-surf3:     #1c1c28;
  --c-border:    rgba(255,255,255,0.06);
  --c-border2:   rgba(255,255,255,0.1);
  --c-primary:   #5865f2;
  --c-accent:    #23d18b;
  --c-text:      #e2e2f0;
  --c-muted:     #6b6b7e;
}

/* ── Overall page background (only the very root) ──────────── */
html { background: var(--c-bg) !important; }

/* ── Guild / server list ───────────────────────────────────── */
nav[class*="guilds"] {
  background: var(--c-surf) !important;
  border-right: 1px solid var(--c-border) !important;
}

/* Guild icon buttons: pill shape when active */
[class*="listItem-"] [class*="wrapper-"] {
  border-radius: 50% !important;
  transition: border-radius 0.15s !important;
}
[class*="listItem-"][class*="selected-"] [class*="wrapper-"],
[class*="listItem-"]:hover [class*="wrapper-"] {
  border-radius: 30% !important;
}

/* ── Channel / DM sidebar ──────────────────────────────────── */
[class*="sidebar-"] {
  background: var(--c-surf) !important;
}

/* Channel items */
[class*="containerDefault-"] {
  border-radius: 5px !important;
  margin: 1px 6px !important;
}
[class*="containerDefault-"]:hover {
  background: var(--c-surf3) !important;
}
[class*="containerDefault-"][class*="modeSelected-"],
[class*="containerDefault-"][class*="modeSelected"] {
  background: var(--c-surf3) !important;
}

/* Category headers */
[class*="containerDefault-"] [class*="name-"],
[class*="categoryContainer-"] [class*="name-"] {
  font-size: 11px !important;
  letter-spacing: 0.06em !important;
}

/* ── Chat area ─────────────────────────────────────────────── */
[class*="chatContent-"] {
  background: var(--c-bg) !important;
}
[class*="messagesWrapper-"],
[class*="scroller-"][class*="messages"] {
  background: var(--c-bg) !important;
}

/* Message hover */
[class*="message-"]:hover {
  background: rgba(255,255,255,0.015) !important;
  border-radius: 4px !important;
}

/* Message text */
[class*="messageContent-"] {
  font-size: 13.5px !important;
  line-height: 1.55 !important;
  color: var(--c-text) !important;
}

/* Username */
[class*="username-"] {
  font-weight: 700 !important;
}

/* Timestamp */
[class*="timestamp-"] {
  font-size: 10px !important;
  font-family: 'JetBrains Mono', monospace !important;
}

/* Code blocks */
[class*="codeBlock-"] {
  background: var(--c-surf2) !important;
  border: 1px solid var(--c-border2) !important;
  border-left: 3px solid var(--c-accent) !important;
  border-radius: 4px !important;
}

/* Embeds */
[class*="embedWrapper-"] {
  background: var(--c-surf2) !important;
  border: 1px solid var(--c-border2) !important;
  border-radius: 8px !important;
}

/* Image attachments */
[class*="imageWrapper-"],
[class*="imageZoomable-"] {
  border-radius: 8px !important;
  overflow: hidden !important;
}

/* Reactions */
[class*="reaction-"] {
  background: var(--c-surf2) !important;
  border: 1px solid var(--c-border2) !important;
  border-radius: 20px !important;
}
[class*="reaction-"][class*="reactionMe-"] {
  background: rgba(88,101,242,0.15) !important;
  border-color: var(--c-primary) !important;
}

/* ── Message input ─────────────────────────────────────────── */
[class*="form-"] {
  background: var(--c-bg) !important;
  padding-bottom: 12px !important;
}
[class*="textArea-"] {
  background: var(--c-surf2) !important;
  border-radius: 8px !important;
  border: 1px solid var(--c-border2) !important;
}
[class*="textArea-"]:focus-within {
  border-color: rgba(88,101,242,0.4) !important;
}
[class*="slateTextArea-"] [data-placeholder]::before {
  color: var(--c-muted) !important;
}

/* ── Channel / DM top header ───────────────────────────────── */
[class*="header-"][class*="chat-"] {
  background: var(--c-surf) !important;
  border-bottom: 1px solid var(--c-border) !important;
}

/* ── Members list ──────────────────────────────────────────── */
[class*="membersWrap-"] {
  background: var(--c-surf) !important;
  border-left: 1px solid var(--c-border) !important;
}
[class*="member-"]:hover {
  background: var(--c-surf3) !important;
  border-radius: 5px !important;
}

/* ── User panel (bottom-left) ──────────────────────────────── */
[class*="panels-"] {
  background: var(--c-surf) !important;
  border-top: 1px solid var(--c-border) !important;
}

/* ── Server header (top of channel list) ───────────────────── */
[class*="header-"][class*="server"],
header[class*="guilds"],
[class*="headerContent-"] {
  background: var(--c-surf) !important;
  border-bottom: 1px solid var(--c-border) !important;
}

/* ── Hide Discord's "Download App" / "Open in app" prompts ─── */
[class*="downloadLink"],
[class*="downloadLink-"],
[href*="/download"],
[class*="upsell-"],
[class*="premiumBanner"],
[class*="premiumTab-"],
a[href*="discord.com/download"],
[class*="downloadPrompt"],
[class*="nativeLink-"],
[class*="nitro"],
[class*="giftingTooltip"] {
  display: none !important;
}

/* ── Scrollbars ────────────────────────────────────────────── */
::-webkit-scrollbar { width: 3px !important; height: 3px !important; }
::-webkit-scrollbar-track { background: transparent !important; }
::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.08) !important;
  border-radius: 4px !important;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.15) !important;
}

/* ── Modals & popouts ──────────────────────────────────────── */
[class*="modal-"] > [class*="inner-"] {
  background: var(--c-surf) !important;
  border-radius: 12px !important;
}
[class*="backdrop-"] {
  background: rgba(0,0,0,0.75) !important;
  backdrop-filter: blur(4px) !important;
}

/* ── Context menus ─────────────────────────────────────────── */
[class*="menu-"][role="menu"] {
  background: var(--c-surf2) !important;
  border: 1px solid var(--c-border2) !important;
  border-radius: 8px !important;
  box-shadow: 0 12px 36px rgba(0,0,0,0.5) !important;
  padding: 4px !important;
}
[class*="item-"][role="menuitem"]:hover {
  background: var(--c-primary) !important;
  border-radius: 4px !important;
  color: #fff !important;
}

/* ── Tooltips ──────────────────────────────────────────────── */
[class*="tooltip-"] {
  background: var(--c-surf3) !important;
  border: 1px solid var(--c-border2) !important;
  border-radius: 5px !important;
  font-size: 11px !important;
}

/* ── Buttons ───────────────────────────────────────────────── */
[class*="colorBrand-"] {
  background: var(--c-primary) !important;
  border-radius: 5px !important;
}
[class*="colorBrand-"]:hover {
  opacity: 0.85 !important;
}

/* ── Unread / ping badges ──────────────────────────────────── */
[class*="numberBadge-"] {
  background: var(--c-primary) !important;
  font-family: 'JetBrains Mono', monospace !important;
  font-size: 10px !important;
  font-weight: 700 !important;
}

/* ── DM list background ────────────────────────────────────── */
[class*="privateChannels-"] {
  background: var(--c-surf) !important;
}

/* ── Voice / RTC UI ────────────────────────────────────────── */
[class*="connection-"],
[class*="rtc-"] {
  background: var(--c-surf2) !important;
  border: 1px solid var(--c-border2) !important;
  border-radius: 8px !important;
}

/* ── Selection ─────────────────────────────────────────────── */
::selection {
  background: rgba(88,101,242,0.3) !important;
}

/* ── Online dot color ──────────────────────────────────────── */
rect[fill="#23a55a"], circle[fill="#23a55a"] {
  fill: var(--c-accent) !important;
}
`;
