"""
Michaels Vorlagen des Führerstands (2026-10-23) fürs Bild-Cockpit: Fenster, Seitenfenster und Reste der gemalten Landschaft
durchsichtig, aussen dunkel. Danach als WebP nach app/src/assets/fuehrerstand-quer.webp und -hoch.webp:

    .venv/bin/python entwuerfe/fuehrerstand/schneiden.py
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
HIER = Path(__file__).resolve().parent
U = str(HIER) + '/'
def schneiden(datei, poly, wischer, ziel, rand=10, saum=3, seite_tol=14):
    im = Image.open(U + datei).convert('RGBA')
    # aussen um den Führerstand durchsichtig: dort dunkel wie der Rahmen, sonst schiene die Landschaft neben den Säulen durch
    grund = Image.new('RGBA', im.size, (24, 27, 31, 255)); grund.alpha_composite(im); im = grund
    w, h = im.size
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).polygon(poly, fill=255)
    innen = np.asarray(m) > 0
    gross = np.asarray(m.filter(ImageFilter.MaxFilter(2 * saum + 1))) > 0
    klein = np.asarray(m.filter(ImageFilter.MinFilter(2 * rand + 1))) > 0
    a = np.asarray(im).copy()
    lum = a[..., :3].astype(int).mean(axis=2)
    dunkel = lum < 40
    wx0, wy0 = wischer
    yy, xx = np.mgrid[0:h, 0:w]
    weg = gross & ~( (dunkel & ~klein) | (dunkel & (xx > wx0) & (yy > wy0)) )
    a[weg, 3] = 0
    # die Seitenfenster: die hellen, schrägen Flächen in den Säulen (Michael, 2026-10-24: «Bei den Seitenfenstern sieht man noch
    # nicht hinaus»), gefunden an ihrer Farbe, nur grosse Flächen über dem Pult, Löcher geschlossen
    from scipy import ndimage
    farbe = np.abs(a[..., :3].astype(int) - np.array([89, 111, 137])).max(axis=2) < seite_tol
    farbe[poly[2][1]:] = False
    lab, n = ndimage.label(farbe)
    gr = ndimage.sum(farbe, lab, range(1, n + 1))
    seiten = np.isin(lab, [i + 1 for i in range(n) if gr[i] > 5000])
    seiten = ndimage.binary_fill_holes(ndimage.binary_closing(seiten, iterations=3))
    a[seiten, 3] = 0
    print('Seitenfenster', int(seiten.sum()))
    # Reste der gemalten Landschaft über dem Pult (Himmel, Gras, Laub, Fels in den kleinen Seitenfenstern): weg, mit 2 Bildpunkten Saum
    r, g, b = (a[..., i].astype(int) for i in range(3))
    himmel = (b > 170) & (b > r + 40)
    gruen = (g > r + 25) & (g > b + 25)
    gelb = (r > 150) & (g > 150) & (b < 110)
    # Fels: hell und eher warm, der Führerstand ist überall bläulich grau
    fels = (r + g + b > 270) & (r >= b)
    rest = (himmel | gruen | gelb | fels)
    rest[poly[2][1] - 2:] = False
    rest = ndimage.binary_dilation(rest, iterations=2)
    rest[poly[2][1]:] = False
    a[rest, 3] = 0
    print('Reste', int(rest.sum()))
    Image.fromarray(a).save(ziel)
    print(ziel, w, h)
ziel_ordner = str(HIER)
schneiden('vorlage-quer.png', [(247, 63), (1597, 63), (1522, 502), (320, 502)], (1340, 230), ziel_ordner + '/cockpit-quer.png')
schneiden('vorlage-hoch.png', [(4, 26), (1082, 26), (990, 1047), (118, 1047)], (780, 780), ziel_ordner + '/cockpit-hoch.png', seite_tol=20)

from PIL import Image as _Bild
for _n in ('quer', 'hoch'):
    _Bild.open(f'{ziel_ordner}/cockpit-{_n}.png').save(HIER.parent.parent / f'app/src/assets/fuehrerstand-{_n}.webp', quality=88, method=6)
