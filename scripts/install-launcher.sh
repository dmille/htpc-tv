#!/usr/bin/env bash
set -euo pipefail

: "${INSTALL_DIR:?INSTALL_DIR is required}"

mkdir -p "$INSTALL_DIR"
rsync -av --delete web/ "$INSTALL_DIR/"
install -m 755 scripts/launch-chrome.sh "$INSTALL_DIR/launch-chrome.sh"

echo "Installed launcher to $INSTALL_DIR"
