"""update_versions.py: the new game versions of Beyond All Reason into the website (docs/versions.md). Started by "update game versions.bat".

    python exporter/update_versions.py [--list] [--max N] [--out DIR] [--data DIR] [--format avif]

1. Reads the list of all game versions from the package server of BAR (rapid, https://repos-cdn.beyondallreason.dev/byar/versions.gz: one package per commit of the
   Beyond All Reason repository, "Beyond All Reason test-<number>-<short hash>"; byar:git:<full hash>, so a version is always the same).
2. The new versions: newer than the newest one done (website/assets/versions.json: listed, or unchanged), oldest first.
3. For each one in turn: downloads its package with pr-downloader of the BAR installation (only the files that are missing, into the data folder, like the launcher),
   then export_and_render_all_units.ps1 -Game: export, the diff against the version before (reduce_units.py), the pictures that changed. A version in which nothing
   changed gets no files and is not shown; it is only named in versions.json (unchanged).
--list: only show the new versions. --max N: only the first N new ones (the oldest).
"""
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'shared'))
import bar_common  # noqa: E402

RAPID = 'https://repos-cdn.beyondallreason.dev'
VERSIONS = RAPID + '/byar/versions.gz'
# the settings of pr-downloader that the BAR launcher uses (resources/app.asar)
PRD_ENV = {'PRD_RAPID_REPO_MASTER': RAPID + '/repos.gz', 'PRD_RAPID_USE_STREAMER': 'false', 'PRD_HTTP_SEARCH_URL': 'https://files-cdn.beyondallreason.dev/find'}
NAME = re.compile(r'^Beyond All Reason (test-(\d+)-[0-9a-f]+)$', re.I)


def parse_versions(fields):
    """[(number, version, game name)] of every package built from a commit (byar:git:<hash>), oldest first (fields: bar_common.rapid_lines)."""
    found = {}
    for f in fields:
        m = f[0].startswith('byar:git:') and NAME.match(f[3])
        if m:
            found[int(m.group(2))] = (int(m.group(2)), m.group(1), 'Beyond All Reason ' + m.group(1))
    return [found[n] for n in sorted(found)]


def server_versions():
    """The versions on the package server of BAR."""
    return parse_versions(bar_common.rapid_lines(bar_common.http_get(VERSIONS, timeout=120)))


def newest_done(out):
    """The number of the newest version in versions.json (listed or unchanged), 0 if none."""
    listing = out / 'versions.json'
    if not listing.exists():
        return 0
    data = json.loads(listing.read_text(encoding='utf-8'))
    names = [v['version'] for v in data['versions']] + data.get('unchanged', [])
    numbers = [int(m.group(1)) for m in (re.match(r'^test-(\d+)-', n) for n in names) if m]
    return max(numbers, default=0)


def pr_downloader(data, given):
    """pr-downloader.exe: the given one, the one of the BAR installation (<install>/bin next to <install>/data), or on the PATH."""
    for c in [given, Path(data).parent / 'bin' / 'pr-downloader.exe', shutil.which('pr-downloader')]:
        if c and Path(c).exists():
            return str(c)
    sys.exit('ERROR: pr-downloader not found (it comes with BAR: <BAR folder>/bin/pr-downloader.exe). Give it with --prd.')


def download(prd, data, game):
    """The package of the game into the data folder, unless it is there."""
    if bar_common.rapid_package(data, game):
        print(f'  {game}: the package is there already')
        return
    print(f'  {game}: downloading (only the missing files) ...', flush=True)
    r = subprocess.run([prd, '--filesystem-writepath', str(data), '--download-game', game], env={**os.environ, **PRD_ENV},
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace')
    if r.returncode != 0 or not bar_common.rapid_package(data, game):
        sys.exit(f'ERROR: pr-downloader could not download {game} (exit code {r.returncode}):\n' + '\n'.join(r.stdout.splitlines()[-15:]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--list', action='store_true', help='only show the new versions')
    ap.add_argument('--max', type=int, default=0, help='only the first N new versions (the oldest)')
    ap.add_argument('--out', default=str(ROOT / 'website' / 'assets'), help='the out folder (default website/assets/)')
    ap.add_argument('--data', default='', help='data folder of the BAR installation')
    ap.add_argument('--prd', default='', help='pr-downloader.exe (default: the one of the BAR installation)')
    ap.add_argument('--format', default='avif', help='picture format (as export_and_render_all_units.ps1 -Format)')
    a = ap.parse_args()
    out = Path(a.out)
    done = newest_done(out)
    if not done:
        sys.exit(f'ERROR: no game version in {out / "versions.json"}: export the base version first ("export and render all units.bat").')
    new = [v for v in server_versions() if v[0] > done]
    print(f'newest version done: test-{done}; new on the server: {len(new)}' + (f' ({new[0][1]} ... {new[-1][1]})' if new else ''))
    if a.max:
        new = new[:a.max]
    if a.list or not new:
        for _, version, _ in new:
            print(f'  {version}')
        return
    data = bar_common.find_data_dir(a.data)
    prd = pr_downloader(data, a.prd)
    for i, (_, version, game) in enumerate(new, 1):
        print(f'[{i}/{len(new)}] {version}', flush=True)
        download(prd, data, game)
        args = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'export_and_render_all_units.ps1'),
                '-Game', game, '-Yes', '-Faction', 'all', '-Format', a.format, '-Out', str(out), '-Data', str(data)]
        r = subprocess.run(args)
        if r.returncode != 0:
            sys.exit(f'ERROR: export_and_render_all_units.ps1 failed for {version} (exit code {r.returncode}); the versions after it are not done. Start again to go on.')
    print('done: ' + ', '.join(f'{v["version"]} ({v.get("changed", "base")})' for v in json.loads((out / 'versions.json').read_text(encoding='utf-8'))['versions']))


if __name__ == '__main__':
    main()
