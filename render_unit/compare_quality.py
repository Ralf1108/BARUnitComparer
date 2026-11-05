"""compare_quality.py: how much quality do the picture formats lose against the lossless PNG? (specification.md, section 12)

    python compare_quality.py [--work DIR] [--size 400] [--units FILE] <unit> [<unit> ...]

Renders every unit once as a lossless PNG (with render_unit.py, the same settings), encodes it in several formats and quality settings, decodes it again and measures
the difference to the lossless picture:
  PSNR  peak signal to noise ratio in dB over the colour channels: higher is better; above 40 dB hardly anyone sees a difference, 30 to 35 dB is visible when looking closely.
  SSIM  structural similarity (0 to 1, 1 = identical, Gaussian window 11 x 11, on the brightness); above 0.99 the picture looks the same.
  A     PSNR of the alpha channel (the soft shadow); only for the formats with transparency (WebP, AVIF).
Pictures with transparency are compared as they would look on a white and on a dark page (composite), the worse value counts; JPEG has no transparency and is
compared on white (as it is written). The size is the mean file size over all units.
"""
import argparse, io, sys, tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

import render_unit as ru

SETTINGS = ([('png', {})]
            + [('jpeg', {'q': q, 's': s}) for s in (2, 0) for q in (80, 85, 90, 95)]
            + [('webp', {'q': q}) for q in (75, 80, 85, 90, 95)]
            + [('avif', {'q': q}) for q in (50, 60, 70, 80, 90)])


def composite(im, bg):
    flat = Image.new('RGBA', im.size, bg + (255,))
    flat.alpha_composite(im)
    return np.asarray(flat.convert('RGB')).astype(np.float64)


def psnr(a, b):
    mse = np.mean((a - b) ** 2)
    return 99.0 if mse == 0 else 10 * np.log10(255.0 ** 2 / mse)


def ssim(a, b):
    """SSIM of the brightness (Gaussian window sigma 1.5, as in the paper of Wang et al.)."""
    y = lambda x: x @ np.array([0.299, 0.587, 0.114])
    a, b = y(a), y(b)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    g = lambda x: gaussian_filter(x, 1.5, truncate=3.5)
    ma, mb = g(a), g(b)
    saa, sbb, sab = g(a * a) - ma * ma, g(b * b) - mb * mb, g(a * b) - ma * mb
    return float(np.mean(((2 * ma * mb + c1) * (2 * sab + c2)) / ((ma * ma + mb * mb + c1) * (saa + sbb + c2))))


def encode(im, fmt, p):
    buf = io.BytesIO()
    if fmt == 'png':
        im.save(buf, 'PNG', optimize=True)
    elif fmt == 'jpeg':
        flat = Image.new('RGBA', im.size, (255, 255, 255, 255))
        flat.alpha_composite(im)
        flat.convert('RGB').save(buf, 'JPEG', quality=p['q'], subsampling=p['s'], optimize=True)
    elif fmt == 'webp':
        im.save(buf, 'WEBP', quality=p['q'], method=4)
    elif fmt == 'avif':
        im.save(buf, 'AVIF', quality=p['q'], speed=6)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('units', nargs='+')
    ap.add_argument('--work', default=str(Path(tempfile.gettempdir()) / 'render_unit'))
    ap.add_argument('--size', default='400')
    ap.add_argument('--units-file', '--units', dest='units_file', default='')
    a = ap.parse_args()
    cmd = [sys.executable, str(ru.HERE / 'render_unit.py'), '--work', a.work, '--size', a.size, '--out', str(Path(a.work) / 'quality_png'), '--format', 'png']
    if a.units_file:
        cmd += ['--units', a.units_file]
    import subprocess
    if subprocess.run(cmd + a.units).returncode:
        sys.exit(1)
    pics = [Image.open(Path(a.work) / 'render' / f'{u}.png').convert('RGBA') for u in a.units]

    rows = []
    for fmt, p in SETTINGS:
        res = {'size': [], 'psnr': [], 'ssim': [], 'a': []}
        for im in pics:
            data = encode(im, fmt, p)
            dec = Image.open(io.BytesIO(data)).convert('RGBA')
            res['size'].append(len(data))
            worst_psnr, worst_ssim = 99.0, 1.0
            for bg in ((255, 255, 255), (30, 30, 30)) if fmt in ('png', 'webp', 'avif') else ((255, 255, 255),):
                ref, got = composite(im, bg), composite(dec, bg)
                worst_psnr, worst_ssim = min(worst_psnr, psnr(ref, got)), min(worst_ssim, ssim(ref, got))
            res['psnr'].append(worst_psnr)
            res['ssim'].append(worst_ssim)
            if fmt in ('webp', 'avif'):
                res['a'].append(psnr(np.asarray(im)[..., 3].astype(float), np.asarray(dec)[..., 3].astype(float)))
        label = fmt + ''.join(f' {k}={v}' for k, v in p.items())
        rows.append((label, np.mean(res['size']), np.mean(res['psnr']), np.mean(res['ssim']), np.mean(res['a']) if res['a'] else None))

    print(f'\nmean over {len(pics)} picture(s) of {a.size} x {a.size} pixels  (jpeg s: 0 = 4:4:4, 2 = 4:2:0)\n')
    print(f'{"format and setting":<22}{"size KB":>9}{"PSNR dB":>10}{"SSIM":>9}{"alpha dB":>10}')
    for label, size, ps, ss, al in rows:
        print(f'{label:<22}{size / 1024:>9.1f}{ps:>10.1f}{ss:>9.4f}{(f"{al:.1f}" if al is not None else "-"):>10}')


if __name__ == '__main__':
    main()
