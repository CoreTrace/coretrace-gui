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
# shellcheck disable=SC2086
docker build $PLATFORM_FLAG --build-arg CORETRACE_VERSION="$VERSION" \
  --build-arg TESTER_UID="$(id -u)" -t coretrace-gui-atp .
echo "Image built: coretrace-gui-atp (CoreTrace Desktop $VERSION)"
