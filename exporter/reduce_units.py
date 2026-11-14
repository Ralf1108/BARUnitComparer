"""reduce_units.py: the data of the website from the exporter's files (docs/website.md, docs/versions.md). export_units.ps1 runs it after every export.

    python exporter/reduce_units.py [--units FILE] [--out DIR] [--data DIR] [--redo VERSION ...] [--force]
    python exporter/reduce_units.py --pictures <out>/<version>     the units whose picture belongs into that version's images/ folder, one per line

Reads every <out>/<version>/data/units-<version>.json and writes what is not there yet (--redo <folder name>: that version again, e.g. after its export was made again;
--force: everything again), the versions in order (by the numbers in the name):
  the BASE version (the first one exported: the one that has a units-<version>.reduced.json.gz):
    <out>/<version>/data/units-<version>.reduced.json.gz   only the values the page shows, plus the new property `category`, as gzip at its maximum (pip install zopfli)
    <out>/<version>/data/pictures.json                    the fingerprint of every unit's picture (render_unit.picture_fingerprints: model, textures, hidden pieces, faction)
    <out>/<version>/images/icons/<file>.png               the role icons of the units, from the game
  every LATER version: only what changed against the version BEFORE it (the base with the changes of every version in between)
    <out>/<version>/data/units-<version>.diff.json.gz      the units whose values changed and the new units (`ownPicture` / `ownIcon`: their picture /
                                                          icon is in this version's folder), the names of the units that are gone
    <out>/<version>/data/pictures.json                    the fingerprints of the pictures that changed
    <out>/<version>/images/icons/<file>.png               only the icons that changed
    A version in which nothing changed gets no file; versions.json only says up to where versions were looked at (checkedUpTo); it is not shown.
and in any case <out>/versions.json: the base and every version with a diff file, oldest first, with the date of the game version (the commit of the Beyond All Reason
repository), and the versions in which nothing changed. A version older than the base is left out.
--data: data folder of BAR (default as in shared/bar_common.py); without the game installed there are no icons and no picture fingerprints (the pictures count as unchanged).
--out: default website/assets/; nothing else in that folder is touched.
--units: this units-<version>.json has to exist (it is only checked; every version that has an export and no result yet is done).
"""
import argparse, gzip, json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'shared'))
import bar_common  # noqa: E402  (the game's files, shared with render_unit.py)
from unit_rules import category, dps, natural, reduce_unit, texts  # noqa: E402,F401  (the rules; also reachable as reduce_units.<name>)

# The Scavenger loot boxes get one of two models by chance at every start of the game (unitbasedefs/lootboxes/lootboxnano.lua: math.random(1, 2)): another model
# of one of them is no change of the game, so their pictures are not compared
RANDOM_MODEL = re.compile(r'^lootbox')
COMMITS = 'https://api.github.com/repos/beyond-all-reason/Beyond-All-Reason/commits/'


# ---------------------------------------------------------------- the game: icons, picture fingerprints
def game_pool(data_dir, game_name):
    """The pool of the installed game version. Raises SystemExit or OSError if it is not there."""
    folder = bar_common.find_data_dir(data_dir)
    sdp, _ = bar_common.find_game(folder, game_name)
    return bar_common.Pool(folder, sdp)


def icon_files(pool, icon_types):
    """{iconType: name of the file in the pool}."""
    text = pool.read('gamedata/icontypes.lua').decode('utf-8', errors='replace')
    bitmaps = {m.group(1).lower(): m.group(2).lower() for m in re.finditer(r'\b(\w+)\s*=\s*\{\s*bitmap\s*=\s*"([^"]+)"', text)}
    found = {}
    for icon_type in icon_types:
        bitmap = bitmaps.get(icon_type.lower()) or bitmaps.get(re.sub(r'_scav$', '', icon_type.lower()))
        if bitmap and pool.has(bitmap):
            found[icon_type] = bitmap
    return found


def fingerprints(pool, full):
    """{unit: fingerprint of its picture} (render_unit.py, loaded only here: it needs numpy and Pillow)."""
    sys.path.insert(0, str(ROOT / 'render_unit'))
    import render_unit
    return render_unit.picture_fingerprints(pool, full['units'], sorted(full['units']))


# ---------------------------------------------------------------- files
def text_of(header, units):
    """The file as text: normal JSON, one object per unit, one unit per line."""
    head = json.dumps({'format': 1, **header, 'count': header.get('count', len(units))}, ensure_ascii=False)[:-1]
    body = ',\n'.join(json.dumps(k, ensure_ascii=False) + ':' + json.dumps(v, ensure_ascii=False, separators=(',', ':')) for k, v in sorted(units.items()))
    return (head + ', "units":{\n' + body + '\n}}\n').encode('utf-8')


def compress(text):
    """gzip at its maximum: Zopfli writes normal gzip files, smaller than gzip -9 (54.6 KB against 57.8 KB here). Every browser reads gzip without help from the server (DecompressionStream),
    so the file also works on hosts that cannot set headers, such as GitHub Pages; 7-Zip opens it. Without the package zopfli the result is the same format, only larger."""
    try:
        import zopfli.gzip
    except ImportError:
        print('note: package zopfli not installed (pip install zopfli), using gzip -9')
        return gzip.compress(text, 9, mtime=0)
    return zopfli.gzip.compress(text, numiterations=100)


def write_whole(target, data):
    """Complete or not at all: the existence of the file decides whether it is made."""
    part = target.with_name(target.name + '.part')
    part.write_bytes(data)
    part.replace(target)


def read_gz(path):
    return json.loads(gzip.decompress(Path(path).read_bytes()))


def find_base(out):
    """The folder of the base version (it has the full reduced file), or None. With several, the oldest."""
    full = sorted(out.glob('*/data/units-*.reduced.json.gz'), key=lambda p: natural(p.parent.parent.name))
    return full[0].parent.parent if full else None


HISTORY = 'history.json.gz'   # next to versions.json: the diff files of all versions in one file


def diff_file(folder):
    return next((folder / 'data').glob('units-*.diff.json.gz'), None)


def checked_up_to(out):
    """The newest version looked at (versions.json: checkedUpTo), '' if none. Versions are done in order: every version up to it is done, with a diff file or without
    a change (then it has no files and is not listed). An older versions.json with `unchanged` is read as well."""
    f = out / 'versions.json'
    if not f.exists():
        return ''
    data = json.loads(f.read_text(encoding='utf-8'))
    names = [data.get('checkedUpTo', '')] + data.get('unchanged', []) + [v['version'] for v in data['versions']]
    return max((n for n in names if n), key=natural, default='')


# ---------------------------------------------------------------- the chain: base, then every version against the one before
class Chain:
    """The game version reached so far: its units (reduced), the fingerprints of their pictures, {icon file: folder that has it}. Starts at the base version; every
    version's diff file is applied in turn."""

    def __init__(self, base):
        data = read_gz(next((base / 'data').glob('units-*.reduced.json.gz')))
        self.version, self.units = data['gameVersion'], data['units']
        prints = base / 'data' / 'pictures.json'
        self.prints = json.loads(prints.read_text(encoding='utf-8')) if prints.exists() else {}
        self.icons = {p.name: base for p in (base / 'images' / 'icons').glob('*.png')}

    def apply(self, folder, diff):
        """The changes of the version in `folder` (its diff file, read)."""
        for name, u in diff['units'].items():
            self.units[name] = {k: v for k, v in u.items() if k not in ('ownPicture', 'ownIcon', 'pictureParts')}
            if u.get('ownIcon'):
                self.icons[u['icon']] = folder
        prints = folder / 'data' / 'pictures.json'
        if prints.exists():
            self.prints.update(json.loads(prints.read_text(encoding='utf-8')))
        for name in diff.get('removed', []):
            self.units.pop(name, None)
            self.prints.pop(name, None)
        self.version = diff['gameVersion']


def compare(units, prints, before_units, before_prints):
    """(the units whose values differ from the version before, new units included; the units among them whose picture differs, new units included).
    Only the values count: a unit whose picture or icon changed but not one value is no change (the page compares values), and its fingerprint stays that of the picture
    that is shown. The pictures are compared only if both versions have fingerprints. A unit that had no picture before and has one now gets one."""
    plain = lambda u: {k: v for k, v in u.items() if k != 'icon'}
    changed, pictures = set(), set()
    for name, u in units.items():
        b = before_units.get(name)
        if b is None:
            changed.add(name)
            pictures.add(name)
            continue
        if plain(u) != plain(b):
            changed.add(name)
            old, new = before_prints.get(name), prints.get(name)
            if prints and before_prints and new and old != new and not RANDOM_MODEL.match(name):
                pictures.add(name)
    return changed, pictures


def value_changes(a, b):
    """{field: [value in a, value in b]} of the fields (not the icon) in which two reduced units differ."""
    return {k: [a.get(k), b.get(k)] for k in sorted(set(a) | set(b)) if k != 'icon' and a.get(k) != b.get(k)}


def load_export(f, data_dir):
    """The full export -> (game version, reduced units, {iconType: bitmap in the pool}, picture fingerprints, pool or None)."""
    full = json.loads(f.read_text(encoding='utf-8'))
    version = full['gameVersion']
    units = {name: reduce_unit(name, u) for name, u in full['units'].items()}
    icon_types = {name: u['game'].get('iconType') or name for name, u in full['units'].items()}
    icons, prints, pool = {}, {}, None
    try:
        pool = game_pool(data_dir, f"{full.get('gameName', 'Beyond All Reason')} {version}")
        icons = icon_files(pool, set(icon_types.values()))
        for name, u in units.items():
            if icon_types[name] in icons:
                u['icon'] = Path(icons[icon_types[name]]).name
        prints = fingerprints(pool, full)
    except (SystemExit, OSError) as e:
        print(f'note: game {version} not installed ({e}): no icons, no picture fingerprints')
    except ImportError as e:
        print(f'note: no picture fingerprints ({e}; render_unit.py needs numpy and Pillow)')
    return full, units, icons, prints, pool


def write_base(f, folder, data_dir, engine=''):
    """The base version: the reduced file of all units, pictures.json, all icons."""
    full, units, icons, prints, pool = load_export(f, data_dir)
    version, target = full['gameVersion'], folder / 'data' / f'{f.stem}.reduced.json.gz'
    if pool and icons:
        (folder / 'images' / 'icons').mkdir(parents=True, exist_ok=True)
        for bitmap in set(icons.values()):
            (folder / 'images' / 'icons' / Path(bitmap).name).write_bytes(pool.read(bitmap))
        print(f'{version}: {len(set(icons.values()))} icons')
    if prints:
        write_whole(folder / 'data' / 'pictures.json', (json.dumps(prints, indent=0, sort_keys=True) + '\n').encode('utf-8'))
    write_whole(target, compress(text_of({'gameName': full.get('gameName'), 'gameVersion': version, **({'engine': engine} if engine else {})}, units)))
    print(f'{target.name}: base version, {len(units)} units, {target.stat().st_size / 1024:.1f} KB (full file {f.stat().st_size / 1e6:.1f} MB)')


def write_diff(f, folder, chain, data_dir, engine='', control=None):
    """A later version against the version before it (chain): the diff file, pictures.json of the changed pictures, the changed icons. Returns the diff, or None if
    nothing changed (then the version has no diff file). `engine`: the engine of the export (named in the diff file). `control`: a second export of the version before, made
    with the engine of this one (a change of the engine, docs/plan-versions-2026.md decision 8): the comparison is made against it, so that only changes of the game
    count; the units whose values differ only because of the engine are named in `engineOnly` (unit: {field: [value before, value now]})."""
    full, units, icons, prints, pool = load_export(f, data_dir)
    before_units, engine_only = chain.units, {}
    if control:
        before_units = load_export(control, data_dir)[1]
        engine_only = {n: d for n in chain.units if n in before_units and (d := value_changes(chain.units[n], before_units[n]))}
    version = full['gameVersion']
    target = folder / 'data' / f'{f.stem}.diff.json.gz'
    if not chain.prints or not prints:
        print(f'note: the pictures are not compared (no fingerprints of {"the version before" if not chain.prints else "this version"}), only the values')
    if not prints and (folder / 'data' / 'pictures.json').exists():
        sys.exit(f'ERROR: the game {version} is not installed, so its pictures cannot be compared, and {folder.name} has pictures.json already: it would be lost. Install the game version (the download of exporter/update_versions.py) or remove the file on purpose.')
    changed, pictures = compare(units, prints, before_units, chain.prints)
    new_icons = {}   # icon files that the version before does not have like this; a changed unit with one of them brings it along (a new icon alone is no change)
    if pool:
        for bitmap in set(icons.values()):
            name, mine = Path(bitmap).name, pool.read(bitmap)
            theirs = chain.icons.get(name)
            if theirs is None or (theirs / 'images' / 'icons' / name).read_bytes() != mine:
                new_icons[name] = mine
    removed = sorted(set(before_units) - set(units))
    if not changed and not removed:
        for old in (target, folder / 'data' / 'pictures.json'):
            old.unlink(missing_ok=True)
        print(f'{version}: nothing changed against {chain.version}: no diff file, the version is not listed')
        return None
    diff = {}
    for name in sorted(changed):
        u = dict(units[name])
        if name in pictures:
            u['ownPicture'] = True
        if u.get('icon') in new_icons:
            (folder / 'images' / 'icons').mkdir(parents=True, exist_ok=True)
            (folder / 'images' / 'icons' / u['icon']).write_bytes(new_icons[u['icon']])
            u['ownIcon'] = True
        diff[name] = u
    own_prints = {n: prints[n] for n in pictures if n in prints}
    if own_prints:
        write_whole(folder / 'data' / 'pictures.json', (json.dumps(own_prints, indent=0, sort_keys=True) + '\n').encode('utf-8'))
    else:
        (folder / 'data' / 'pictures.json').unlink(missing_ok=True)
    header = {'gameName': full.get('gameName'), 'gameVersion': version, 'before': chain.version, 'count': len(units), 'removed': removed,
              **({'engine': engine} if engine else {}), **({'engineOnly': engine_only} if engine_only else {})}
    write_whole(target, compress(text_of(header, diff)))
    print(f'{target.name}: {len(diff)} of {len(units)} units changed against {chain.version} ({len(pictures)} with another picture), '
          f'{len(removed)} gone, {target.stat().st_size / 1024:.1f} KB')
    return {'gameVersion': version, 'units': diff, 'removed': removed}


def picture_units(folder):
    """The units whose picture belongs into <folder>/images: all units of the base version, only the ones with ownPicture of a later version, none of a version in
    which nothing changed."""
    data = Path(folder) / 'data'
    full = list(data.glob('units-*.reduced.json.gz'))
    if full:
        return sorted(read_gz(full[0])['units'])
    diff = diff_file(Path(folder))
    return sorted(n for n, u in read_gz(diff)['units'].items() if u.get('ownPicture')) if diff else []


def commit_date(version):
    """The date of the game version: the commit of the Beyond All Reason repository whose short hash ends the version (test-31836-b250a16), as YYYY-MM-DD; '' if unknown."""
    sha = version.rsplit('-', 1)[-1]
    if not re.fullmatch(r'[0-9a-f]{7,40}', sha):
        return ''
    clone = ROOT / 'cache' / 'bar.git'
    if clone.exists():   # the clone of the game repository (exporter/git_history.py) knows every date; the API of GitHub often answers with 503
        r = subprocess.run(['git', '-C', str(clone), 'log', '-1', '--format=%cs', sha], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        if r.returncode == 0 and re.fullmatch(r'\d{4}-\d\d-\d\d', r.stdout.strip()):
            return r.stdout.strip()
    try:
        return json.loads(bar_common.fetch(COMMITS + sha))['commit']['committer']['date'][:10]
    except Exception as e:
        print(f'note: no date for {version} ({e})')
        return ''


def write_versions(out, checked):
    """website/assets/versions.json: the base version and every later version that has a diff file, the oldest first (by the numbers in the name), with its date;
    `checkedUpTo`: the newest version looked at (the ones without a diff file up to there had no change, they are not shown). The dates there already are kept (a commit does not change); only the missing ones are
    asked from GitHub."""
    old = out / 'versions.json'
    known = {v['version']: v.get('date', '') for v in json.loads(old.read_text(encoding='utf-8'))['versions']} if old.exists() else {}
    base = find_base(out)
    files = [next((base / 'data').glob('units-*.reduced.json.gz'))] + [d for d in map(diff_file, out.iterdir()) if d] if base else []
    versions, diffs = [], {}
    for file in files:
        folder = file.parent.parent
        if natural(folder.name) < natural(base.name):
            continue   # older than the base: not part of the chain
        d = read_gz(file)
        if folder != base:
            diffs[folder.name] = d
        v = {'version': d['gameVersion'], 'dir': folder.name, 'file': file.name, 'date': known.get(d['gameVersion']) or commit_date(d['gameVersion'])}
        if folder == base:
            v['base'] = True
        else:
            v['changed'] = len(d['units'])
            if d.get('removed'):
                v['removed'] = len(d['removed'])
            if d.get('engineOnly'):
                v['engineOnly'] = d['engineOnly']
        if d.get('engine'):
            v['engine'] = d['engine']
        versions.append(v)
    versions.sort(key=lambda v: natural(v['version']))
    # all diff files in ONE file: the page loads it with one request instead of one per version (the files of the versions stay, they are the source)
    write_whole(out / HISTORY, compress(json.dumps({'format': 1, 'diffs': {v['dir']: diffs[v['dir']] for v in versions if v['dir'] in diffs}}, ensure_ascii=False, separators=(',', ':')).encode('utf-8')))
    text = json.dumps({'versions': versions, 'history': HISTORY, 'checkedUpTo': checked}, indent=1) + '\n'
    old.write_text(text, encoding='utf-8', newline='\n')


def check_before(chain, folder, existing):
    """A diff file is made against one version (`before`): applied to another one it would give wrong units, so that is an error."""
    before = read_gz(existing).get('before')
    if before != chain.version:
        sys.exit(f'ERROR: {existing.name} was made against {before}, but the version before it is now {chain.version}. Make it again: reduce_units.py --redo {folder.name} (or --force for all).')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--units', default='', help='this units-<version>.json has to be there (all versions not done yet are done, in order)')
    ap.add_argument('--out', default=str(ROOT / 'website' / 'assets'), help='the out folder (default website/assets/)')
    ap.add_argument('--data', default='', help='data folder of the BAR installation (for the icons and the picture fingerprints)')
    ap.add_argument('--force', action='store_true', help='make the base file and every diff file again, even if they are there')
    ap.add_argument('--redo', action='append', default=[], metavar='VERSION', help='make only this version (its folder name) again; repeat for several. A later version that depends on it is not changed: use --force for that')
    ap.add_argument('--engine', default='', help='the engine of the exports (its name, for example 2025.06.12): named in the file of the version made now')
    ap.add_argument('--control', default='', metavar='FILE', help='a second export of the version before, made with the engine of the version made now (only with --redo VERSION)')
    ap.add_argument('--pictures', default='', metavar='FOLDER', help='only print the units whose picture belongs into FOLDER/images (FOLDER: <out>/<version>)')
    a = ap.parse_args()
    if a.pictures:
        print('\n'.join(picture_units(a.pictures)))
        return
    out = Path(a.out)
    exports = {p.parent.parent: p for p in out.glob('*/data/units-*.json') if '.reduced' not in p.name and '.diff' not in p.name}
    if a.units and not Path(a.units).exists():
        sys.exit(f'ERROR: {a.units} not found.')
    base = find_base(out)
    if not exports and not base:
        sys.exit(f'ERROR: no units-<version>.json in {out}. Run the exporter first (exporter/export_units.bat).')
    out.mkdir(parents=True, exist_ok=True)
    redo = set(a.redo)
    if base is None or ((a.force or base.name in redo) and base in exports):   # the first version exported is the base
        base = base or min(exports, key=lambda p: natural(p.name))
        write_base(exports[base], base, a.data, a.engine)
    checked = checked_up_to(out)
    folders = {p for p in exports} | {d.parent.parent for d in out.glob('*/data/units-*.diff.json.gz')}
    for folder in sorted((p for p in folders if natural(p.name) < natural(base.name)), key=lambda p: natural(p.name)):
        print(f'note: {folder.name} is older than the base version {base.name}: left out')
    chain = Chain(base)
    for folder in sorted((p for p in folders if natural(p.name) > natural(base.name)), key=lambda p: natural(p.name)):
        existing = diff_file(folder)
        again = a.force or folder.name in redo
        if existing and not again:
            check_before(chain, folder, existing)
        if not again and (existing or (checked and natural(folder.name) <= natural(checked))):
            if existing:
                chain.apply(folder, read_gz(existing))
            print(f'{folder.name}: done already ({"diff file" if existing else "nothing changed"}), skipped')
            continue
        if folder not in exports:   # only the diff file (the full export is not in Git)
            check_before(chain, folder, existing)
            chain.apply(folder, read_gz(existing))
            print(f'note: {folder.name}: no units-<version>.json, the diff file is kept as it is')
            continue
        diff = write_diff(exports[folder], folder, chain, a.data, a.engine, Path(a.control) if a.control else None)
        if diff:
            chain.apply(folder, diff)
    newest = max((p.name for p in folders), key=natural, default='')
    write_versions(out, max(checked, newest, key=natural))
    print(f'done: {out}')


if __name__ == '__main__':
    main()
