"""reduce_units.py: the data of the website from the exporter's files (SPECIFICATION_WEBSITE.md, section 1). export_units.ps1 runs it after every export.

    python exporter/reduce_units.py [--units FILE] [--out DIR] [--data DIR] [--force]

Reads every <out>/<version>/data/units-<version>.json (or only --units) and writes, if it is not there yet (--force: anyway):
    <out>/<version>/data/units-<version>.reduced.json.gz   only the values the page shows, plus the new property `category`, as gzip at its maximum (pip install zopfli)
    <out>/<version>/images/icons/<file>.png             the role icons of the units of that version, from the game (--data: data folder of BAR, default as in render_unit.py); skipped if the game version is not installed
and in any case <out>/versions.json: the versions there are, newest last. --out: default website/assets/; nothing else in that folder is touched.
"""
import argparse, gzip, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATEGORY_OF_GROUP = {'bot': 'bots', 'vehicle': 'vehicles', 'air': 'air', 'ships': 'sea', 'hover': 'hover', 'turrets': 'defense'}


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


def icon_files(data_dir, game_name, icon_types):
    """The pool of the game and {iconType: name of the file in the pool}. Raises SystemExit or OSError if the game is not there."""
    sys.path.insert(0, str(ROOT / 'render_unit'))
    import render_unit as ru
    folder = ru.find_data_dir(data_dir)
    sdp, _ = ru.find_game(folder, game_name)
    pool = ru.Pool(folder, sdp)
    text = pool.read('gamedata/icontypes.lua').decode('utf-8', errors='replace')
    bitmaps = {m.group(1).lower(): m.group(2).lower() for m in re.finditer(r'\b(\w+)\s*=\s*\{\s*bitmap\s*=\s*"([^"]+)"', text)}
    found = {}
    for icon_type in icon_types:
        bitmap = bitmaps.get(icon_type.lower()) or bitmaps.get(re.sub(r'_scav$', '', icon_type.lower()))
        if bitmap and pool.has(bitmap):
            found[icon_type] = bitmap
    return pool, found


def text_of(full, version, units):
    """The file as text: normal JSON, one object per unit, one unit per line."""
    head = json.dumps({'format': 1, 'gameName': full.get('gameName'), 'gameVersion': version, 'count': len(units)}, ensure_ascii=False)[:-1]
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


def reduce_file(f, out, data_dir, force):
    """One <out>/<version>/data/units-<version>.json -> the reduced file next to it and the icons in <out>/<version>/images/icons/. Nothing happens if the reduced file is there (unless force)."""
    folder = out / f.stem[len('units-'):]
    target = folder / 'data' / f'{f.stem}.reduced.json.gz'
    if target.exists() and not force:
        print(f'{target.name} is there already, skipped')
        return
    full = json.loads(f.read_text(encoding='utf-8'))
    version = full['gameVersion']
    target.parent.mkdir(parents=True, exist_ok=True)
    units = {name: reduce_unit(name, u) for name, u in full['units'].items()}
    icon_types = {name: u['game'].get('iconType') or name for name, u in full['units'].items()}
    try:
        pool, icons = icon_files(data_dir, f"{full.get('gameName', 'Beyond All Reason')} {version}", set(icon_types.values()))
        (folder / 'images' / 'icons').mkdir(parents=True, exist_ok=True)
        for bitmap in set(icons.values()):
            (folder / 'images' / 'icons' / Path(bitmap).name).write_bytes(pool.read(bitmap))
        for name, u in units.items():
            if icon_types[name] in icons:
                u['icon'] = Path(icons[icon_types[name]]).name
        print(f'{version}: {len(set(icons.values()))} icons')
    except (SystemExit, OSError) as e:
        print(f'note: no icons for {version} ({e})')
    part = target.with_name(target.name + '.part')   # complete or not at all: the existence of the file decides whether it is made
    part.write_bytes(compress(text_of(full, version, units)))
    part.replace(target)
    (folder / 'data' / f'{f.stem}.reduced.json.br').unlink(missing_ok=True)   # the file of an earlier version of this script
    print(f'{target.name}: {len(units)} units, {target.stat().st_size / 1024:.1f} KB (full file {f.stat().st_size / 1e6:.1f} MB)')


def write_versions(out):
    """website/assets/versions.json: every version that has a reduced file in website/assets/, the newest last (by the numbers in the name)."""
    natural = lambda text: [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', text)]
    versions = []
    for file in out.glob('*/data/units-*.reduced.json.gz'):
        version = json.loads(gzip.decompress(file.read_bytes()))['gameVersion']
        versions.append({'version': version, 'dir': file.parent.parent.name, 'file': file.name})
    versions.sort(key=lambda v: natural(v['version']))
    (out / 'versions.json').write_text(json.dumps({'versions': versions}, indent=1), encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--units', default='', help='only this units-<version>.json (default: all in --out)')
    ap.add_argument('--out', default=str(ROOT / 'website' / 'assets'), help='the out folder (default website/assets/)')
    ap.add_argument('--data', default='', help='data folder of the BAR installation (for the icons)')
    ap.add_argument('--force', action='store_true', help='make the reduced file even if it is there')
    a = ap.parse_args()
    out = Path(a.out)
    files = [Path(a.units)] if a.units else sorted(p for p in out.glob('*/data/units-*.json') if '.reduced' not in p.name)
    if not files or not all(f.exists() for f in files):
        sys.exit(f'ERROR: no units-<version>.json ({a.units or out}). Run the exporter first (exporter/export_units.bat).')
    out.mkdir(parents=True, exist_ok=True)
    for f in files:
        reduce_file(f, out, a.data, a.force)
    write_versions(out)
    print(f'done: {out}')


if __name__ == '__main__':
    main()
