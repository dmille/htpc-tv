#!/usr/bin/env bash
set -euo pipefail

: "${INSTALL_DIR:?INSTALL_DIR is required}"
: "${AUTOSTART_FILE:?AUTOSTART_FILE is required}"

fail=0

check() {
  local msg="$1"
  local cmd="$2"
  if eval "$cmd"; then
    echo "[OK] $msg"
  else
    echo "[FAIL] $msg"
    fail=1
  fi
}

check "Chrome installed" "command -v google-chrome >/dev/null 2>&1"
check "Launcher installed" "test -f '$INSTALL_DIR/index.html'"
check "Autostart file exists" "test -f '$AUTOSTART_FILE'"
check "unclutter installed" "command -v unclutter >/dev/null 2>&1"
check "Lid close set to ignore" "grep -q '^HandleLidSwitch=ignore' /etc/systemd/logind.conf 2>/dev/null"

exit $fail
