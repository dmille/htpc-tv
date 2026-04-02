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

## Development principles

### This repo is the single source of truth

All configuration, scripts, and web assets live in this repo. Nothing is hand-edited on the target machine. Changes are always made here first, then deployed via Make targets. If something needs to change on the target system, the corresponding script or config in this repo must be updated -- never patch the deployed files directly.

### Scripts must be idempotent

Every script must be safe to run repeatedly. Check before installing (e.g. `command -v` before apt install), use `rsync --delete` instead of manual copies, overwrite config files rather than appending. `make bootstrap` should be runnable on a fresh machine or an already-configured one with the same result.

### Keep deploy scripts in sync with changes

When adding new features (new packages, new config, new web assets), update the relevant install script AND the doctor script. If a new component is added, `doctor.sh` should validate it. The deploy pipeline is: edit in repo -> `make <target>` -> deployed to target paths. Don't add things that bypass this flow.

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

## Testing

There is no test suite. Use `make doctor` to validate the system setup. Use `make run` to manually test the launcher in Chrome.
