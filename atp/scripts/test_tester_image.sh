#!/bin/sh
# Exercise both entry points without building images or starting a container.
set -eu
docker_dir=$(cd "$(dirname "$0")/../appendices/docker" && pwd)
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
printf '%s\n' '#!/bin/sh' 'printf "%s\n" "$@"' > "$temp/docker"
printf '%s\n' '#!/bin/sh' 'echo "$HOST_UID"' > "$temp/id"
chmod +x "$temp/docker" "$temp/id"
export PATH="$temp:$PATH"
cd "$docker_dir"

check_image() {
  ./build.sh > "$temp/build"
  ./run.sh > "$temp/run"
  grep -Fxq "TESTER_UID=$1" "$temp/build"
  grep -Fxq "coretrace-gui-atp:uid-$1" "$temp/build"
  grep -Fxq "coretrace-gui-atp:uid-$1" "$temp/run"
  grep -Fxq "coretrace-gui-atp-$1" "$temp/run"
}

unset SUDO_UID TESTER_UID
export HOST_UID=501
check_image 501
export HOST_UID=0 SUDO_UID=1000
check_image 1000
export TESTER_UID=001001
check_image 1001
for TESTER_UID in 0 0000 invalid 4294967295; do
  if ./build.sh >/dev/null 2>&1 || ./run.sh >/dev/null 2>&1; then
    echo "Accepted invalid TESTER_UID=$TESTER_UID" >&2
    exit 1
  fi
done
