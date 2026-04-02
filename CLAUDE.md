# CLAUDE.md

## Project overview

htpc-tv bootstraps an Ubuntu 24.04 laptop into a TV/HTPC appliance. It installs Google Chrome, configures GNOME to stay awake and unlocked, deploys a local launcher webpage, and sets Chrome to auto-launch in fullscreen on login.

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
  doctor.sh           # Validates: Chrome, launcher, autostart, unclutter
  uninstall.sh        # Removes launcher dir and autostart file
web/                  # Launcher webpage (served as file://)
  index.html          # Tile grid with app links
  styles.css          # Dark theme, responsive grid, focus ring for remote nav
  app.js              # Arrow key navigation across tile grid
  assets/             # Placeholder for icons/images (currently empty)
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

## Conventions

- All scripts use `set -euo pipefail` and are invoked via `bash scripts/<name>.sh`
- Scripts receive config via environment variables set in the Makefile (INSTALL_DIR, AUTOSTART_DIR, etc.)
- Scripts are idempotent where possible (check before install)
- No build step for the web frontend -- plain HTML/CSS/JS, no bundler or framework
- The launcher runs as a local `file://` URL, not a web server

## Working with the launcher

- To add a new app tile: add an `<a class="tile">` element to `web/index.html` inside the `.grid` section
- Tiles use `data-app` attributes for identification
- The grid is responsive: 3 columns at 900px+, 2 at 600px+, 1 below
- Arrow key navigation in `app.js` adapts to the column count
- After editing, run `make launcher` to deploy changes

## Testing

There is no test suite. Use `make doctor` to validate the system setup. Use `make run` to manually test the launcher in Chrome.
