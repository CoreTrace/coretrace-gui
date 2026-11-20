#!/bin/sh
# Append the build host's exact GUI runtime attributions to Debian/Ubuntu releases.
set -eu
pkg_root=${DPKG_ROOT:-/}
arch=$(dpkg --print-architecture)
gtk=libgtk-3-0t64
if ! dpkg-query -W -f='${db:Status-Status}' "$gtk:$arch" 2>/dev/null | grep -qx installed; then
  gtk=libgtk-3-0
fi
printf 'LINUX WEBVIEW AND TOOLKIT\n'
for pkg in "$gtk" libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0; do
  printf '\n'
  dpkg-query -W -f='Binary: ${binary:Package} ${Version}\nSource: ${source:Package} ${source:Version}\n' "$pkg:$arch"
  cat "$pkg_root/usr/share/doc/$pkg/copyright"
done
