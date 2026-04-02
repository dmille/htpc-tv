#!/usr/bin/env bash
set -euo pipefail

: "${INSTALL_DIR:?INSTALL_DIR is required}"
: "${AUTOSTART_FILE:?AUTOSTART_FILE is required}"

rm -rf "$INSTALL_DIR"
rm -f "$AUTOSTART_FILE"

echo "Removed repo-managed installed files"
