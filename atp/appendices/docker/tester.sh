# Shared by build.sh and run.sh so both select the same image.
# The container user takes the UID of whoever owns the mounted data set, so the app can
# change its files. Under sudo, that is the user who ran sudo, not root.
if [ -z "$TESTER_UID" ]; then
  TESTER_UID="$(id -u)"
  if [ "$TESTER_UID" = "0" ] && [ -n "$SUDO_UID" ]; then
    TESTER_UID="$SUDO_UID"
  fi
fi
# Check the UID here, so a bad value fails now rather than after the package downloads.
case "$TESTER_UID" in
  '' | *[!0-9]*)
    echo "TESTER_UID must be a decimal number, not '$TESTER_UID'." >&2
    exit 1
    ;;
esac
# Drop leading zeros: "0010" is UID 10, and "0000" is root.
TESTER_UID="$(printf '%s' "$TESTER_UID" | sed 's/^0*//')"
if [ "${#TESTER_UID}" -gt 10 ] || [ "${TESTER_UID:-0}" -gt 4294967294 ]; then
  echo "TESTER_UID is out of range: the largest UID is 4294967294." >&2
  exit 1
fi
if [ -z "$TESTER_UID" ]; then
  echo "Run the ATP scripts as your own user, or set TESTER_UID to the" >&2
  echo "UID that owns the data set. To use Docker without sudo, see" >&2
  echo "https://docs.docker.com/engine/install/linux-postinstall/" >&2
  exit 1
fi
IMAGE="coretrace-gui-atp:uid-$TESTER_UID"
