#!/usr/bin/env python3
"""Holt aus swissTLM3D (swisstopo) nur die Ebene TLM_EISENBAHN.

Das ZIP ist 3,6 GB gross; gelesen werden nur sein Inhaltsverzeichnis und die
vier Dateien der Ebene (etwa 60 MB), mit HTTP-Range-Anfragen. Ablage:
data/raw/tlm3d/. Kostenlose Geodaten (OGD) von swisstopo, Quellenangabe Pflicht.

    python3 pipeline/fetch_tlm3d.py
"""
import io
import urllib.request
import zipfile
from pathlib import Path

STAND = "2026-02"
URL = ("https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/"
       f"swisstlm3d_{STAND}/swisstlm3d_{STAND}_2056_5728.shp.zip")
AUSGABE = Path(__file__).resolve().parent.parent / "data" / "raw" / "tlm3d"
EBENE = "swissTLM3D_TLM_EISENBAHN"


class Fern(io.RawIOBase):
    """Eine Datei im Netz, gelesen in Stücken"""

    def __init__(self, url):
        self.url, self.pos = url, 0
        kopf = urllib.request.urlopen(urllib.request.Request(url, method="HEAD"))
        self.size = int(kopf.headers["Content-Length"])

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, o, woher=0):
        self.pos = o if woher == 0 else self.pos + o if woher == 1 else self.size + o
        return self.pos

    def read(self, n=-1):
        n = self.size - self.pos if n < 0 else min(n, self.size - self.pos)
        if n <= 0:
            return b""
        r = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        d = urllib.request.urlopen(r, timeout=300).read()
        self.pos += len(d)
        return d

    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)


def main():
    AUSGABE.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(Fern(URL), buffer_size=1 << 20))
    for info in z.infolist():
        name = info.filename.replace("\\", "/").rsplit("/", 1)[-1]
        if name.startswith(EBENE + ".") and not name.endswith(".lock"):
            (AUSGABE / name).write_bytes(z.read(info))
            print("ok", name, info.file_size)


if __name__ == "__main__":
    main()
