#!/usr/bin/env bash
set -euo pipefail

: "${REMOTE_DIR:?REMOTE_DIR is required}"
: "${MOTE_PORT:?MOTE_PORT is required}"

SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/mote-remote.service"

mkdir -p "$SERVICE_DIR"

NODE_BIN="$(command -v node)"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Mote - HTPC dev remote
After=graphical-session.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}
Environment=MOTE_PORT=${MOTE_PORT}
ExecStart=${NODE_BIN} server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable mote-remote.service
systemctl --user restart mote-remote.service

echo "Mote service installed and running on port ${MOTE_PORT}"
echo "  status:  systemctl --user status mote-remote"
echo "  logs:    journalctl --user -u mote-remote -f"
