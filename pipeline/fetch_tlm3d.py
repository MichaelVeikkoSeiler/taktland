#!/usr/bin/env python3
"""Holt aus swissTLM3D (swisstopo) nur die Ebene TLM_EISENBAHN.

Das ZIP ist 3,6 GB gross; gelesen werden nur sein Inhaltsverzeichnis und die
vier Dateien der Ebene (etwa 60 MB), mit HTTP-Range-Anfragen. Ablage:
data/raw/tlm3d/. Kostenlose Geodaten (OGD) von swisstopo, Quellenangabe Pflicht.

Mit --baeume statt dessen die Ebenen für pipeline/build_baeume.py: von TLM_EINZELBAUM nur die Geometrie (.shp, etwa
500 MB), von TLM_BODENBEDECKUNG die ganze Ebene (etwa 2,8 GB) und TLM_EISENBAHN für den Lichtraum der Gleise.

Mit --strassen die Ebene TLM_STRASSE (Geometrie mit Höhe und Attribute, etwa 520 MB gepackt, 3,3 GB entpackt) für
pipeline/build_strassenbruecken.py.

    python3 pipeline/fetch_tlm3d.py
    python3 pipeline/fetch_tlm3d.py --baeume
    python3 pipeline/fetch_tlm3d.py --strassen
"""
import io
import sys
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


def gewollt(name):
    if "--seen" in sys.argv:
        # nur die Bodenbedeckung, für das Ufer der Seen (pipeline/build_seeufer.py)
        return name.startswith("swissTLM3D_TLM_BODENBEDECKUNG_") and name.rsplit(".", 1)[-1] in ("shp", "shx", "dbf", "cpg", "CPG")
    if "--strassen" in sys.argv:
        return name.startswith("swissTLM3D_TLM_STRASSE.") and name.rsplit(".", 1)[-1] in ("shp", "shx", "dbf", "cpg")
    if "--baeume" not in sys.argv:
        return name.startswith(EBENE + ".") and not name.endswith(".lock")
    # die Gleisachsen für den Lichtraum der Bäume
    if name.startswith(EBENE + ".") and not name.endswith(".lock"):
        return True
    if name.startswith("swissTLM3D_TLM_EINZELBAUM_"):
        return name.endswith(".shp")
    return name.startswith("swissTLM3D_TLM_BODENBEDECKUNG_") and name.rsplit(".", 1)[-1] in ("shp", "shx", "dbf", "cpg", "CPG")


def main():
    AUSGABE.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(Fern(URL), buffer_size=1 << 20))
    for info in z.infolist():
        name = info.filename.replace("\\", "/").rsplit("/", 1)[-1]
        if gewollt(name):
            # in Stücken, die grossen Dateien passen nicht am Stück in den Speicher
            with z.open(info) as quelle, open(AUSGABE / (name + ".teil"), "wb") as ziel:
                while block := quelle.read(1 << 24):
                    ziel.write(block)
            (AUSGABE / (name + ".teil")).rename(AUSGABE / name)
            print("ok", name, info.file_size)


if __name__ == "__main__":
    main()
