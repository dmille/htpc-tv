#!/usr/bin/env bash
set -euo pipefail

if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.screensaver lock-enabled false || true
  gsettings set org.gnome.desktop.session idle-delay 0 || true
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' || true
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' || true

  # Hide the GNOME dock/sidebar so it doesn't appear on screen edges
  gsettings set org.gnome.shell.extensions.dash-to-dock dock-fixed false || true
  gsettings set org.gnome.shell.extensions.dash-to-dock autohide false || true
  gsettings set org.gnome.shell.extensions.dash-to-dock intellihide false || true
fi

# Ignore lid close so the laptop doesn't suspend when used as an HTPC
LOGIND_CONF="/etc/systemd/logind.conf"
if ! grep -q '^HandleLidSwitch=ignore' "$LOGIND_CONF" 2>/dev/null; then
  sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' "$LOGIND_CONF"
  if ! grep -q '^HandleLidSwitch=ignore' "$LOGIND_CONF"; then
    echo 'HandleLidSwitch=ignore' | sudo tee -a "$LOGIND_CONF" >/dev/null
  fi
  sudo systemctl restart systemd-logind
fi

echo "Applied system settings"
