#!/bin/sh
# Starts a virtual X display, exposes it over noVNC on port 6080, then launches
# CoreTrace Desktop inside it.
set -e

SCREEN_SIZE="${SCREEN_SIZE:-1600x1000x24}"

Xvfb :99 -screen 0 "$SCREEN_SIZE" -nolisten tcp &
XVFB_PID=$!

# Wait for the display to accept connections before starting anything on it.
for _ in $(seq 1 50); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then break; fi
  sleep 0.2
done

openbox &
x11vnc -display :99 -forever -shared -nopw -quiet -rfbport 5900 &
websockify --web=/usr/share/novnc 6080 localhost:5900 &

echo "CoreTrace is starting. Open http://localhost:6080/ in a browser (it connects on its own)."

# There is no GPU in the container: make WebKitGTK render in software instead of
# opening a blank window.
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export LIBGL_ALWAYS_SOFTWARE=1

# Signing in stores the session in the desktop keyring: give the container one,
# unlocked with an empty password, or every sign-in is refused.
exec dbus-run-session -- sh -c '
  printf "\n" | gnome-keyring-daemon --unlock --components=secrets --daemonize >/dev/null
  exec coretrace-desktop "$@"' sh "$@"
