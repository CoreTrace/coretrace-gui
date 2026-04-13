#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <app-path> [runs] [timeout-seconds]" >&2
  exit 1
fi

APP_PATH="$1"
RUNS="${2:-3}"
TIMEOUT_SECONDS="${3:-15}"

if [[ ! -x "$APP_PATH" ]]; then
  echo "Error: app is not executable: $APP_PATH" >&2
  exit 1
fi

extract_ms() {
  local pattern="$1"
  local file="$2"
  local value
  value="$(grep -m1 "$pattern" "$file" | sed -n 's/.*(\([0-9][0-9]*\)ms since process start).*/\1/p')"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
  else
    printf 'NA'
  fi
}

extract_renderer_ms() {
  local file="$1"
  local value
  value="$(grep -m1 'restored-session-ready' "$file" | sed -n 's/.*rendererElapsedMs=\([0-9][0-9]*\)ms.*/\1/p')"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
  else
    printf 'NA'
  fi
}

echo "run,when_ready_ms,window_created_ms,ready_to_show_ms,restored_session_ready_ms,renderer_restore_ms"

for run in $(seq 1 "$RUNS"); do
  log_file="$(mktemp)"
  timeout --signal=INT "${TIMEOUT_SECONDS}s" "$APP_PATH" >"$log_file" 2>&1 || true

  when_ready_ms="$(extract_ms 'app.whenReady resolved' "$log_file")"
  window_created_ms="$(extract_ms 'BrowserWindow created' "$log_file")"
  ready_to_show_ms="$(extract_ms 'Main window ready-to-show' "$log_file")"
  restored_session_ready_ms="$(extract_ms 'restored-session-ready' "$log_file")"
  renderer_restore_ms="$(extract_renderer_ms "$log_file")"

  echo "${run},${when_ready_ms},${window_created_ms},${ready_to_show_ms},${restored_session_ready_ms},${renderer_restore_ms}"
  rm -f "$log_file"
done
