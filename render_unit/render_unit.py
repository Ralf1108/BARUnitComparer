"""render_unit.py: pictures of Beyond All Reason units, rendered from the game's own model files (specification.md, section 12).

    python render_unit.py [--out DIR] [--data DIR] [--game NAME] [--work DIR] [--size 400] [--tex-size 2048] [--team R,G,B]
                          [--browser EXE] [--param key=value ...] <unit> [<unit> ...]      (or @file with one unit name per line)

For every unit it writes <out>/<unit>.<format> (--format: png, bmp, avif, webp or all). The browser renders a lossless PNG with transparent background (the shadow is
semi-transparent), the wanted formats are made from it; the encoding
is a separate step, so that its settings can be tried without rendering again (--format all puts the formats side by side).

What it does: reads the model (.s3o) and the textures of the unit from the game's pool (specification.md, section 5), converts the textures of a faction once
(cached in --work), then lets the browser (renderer/index.html, three.js) render all units in one session.
Needs: Python with numpy and Pillow, Node.js (the first run installs three.js and playwright-core with npm), Microsoft Edge or Chrome.
"""
import argparse, gzip, io, json, os, re, shutil, struct, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
# the green of the pictures on beyondallreason.info (the team colour mask of the colour texture is filled with it)
DEFAULT_TEAM = '130,218,105'


# ---------------------------------------------------------------- the game: archive cache, .sdp, pool
def find_game(data, wanted):
    """The package (.sdp) of Beyond All Reason: the newest installed one, or the one named `wanted` ("Beyond All Reason <version>"). Returns (sdp path, name)."""
    caches = sorted(Path(data, 'cache').glob('ArchiveCache*.lua'), key=lambda p: p.stat().st_mtime)
    if not caches:
        sys.exit(f'ERROR: no archive cache in {data}\\cache. Please start BAR once and let a game load.')
    found = []
    for e in caches[-1].read_text(encoding='utf-8', errors='replace').split('\n\t\t{\n')[1:]:
        sdp = re.search(r'^\t\t\tname = "([^"]+\.sdp)"', e, re.M)
        name = re.search(r'^\t\t\t\tname = "(Beyond All Reason [^"]+)"', e, re.M)
        mod = re.search(r'^\t\t\tmodified = "(\d+)"', e, re.M)
        if sdp and name:
            found.append((int(mod.group(1)) if mod else 0, name.group(1), sdp.group(1)))
    if not found:
        sys.exit('ERROR: no Beyond All Reason package found in the archive cache.')
    if wanted:
        found = [f for f in found if f[1] == wanted]
        if not found:
            sys.exit(f'ERROR: game "{wanted}" is not installed.')
    _, name, sdp = max(found)
    return Path(data, 'packages', sdp), name


class Pool:
    """The files of one package: .sdp = gzip stream of [1 byte name length][name][16 bytes md5][4 bytes crc][4 bytes size], the file is in pool/<md5[:2]>/<md5[2:]>.gz."""
    def __init__(self, data, sdp):
        self.data = Path(data)
        raw = gzip.open(sdp, 'rb').read()
        self.entries, i = {}, 0
        while i < len(raw):
            n = raw[i]
            self.entries[raw[i + 1:i + 1 + n].decode('latin-1')] = raw[i + 1 + n:i + 17 + n].hex()
            i += 25 + n

    def has(self, name):
        return name in self.entries

    def read(self, name):
        h = self.entries[name]
        return gzip.open(self.data / 'pool' / h[:2] / (h[2:] + '.gz'), 'rb').read()

    def find_model(self, unit):
        """objects3d/units/<unit>.s3o; a Scavenger copy (<unit>_scav) uses the model of its unit."""
        for name in (unit, re.sub(r'_scav$', '', unit)):
            for folder in ('objects3d/units/', 'objects3d/'):
                if self.has(f'{folder}{name}.s3o'):
                    return f'{folder}{name}.s3o'
        base = re.sub(r'_scav$', '', unit) + '.s3o'
        hits = sorted(n for n in self.entries if n.startswith('objects3d/') and n.endswith('/' + base))
        return hits[0] if hits else None


def s3o_textures(data):
    """The names of the two textures in the header of an .s3o: the colour texture and the second one (glow, metal, roughness)."""
    if data[:12] != b'Spring unit\0':
        raise ValueError('not an S3O file')
    h = struct.unpack('<I2f3f4I', data[12:52])
    text = lambda o: data[o:data.index(b'\0', o)].decode('latin-1').lower()
    return text(h[8]), text(h[9])


# ---------------------------------------------------------------- textures: the DDS atlases -> the four maps of the material
def lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def load_dds(pool, name, size):
    """The texture as float RGBA (0..1), scaled down to size x size. RGB and alpha are scaled separately: Pillow scales an RGBA image with premultiplied alpha, which would
    wipe out the colour wherever the alpha is 0 (the team colour mask is 0 nearly everywhere)."""
    im = Image.open(io.BytesIO(pool.read(name))).convert('RGBA')
    if im.size != (size, size):
        r, g, b, a = im.split()
        rgb = Image.merge('RGB', (r, g, b)).resize((size, size), Image.LANCZOS)
        im = Image.merge('RGBA', (*rgb.split(), a.resize((size, size), Image.LANCZOS)))
    return np.asarray(im).astype(np.float32) / 255.0


def save_png(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, compress_level=1)


def convert_textures(pool, tex1, tex2, out, tex_size, team, game):
    """Writes albedo.png, emissive.png, orm.png, normal.png into out (skipped if they are there already for the same game, size and team colour).
    Channels as in the game's shader (modelmaterials_gl4/templates/cus_gl4.frag.glsl): colour.rgb = albedo, colour.a = team colour mask;
    shader texture r = emissive, g = metalness, b = roughness; normal map rgb = tangent space normal."""
    stamp = {'game': game, 'size': tex_size, 'team': list(team), 'tex1': tex1, 'tex2': tex2}
    if (out / 'stamp.json').exists() and json.loads((out / 'stamp.json').read_text()) == stamp:
        return
    out.mkdir(parents=True, exist_ok=True)
    (out / 'stamp.json').unlink(missing_ok=True)
    name1 = f'unittextures/{tex1}'
    size = min(Image.open(io.BytesIO(pool.read(name1))).size[0], tex_size)
    print(f'  converting the textures {tex1} / {tex2} ({size} x {size}) ...', flush=True)
    color = load_dds(pool, name1, size)
    albedo = color[..., :3] * (1 - color[..., 3:4]) + np.array(team) / 255.0 * color[..., 3:4]   # the game: mix(colour.rgb, teamColor.rgb, colour.a), then sRGB -> linear
    one = np.ones_like(albedo[..., :1])
    if pool.has(f'unittextures/{tex2}'):
        shader = load_dds(pool, f'unittextures/{tex2}', size)
    else:
        shader = np.dstack([np.zeros((size, size), np.float32), np.zeros((size, size), np.float32), np.full((size, size), 0.6, np.float32), np.ones((size, size), np.float32)])
    save_png(np.dstack([albedo, one]), out / 'albedo.png')
    save_png(np.dstack([srgb(lin(albedo) * shader[..., 0:1]), one]), out / 'emissive.png')          # the game: outColor += emissiveness * albedoColor
    save_png(np.dstack([one[..., 0], shader[..., 2], shader[..., 1], one[..., 0]]), out / 'orm.png')   # three.js: green = roughness, blue = metalness
    del color, albedo, shader
    normal_name = f'unittextures/{re.sub(r"_color(?=\.)", "_normal", tex1)}'
    if normal_name != name1 and pool.has(normal_name):
        normal = load_dds(pool, normal_name, size)
        save_png(np.dstack([normal[..., :3], np.ones_like(normal[..., 0])]), out / 'normal.png')
    else:
        save_png(np.dstack([np.full((size, size), 0.5, np.float32), np.full((size, size), 0.5, np.float32), np.ones((size, size), np.float32), np.ones((size, size), np.float32)]), out / 'normal.png')
    (out / 'stamp.json').write_text(json.dumps(stamp))


# ---------------------------------------------------------------- the output formats
FORMATS = ('png', 'bmp', 'avif', 'webp')


def encode(src, dst_base, formats, opt):
    """Writes the rendered picture (lossless PNG with alpha) in the wanted formats next to dst_base (without extension). Returns {format: file size}."""
    im = Image.open(src).convert('RGBA')
    sizes = {}
    for f in formats:
        dst = Path(f'{dst_base}.{f}')
        if f == 'png':
            im.save(dst, optimize=True)
        elif f == 'bmp':   # a BMP has no usable transparency: the picture is put on a white background
            flat = Image.new('RGBA', im.size, (255, 255, 255, 255))
            flat.alpha_composite(im)
            flat.convert('RGB').save(dst)
        elif f == 'avif':
            im.save(dst, quality=opt.avif_quality, speed=opt.avif_speed)
        elif f == 'webp':
            im.save(dst, quality=opt.webp_quality, method=opt.webp_method)
        sizes[f] = dst.stat().st_size
    return sizes


# ---------------------------------------------------------------- the browser and node
def find_browser(given):
    candidates = [given, os.environ.get('RENDER_BROWSER'),
                  r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
                  r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe']
    for c in candidates:
        if c and Path(c).exists():
            return c
    sys.exit('ERROR: no Microsoft Edge or Google Chrome found. Give the program with --browser.')


def ensure_node_modules():
    if (HERE / 'node_modules' / 'three').exists() and (HERE / 'node_modules' / 'playwright-core').exists():
        return
    print('first run: installing three.js and playwright-core with npm ...', flush=True)
    if subprocess.run('npm install --no-audit --no-fund', cwd=HERE, shell=True).returncode:
        sys.exit('ERROR: npm install failed. Is Node.js installed?')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], fromfile_prefix_chars='@')
    ap.add_argument('units', nargs='+', help='unit names (armllt, legnavyscout, ...); @file: a file with one name per line')
    ap.add_argument('--out', default=str(HERE / 'out'), help='folder for the pictures (default: out next to this script)')
    ap.add_argument('--data', default=r'C:\Games\Beyond-All-Reason\data', help='data folder of the BAR installation (only read)')
    ap.add_argument('--game', default='', help='"Beyond All Reason <version>"; default: the newest installed game')
    ap.add_argument('--work', default=str(Path(tempfile.gettempdir()) / 'render_unit'), help='folder for the converted textures (kept between runs) and the models')
    ap.add_argument('--size', type=int, default=400, help='edge of the square picture in pixels (default 400, as on the website)')
    ap.add_argument('--tex-size', type=int, default=2048, help='the 4096 pixel atlases are scaled down to this size (default 2048)')
    ap.add_argument('--team', default=DEFAULT_TEAM, help=f'colour of the team colour parts, R,G,B (default {DEFAULT_TEAM})')
    ap.add_argument('--format', default='png', help='png, bmp, avif, webp, several separated by commas, or all (default png). With all, the formats of one unit lie side by side '
                    'and a table shows the file sizes. A BMP has no transparency (white background); PNG, AVIF and WebP keep it')
    ap.add_argument('--avif-quality', type=int, default=60, help='AVIF quality 0 to 100 (default 60)')
    ap.add_argument('--avif-speed', type=int, default=6, help='AVIF encoder speed 0 (slowest, smallest) to 10 (fastest) (default 6)')
    ap.add_argument('--webp-quality', type=int, default=80, help='WebP quality 0 to 100 (default 80)')
    ap.add_argument('--webp-method', type=int, default=4, help='WebP effort 0 (fast) to 6 (slowest, smallest) (default 4)')
    ap.add_argument('--browser', default='', help='Microsoft Edge or Google Chrome (default: looked for)')
    ap.add_argument('--param', action='append', default=[], metavar='key=value', help='a value of the renderer, e.g. sun=2.5 or az=300 (see renderer/index.html)')
    a = ap.parse_args()
    team = tuple(int(x) for x in a.team.split(','))
    work, out = Path(a.work), Path(a.out)
    formats = list(FORMATS) if a.format.strip().lower() == 'all' else [f.strip().lower() for f in a.format.split(',') if f.strip()]
    for f in formats:
        if f not in FORMATS:
            sys.exit(f'ERROR: unknown format "{f}" (png, bmp, avif, webp or all)')
    (work / 'render').mkdir(parents=True, exist_ok=True)

    sdp, game = find_game(a.data, a.game)
    print(f'game: {game}', flush=True)
    pool = Pool(a.data, sdp)
    (work / 'models').mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)

    jobs, problems = [], []
    for unit in dict.fromkeys(u.strip() for u in a.units if u.strip()):
        unit = unit.lower()
        model = pool.find_model(unit)
        if not model:
            problems.append(f'{unit}: no model found in the game (looked for objects3d/units/{unit}.s3o)')
            continue
        data = pool.read(model)
        try:
            tex1, tex2 = s3o_textures(data)
        except ValueError as e:
            problems.append(f'{unit}: {model}: {e}')
            continue
        if not pool.has(f'unittextures/{tex1}'):
            problems.append(f'{unit}: texture unittextures/{tex1} not found in the game')
            continue
        key = f'{Path(tex1).stem}__{Path(tex2).stem}'
        convert_textures(pool, tex1, tex2, work / 'tex' / key, a.tex_size, team, game)
        (work / 'models' / f'{unit}.s3o').write_bytes(data)
        query = f'model=/work/models/{unit}.s3o&tex=/work/tex/{key}&size={a.size}' + ''.join('&' + p for p in a.param)
        jobs.append({'out': str(work / 'render' / f'{unit}.png'), 'query': query})   # the lossless picture of the browser; the wanted formats are made from it

    failed = 0
    if jobs:
        ensure_node_modules()
        (work / 'jobs.json').write_text(json.dumps(jobs))
        node = shutil.which('node')
        if not node:
            sys.exit('ERROR: Node.js not found.')
        failed = subprocess.run([node, str(HERE / 'renderer' / 'render.mjs'), str(work / 'jobs.json'), str(work), find_browser(a.browser)], cwd=HERE).returncode
    table = []
    for job in jobs:
        src = Path(job['out'])
        if src.exists():
            unit = src.stem
            table.append((unit, encode(src, out / unit, formats, a)))
    if table:
        print('\nfile sizes (bytes):')
        print('  ' + 'unit'.ljust(22) + ''.join(f.rjust(10) for f in formats))
        for unit, sizes in table:
            print('  ' + unit.ljust(22) + ''.join(f'{sizes[f]:>10,}' for f in formats))
    for p in problems:
        print('ERROR:', p, file=sys.stderr)
    if failed or problems:
        sys.exit(1)
    print(f'\ndone: {len(table)} unit(s) as {", ".join(formats)} in {out}')


if __name__ == '__main__':
    main()
