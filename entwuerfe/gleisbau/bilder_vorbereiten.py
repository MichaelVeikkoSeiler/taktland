# Bereitet Michaels Gleisbau-Bilder (PNG von ChatGPT) für die App vor: python bilder_vorbereiten.py ORDNER_MIT_PNG app/src/assets/gleisbau (braucht numpy, pillow, scipy)
import sys, json, os
from PIL import Image
import numpy as np
from scipy import ndimage
Q, Z = sys.argv[1], sys.argv[2]
meta = {}
def sauber(a):
    al = a[..., 3].astype(int)
    al = np.where(al >= 240, 255, np.where(al <= 60, 0, al))
    lab, n = ndimage.label(al > 0)
    if n > 1:
        gr = ndimage.sum(np.ones_like(al), lab, range(1, n + 1))
        weg = np.isin(lab, [k + 1 for k, s in enumerate(gr) if s < 400])
        al = np.where(weg, 0, al)
    a[..., 3] = al
    return a
for f in sorted(os.listdir(Q)):
    if not f.endswith('.png'): continue
    name = f[:-4]
    if name == 'gb_bau_tunnelportal_n': continue  # Schachbrett im Bild, wartet auf neue Fassung
    im = Image.open(f'{Q}/{f}').convert('RGBA')
    if name.startswith('gb_textur') or name.startswith('gb_grund'):
        a = np.array(im.convert('RGB').resize((512, 512), Image.LANCZOS)).astype(float)
        n = a.shape[0]
        for ax in (1, 0):  # Ränder überblenden, damit sich die Textur ohne Naht wiederholt
            r = np.roll(a, n // 2, axis=ax)
            k = np.abs(np.arange(n) - n / 2) / (n / 2)
            k = np.clip((k - 0.55) / 0.45, 0, 1)
            k = k[None, :, None] if ax == 1 else k[:, None, None]
            a = a * (1 - k) + r * k
        Image.fromarray(a.astype('uint8')).save(f'{Z}/{name}.webp', quality=82)
        meta[name] = {'w': 512, 'h': 512}
        continue
    a = sauber(np.array(im))
    if name in ('gb_obj_nadelbaum_01', 'gb_obj_nadelbaum_04'):
        a[..., :3] = (a[..., :3] * 0.85).astype('uint8')  # etwas dunkler, damit sie sich im Mischwald abheben (gewählt)
    im = Image.fromarray(a)
    if name.startswith('gb_bau_perron'):
        im = im.resize((512, 512), Image.LANCZOS)
        im.save(f'{Z}/{name}.webp', quality=90)
        meta[name] = {'w': 512, 'h': 512}
        continue
    bb = im.getbbox(); im = im.crop(bb)
    gross = name.startswith('gb_obj_gipfel') or name.startswith('gb_bau_tunnelportal')
    m = 512 if gross else 320
    s = m / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    eintrag = {'w': im.width, 'h': im.height}
    if name.startswith('gb_bau_tunnelportal'):
        b = np.array(im).astype(int)
        dk = (b[..., :3].max(-1) < 75) & (b[..., 3] > 200)
        ys, xs = np.where(dk)
        eintrag['oeffnung'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    if name == 'gb_bau_prellbock_01':
        b = np.array(im).astype(int)
        rot = (b[..., 0] > 180) & (b[..., 1] < 90) & (b[..., 3] > 200)
        ys, xs = np.where(rot)
        eintrag['balken'] = int(np.median(xs))
    im.save(f'{Z}/{name}.webp', quality=86)
    meta[name] = eintrag
json.dump(meta, open(f'{Z}/../gleisbau-masse.json', 'w'), indent=0, sort_keys=True)
print(len(meta), 'Bilder', sum(os.path.getsize(f'{Z}/{k}.webp') for k in meta) // 1024, 'KB')
