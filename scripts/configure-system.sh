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

# Disable GNOME Keyring password so it unlocks automatically on auto-login
KEYRING_DIR="${HOME}/.local/share/keyrings"
KEYRING_FILE="${KEYRING_DIR}/login.keyring"
if [[ -f "$KEYRING_FILE" ]] && [[ -s "$KEYRING_FILE" ]]; then
  rm -f "$KEYRING_FILE"
  echo "Removed existing login keyring (will be recreated without a password)"
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

# Set up /dev/uinput access for Mote virtual keyboard
if ! grep -q '^uinput' /etc/modules-load.d/uinput.conf 2>/dev/null; then
  echo 'uinput' | sudo tee /etc/modules-load.d/uinput.conf >/dev/null
fi
sudo modprobe uinput 2>/dev/null || true

UDEV_RULE='/etc/udev/rules.d/99-uinput.rules'
UDEV_CONTENT='KERNEL=="uinput", GROUP="input", MODE="0660"'
if ! grep -qF "$UDEV_CONTENT" "$UDEV_RULE" 2>/dev/null; then
  echo "$UDEV_CONTENT" | sudo tee "$UDEV_RULE" >/dev/null
  sudo udevadm control --reload-rules
  sudo udevadm trigger /dev/uinput
fi

if ! id -nG "$USER" | grep -qw input; then
  sudo usermod -aG input "$USER"
  echo "Added $USER to input group — log out and back in for this to take effect"
fi

echo "Applied system settings"
