#!/usr/bin/env bash
set -euo pipefail

KEYRING="/usr/share/keyrings/google-chrome.gpg"
LISTFILE="/etc/apt/sources.list.d/google-chrome.list"

if ! command -v google-chrome >/dev/null 2>&1; then
  wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
    | sudo gpg --dearmor -o "$KEYRING"

  echo "deb [arch=amd64 signed-by=$KEYRING] http://dl.google.com/linux/chrome/deb/ stable main" \
    | sudo tee "$LISTFILE" >/dev/null

  sudo apt update
  sudo apt install -y google-chrome-stable
else
  echo "Chrome already installed"
fi
