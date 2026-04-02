#!/usr/bin/env bash
set -euo pipefail

: "${AUTOSTART_DIR:?AUTOSTART_DIR is required}"
: "${INSTALL_DIR:?INSTALL_DIR is required}"
: "${CHROME_CMD:?CHROME_CMD is required}"
: "${CHROME_FLAGS:?CHROME_FLAGS is required}"

mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_DIR/tv-mode.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=TV Mode
Comment=Launch HTPC TV launcher
Exec=bash -lc 'sleep 3 && INSTALL_DIR=${INSTALL_DIR} CHROME_CMD=${CHROME_CMD} CHROME_FLAGS=${CHROME_FLAGS} ${INSTALL_DIR}/launch-chrome.sh'
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

echo "Installed autostart entry to $AUTOSTART_DIR/tv-mode.desktop"
