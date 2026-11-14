"""update_versions.py: every game version of Beyond All Reason from 2026-01-01 into the website (docs/versions.md, docs/plan-versions-2026.md).
Started by "update game versions.bat".

    python exporter/update_versions.py [--list] [--max N] [--out DIR] [--data DIR] [--format avif] [--no-prefilter] [--keep-exports]

1. The versions: the packages of the BAR server (rapid, https://repos-cdn.beyondallreason.dev/byar/versions.gz: one package per commit, "Beyond All Reason
   test-<number>-<short hash>", byar:git:<full hash>) whose commit is on the branch `stable` and dated 2026-01-01 or later (the clone of the game repository,
   git_history.py). The first one is the base version.
2. The new ones: newer than checkedUpTo (website/assets/versions.json), oldest first. For each one in turn:
   - the prefilter (git_history.py): no file of the unit definitions changed against the version before: nothing is downloaded or started,
     checkedUpTo moves on. --no-prefilter exports every version.
   - otherwise: the package comes with pr-downloader (only the missing files, into the data folder), the engine of its date (engines.json) into cache/engines,
     then export_and_render_all_units.ps1: export with that engine, the diff against the version before (reduce_units.py), the pictures that changed.
     If the engine differs from the one of the version before, that version is exported again with the new engine first (control) and the diff is made against it.
   - a failure stops the run (nothing is skipped); started again, it goes on at checkedUpTo. Only versions named in broken_versions.json (the game itself does
     not start with them) are skipped, with the reason.
   (exporter/engines.json is brought up to date first: make_engine_table.py, from the history of the launcher.)
3. The full export of a version (15 MB) is removed after the version is done (--keep-exports keeps it).
4. After exported versions: counterparts.json and counters.json are refreshed from beyondallreason.info (export_counterparts.py, export_counters.py; --no-lists skips it).
A folder that holds another chain (another base) is an error: use a new --out.
--list: only show what is to be done. --max N: only the first N new versions.
"""
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'shared'))
sys.path.insert(0, str(ROOT / 'exporter'))
import bar_common, git_history, make_engine_table, reduce_units  # noqa: E402

RAPID = 'https://repos-cdn.beyondallreason.dev'
VERSIONS = RAPID + '/byar/versions.gz'
# the settings of pr-downloader that the BAR launcher uses (resources/app.asar)
PRD_ENV = {'PRD_RAPID_REPO_MASTER': RAPID + '/repos.gz', 'PRD_RAPID_USE_STREAMER': 'false', 'PRD_HTTP_SEARCH_URL': 'https://files-cdn.beyondallreason.dev/find'}
START = '2026-01-01'   # the chain starts with the first version of the year (docs/plan-versions-2026.md)
NAME = re.compile(r'^Beyond All Reason (test-(\d+)-[0-9a-f]+)$', re.I)


def parse_versions(fields):
    """[(number, version, game name)] of every package built from a commit (byar:git:<hash>), oldest first (fields: bar_common.rapid_lines)."""
    found = {}
    for f in fields:
        m = f[0].startswith('byar:git:') and NAME.match(f[3])
        if m:
            found[int(m.group(2))] = (int(m.group(2)), m.group(1), 'Beyond All Reason ' + m.group(1))
    return [found[n] for n in sorted(found)]


def parse_commits(fields):
    """{version: full commit hash} of the packages built from a commit (the tag is byar:git:<hash>)."""
    return {m.group(1): f[0].removeprefix('byar:git:') for f in fields for m in [f[0].startswith('byar:git:') and NAME.match(f[3])] if m}


def server_fields():
    return bar_common.rapid_lines(bar_common.http_get(VERSIONS, timeout=120))


def server_versions():
    """The versions on the package server of BAR."""
    return parse_versions(server_fields())


def year_versions(dates, start=START, fields=None):
    """[(number, version, commit hash)], oldest first: the versions whose commit is on the branch `stable` (dates: git_history.commit_dates) and dated `start` or later."""
    fields = fields if fields is not None else server_fields()
    commits = parse_commits(fields)
    return [(n, v, commits[v]) for n, v, _ in parse_versions(fields) if commits.get(v) in dates and dates[commits[v]] >= start]


def newest_done(out):
    """The number of the newest version looked at (versions.json: checkedUpTo, or the newest listed one), 0 if none."""
    m = re.match(r'^test-(\d+)-', reduce_units.checked_up_to(out))
    return int(m.group(1)) if m else 0


def pr_downloader(data, given):
    """pr-downloader.exe: the given one, the one of the BAR installation (<install>/bin next to <install>/data), or on the PATH."""
    for c in [given, Path(data).parent / 'bin' / 'pr-downloader.exe', shutil.which('pr-downloader')]:
        if c and Path(c).exists():
            return str(c)
    sys.exit('ERROR: pr-downloader not found (it comes with BAR: <BAR folder>/bin/pr-downloader.exe). Give it with --prd.')


def run_prd(prd, write_path, *args):
    """(exit code, the last lines of the output) of pr-downloader with the settings of the launcher."""
    r = subprocess.run([prd, '--filesystem-writepath', str(write_path), *args], env={**os.environ, **PRD_ENV},
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace')
    return r.returncode, '\n'.join(r.stdout.splitlines()[-15:])


def download(prd, data, game):
    """The package of the game into the data folder, unless it is there."""
    if bar_common.rapid_package(data, game):
        print(f'  {game}: the package is there already')
        return
    print(f'  {game}: downloading (only the missing files) ...', flush=True)
    code, tail = run_prd(prd, data, '--download-game', game)
    if code != 0 or not bar_common.rapid_package(data, game):
        sys.exit(f'ERROR: pr-downloader could not download {game} (exit code {code}):\n{tail}')


def engine_for(date, table):
    """The standard engine on a day (engines.json: [{from, engine}], oldest first); a day before the first entry gets the first engine."""
    name = table[0]['engine']
    for e in table:
        if e['from'] <= date:
            name = e['engine']
    return name


def engine_dir(cache, name):
    return Path(cache) / 'engines' / 'engine' / 'windows64' / name


def ensure_engine(prd, cache, name):
    """The engine in the cache of the tools (not in the installation): downloaded with pr-downloader if it is not there. Returns its folder."""
    folder = engine_dir(cache, name)
    if not (folder / 'spring.exe').exists():
        print(f'  engine {name}: downloading ...', flush=True)
        code, tail = run_prd(prd, Path(cache) / 'engines', '--download-engine', name)
        if code != 0 or not (folder / 'spring.exe').exists():
            sys.exit(f'ERROR: pr-downloader could not download the engine {name} (exit code {code}):\n{tail}')
        for archive in (Path(cache) / 'engines' / 'engine').glob('*.7z*'):   # the archive is not needed after it is unpacked
            archive.unlink()
    return folder


def move_checked(out, version):
    """checkedUpTo -> version (a version without a change: no files, only this)."""
    f = Path(out) / 'versions.json'
    data = json.loads(f.read_text(encoding='utf-8'))
    data.pop('unchanged', None)
    data['checkedUpTo'] = version
    f.write_text(json.dumps(data, indent=1) + '\n', encoding='utf-8', newline='\n')


def run_script(args):
    return subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', *map(str, args)]).returncode


def game_error():
    """Why the game did not start, if its log (the work folder of export_units.ps1) says: the line 'forced quit with exception' (a broken game version), else ''."""
    log = Path(os.environ.get('TEMP', '.')) / 'unit_export' / 'data' / 'infolog.txt'
    try:
        for line in log.read_text(encoding='utf-8', errors='replace').splitlines():
            if 'forced quit with exception' in line:
                return line.split('forced quit with exception', 1)[1].strip()[:400]
    except OSError:
        pass
    return ''


def listed_engine(out):
    """The engine of the newest version in versions.json that names one ('' if none)."""
    f = Path(out) / 'versions.json'
    if not f.exists():
        return ''
    return next((v['engine'] for v in reversed(json.loads(f.read_text(encoding='utf-8'))['versions']) if v.get('engine')), '')


def drop_unused(out, version):
    """The folder of a version that got no files (nothing changed) holds only the full export and empty folders: it is removed. A folder with a diff file, the base,
    or a picture is never touched."""
    folder = Path(out) / bar_common.version_name(version)
    if folder.is_dir() and not list(folder.glob('data/*.gz')) and not list(folder.glob('images/*')):
        shutil.rmtree(folder)


def refresh_lists(out):
    """The counterparts (export_counterparts.py) and the counters (export_counters.py) from beyondallreason.info for the units of the newest version; both read the unit
    data of website/assets, so only for that folder. A failure (no network, a changed page) is a warning: the rest is done."""
    if Path(out).resolve() != bar_common.ASSETS.resolve():
        print('note: counterparts.json and counters.json are only refreshed for website/assets (run exporter/export_counterparts.py and export_counters.py yourself)')
        return
    for script in ('export_counterparts.py', 'export_counters.py'):
        r = subprocess.run([sys.executable, str(ROOT / 'exporter' / script)])
        if r.returncode != 0:
            print(f'WARNING: {script} failed (exit code {r.returncode}); run it again later.')


def plan(chain, done, repo, prefilter):
    """[(number, version, commit, kind)] of the versions after `done`. kind: 'base' (the first version of the chain when nothing is done), 'values'
    (Git shows a change: to be exported), 'none' (no change of the files: only checkedUpTo moves on). Without the prefilter every version is 'values'."""
    steps = []
    for i, (n, v, c) in enumerate(chain):
        if n <= done:
            continue
        if i == 0 and not done:
            kind = 'base'
        else:
            kind = git_history.kind_of_step(repo, chain[i - 1][2], c) if prefilter else 'values'
        steps.append((n, v, c, kind))
    return steps


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--list', action='store_true', help='only show what is to be done')
    ap.add_argument('--max', type=int, default=0, help='only the first N new versions (the oldest)')
    ap.add_argument('--out', default=str(ROOT / 'website' / 'assets'), help='the out folder (default website/assets/)')
    ap.add_argument('--data', default='', help='data folder of the BAR installation')
    ap.add_argument('--prd', default='', help='pr-downloader.exe (default: the one of the BAR installation)')
    ap.add_argument('--format', default='avif', help='picture format (as export_and_render_all_units.ps1 -Format)')
    ap.add_argument('--cache', default=str(ROOT / 'cache'), help='the cache of the tools: the clone of the game repository and the engines (default cache/)')
    ap.add_argument('--no-prefilter', action='store_true', help='export every version, also the ones for which Git shows no change of the units')
    ap.add_argument('--no-lists', action='store_true', help='do not refresh counterparts.json and counters.json from beyondallreason.info at the end')
    ap.add_argument('--keep-exports', action='store_true', help='keep the full export (15 MB) of every version')
    a = ap.parse_args()
    out, cache = Path(a.out), Path(a.cache)
    repo = git_history.ensure_clone(cache / 'bar.git')
    dates = git_history.commit_dates(repo)
    chain = year_versions(dates)
    if not chain:
        sys.exit('ERROR: no game version of the year found.')
    done = newest_done(out)
    listing = out / 'versions.json'
    if done:
        base = next((v['version'] for v in json.loads(listing.read_text(encoding='utf-8'))['versions'] if v.get('base')), '')
        if base != chain[0][1]:
            sys.exit(f'ERROR: the base version in {listing} is {base}, but the year starts with {chain[0][1]}. Use a new --out folder (the old chain is not changed).')
    steps = plan(chain, done, repo, not a.no_prefilter)
    hits = [s for s in steps if s[3] != 'none']
    print(f'{len(chain)} versions since {START} (newest test-{chain[-1][0]}); checked up to: {"test-" + str(done) if done else "nothing"}; '
          f'to do: {len(steps)} ({len(hits)} to export, {len(steps) - len(hits)} without a change in the files)')
    if a.max:
        steps = steps[:a.max]
    if a.list or not steps:
        for n, v, c, kind in steps:
            print(f'  {v}  {dates[c]}  {kind}')
        return
    data = bar_common.find_data_dir(a.data)
    prd = pr_downloader(data, a.prd)
    table, changed = make_engine_table.refresh(cache / 'chobby.git')   # a new standard engine of the launcher is picked up
    if changed:
        print(f'note: exporter/engines.json changed (a new standard engine): {table[-1]["engine"]} from {table[-1]["from"]}')
    names = [v for _, v, _ in chain]
    broken = json.loads((ROOT / 'exporter' / 'broken_versions.json').read_text(encoding='utf-8'))
    for i, (n, version, commit, kind) in enumerate(steps, 1):
        print(f'[{i}/{len(steps)}] {version} ({dates[commit]}, {kind})', flush=True)
        if kind == 'none':
            move_checked(out, version)
            continue
        if version in broken:   # a version in which the game itself does not start: nothing to export; the next version is compared with the one before it
            print(f'  {version} is known as broken, skipped: {broken[version]}')
            move_checked(out, version)
            continue
        game = 'Beyond All Reason ' + version
        engine = ensure_engine(prd, cache, engine_for(dates[commit], table))
        download(prd, data, game)
        args = [ROOT / 'export_and_render_all_units.ps1', '-Game', game, '-Yes', '-Faction', 'all', '-Format', a.format, '-Out', out, '-Data', data, '-Engine', engine]
        before = listed_engine(out)
        if kind != 'base' and before and before != engine.name:   # a change of the engine: the version before, exported again with the new engine
            prev = names[names.index(version) - 1]
            short = bar_common.version_name(prev)
            control = cache / 'control' / short / 'data' / f'units-{short}.json'
            if not control.exists():
                print(f'  the engine changes ({before} -> {engine.name}): {prev} is exported again with the new engine', flush=True)
                download(prd, data, 'Beyond All Reason ' + prev)
                code = run_script([ROOT / 'exporter' / 'export_units.ps1', '-Out', cache / 'control', '-Game', 'Beyond All Reason ' + prev, '-Data', data, '-Engine', engine])
                if code != 0 or not control.exists():
                    sys.exit(f'ERROR: the control export of {prev} with the engine {engine.name} failed; the versions from {version} on are not done. Start again to go on.')
            args += ['-Control', control]
        if run_script(args) != 0:
            why = game_error()
            sys.exit(f'ERROR: export_and_render_all_units.ps1 failed for {version}; the versions after it are not done. Start again to go on.'
                     + (f'\nThe game itself does not load this version: {why}\nIf that is a mistake in the game, name the version in exporter/broken_versions.json.' if why else ''))
        if not a.keep_exports:
            (out / bar_common.version_name(version) / 'data' / f'units-{bar_common.version_name(version)}.json').unlink(missing_ok=True)
        drop_unused(out, version)
    if not a.no_lists and any(s[3] != 'none' for s in steps):   # a version was exported: the newest units may have new counterparts and counters
        refresh_lists(out)
    print('done: ' + ', '.join(f'{v["version"]} ({v.get("changed", "base")})' for v in json.loads(listing.read_text(encoding='utf-8'))['versions']))


if __name__ == '__main__':
    main()
