#!/bin/sh
# Starts a virtual X display, exposes it over noVNC on port 6080, then launches
# CoreTrace GUI inside it.
set -e

SCREEN_SIZE="${SCREEN_SIZE:-1600x1000x24}"

Xvfb :99 -screen 0 "$SCREEN_SIZE" -nolisten tcp &
XVFB_PID=$!

# Wait for the display to accept connections before starting anything on it.
for _ in $(seq 1 50); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then break; fi
  sleep 0.2
done

x11vnc -display :99 -forever -shared -nopw -quiet -rfbport 5900 &
websockify --web=/usr/share/novnc 6080 localhost:5900 &

echo "CoreTrace GUI is starting. Open http://localhost:6080/ in a browser (it connects on its own)."

# AppRun resolves the app as "$APPDIR/ctrace-gui" and only detects APPDIR when it
# runs from a mounted AppImage. This one is extracted, so set it explicitly —
# otherwise AppRun looks for "/ctrace-gui" and exits 127. Going through AppRun
# rather than the binary keeps the LD_LIBRARY_PATH and XDG setup it performs.
export APPDIR=/opt/ctrace-gui

# --no-sandbox is required because the extracted AppImage has no setuid helper.
exec "$APPDIR/AppRun" --no-sandbox --disable-gpu "$@"

kill "$XVFB_PID"
