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

## Not automated yet

- BIOS power-on settings
- Auto-login configuration
- HDMI-CEC hardware setup
- Custom remote key mapping
