"""bar_common.py: what the Python tools share (SPECIFICATION.md, section 2). The same rules for PowerShell: BarCommon.ps1 next to this file.

    import sys; sys.path.insert(0, str(<repository> / 'shared')); import bar_common

- find_data_dir, find_game, Pool: the game's files (data folder, the package of the game, the pool)
- faction_of, version_name: the faction of a unit by its name, the game version as it is used in file and folder names
- fetch, newest_units: beyondallreason.info and the unit data of the newest exported game version
"""
import gzip, json, os, re, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / 'website' / 'assets'
GAME_PREFIX = 'Beyond All Reason '


# ---------------------------------------------------------------- units and versions
def faction_of(unit):
    """Same rule as Shared.factionOf of the Level Editor: _scav = Scavengers, raptor_ = Raptors, otherwise the first three letters."""
    if unit.endswith('_scav'):
        return 'scv'
    if unit.startswith('raptor_'):
        return 'rap'
    return unit[:3]


def version_name(game):
    """"Beyond All Reason test-31820-45ea098" (or only the version) -> the version as in file and folder names: every character other than letters, digits, . _ -
    becomes _ (the same rule as led_export.lua: units-<version>.json)."""
    return re.sub(r'[^A-Za-z0-9._-]', '_', game.removeprefix(GAME_PREFIX))


# ---------------------------------------------------------------- the game: data folder, archive cache, .sdp, pool
def usual_data_dirs():
    """The usual places of the data folder (data_dirs.txt), expanded."""
    out = []
    for line in (HERE / 'data_dirs.txt').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            out.append(Path(os.path.expanduser(os.path.expandvars(line))))
    return out


def is_data_dir(folder):
    return bool(folder) and Path(folder, 'packages').is_dir() and Path(folder, 'pool').is_dir()


def find_data_dir(given=''):
    """The data folder of the BAR installation (it has packages and pool): the given one, $BAR_DATA, otherwise the first of the usual places. Exits with an error if none."""
    if given and not is_data_dir(given):
        sys.exit(f'ERROR: {given} is not a BAR data folder (it has the folders packages and pool).')
    candidates = [given, os.environ.get('BAR_DATA'), *usual_data_dirs()]
    for c in candidates:
        if is_data_dir(c):
            return Path(c)
    sys.exit('ERROR: no BAR data folder found (it has the folders packages and pool). Give it with --data or the environment variable BAR_DATA. Looked in: '
             + ', '.join(str(c) for c in candidates if c))


def find_game(data, wanted=''):
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
        for name in (unit, unit.removesuffix('_scav')):
            for folder in ('objects3d/units/', 'objects3d/'):
                if self.has(f'{folder}{name}.s3o'):
                    return f'{folder}{name}.s3o'
        base = unit.removesuffix('_scav') + '.s3o'
        hits = sorted(n for n in self.entries if n.startswith('objects3d/') and n.endswith('/' + base))
        return hits[0] if hits else None


# ---------------------------------------------------------------- the website's data and beyondallreason.info
def newest_units(assets=ASSETS):
    """The unit names of the newest game version in website/assets/ (versions.json): the units of the base version (the reduced file) with the changes of the newest
    version (its diff file: new units, units that are gone)."""
    versions = json.loads((Path(assets) / 'versions.json').read_text(encoding='utf-8'))['versions']
    read = lambda v: json.loads(gzip.decompress((Path(assets) / v['dir'] / 'data' / v['file']).read_bytes()))
    base = read(next((v for v in versions if v.get('base')), versions[0]))
    newest = versions[-1]
    if newest.get('base', newest is versions[0]):
        return set(base['units'])
    diff = read(newest)
    return (set(base['units']) - set(diff.get('removed', []))) | set(diff['units'])


def fetch(url, tries=3):
    """A page of beyondallreason.info as text; a failed request is tried again (it is not always a missing page)."""
    last = None
    for _ in range(tries):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'BARUnitComparer'})
            with urllib.request.urlopen(request, timeout=60) as r:
                return r.read().decode('utf-8')
        except Exception as e:
            last = e
    raise RuntimeError(f'{url}: {last}')
