#!/usr/bin/env bash
set -euo pipefail

: "${INSTALL_DIR:?INSTALL_DIR is required}"
: "${CHROME_CMD:?CHROME_CMD is required}"
: "${CHROME_FLAGS:?CHROME_FLAGS is required}"

CHROME_USER_AGENT="Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"

# If DISPLAY is not set (e.g. running from SSH), find the active X display
if [[ -z "${DISPLAY:-}" ]]; then
  for sock in /tmp/.X11-unix/X*; do
    DISPLAY=":${sock##*/tmp/.X11-unix/X}"
    break
  done
  export DISPLAY
fi

exec "$CHROME_CMD" $CHROME_FLAGS --user-agent="$CHROME_USER_AGENT" "file://${INSTALL_DIR}/index.html"
