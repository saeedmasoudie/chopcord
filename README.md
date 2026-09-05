# ChopCord

A privacy-first Discord desktop client built with Electron. ChopCord wraps Discord in a native window and adds features Discord doesn't offer: a built-in download manager, proxy/DNS support, multi-profile switching, offline mode, and media cache controls — all without modifying Discord's files or violating its ToS.

![ChopCord Screenshot](docs/screenshot.png)

---

## Features

- **Download Manager** — Download videos, images, and files from Discord directly inside the app. Progress bar shows in-frame, files are saved to your Downloads folder, and you get a notification when done.
- **Multi-Profile Switching** — Switch between Discord accounts instantly. Each profile keeps its own session (login stays persistent per profile).
- **Proxy & DNS** — Route Discord traffic through a custom proxy or DNS server. Built-in connection test before applying.
- **Offline Mode** — Slim banner instead of Discord's full-screen reconnect overlay. Suppresses the "did you know" offline page.
- **Media Cache** — 256 MB disk cache for faster loading. View cache size and clear it from the panel.
- **Tracking Blocker** — Blocks requests to Sentry, PostHog, Datadog, and Discord's own analytics endpoints.
- **Privacy First** — No telemetry, no accounts, no cloud sync. All settings are stored locally.

---

## Installation

### Pre-built Releases

Download the latest installer from the [Releases](https://github.com/saeedmasoudie/chopcord/releases) page.

| Platform | File |
|----------|------|
| Windows | `ChopCord-Setup-x.x.x.exe` |
| Linux | `ChopCord-x.x.x.AppImage` |
| macOS | `ChopCord-x.x.x.dmg` |

### Build from Source

**Requirements:** Node.js 22+, pnpm 10+

```bash
git clone https://github.com/saeedmasoudie/chopcord.git
cd chopcord
pnpm install

# Development (hot reload)
pnpm electron:dev

# Build for current platform
pnpm electron:build

# Build for specific platform
pnpm electron:build:win
pnpm electron:build:linux
pnpm electron:build:mac
```

---

## Development

```bash
pnpm install
pnpm electron:dev
```

This starts the Vite dev server on port 5173 and launches Electron. Changes to `src/` hot-reload instantly. Changes to `electron/` require restarting the process.

### Project Structure

```
chopcord/
├── electron/
│   ├── main.cjs              # Main process — window, IPC, download manager
│   ├── preload.cjs           # Renderer preload — exposes window.chopcord API
│   ├── discord-preload.cjs   # Injected into Discord webview — download overlay, offline suppression
│   └── discord-css.cjs       # CSS injected into Discord — hides reconnect overlays
├── src/
│   ├── App.tsx               # Main React component — webview, title bar, offline banner
│   ├── components/
│   │   └── ChopPanel.tsx     # Side panel — downloads, profiles, cache, settings
│   ├── index.css             # Global styles + Tailwind v4
│   └── main.tsx              # React entrypoint + window.chopcord bootstrap
├── electron-builder.yml      # Electron Builder config
├── vite.config.ts            # Vite config
└── package.json
```

### Tech Stack

- **Electron** — Native desktop wrapper
- **React 19** + **Vite 8** — UI
- **Tailwind CSS v4** — Styling
- **TypeScript** — Type safety throughout
- **Electron Builder** — Cross-platform packaging

---

## How It Works

ChopCord loads `https://discord.com` inside an Electron `<webview>` tag (not an iframe — Discord blocks those). A preload script is injected into Discord's webview that:

- Intercepts mouse-over events on videos/images and shows a floating download button
- Sends download requests via IPC to the main process, which streams the file using `https.get()`
- Suppresses Discord's offline detection (`navigator.onLine` override, stops `offline` events)
- Blocks navigation to Discord's offline pages

Each user profile maps to a separate Electron session partition, so sessions are fully isolated and persist across restarts.

---

## Contributing

Pull requests are welcome. For major changes, open an issue first.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a PR

---

## License

MIT — see [LICENSE](LICENSE) for details.
