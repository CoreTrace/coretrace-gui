#!/bin/sh
# Starts the acceptance-test container and mounts the test data set read-write
# (scenarios create, rename and delete files, so it must not be read-only).
set -e
DATASETS="${1:-$(cd "$(dirname "$0")/../datasets" && pwd)}"
PLATFORM_FLAG=""
if [ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ]; then
  PLATFORM_FLAG="--platform linux/amd64"
fi
echo "Mounting data set: $DATASETS -> /home/tester/workspace"
# noVNC has no password and the data set is writable: publish the port on this machine
# only, never on the network.
# shellcheck disable=SC2086
docker run --rm -it $PLATFORM_FLAG \
  --name coretrace-gui-atp \
  -p 127.0.0.1:6080:6080 \
  -v "$DATASETS":/home/tester/workspace \
  --shm-size=1g \
  coretrace-gui-atp
