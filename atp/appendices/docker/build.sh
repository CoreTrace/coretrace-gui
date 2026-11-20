#!/bin/sh
# Builds the acceptance-test image. Works on Linux and on macOS (Docker Desktop).
# On Apple Silicon the amd64 platform is forced because the published Linux build
# is x86-64 only; expect the emulated app to be noticeably slower.
set -e
VERSION="${CORETRACE_VERSION:-6.0.0-beta.3}"
PLATFORM_FLAG=""
if [ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ]; then
  PLATFORM_FLAG="--platform linux/amd64"
fi
# The container user takes the UID of whoever owns the mounted data set, so the app can
# change its files. Under sudo, that is the user who ran sudo, not root.
if [ -z "$TESTER_UID" ]; then
  TESTER_UID="$(id -u)"
  if [ "$TESTER_UID" = "0" ] && [ -n "$SUDO_UID" ]; then
    TESTER_UID="$SUDO_UID"
  fi
fi
if [ "$TESTER_UID" = "0" ]; then
  echo "Cannot build as root: run ./build.sh as your own user, or set TESTER_UID to the" >&2
  echo "UID that owns the data set. To use Docker without sudo, see" >&2
  echo "https://docs.docker.com/engine/install/linux-postinstall/" >&2
  exit 1
fi
# shellcheck disable=SC2086
docker build $PLATFORM_FLAG --build-arg CORETRACE_VERSION="$VERSION" \
  --build-arg TESTER_UID="$TESTER_UID" -t coretrace-gui-atp .
echo "Image built: coretrace-gui-atp (CoreTrace Desktop $VERSION)"
