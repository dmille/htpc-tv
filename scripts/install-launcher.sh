#!/usr/bin/env bash
set -euo pipefail

: "${INSTALL_DIR:?INSTALL_DIR is required}"

mkdir -p "$INSTALL_DIR"
rsync -av --delete web/ "$INSTALL_DIR/"

echo "Installed launcher to $INSTALL_DIR"
