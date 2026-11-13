"""compare_quality.py: how much quality do the picture formats lose against the lossless PNG? (docs/renderer.md)

    python compare_quality.py [--work DIR] [--size 400] [--units FILE] <unit> [<unit> ...]

Renders every unit once as a lossless PNG (with render_unit.py, the same settings), encodes it in several formats and quality settings, decodes it again and measures
the difference to the lossless picture:
  PSNR  peak signal to noise ratio in dB over the colour channels: higher is better; above 40 dB hardly anyone sees a difference, 30 to 35 dB is visible when looking closely.
  SSIM  structural similarity (0 to 1, 1 = identical, Gaussian window 11 x 11, on the brightness); above 0.99 the picture looks the same.
  A     PSNR of the alpha channel (the soft shadow); only for the formats with transparency (WebP, AVIF).
Pictures with transparency are compared as they would look on a white and on a dark page (composite), the worse value counts; JPEG has no transparency and is
compared on white (as it is written). The size is the mean file size over all units.
"""
import argparse, io, subprocess, sys, tempfile
from types import SimpleNamespace
from pathlib import Path

import numpy as np
from PIL import Image

import render_unit as ru

SETTINGS = ([('png', {})]
            + [('jpeg', {'q': q, 's': s}) for s in (2, 0) for q in (80, 85, 90, 95)]
            + [('webp', {'q': q}) for q in (75, 80, 85, 90, 95)]
            + [('avif', {'q': q}) for q in (50, 60, 70, 80, 90)])


def encode(im, fmt, p):
    """The picture in the format and setting `p` as bytes (the same encoder as render_unit.py)."""
    buf = io.BytesIO()
    q = p.get('q')
    opt = SimpleNamespace(jpeg_quality=q, jpeg_subsampling=p.get('s'), avif_quality=q, avif_speed=6, webp_quality=q, webp_method=4)
    ru.save_as(im, fmt, buf, opt)
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
            psnr, ssim, alpha = ru.measure(im, dec, fmt in ('png', 'webp', 'avif'))   # the same measure as the quality check of render_unit.py
            res['psnr'].append(psnr)
            res['ssim'].append(ssim)
            if fmt in ('webp', 'avif'):
                res['a'].append(alpha)
        label = fmt + ''.join(f' {k}={v}' for k, v in p.items())
        rows.append((label, np.mean(res['size']), np.mean(res['psnr']), np.mean(res['ssim']), np.mean(res['a']) if res['a'] else None))

    print(f'\nmean over {len(pics)} picture(s) of {a.size} x {a.size} pixels  (jpeg s: 0 = 4:4:4, 2 = 4:2:0)\n')
    print(f'{"format and setting":<22}{"size KB":>9}{"PSNR dB":>10}{"SSIM":>9}{"alpha dB":>10}')
    for label, size, ps, ss, al in rows:
        print(f'{label:<22}{size / 1024:>9.1f}{ps:>10.1f}{ss:>9.4f}{(f"{al:.1f}" if al is not None else "-"):>10}')


if __name__ == '__main__':
    main()
