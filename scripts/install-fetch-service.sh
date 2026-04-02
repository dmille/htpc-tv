#!/usr/bin/env bash
set -euo pipefail

: "${FETCH_DIR:?FETCH_DIR is required}"
: "${FETCH_PORT:?FETCH_PORT is required}"
: "${TRANSMISSION_URL:?TRANSMISSION_URL is required}"
: "${TRANSMISSION_USER:?TRANSMISSION_USER is required}"
: "${TRANSMISSION_PASS:?TRANSMISSION_PASS is required}"
: "${JELLYFIN_URL:?JELLYFIN_URL is required}"
: "${JELLYFIN_USER:?JELLYFIN_USER is required}"
: "${JELLYFIN_PASS:?JELLYFIN_PASS is required}"
: "${MIN_SEEDERS:?MIN_SEEDERS is required}"

SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/fetch.service"

mkdir -p "$SERVICE_DIR"

NODE_BIN="$(command -v node)"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Fetch - HTPC torrent search & download
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${FETCH_DIR}
Environment=FETCH_PORT=${FETCH_PORT}
Environment=TRANSMISSION_URL=${TRANSMISSION_URL}
Environment=TRANSMISSION_USER=${TRANSMISSION_USER}
Environment=TRANSMISSION_PASS=${TRANSMISSION_PASS}
Environment=JELLYFIN_URL=${JELLYFIN_URL}
Environment=JELLYFIN_USER=${JELLYFIN_USER}
Environment=JELLYFIN_PASS=${JELLYFIN_PASS}
Environment=MIN_SEEDERS=${MIN_SEEDERS}
ExecStart=${NODE_BIN} server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable fetch.service
systemctl --user restart fetch.service

echo "Fetch service installed and running on port ${FETCH_PORT}"
echo "  status:  systemctl --user status fetch"
echo "  logs:    journalctl --user -u fetch -f"
