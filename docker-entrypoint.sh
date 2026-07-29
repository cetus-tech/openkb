#!/bin/sh
# Drop privileges to the node user after ensuring the data directory is writable.
# Bind-mounted host paths often arrive as root-owned; fix ownership when we start as root.
set -e

DATA_DIR="${OPENKB_DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  exec su-exec node "$@"
fi

exec "$@"
