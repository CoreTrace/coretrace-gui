#!/bin/sh
# Builds the acceptance-test image. Works on Linux and on macOS (Docker Desktop).
# On Apple Silicon the amd64 platform is forced because the published AppImage
# is x86-64 only; expect the emulated app to be noticeably slower.
set -e
VERSION="${CTRACE_GUI_VERSION:-5.0.2}"
PLATFORM_FLAG=""
if [ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ]; then
  PLATFORM_FLAG="--platform linux/amd64"
fi
# shellcheck disable=SC2086
docker build $PLATFORM_FLAG --build-arg CTRACE_GUI_VERSION="$VERSION" -t coretrace-gui-atp .
echo "Image built: coretrace-gui-atp (CoreTrace GUI $VERSION)"
