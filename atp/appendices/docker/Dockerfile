# CoreTrace Desktop — reproducible acceptance-test environment for any OS with
# Docker. The image installs the published Linux package and the ctrace analyser,
# and serves the running application over noVNC so the tester only needs a
# browser. No source build is required.
#
#   ./build.sh
#   ./run.sh
#   open http://localhost:6080
#
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# X server, VNC bridge and a window manager. Without a window manager the file
# pickers never get keyboard focus, so a tester cannot type a path in them.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xvfb x11-utils x11vnc novnc websockify python3 openbox \
      dbus-x11 gnome-keyring libsecret-tools \
      libgtk-3-0t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
      libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libxshmfence1 libnss3 libnspr4 libxss1 libxtst6 libnotify4 \
      libasound2t64 libsecret-1-0 libglib2.0-0t64 \
      fonts-dejavu-core xdg-utils gnupg wget git \
    && rm -rf /var/lib/apt/lists/*

# clang 20 is a hard runtime requirement of the analyser: it compiles the source
# under test to LLVM IR before analysing it, and needs a resource directory
# matching the LLVM it links (libclang-cpp.so.20.1). Ubuntu 24.04 only ships
# clang 18, which fails with "'stddef.h' file not found".
#
# Without it the analyser does not error out — it reports "0 diagnostics" for
# every input, so a tester would mark the clean-file scenario as passing while
# nothing is actually being analysed. That silence is why this is installed
# here rather than left to the tester.
RUN wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key \
      | gpg --dearmor -o /usr/share/keyrings/llvm.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/llvm.gpg] http://apt.llvm.org/noble/ llvm-toolchain-noble-20 main" \
      > /etc/apt/sources.list.d/llvm20.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends clang-20 \
    && ln -sf /usr/bin/clang-20 /usr/bin/clang \
    && ln -sf /usr/bin/clang++-20 /usr/bin/clang++ \
    && rm -rf /var/lib/apt/lists/*

# Version under test. Override with --build-arg to test another release.
ARG CORETRACE_VERSION=6.0.0-beta.3

# The .deb declares its own dependencies (WebKitGTK, GTK), so apt resolves them.
RUN curl -fL --retry 3 -o /tmp/coretrace.deb \
      "https://github.com/CoreTrace/coretrace-gui/releases/download/v${CORETRACE_VERSION}/CoreTrace_${CORETRACE_VERSION}_amd64.deb" \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/coretrace.deb \
    && rm -rf /tmp/coretrace.deb /var/lib/apt/lists/*

# Local analysis needs a ctrace binary chosen once in Paramètres; the desktop
# ships none. The v6.0.0-beta.3 notes point to v0.74.0, but that version writes a
# report the desktop cannot read ("Format de rapport non reconnu").
ARG CTRACE_VERSION=0.85.0
RUN mkdir -p /opt/coretrace \
    && curl -fL --retry 3 "https://github.com/CoreTrace/coretrace/releases/download/v${CTRACE_VERSION}/coretrace-v${CTRACE_VERSION}-linux-amd64.tar.gz" \
      | tar -xz --strip-components=1 -C /opt/coretrace \
    && chmod -R a+rX /opt/coretrace

# The app runs as an ordinary user, like on a tester's own machine.
# /tmp/.X11-unix is created here because Xvfb cannot create it as a non-root user
# and prints an alarming "ERROR" when it is missing, even though it goes on to
# start normally — a tester should not have to judge whether that is a defect.
RUN useradd -m -s /bin/bash tester && mkdir -p /home/tester/workspace \
    && chown -R tester:tester /home/tester \
    && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# noVNC's own vnc.html opens a panel with a Connect button and shows a blank
# canvas until it is clicked, which reads as "the container is broken". Make the
# bare URL redirect straight into a connected, scaled session so a tester only
# has to open http://localhost:6080/ and never hunts for a control to press.
RUN printf '%s\n' \
      '<!doctype html><meta charset="utf-8"><title>CoreTrace GUI</title>' \
      '<meta http-equiv="refresh" content="0; url=vnc.html?autoconnect=true&resize=scale&reconnect=true">' \
      '<p>Connecting to CoreTrace GUI… <a href="vnc.html?autoconnect=true&resize=scale&reconnect=true">open it manually</a>.</p>' \
      > /usr/share/novnc/index.html

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER tester
WORKDIR /home/tester
ENV DISPLAY=:99

EXPOSE 6080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
