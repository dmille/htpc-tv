# htpc-tv

Bootstrap an Ubuntu laptop into a TV/HTPC setup with a custom launcher homepage.

## Prerequisites

- Ubuntu 24.04
- User account created
- This repo cloned

## Quick start

```bash
make bootstrap
```

This installs Chrome, unclutter, configures GNOME power/lock settings, deploys the launcher webpage, and sets up autostart.

## What gets installed

- **Google Chrome** (from Google's apt repo)
- **unclutter** (hides mouse cursor when idle)
- **Launcher webpage** at `~/.local/share/htpc-tv/`
- **Autostart entry** at `~/.config/autostart/tv-mode.desktop`
- **GNOME settings**: screen lock disabled, sleep disabled

## Customize app tiles

Edit `web/index.html` to add or change tiles, then deploy:

```bash
make launcher
```

## Test without rebooting

```bash
make run
```

## Validate setup

```bash
make doctor
```

## Uninstall

```bash
make uninstall
```

Removes the installed launcher and autostart entry. Does not uninstall Chrome or undo GNOME settings.

## Dev Remote (Mote)

Mote is a lightweight LAN-only dev remote for controlling the HTPC from a phone or laptop. It sends keyboard input to the active X session via `xdotool`.

### Setup

```bash
make remote-install   # install Node.js deps
```

### Run

```bash
make remote           # starts Mote on port 8880
```

Then open `http://<htpc-ip>:8880` from your phone or laptop on the same network.

### Controls

| Button | Sends |
|--------|-------|
| Up/Down/Left/Right | Arrow keys |
| OK | Enter |
| Back | Escape |
| Home | Alt+Home (Chrome homepage = launcher) |
| Reload | F5 |

Plus a **text input field** — type on your phone/laptop and send text to the HTPC. Works great for search boxes.

### Keyboard shortcuts (on laptop)

When not focused in the text field: arrow keys, Enter, Escape, `h` (Home), `r` (Reload).

### Notes

- LAN-only, no auth in v1
- Designed to complement the MX3 air mouse, not replace it
- Supports both D-pad remote navigation and pointer interaction

## Not automated yet

- BIOS power-on settings
- Auto-login configuration
- HDMI-CEC hardware setup
- Custom remote key mapping
