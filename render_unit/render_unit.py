"""render_unit.py: pictures of Beyond All Reason units, rendered from the game's own model files (SPECIFICATION.md, section 12).

    python render_unit.py [--out DIR] [--units FILE] [--format png|bmp|avif|webp|all] [--data DIR] [--game NAME] [--work DIR] [--size 400]
                          [--tex-size 2048] [--team R,G,B] [--browser EXE] [--param key=value ...] [-v] <unit> [<unit> ...]    (or @file with one unit name per line)

For every unit it writes <out>/<unit>.<format> (--format: png, bmp, avif, webp or all). The browser renders a lossless PNG with transparent background (the shadow is
semi-transparent), the wanted formats are made from it; the encoding is a separate step, so that its settings can be tried without rendering again
(--format all puts the formats side by side).

What it does: reads the model (.s3o) and the textures of the unit from the game's pool (SPECIFICATION.md, section 5), converts the textures of a faction once
(cached in --work), leaves out the pieces that the unit's script hides when the unit is created, and lets the browser (renderer/index.html, three.js) render all
units in one session. The team colour parts get the colour of the faction: Armada blue, Cortex red, Legion green, Scavengers purple, Raptors black (--team: one colour for all).
--units: the units-<game version>.json of the extractor (default: the one of the game version in ../extractor/out; if it is missing the script stops with an error, unless --no-units is given): it gives the model and the script of every unit, which are
needed for Scavenger copies and Raptors (their model is not named like the unit). Without it the model is looked for by the name of the unit.
Needs: Python with numpy and Pillow, Node.js (the first run installs three.js and playwright-core with npm), Microsoft Edge or Chrome.
"""
import argparse, gzip, io, json, os, re, shutil, struct, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent

# colour of the team colour parts of the pictures, by faction (the colours are put through the same colour grading as the rest, so they look a bit different on the picture)
TEAM_COLORS = {'arm': (90, 140, 235), 'cor': (235, 85, 75), 'leg': (130, 218, 105), 'scv': (175, 105, 225), 'rap': (20, 20, 20)}


def faction_of(unit):
    """Same rule as Shared.factionOf of the Level Editor: _scav = Scavengers, raptor_ = Raptors, otherwise the first three letters."""
    if unit.endswith('_scav'):
        return 'scv'
    if unit.startswith('raptor_'):
        return 'rap'
    return unit[:3]


# ---------------------------------------------------------------- the game: archive cache, .sdp, pool
def find_data_dir(given):
    """The data folder of the BAR installation (it has packages, pool and cache): the given one, $BAR_DATA, otherwise the first of the usual places."""
    if given and not (Path(given, 'packages').is_dir() and Path(given, 'pool').is_dir()):
        sys.exit(f'ERROR: {given} is not a BAR data folder (it has the folders packages and pool).')
    usual = [given, os.environ.get('BAR_DATA'), r'C:\Games\Beyond-All-Reason\data', Path(os.environ.get('LOCALAPPDATA', '.'), 'Programs', 'Beyond-All-Reason', 'data'),
             r'D:\Games\Beyond-All-Reason\data', Path.home() / '.local' / 'state' / 'Beyond All Reason', Path.home() / 'Library' / 'Application Support' / 'Beyond All Reason']
    for c in usual:
        if c and Path(c, 'packages').is_dir() and Path(c, 'pool').is_dir():
            return Path(c)
    sys.exit('ERROR: no BAR data folder found (it has the folders packages and pool). Give it with --data or the environment variable BAR_DATA. Looked in: '
             + ', '.join(str(c) for c in usual if c))


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
        """Without the unit data: objects3d/units/<unit>.s3o; a Scavenger copy (<unit>_scav) uses the model of its unit."""
        for name in (unit, re.sub(r'_scav$', '', unit)):
            for folder in ('objects3d/units/', 'objects3d/'):
                if self.has(f'{folder}{name}.s3o'):
                    return f'{folder}{name}.s3o'
        base = re.sub(r'_scav$', '', unit) + '.s3o'
        hits = sorted(n for n in self.entries if n.startswith('objects3d/') and n.endswith('/' + base))
        return hits[0] if hits else None


def load_units(given, game, none_ok):
    """The units-<game version>.json of the extractor for exactly this game: { unit name: {game, editor} }. Without --units the file
    ../extractor/out/units-<version>.json is taken (the name of the game without "Beyond All Reason "): data of another version would give wrong models and scripts.
    A missing file is an error; only with --no-units ({} is returned) the models are looked for by the name of the unit."""
    if none_ok:
        print('no unit data (--no-units): the models are looked for by the name of the unit, Raptors will not be found', flush=True)
        return {}
    version = game.replace('Beyond All Reason ', '', 1)
    path = Path(given) if given else HERE.parent / 'extractor' / 'out' / f'units-{re.sub(r"[^A-Za-z0-9._-]", "_", version)}.json'
    if not path.exists():
        sys.exit(f'ERROR: unit data {path} not found. Run extractor/extract_units.ps1 first (it writes units-<game version>.json), give the file with --units, '
                 'or work without it with --no-units (models by the name of the unit).')
    units = json.loads(path.read_text(encoding='utf-8'))
    if given and units.get('gameVersion', version) != version:
        print(f'WARNING: {path.name} is of game version {units.get("gameVersion")}, not {version}', flush=True)
    print(f'unit data: {path}', flush=True)
    return units['units']


def s3o_textures(data):
    """The names of the two textures in the header of an .s3o: the colour texture and the second one (glow, metal, roughness)."""
    if data[:12] != b'Spring unit\0':
        raise ValueError('not an S3O file')
    h = struct.unpack('<I2f3f4I', data[12:52])
    text = lambda o: data[o:data.index(b'\0', o)].decode('latin-1').lower()
    return text(h[8]), text(h[9])


# ---------------------------------------------------------------- pieces that the script of the unit hides
def _strip_comments(text, lua):
    if lua:
        text = re.sub(r'--\[(=*)\[.*?\]\1\]', '', text, flags=re.S)
        return re.sub(r'--[^\n]*', '', text)
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'//[^\n]*', '', text)


def hidden_pieces(pool, script_path):
    """The names of the pieces that the script hides in Create() (they are not part of the picture): `hide <piece>;` in a BOS script, `Hide(<piece>)` in a Lua script
    (the script of the game is compiled (.cob); the source (.bos) lies next to it in the pool). A `show` later in Create() takes the piece back. Only the statements
    of Create() itself are read, not the functions it starts."""
    sp = (script_path or '').lower()
    if sp.endswith('.cob'):
        sp = sp[:-4] + '.bos'
    if not sp or not pool.has(sp):
        return set(), None
    text = pool.read(sp).decode('utf-8', errors='replace')
    hidden = set()
    if sp.endswith('.lua'):
        text = _strip_comments(text, True)
        names = {}   # variable -> piece name:  local a, b = piece("x", "y")
        for m in re.finditer(r'local\s+([\w\s,]+?)\s*=\s*piece\s*\(([^)]*)\)', text):
            variables = [v.strip() for v in m.group(1).split(',')]
            pieces = re.findall(r'["\']([^"\']+)["\']', m.group(2))
            names.update(zip(variables, pieces))
        m = re.search(r'function\s+script\.Create\s*\([^)]*\)', text)
        if not m:
            return set(), sp
        end = re.search(r'\nfunction\s', text[m.end():])
        body = text[m.end():m.end() + end.start()] if end else text[m.end():]
        for st in re.finditer(r'\b(Hide|Show)\s*\(\s*(?:piece\s*\(\s*["\']([^"\']+)["\']\s*\)|(\w+))\s*\)', body):
            name = (st.group(2) or names.get(st.group(3), st.group(3))).lower()
            (hidden.add if st.group(1) == 'Hide' else hidden.discard)(name)
        return hidden, sp
    text = _strip_comments(text, False)
    m = re.search(r'\bCreate\s*\([^)]*\)\s*\{', text)
    if not m:
        return set(), sp
    depth, i = 1, m.end()
    while i < len(text) and depth:
        depth += (text[i] == '{') - (text[i] == '}')
        i += 1
    for st in re.finditer(r'\b(hide|show)\s+(\w+)\s*;', text[m.end():i - 1], re.I):
        (hidden.add if st.group(1).lower() == 'hide' else hidden.discard)(st.group(2).lower())
    return hidden, sp


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


def prepare_base(pool, tex1, tex2, base, tex_size, game):
    """The maps that do not depend on the team colour, once per texture set (skipped if they are there already for the same game and size): color.png and shader.png
    (the scaled atlases), orm.png and normal.png. Channels as in the game's shader (modelmaterials_gl4/templates/cus_gl4.frag.glsl): colour.rgb = albedo,
    colour.a = mask of the team colour; shader texture r = emissive, g = metalness, b = roughness; normal map rgb = tangent space normal."""
    stamp = {'game': game, 'size': tex_size, 'tex1': tex1, 'tex2': tex2}
    if (base / 'stamp.json').exists() and json.loads((base / 'stamp.json').read_text()) == stamp:
        return
    base.mkdir(parents=True, exist_ok=True)
    (base / 'stamp.json').unlink(missing_ok=True)
    name1 = f'unittextures/{tex1}'
    size = min(Image.open(io.BytesIO(pool.read(name1))).size[0], tex_size)
    print(f'  converting the textures {tex1} / {tex2} ({size} x {size}) ...', flush=True)
    save_png(load_dds(pool, name1, size), base / 'color.png')
    if pool.has(f'unittextures/{tex2}'):
        shader = load_dds(pool, f'unittextures/{tex2}', size)
    else:   # no second texture: not glowing, not metal, a bit rough
        shader = np.dstack([np.zeros((size, size), np.float32), np.zeros((size, size), np.float32), np.full((size, size), 0.6, np.float32), np.ones((size, size), np.float32)])
    save_png(shader, base / 'shader.png')
    one = np.ones((size, size), np.float32)
    save_png(np.dstack([one, shader[..., 2], shader[..., 1], one]), base / 'orm.png')   # three.js: green = roughness, blue = metalness
    normal_name = f'unittextures/{re.sub(r"_color(?=\.)", "_normal", tex1)}'
    if normal_name != name1 and pool.has(normal_name):
        normal = load_dds(pool, normal_name, size)
        save_png(np.dstack([normal[..., :3], one]), base / 'normal.png')
    else:   # no normal map: flat
        half = np.full((size, size), 0.5, np.float32)
        save_png(np.dstack([half, half, one, one]), base / 'normal.png')
    (base / 'stamp.json').write_text(json.dumps(stamp))


def prepare_team(base, team_dir, team):
    """albedo.png and emissive.png for one team colour (fast, from the maps of prepare_base)."""
    stamp = {'team': list(team), 'base': (base / 'stamp.json').read_text()}
    if (team_dir / 'stamp.json').exists() and json.loads((team_dir / 'stamp.json').read_text()) == stamp:
        return
    team_dir.mkdir(parents=True, exist_ok=True)
    color = np.asarray(Image.open(base / 'color.png').convert('RGBA')).astype(np.float32) / 255.0
    shader = np.asarray(Image.open(base / 'shader.png').convert('RGBA')).astype(np.float32) / 255.0
    albedo = color[..., :3] * (1 - color[..., 3:4]) + np.array(team) / 255.0 * color[..., 3:4]   # the game: mix(colour.rgb, teamColor.rgb, colour.a), then sRGB -> linear
    one = np.ones_like(albedo[..., :1])
    save_png(np.dstack([albedo, one]), team_dir / 'albedo.png')
    save_png(np.dstack([srgb(lin(albedo) * shader[..., 0:1]), one]), team_dir / 'emissive.png')   # the game: outColor += emissiveness * albedoColor
    (team_dir / 'stamp.json').write_text(json.dumps(stamp))


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
                  r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
                  *(shutil.which(n) for n in ('msedge', 'microsoft-edge', 'google-chrome', 'chromium', 'chrome')),
                  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
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
    ap.add_argument('--units-file', '--units', dest='units_file', default='', help='units-<game version>.json of the extractor (default: ../extractor/out/units-<version of the game>.json)')
    ap.add_argument('--no-units', action='store_true', help='work without the unit data: the model is looked for by the name of the unit (Raptors are not found, Scavenger copies are)')
    ap.add_argument('--data', default='', help='data folder of the BAR installation (only read); default: $BAR_DATA, otherwise the usual places')
    ap.add_argument('--game', default='', help='"Beyond All Reason <version>"; default: the newest installed game')
    ap.add_argument('--work', default=str(Path(tempfile.gettempdir()) / 'render_unit'), help='folder for the converted textures (kept between runs) and the models')
    ap.add_argument('--size', type=int, default=400, help='edge of the square picture in pixels (default 400, as on the website)')
    ap.add_argument('--tex-size', type=int, default=2048, help='the 4096 pixel atlases are scaled down to this size (default 2048)')
    ap.add_argument('--team', default='', help='colour of the team colour parts for all units, R,G,B (default: by faction: Armada blue, Cortex red, Legion green, Scavengers purple, Raptors black)')
    ap.add_argument('--format', default='png', help='png, bmp, avif, webp, several separated by commas, or all (default png). With all, the formats of one unit lie side by side '
                    'and a table shows the file sizes. A BMP has no transparency (white background); PNG, AVIF and WebP keep it')
    ap.add_argument('--avif-quality', type=int, default=60, help='AVIF quality 0 to 100 (default 60)')
    ap.add_argument('--avif-speed', type=int, default=6, help='AVIF encoder speed 0 (slowest, smallest) to 10 (fastest) (default 6)')
    ap.add_argument('--webp-quality', type=int, default=80, help='WebP quality 0 to 100 (default 80)')
    ap.add_argument('--webp-method', type=int, default=4, help='WebP effort 0 (fast) to 6 (slowest, smallest) (default 4)')
    ap.add_argument('--browser', default='', help='Microsoft Edge or Google Chrome (default: looked for)')
    ap.add_argument('--param', action='append', default=[], metavar='key=value', help='a value of the renderer, e.g. sun=2.5 or az=300 (see renderer/index.html)')
    ap.add_argument('-v', '--verbose', action='store_true', help='say which pieces are left out and which team colour is used')
    a = ap.parse_args()
    work, out = Path(a.work), Path(a.out)
    one_team = tuple(int(x) for x in a.team.split(',')) if a.team else None
    formats = list(FORMATS) if a.format.strip().lower() == 'all' else [f.strip().lower() for f in a.format.split(',') if f.strip()]
    for f in formats:
        if f not in FORMATS:
            sys.exit(f'ERROR: unknown format "{f}" (png, bmp, avif, webp or all)')
    (work / 'render').mkdir(parents=True, exist_ok=True)

    data_dir = find_data_dir(a.data)
    sdp, game = find_game(data_dir, a.game)
    print(f'game: {game}', flush=True)
    pool = Pool(data_dir, sdp)
    info = load_units(a.units_file, game, a.no_units)
    (work / 'models').mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)

    jobs, problems = [], []
    for unit in dict.fromkeys(u.strip().lower() for u in a.units if u.strip()):
        u = info.get(unit)
        model = (u['editor']['model'].lower() if u else None)
        if not model or not pool.has(model):
            model = pool.find_model(unit)
        if not model:
            problems.append(f'{unit}: no model found in the game' + ('' if u else f' (looked for objects3d/units/{unit}.s3o; the unit data of --units would give the model)'))
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
        faction = u['editor']['faction'] if u else faction_of(unit)
        team = one_team or TEAM_COLORS.get(faction, TEAM_COLORS['leg'])
        script = u['game'].get('scriptPath') if u else f'scripts/units/{re.sub(chr(95) + "scav$", "", unit)}.bos'
        hidden, script_used = hidden_pieces(pool, script)
        if a.verbose:
            print(f'  {unit}: faction {faction}, team colour {team}, model {model}, hidden pieces ({script_used or "no script source"}): {", ".join(sorted(hidden)) or "-"}')
        base = work / 'tex' / f'{Path(tex1).stem}__{Path(tex2).stem}'
        prepare_base(pool, tex1, tex2, base, a.tex_size, game)
        team_dir = base / ('team_%d_%d_%d' % team)
        prepare_team(base, team_dir, team)
        (work / 'models' / f'{unit}.s3o').write_bytes(data)
        query = (f'model=/work/models/{unit}.s3o&base=/work/tex/{base.name}&tex=/work/tex/{base.name}/{team_dir.name}&size={a.size}'
                 + (f'&hide={",".join(sorted(hidden))}' if hidden else '') + ''.join('&' + p for p in a.param))
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
            table.append((src.stem, encode(src, out / src.stem, formats, a)))
    if table:
        print('\nfile sizes (bytes):')
        print('  ' + 'unit'.ljust(40) + ''.join(f.rjust(10) for f in formats))
        for unit, sizes in table:
            print('  ' + unit.ljust(40) + ''.join(f'{sizes[f]:>10,}' for f in formats))
    for p in problems:
        print('ERROR:', p, file=sys.stderr)
    if failed or problems:
        sys.exit(1)
    print(f'\ndone: {len(table)} unit(s) as {", ".join(formats)} in {out}')


if __name__ == '__main__':
    main()
