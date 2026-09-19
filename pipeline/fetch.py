#!/usr/bin/env python3
"""Laedt die Datasets aus sources.py als CSV nach data/raw/.

Aufruf:
    python pipeline/fetch.py              # alle Datasets
    python pipeline/fetch.py perron       # nur einzelne
    python pipeline/fetch.py --force      # vorhandene Dateien neu laden
"""
import gzip
import io
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sources import DATASETS  # noqa: E402

BASE = "https://data.sbb.ch/api/explore/v2.1/catalog/datasets"
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def download(dataset_id, dest):
    url = f"{BASE}/{urllib.parse.quote(dataset_id)}/exports/csv?delimiter=%3B"
    req = urllib.request.Request(
        url, headers={"User-Agent": "taktland-fetch/0.1", "Accept-Encoding": "gzip"}
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    text = raw.decode("utf-8-sig")
    dest.write_text(text, encoding="utf-8")
    return len(text.splitlines()) - 1, len(raw)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    ids = args or list(DATASETS)
    RAW.mkdir(parents=True, exist_ok=True)
    for did in ids:
        dest = RAW / f"{did}.csv"
        if dest.exists() and not force:
            print(f"skip {did:<48} (vorhanden, --force zum Neuladen)")
            continue
        t0 = time.time()
        try:
            rows, size = download(did, dest)
            print(f"ok   {did:<48} {rows:>7} Zeilen  {size/1e6:>6.1f} MB  {time.time()-t0:.1f}s")
        except Exception as e:  # noqa: BLE001
            print(f"FEHL {did:<48} {e}")
        time.sleep(0.5)


if __name__ == "__main__":
    main()
