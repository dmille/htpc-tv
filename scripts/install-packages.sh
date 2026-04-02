#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt install -y \
  curl \
  wget \
  gpg \
  ca-certificates \
  jq \
  xdotool \
  unclutter \
  rsync
