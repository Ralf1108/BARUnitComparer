"""reduce_units.py: the data of the website from the exporter's files (SPECIFICATION_WEBSITE.md, section 1). export_units.ps1 runs it after every export.

    python exporter/reduce_units.py [--units FILE] [--out DIR] [--data DIR] [--force]
    python exporter/reduce_units.py --pictures <out>/<version>     the units whose picture belongs into that version's images/ folder, one per line

Reads every <out>/<version>/data/units-<version>.json (or only --units) and writes, if it is not there yet (--force: anyway):
  the BASE version (the first one exported: the one that has a units-<version>.reduced.json.gz):
    <out>/<version>/data/units-<version>.reduced.json.gz   only the values the page shows, plus the new property `category`, as gzip at its maximum (pip install zopfli)
    <out>/<version>/data/pictures.json                    the fingerprint of every unit's picture (render_unit.picture_fingerprints: model, textures, script, faction)
    <out>/<version>/images/icons/<file>.png               the role icons of the units, from the game
  every OTHER version: only what differs from the base version
    <out>/<version>/data/units-<version>.diff.json.gz      the units whose values or picture differ from the base and the new units (`ownPicture` / `ownIcon`: their
                                                          picture / icon is in this version's folder, not in the base's), the names of the units that are gone
    <out>/<version>/images/icons/<file>.png               only the icons that the base does not have like this
and in any case <out>/versions.json: the versions there are, oldest first, with the date of the game version (the commit of the Beyond All Reason repository).
--data: data folder of BAR (default as in shared/bar_common.py); without the game installed there are no icons and no picture fingerprints (the pictures count as unchanged).
--out: default website/assets/; nothing else in that folder is touched.
"""
import argparse, gzip, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'shared'))
import bar_common  # noqa: E402  (the game's files, shared with render_unit.py)

CATEGORY_OF_GROUP = {'bot': 'bots', 'vehicle': 'vehicles', 'air': 'air', 'ships': 'sea', 'hover': 'hover', 'turrets': 'defense'}
# The Scavenger loot boxes get one of two models by chance at every start of the game (unitbasedefs/lootboxes/lootboxnano.lua: math.random(1, 2)): another model
# of one of them is no change of the game, so their pictures are not compared
RANDOM_MODEL = re.compile(r'^lootbox')
COMMITS = 'https://api.github.com/repos/beyond-all-reason/Beyond-All-Reason/commits/'


def category(game, editor):
    if game.get('isFactory'):
        return 'factories'
    if editor.get('filler'):
        return 'defense'
    return CATEGORY_OF_GROUP.get(editor.get('group'), 'buildings')


def dps(weapons):
    """Damage per second of all weapons that deal damage continuously (SPECIFICATION_WEBSITE.md, section 1)."""
    total = 0.0
    for w in weapons:
        if (w.get('customParams') or {}).get('bogus') or w.get('isShield') or w.get('type') == 'Shield' or w.get('interceptor') or w.get('paralyzer') or w.get('stockpile') or w.get('manualFire'):
            continue
        damages = w.get('damages') or {}
        reload = w.get('reload') or 0
        if reload > 0:
            total += max(damages.get('default') or 0, damages.get('vtol') or 0) * (w.get('projectiles') or 1) * (w.get('salvoSize') or 1) / reload
    return total


def texts(unit_name, editor):
    """Name and description. Some units have no translation in the game: the text is then only a key (`units.names.armprowl`). The description is the name then if it is a real
    text (armprowl: "Prowler"), otherwise the name of the unit."""
    name, description = editor.get('humanName') or '', editor.get('description') or ''
    name_missing, description_missing = name.startswith('units.'), description.startswith('units.')
    if name_missing:
        name, description = (description, '') if description and not description_missing else (unit_name, '')
    elif description_missing:
        description = ''
    return name, description


def reduce_unit(unit_name, unit):
    game, editor = unit['game'], unit['editor']
    weapons = editor.get('weapons') or []
    name, description = texts(unit_name, editor)
    types = list(dict.fromkeys(w['type'] for w in weapons if w.get('type') and not (w.get('customParams') or {}).get('bogus')))
    energy_make = max(0, (game.get('energyMake') or 0) - (game.get('energyUpkeep') or 0)) + (game.get('windGenerator') or 0) + (game.get('tidalGenerator') or 0)
    return {
        'name': name, 'description': description, 'faction': editor.get('faction'), 'category': category(game, editor),
        'tech': editor.get('tech') or 1, 'metal': game.get('metalCost') or 0, 'energy': game.get('energyCost') or 0, 'buildTime': round((game.get('buildTime') or 0) / 100, 1),
        'buildPower': game.get('buildSpeed') or 0, 'energyMake': round(energy_make, 1), 'hitpoints': round(game.get('health') or 0, 1), 'radar': game.get('radarDistance') or 0,
        'speed': round(game.get('speed') or 0, 1), 'weapons': types, 'dps': round(dps(weapons), 1), 'range': game.get('maxWeaponRange') or 0,
    }


def natural(text):
    """Sort key with the numbers in the text as numbers: test-31450 before test-31820."""
    return [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', text)]


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


# ---------------------------------------------------------------- base and diff
def compare(units, prints, base_units, base_prints):
    """(the units whose values or picture differ from the base, new units included; the units whose picture differs, new units included)."""
    changed, pictures = set(), set()
    for name, u in units.items():
        b = base_units.get(name)
        if b is None:
            changed.add(name)
            pictures.add(name)
            continue
        if {k: v for k, v in u.items() if k != 'icon'} != {k: v for k, v in b.items() if k != 'icon'}:
            changed.add(name)
        old, new = base_prints.get(name), prints.get(name)
        if old and new and old != new and not RANDOM_MODEL.match(name):
            changed.add(name)
            pictures.add(name)
    return changed, pictures


def reduce_file(f, out, data_dir, force):
    """One <out>/<version>/data/units-<version>.json -> the reduced file (base) or the diff file next to it, and the icons. Nothing happens if it is there (unless force)."""
    folder = out / f.stem[len('units-'):]
    base = find_base(out)
    is_base = base is None or base == folder
    target = folder / 'data' / (f'{f.stem}.reduced.json.gz' if is_base else f'{f.stem}.diff.json.gz')
    if target.exists() and not force:
        print(f'{target.name} is there already, skipped')
        return
    full = json.loads(f.read_text(encoding='utf-8'))
    version = full['gameVersion']
    target.parent.mkdir(parents=True, exist_ok=True)
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
    header = {'gameName': full.get('gameName'), 'gameVersion': version}

    if is_base:
        if pool and icons:
            (folder / 'images' / 'icons').mkdir(parents=True, exist_ok=True)
            for bitmap in set(icons.values()):
                (folder / 'images' / 'icons' / Path(bitmap).name).write_bytes(pool.read(bitmap))
            print(f'{version}: {len(set(icons.values()))} icons')
        if prints:
            write_whole(folder / 'data' / 'pictures.json', (json.dumps(prints, indent=0, sort_keys=True) + '\n').encode('utf-8'))
        write_whole(target, compress(text_of(header, units)))
        print(f'{target.name}: base version, {len(units)} units, {target.stat().st_size / 1024:.1f} KB (full file {f.stat().st_size / 1e6:.1f} MB)')
        return

    base_data = read_gz(next((base / 'data').glob('units-*.reduced.json.gz')))
    base_prints_file = base / 'data' / 'pictures.json'
    base_prints = json.loads(base_prints_file.read_text(encoding='utf-8')) if base_prints_file.exists() else {}
    if not base_prints or not prints:
        print(f'note: the pictures are not compared (no fingerprints of {"the base version" if not base_prints else "this version"}), only the values')
    changed, pictures = compare(units, prints, base_data['units'], base_prints)
    by_name = {Path(b).name: b for b in icons.values()}
    diff = {}
    for name in changed:
        u = dict(units[name])
        if name in pictures:
            u['ownPicture'] = True
        icon = u.get('icon')
        if icon and pool:   # an icon that the base does not have like this goes into this version's folder
            mine, theirs = pool.read(by_name[icon]), base / 'images' / 'icons' / icon
            if not theirs.exists() or theirs.read_bytes() != mine:
                (folder / 'images' / 'icons').mkdir(parents=True, exist_ok=True)
                (folder / 'images' / 'icons' / icon).write_bytes(mine)
                u['ownIcon'] = True
        diff[name] = u
    removed = sorted(set(base_data['units']) - set(units))
    header.update({'base': base_data['gameVersion'], 'count': len(units), 'removed': removed})
    write_whole(target, compress(text_of(header, diff)))
    print(f'{target.name}: {len(diff)} of {len(units)} units differ from the base version {base_data["gameVersion"]} ({len(pictures)} with another picture), '
          f'{len(removed)} gone, {target.stat().st_size / 1024:.1f} KB')


def picture_units(folder):
    """The units whose picture belongs into <folder>/images: all units of the base version, only the ones with ownPicture of another version."""
    data = Path(folder) / 'data'
    full = list(data.glob('units-*.reduced.json.gz'))
    if full:
        return sorted(read_gz(full[0])['units'])
    diff = list(data.glob('units-*.diff.json.gz'))
    if not diff:
        sys.exit(f'ERROR: no reduced or diff file in {data}')
    return sorted(n for n, u in read_gz(diff[0])['units'].items() if u.get('ownPicture'))


def commit_date(version):
    """The date of the game version: the commit of the Beyond All Reason repository whose short hash ends the version (test-31836-b250a16), as YYYY-MM-DD; '' if unknown."""
    sha = version.rsplit('-', 1)[-1]
    if not re.fullmatch(r'[0-9a-f]{7,40}', sha):
        return ''
    try:
        return json.loads(bar_common.fetch(COMMITS + sha))['commit']['committer']['date'][:10]
    except Exception as e:
        print(f'note: no date for {version} ({e})')
        return ''


def write_versions(out):
    """website/assets/versions.json: every version that has a reduced (base) or a diff file, the oldest first (by the numbers in the name), with its date.
    The dates of the file there already are kept (a commit does not change); only the missing ones are asked from GitHub."""
    old = out / 'versions.json'
    known = {v['version']: v.get('date', '') for v in json.loads(old.read_text(encoding='utf-8'))['versions']} if old.exists() else {}
    versions = []
    for file in [*out.glob('*/data/units-*.reduced.json.gz'), *out.glob('*/data/units-*.diff.json.gz')]:
        d = read_gz(file)
        v = {'version': d['gameVersion'], 'dir': file.parent.parent.name, 'file': file.name, 'date': known.get(d['gameVersion']) or commit_date(d['gameVersion'])}
        if file.name.endswith('.reduced.json.gz'):
            v['base'] = True
        else:
            v['changed'] = len(d['units'])
        versions.append(v)
    versions.sort(key=lambda v: natural(v['version']))
    old.write_text(json.dumps({'versions': versions}, indent=1) + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--units', default='', help='only this units-<version>.json (default: all in --out)')
    ap.add_argument('--out', default=str(ROOT / 'website' / 'assets'), help='the out folder (default website/assets/)')
    ap.add_argument('--data', default='', help='data folder of the BAR installation (for the icons and the picture fingerprints)')
    ap.add_argument('--force', action='store_true', help='make the reduced or diff file even if it is there')
    ap.add_argument('--pictures', default='', metavar='FOLDER', help='only print the units whose picture belongs into FOLDER/images (FOLDER: <out>/<version>)')
    a = ap.parse_args()
    if a.pictures:
        print('\n'.join(picture_units(a.pictures)))
        return
    out = Path(a.out)
    files = [Path(a.units)] if a.units else sorted((p for p in out.glob('*/data/units-*.json') if '.reduced' not in p.name and '.diff' not in p.name), key=lambda p: natural(p.name))
    if not files or not all(f.exists() for f in files):
        sys.exit(f'ERROR: no units-<version>.json ({a.units or out}). Run the exporter first (exporter/export_units.bat).')
    out.mkdir(parents=True, exist_ok=True)
    base = find_base(out)
    if base:   # the base first: the other versions are compared with it
        files.sort(key=lambda p: p.parent.parent != base)
    for f in files:
        reduce_file(f, out, a.data, a.force)
    write_versions(out)
    print(f'done: {out}')


if __name__ == '__main__':
    main()
