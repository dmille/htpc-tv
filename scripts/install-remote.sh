#!/usr/bin/env bash
set -euo pipefail

: "${REMOTE_DIR:?REMOTE_DIR is required}"

echo "Installing Mote remote service..."

# Ensure Node.js is available
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Installing via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# Install npm dependencies
cd "$REMOTE_DIR"
npm install --production

echo "Mote remote installed at $REMOTE_DIR"
echo "Run with: make remote"
