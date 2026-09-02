# CoreTrace GUI — reproducible acceptance-test environment (Linux, and macOS via
# Docker Desktop). The image downloads the published Linux AppImage, extracts it
# and serves the running application over noVNC so the tester only needs a
# browser. No source build is required.
#
#   docker build -t coretrace-gui-atp .
#   ./run.sh
#   open http://localhost:6080
#
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# X server, VNC bridge, and the shared libraries Electron links against.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xvfb x11-utils x11vnc novnc websockify python3 \
      libgtk-3-0t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
      libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libxshmfence1 libnss3 libnspr4 libxss1 libxtst6 libnotify4 \
      libasound2t64 libsecret-1-0 libglib2.0-0t64 \
      fonts-dejavu-core xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Version under test. Override with --build-arg to test another release.
ARG CTRACE_GUI_VERSION=5.1.0

RUN curl -fL --retry 3 -o /tmp/CtraceGUI.AppImage \
      "https://github.com/CoreTrace/coretrace-gui/releases/download/v${CTRACE_GUI_VERSION}/CtraceGUI-${CTRACE_GUI_VERSION}.AppImage" \
    && chmod +x /tmp/CtraceGUI.AppImage \
    && cd /opt && /tmp/CtraceGUI.AppImage --appimage-extract > /dev/null \
    && mv squashfs-root ctrace-gui \
    && rm /tmp/CtraceGUI.AppImage \
    && chmod -R a+rX /opt/ctrace-gui

# Electron refuses to run its sandbox as root, so the app runs as an ordinary user.
# /tmp/.X11-unix is created here because Xvfb cannot create it as a non-root user
# and prints an alarming "ERROR" when it is missing, even though it goes on to
# start normally — a tester should not have to judge whether that is a defect.
RUN useradd -m -s /bin/bash tester && mkdir -p /home/tester/workspace \
    && chown -R tester:tester /home/tester \
    && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER tester
WORKDIR /home/tester
ENV DISPLAY=:99

EXPOSE 6080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
