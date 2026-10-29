#!/usr/bin/env python3
"""Descarga .deb de Ubuntu sin root y los extrae en ~/libs/root (para Chromium)."""
import gzip
import io
import os
import subprocess
import sys
import urllib.request

BASE = "http://archive.ubuntu.com/ubuntu"
SUITES = ["noble", "noble-updates", "noble-security"]
COMPONENTS = ["main", "universe"]
ARCH = "amd64"
DEST = os.path.expanduser("~/libs/deb")
ROOT = os.path.expanduser("~/libs/root")

WANTED = [
    "libnss3", "libnspr4", "libatk1.0-0t64", "libatk-bridge2.0-0t64", "libatspi2.0-0t64",
    "libcups2t64", "libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3",
    "libxrandr2", "libgbm1", "libasound2t64", "libcairo2", "libpango-1.0-0",
    "libpangocairo-1.0-0", "libpangoft2-1.0-0", "libharfbuzz0b", "libfontconfig1",
    "libfreetype6", "libpixman-1-0", "libpng16-16t64", "libxcb1", "libx11-6", "libxext6",
    "libxi6", "libxtst6", "libdrm2", "libexpat1", "libbrotli1", "libgraphite2-3",
    "libthai0", "libdatrie1", "libfribidi0", "libgdk-pixbuf-2.0-0", "libdbus-1-3",
    "libwayland-client0", "libwayland-server0", "libglib2.0-0t64", "libpcre2-8-0",
    "libzstd1", "libbz2-1.0", "liblzma5", "libuuid1", "libbsd0", "libgcrypt20",
    "libgpg-error0", "liblz4-1", "libxau6", "libxdmcp6", "libmd0", "libcap2",
    "libxrender1", "libxcb-render0", "libavahi-client3", "libavahi-common3",
    "libxcb-shm0", "libxcb-glx0", "libxcb-dri3-0", "libxcb-present0", "libxcb-sync1",
    "libxshmfence1", "libxxf86vm1",
]


def load_packages():
    table = {}
    for suite in SUITES:
        for comp in COMPONENTS:
            url = f"{BASE}/dists/{suite}/{comp}/binary-{ARCH}/Packages.gz"
            try:
                with urllib.request.urlopen(url, timeout=60) as resp:
                    raw = resp.read()
            except Exception as exc:  # noqa: BLE001
                print(f"aviso: no pude leer {url}: {exc}")
                continue
            text = gzip.GzipFile(fileobj=io.BytesIO(raw)).read().decode("utf-8", "replace")
            for stanza in text.split("\n\n"):
                fields = {}
                for line in stanza.splitlines():
                    if line.startswith((" ", "\t")) or ":" not in line:
                        continue
                    key, _, value = line.partition(":")
                    fields[key.strip()] = value.strip()
                pkg = fields.get("Package")
                if not pkg:
                    continue
                if fields.get("Architecture") not in (ARCH, "all"):
                    continue
                if pkg in WANTED:
                    table[pkg] = fields.get("Filename")
    return table


def main():
    os.makedirs(DEST, exist_ok=True)
    os.makedirs(ROOT, exist_ok=True)
    table = load_packages()
    missing = [p for p in WANTED if p not in table]
    if missing:
        print("sin índice:", ", ".join(missing))
    downloaded = 0
    for pkg, filename in table.items():
        if not filename:
            continue
        target = os.path.join(DEST, os.path.basename(filename))
        if not os.path.exists(target):
            try:
                urllib.request.urlretrieve(f"{BASE}/{filename}", target)
            except Exception as exc:  # noqa: BLE001
                print(f"error descargando {pkg}: {exc}")
                continue
        subprocess.run(["dpkg", "-x", target, ROOT], check=False)
        downloaded += 1
    print(f"paquetes extraídos: {downloaded}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
