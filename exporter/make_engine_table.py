"""make_engine_table.py: exporter/engines.json, the engine that was the standard one on every day (docs/plan-versions-2026.md, decision 7).

    python exporter/make_engine_table.py [--cache DIR]

The launcher configuration dist_cfg/config.json of the repository BYAR-Chobby names the engine in every commit (the setup `manual-win`, launch.engine, for
example "recoil_2025.06.12"). The table [{"from": "2026-01-01", "engine": "2025.06.12"}, ...] is made from the commit dates: an approximation of the day the
players changed. A clone without file contents (cache/chobby.git, not in Git) is made, or brought up to date. Run it again when a new engine is the standard.
"""
import argparse, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = 'https://github.com/beyond-all-reason/BYAR-Chobby.git'
SETUP = 'manual-win'   # the standard setup of Windows (not the "test engine" one)
START = '2025-12-01'   # a little before the year, so that the engine at the start is known


def git(repo, *args):
    r = subprocess.run(['git', '-C', str(repo), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors='replace')
    if r.returncode != 0:
        sys.exit(f'ERROR: git {" ".join(args)}: {r.stderr.strip()}')
    return r.stdout


def table(repo, since=START):
    """[{from, engine}] oldest first, one entry per change of the standard engine."""
    out = []
    for line in reversed(git(repo, 'log', '--since', since, '--format=%H %cs', '--', 'dist_cfg/config.json').splitlines()):
        commit, date = line.split()
        config = json.loads(git(repo, 'show', f'{commit}:dist_cfg/config.json'))
        setup = next((s for s in config['setups'] if s['package'].get('id') == SETUP), None)
        engine = setup['launch']['engine'].removeprefix('recoil_') if setup else None
        if engine and (not out or out[-1]['engine'] != engine):
            out.append({'from': date, 'engine': engine})
    return out


def refresh(cache=None):
    """Clone or update the launcher repository and write exporter/engines.json. Returns the table; True as second value if the file changed."""
    repo = Path(cache or ROOT / 'cache' / 'chobby.git')
    if repo.exists():
        git(repo, 'fetch', '--quiet', 'origin', '+HEAD:refs/heads/main')
    else:
        repo.parent.mkdir(parents=True, exist_ok=True)
        if subprocess.run(['git', 'clone', '--bare', '--filter=blob:none', '--single-branch', REPO, str(repo)]).returncode != 0:
            sys.exit('ERROR: the clone of BYAR-Chobby failed.')
    t = table(repo)
    target = ROOT / 'exporter' / 'engines.json'
    text = json.dumps(t, indent=1) + '\n'
    changed = not target.exists() or target.read_text(encoding='utf-8') != text
    if changed:
        target.write_text(text, encoding='utf-8', newline='\n')
    return t, changed


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--cache', default=str(ROOT / 'cache' / 'chobby.git'))
    a = ap.parse_args()
    for e in refresh(a.cache)[0]:
        print(e['from'], e['engine'])


if __name__ == '__main__':
    main()
