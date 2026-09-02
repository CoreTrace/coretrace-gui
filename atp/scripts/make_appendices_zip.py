# -*- coding: utf-8 -*-
"""Build the ATP appendices archive.

`shutil.make_archive` is not usable here. Built from a Windows working copy it
produced an archive that failed for every tester, in three independent ways:

  - shell scripts carried CRLF line endings, so the kernel looked for an
    interpreter named "/bin/sh\\r" and reported "no such file or directory"
  - shell scripts were stored as mode 0666, so `./build.sh` was refused with
    "Permission denied"
  - directory entries were missing their traverse bits

This writes the archive deterministically instead: LF for text, 0755 for
scripts, 0644 for everything else.
"""
import io
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'appendices')
OUT = os.path.join(ROOT, 'CoreTrace-GUI_ATP_appendices.zip')

# Files a tester runs directly, plus the Dockerfile the daemon parses: all must
# reach them with Unix line endings.
EXECUTABLE = {'.sh'}
TEXT = {'.sh', '.md', '.c', '.cpp', '.txt', ''}


def is_text(name):
    return os.path.splitext(name)[1].lower() in TEXT or os.path.basename(name) == 'Dockerfile'


def is_executable(name):
    return os.path.splitext(name)[1].lower() in EXECUTABLE


def main():
    if os.path.exists(OUT):
        os.remove(OUT)

    written = []
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as archive:
        for folder, _dirs, files in os.walk(SOURCE):
            for name in sorted(files):
                full = os.path.join(folder, name)
                arcname = os.path.relpath(full, ROOT).replace(os.sep, '/')

                data = io.open(full, 'rb').read()
                if is_text(arcname):
                    data = data.replace(b'\r\n', b'\n')

                info = zipfile.ZipInfo(arcname, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                # unzip only honours the Unix mode bits when the entry claims a
                # Unix host system. Built on Windows, ZipInfo defaults to FAT (0)
                # and every script lands as 0644 however it was stored here.
                info.create_system = 3
                info.external_attr = (0o755 if is_executable(arcname) else 0o644) << 16
                archive.writestr(info, data)
                written.append((arcname, oct(info.external_attr >> 16)))

    size = os.path.getsize(OUT) / 1024.0
    print('wrote %s (%.0f KB, %d entries)' % (os.path.basename(OUT), size, len(written)))
    for arcname, mode in written:
        print('  %-52s %s' % (arcname, mode))


if __name__ == '__main__':
    main()
