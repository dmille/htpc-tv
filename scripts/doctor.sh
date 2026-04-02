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
check "Keyring has no password" "test ! -s '${HOME}/.local/share/keyrings/login.keyring'"
check "Lid close set to ignore" "grep -q '^HandleLidSwitch=ignore' /etc/systemd/logind.conf 2>/dev/null"
check "Node.js installed" "command -v node >/dev/null 2>&1"
check "Mote remote deps installed" "test -d '$(dirname "$0")/../remote/node_modules/express'"
check "uinput device exists" "test -c /dev/uinput"
check "User in input group" "id -nG | grep -qw input"
check "uinput device writable" "test -w /dev/uinput"

exit $fail
