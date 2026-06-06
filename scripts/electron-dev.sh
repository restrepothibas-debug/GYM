#!/usr/bin/env bash
set -euo pipefail

host="${VITE_DEV_HOST:-127.0.0.1}"
port="${VITE_DEV_PORT:-5173}"
url="http://${host}:${port}"
electron_bin="${PWD}/node_modules/.bin/electron"

if [ ! -x "$electron_bin" ]; then
  printf 'Electron is not installed. Run npm install first.\n' >&2
  exit 1
fi

npm run dev -- --host "$host" --port "$port" &
vite_pid="$!"

cleanup() {
  kill "$vite_pid" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

for _ in $(seq 1 80); do
  if curl -fsS "$url" >/dev/null 2>&1; then
    break
  fi

  if ! kill -0 "$vite_pid" >/dev/null 2>&1; then
    wait "$vite_pid"
    exit 1
  fi

  sleep 0.25
done

if ! curl -fsS "$url" >/dev/null 2>&1; then
  printf 'Vite dev server did not start at %s\n' "$url" >&2
  exit 1
fi

VITE_DEV_SERVER_URL="$url" "$electron_bin" electron/main.cjs
