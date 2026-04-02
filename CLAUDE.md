# CLAUDE.md

## Project overview

htpc-tv bootstraps an Ubuntu 24.04 laptop into a TV/HTPC appliance. It installs Google Chrome, configures GNOME to stay awake and unlocked, deploys a local launcher webpage, and sets Chrome to auto-launch in kiosk mode on login. Chrome uses a Smart TV user agent so that services like YouTube serve their TV interface.

The launcher is a simple HTML/CSS/JS page with tile links to streaming apps (Jellyfin, YouTube, Netflix). Navigation supports arrow keys for remote/keyboard control.

## Repo structure

```
Makefile              # All targets; entry point for setup and operation
scripts/              # Bash scripts invoked by Make targets
  install-packages.sh # apt installs: curl, wget, gpg, jq, xdotool, unclutter, rsync
  install-chrome.sh   # Adds Google apt repo and installs Chrome (idempotent)
  configure-system.sh # gsettings: disable screensaver, sleep, lock
  install-launcher.sh # rsync web/ to ~/.local/share/htpc-tv/
  install-autostart.sh# Writes tv-mode.desktop to ~/.config/autostart/
  launch-chrome.sh    # Chrome launcher with display detection and TV user agent
  doctor.sh           # Validates: Chrome, launcher, autostart, unclutter
  uninstall.sh        # Removes launcher dir and autostart file
  install-remote.sh   # Installs Node.js (if needed) and npm deps for Mote
remote/               # Mote dev remote (Node/Express service)
  server.js           # Express server: action/text/health endpoints + uinput/xdotool
  uinput-keyboard.js  # Virtual input device via /dev/uinput (kernel-level key injection)
  package.json        # npm dependencies (express, ioctl, ws)
  public/             # Static remote UI
    index.html        # Mote remote control page
    styles.css        # Cartoonish dark theme with Mote character
    app.js            # Client-side action sending + keyboard shortcuts
web/                  # Launcher webpage (served as file://)
  index.html          # Tile grid with app links
  styles.css          # Dark theme, responsive grid, focus ring for remote nav
  app.js              # Arrow key navigation across tile grid
  assets/             # Placeholder for icons/images (currently empty)
apps/                 # HTPC apps (each with own Node server + frontend)
  fetch/              # Torrent search & download app (port 8881)
plans/                # Implementation plans (markdown)
  INDEX.md            # Status overview of all plans
config/               # Placeholder for future config files (currently empty)
state/                # Gitignored runtime state; only .gitkeep tracked
```

## Key paths (at runtime)

- Launcher install dir: `~/.local/share/htpc-tv/`
- Autostart file: `~/.config/autostart/tv-mode.desktop`
- State dir: `~/.local/state/htpc-tv/` (defined in Makefile, not yet used)

## Make targets

- `make bootstrap` - Full setup (packages, chrome, configure, launcher, autostart, doctor)
- `make launcher` - Deploy just the web files (use after editing tiles)
- `make run` - Launch Chrome with the launcher page now
- `make doctor` - Validate installation
- `make uninstall` - Remove launcher and autostart entry
- `make clean` - Remove `.tmp/` directory
- `make remote-install` - Install Node.js and Mote npm dependencies
- `make remote` - Start the Mote dev remote on port 8880
- `make fetch-install` - Install Fetch app npm dependencies
- `make fetch` - Start the Fetch torrent search app on port 8881
- `make fetch-service` - Install Fetch as a systemd user service

## Development principles

### This repo is the single source of truth

All configuration, scripts, and web assets live in this repo. Nothing is hand-edited on the target machine. Changes are always made here first, then deployed via Make targets. If something needs to change on the target system, the corresponding script or config in this repo must be updated -- never patch the deployed files directly.

### Scripts must be idempotent

Every script must be safe to run repeatedly. Check before installing (e.g. `command -v` before apt install), use `rsync --delete` instead of manual copies, overwrite config files rather than appending. `make bootstrap` should be runnable on a fresh machine or an already-configured one with the same result.

### Keep deploy scripts in sync with changes

When adding new features (new packages, new config, new web assets), update the relevant install script AND the doctor script. If a new component is added, `doctor.sh` should validate it. The deploy pipeline is: edit in repo -> `make <target>` -> deployed to target paths. Don't add things that bypass this flow.

## 10-foot UI design

This is a TV app viewed from a couch (~10 feet away). Every screen — the launcher, Fetch, and future apps — must follow these rules.

### Sizing

Everything is larger than desktop/mobile. The launcher's CSS variables are the reference:

- **Body text**: minimum 1.1rem, prefer 1.2–1.5rem. Anything under 1rem is unreadable from a couch.
- **Headings / primary labels**: 1.4–2rem.
- **Badges / secondary text**: 0.8rem is the absolute minimum.
- **Touch/focus targets**: minimum 3rem tall. The launcher uses 28rem tiles — list rows in apps should be at least 3.5–4rem.
- **Spacing**: generous padding and gaps. Cramped layouts are hard to scan on TV. Use 1rem+ gaps between list items, 1.5rem+ padding inside interactive elements.
- **Page padding**: 2–3rem margins so content doesn't crowd the screen edges (TVs have overscan).

### Color and contrast

- **Dark theme only**: `--bg: #0a0a0f` with a subtle radial gradient. TVs in dim rooms — dark backgrounds reduce eye strain and light bleed.
- **Text on dark**: `--text: #f0f0f5` for primary, `--text-muted: rgba(255,255,255,0.5)` for secondary. Never use pure white (#fff) for large text areas — too harsh on TV.
- **Surfaces**: frosted glass effect with low-opacity white (`rgba(255,255,255,0.04–0.08)`) and `backdrop-filter: blur`. Provides depth without high contrast boundaries.
- **Accent colors**: use sparingly for badges, progress bars, active states. Current palette: `--accent: #6c8cff`, `--gold: #f0c040`, `--green: #50c878`.

### Focus and navigation

- **Focus ring is mandatory**: every interactive element must have a visible focus state. Use `box-shadow: 0 0 0 0.15rem var(--focus-ring)` — not `outline`, which can be clipped.
- **Scale on focus**: subtle scale-up (1.01–1.04) makes the focused item obvious from across the room.
- **Glow on focus**: `box-shadow` glow (e.g. `0 0 2rem var(--glow)`) adds a halo effect that reads well on TV.
- **No hover-only states**: hover effects must also apply on `:focus`. Remote/keyboard users never hover.
- **Cursor hidden**: TV mode hides the cursor (`cursor: none` on body). Don't rely on pointer interactions.

### Navigation model

- **D-pad is primary**: Up/Down to move through lists, Left/Right for tabs/toggles, Enter to select.
- **Single focus context**: only one thing on screen should be focusable at a time per zone. Don't mix focusable elements in unexpected layouts.
- **Home key** (KEY_HOMEPAGE) returns to the launcher. Chrome handles this natively — the homepage is the launcher. Never use Escape for "return to launcher".
- **Escape**: use for "back within the app" (e.g. close modal, go to previous view, clear input).
- **No Tab navigation**: Tab conflicts with Mote keyboard mode and isn't intuitive with a remote. Use Left/Right arrows for switching between views/tabs.

### Shared CSS variables

Apps should reuse the launcher's color palette. Copy these variables into each app's stylesheet:

```css
--bg: #0a0a0f;
--surface: rgba(255, 255, 255, 0.04);
--surface-hover: rgba(255, 255, 255, 0.08);
--text: #f0f0f5;
--text-muted: rgba(255, 255, 255, 0.5);
--focus-ring: rgba(255, 255, 255, 0.85);
--glow: rgba(120, 120, 255, 0.15);
```

## Conventions

- All scripts use `set -euo pipefail` and are invoked via `bash scripts/<name>.sh`
- Scripts receive config via environment variables set in the Makefile (INSTALL_DIR, AUTOSTART_DIR, etc.)
- No build step for the web frontend -- plain HTML/CSS/JS, no bundler or framework
- The launcher runs as a local `file://` URL, not a web server

## Working with the launcher

- To add a new app tile: add an `<a class="tile">` element to `web/index.html` inside the `.grid` section
- Tiles use `data-app` attributes for identification
- The grid is responsive: 3 columns at 900px+, 2 at 600px+, 1 below
- Arrow key navigation in `app.js` adapts to the column count
- After editing, run `make launcher` to deploy changes

## Remote operation (SSH)

`make run` works from SSH sessions. The `launch-chrome.sh` script auto-detects the active X display by scanning `/tmp/.X11-unix/` when `$DISPLAY` is not set. Chrome must be fully killed before relaunching — if an existing Chrome process is running, new instances join it and ignore command-line flags like `--user-agent`.

## Dev Remote (Mote)

Mote is a LAN-only dev remote that acts as a virtual input device on the HTPC, mirroring how a real MX3 air mouse sends Linux input events. It complements the MX3 for development and as a phone-based fallback.

- **Stack**: Node.js + Express + plain HTML/CSS/JS
- **Port**: 8880 (configurable via `MOTE_PORT`)
- **Input**: Uses `/dev/uinput` to inject real Linux input events at the kernel level (same codes as MX3 air mouse). Falls back to `xdotool` if uinput is unavailable.
- **Actions**: D-pad (KEY_UP/DOWN/LEFT/RIGHT), OK (KEY_ENTER), Back (KEY_ESC), Home (KEY_HOMEPAGE), Reload (KEY_F5)
- **Volume**: Sends KEY_VOLUMEUP/KEY_VOLUMEDOWN/KEY_MUTE via uinput. Falls back to `pactl` without uinput.
- **Text**: Types via uinput char-by-char (US QWERTY map), falling back to `xdotool type` for unmapped characters.
- **Keyboard mode**: WebSocket-based live typing with `beforeinput` event handling for mobile support.
- **Home behavior**: Sends `KEY_HOMEPAGE` (172), the browser home key. Chrome handles this natively — the homepage is the launcher, so this returns the user to the launcher from any page.
- **Display detection**: Uses `$DISPLAY` if set, otherwise scans `/tmp/.X11-unix/`. Only needed for xdotool fallback; uinput works without a display.
- **Safety**: Action whitelist, safe subprocess execution (no shell interpolation for text)
- **UI**: Cartoonish "Mote" character theme, works well on phone and laptop

The HTPC UI supports both D-pad navigation and air-mouse pointer input. Tiles are large with generous hit targets, and both hover and focus states are styled.

## Apps (`apps/`)

Apps are self-contained Node.js services that run alongside the launcher. Each app lives in its own directory under `apps/` and is accessible as a tile on the launcher.

### How to build a new app

Every app follows the same pattern established by Fetch (`apps/fetch/`):

**Directory structure:**
```
apps/<app-name>/
  server.js           # Express server (entry point)
  package.json        # Dependencies (always includes express)
  public/             # Static frontend (HTML/CSS/JS)
    index.html
    styles.css
    app.js
```

**Checklist for adding a new app:**

1. **Create the app directory**: `apps/<app-name>/` with `server.js`, `package.json`, and `public/`
2. **Pick a port**: Next available after 8881 (Fetch). Ports are defined in the Makefile.
3. **Add a launcher tile**: Add an `<a class="tile" href="http://localhost:<port>" data-app="<name>">` to `web/index.html`
4. **Add Makefile targets**: `<name>-install`, `<name>`, `<name>-service` (follow Fetch's pattern)
5. **Add a systemd service script**: `scripts/install-<name>-service.sh` (copy from `install-fetch-service.sh`)
6. **Update `.gitignore`**: Add `apps/<name>/node_modules/` and any generated files (e.g. `.db`)
7. **Run `make <name>-service`** to install and enable the service

**Stack conventions:**
- Backend: Node.js + Express. No other frameworks.
- Frontend: Plain HTML/CSS/JS. No bundler, no framework.
- Config: All via environment variables, set in the Makefile and passed through to the systemd service.
- Database: SQLite via `better-sqlite3` if state is needed. DB file lives in the app directory and is gitignored.
- External APIs: Use `fetch()` directly. No wrapper libraries unless they provide substantial value.

**Frontend conventions (TV-friendly):**
- Match the launcher's dark theme: `--bg: #0a0a0f`, frosted glass surfaces, same color variables
- Large text and hit targets for TV viewing distance
- Full keyboard/D-pad navigation: Up/Down to move through lists, Enter to select, Escape to go back within the app
- Home key (KEY_HOMEPAGE) returns to the launcher (Chrome handles this natively in kiosk mode — do NOT use Escape for this)
- Left/Right arrows for switching between views/tabs (do NOT use Tab — it conflicts with focus navigation and Mote keyboard mode)
- Frontend polls the backend for live data (no server-side push needed for V1 of anything)

**Service conventions:**
- Each app runs as a systemd user service (`~/.config/systemd/user/<name>.service`)
- Services are `Type=simple`, `Restart=on-failure`, `WantedBy=default.target`
- Network-dependent apps use `After=network-online.target`
- Manage with: `systemctl --user status/start/stop/restart <name>`
- Logs: `journalctl --user -u <name> -f`

### Existing apps

**Fetch** (`apps/fetch/`, port 8881): Torrent search and download tracker. Searches TPB via Apibay API, filters by quality (1080p+), submits magnets to Transmission on `titan.local:9091`, tracks download progress. SQLite DB stores download history. Syncs Jellyfin library from `titan.local:8096` every 30 minutes to flag "already in Jellyfin" on search results.

### External services on titan.local

- **Transmission**: `http://titan.local:9091/transmission/rpc` — Torrent client. Auth: `transmission:transmission`. Uses session token (`X-Transmission-Session-Id`) — on 409, read the token from the response header and retry.
- **Jellyfin**: `http://titan.local:8096` — Media server. Auth: `jellyfin:jellyfin`. Authenticate via `POST /Users/AuthenticateByName` with `X-Emby-Authorization` header to get an access token, then use `X-Emby-Token` header for subsequent requests.

## Implementation plans

Plans live in `plans/` as markdown files. `plans/INDEX.md` is the single place to check the status of all plans.

- To create a plan: add a markdown file in `plans/` (e.g. `plans/screensaver.md`) and add a row to the table in `INDEX.md`.
- Plan statuses: `draft`, `in-progress`, `done`, `cancelled`.
- Each plan file should cover: goal, approach, affected files, and open questions.
- Keep `INDEX.md` updated as plans progress.

## Testing

There is no test suite. Use `make doctor` to validate the system setup. Use `make run` to manually test the launcher in Chrome.
