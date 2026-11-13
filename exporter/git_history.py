"""git_history.py: the history of the game's repository, for the year of game versions (docs/plan-versions-2026.md, decisions 2 and 4).

    python exporter/git_history.py [--cache DIR] [--steps]

A bare clone of the repository of Beyond All Reason without file contents (git clone --bare --filter=blob:none, kept in cache/bar.git, not in Git) gives
  - the commits of the branch `stable` with their dates (the date of a game version is the commit date),
  - the prefilter: which files changed between two versions (git diff --name-only on the trees), so that a version that changes neither a value nor the look
    is neither downloaded nor started.
Used by update_versions.py. Standing alone: --steps shows how every step of the chain is classified.
"""
import argparse, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = 'https://github.com/beyond-all-reason/Beyond-All-Reason.git'
BRANCH = 'stable'
CLONE = ROOT / 'cache' / 'bar.git'

# What reaches the exported values: the unit and weapon definitions with their post-processing, names and descriptions, shared code, the mod options.
# The exporter reads only UnitDefs and WeaponDefs, and no gadget writes to them (checked with git grep on the whole of luarules/gadgets); of luarules/ only
# what the definitions include (gamedata/alldefs_post.lua requires luarules/configs/quick_start_build_defs and luarules/gadgets/include/*).
# The list must be COMPLETE (a missed path loses a change): the check against the exports and the switch --no-prefilter of update_versions.py.
VALUE_PATHS = ['units', 'unitbasedefs', 'weapons', 'gamedata', 'language', 'common', 'modules', 'types', 'modoptions.lua', 'modinfo.lua', 'init.lua',
               'EngineOptions.lua', 'luarules/configs', 'luarules/gadgets/include', 'luarules/Utilities']
# What reaches the pictures: the models, the textures, the animation scripts (hidden pieces) and the radar icons.
LOOK_PATHS = ['objects3d', 'unittextures', 'scripts', 'icons']


def git(repo, *args):
    r = subprocess.run(['git', '-C', str(repo), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors='replace')
    if r.returncode != 0:
        sys.exit(f'ERROR: git {" ".join(args)} failed in {repo}: {r.stderr.strip()}')
    return r.stdout


def ensure_clone(repo=CLONE):
    """The clone without file contents: made, or brought up to date with git fetch."""
    repo = Path(repo)
    if repo.exists():
        git(repo, 'fetch', '--quiet', 'origin', f'+{BRANCH}:{BRANCH}')
        return repo
    repo.parent.mkdir(parents=True, exist_ok=True)
    print(f'cloning {REPO} (without file contents, about 35 MB) ...', flush=True)
    r = subprocess.run(['git', 'clone', '--bare', '--filter=blob:none', '--single-branch', '--branch', BRANCH, REPO, str(repo)])
    if r.returncode != 0:
        sys.exit('ERROR: the clone of the game repository failed.')
    return repo


def commit_dates(repo=CLONE):
    """{full commit hash: date 'YYYY-MM-DD'} of every commit of the branch (the commit date, in the time zone of the commit)."""
    out = {}
    for line in git(repo, 'log', BRANCH, '--format=%H %cs').splitlines():
        h, d = line.split()
        out[h] = d
    return out


def changed_files(repo, old, new, paths):
    """The files below `paths` that differ between two commits."""
    return git(repo, 'diff', '--name-only', old, new, '--', *paths).split()


def kind_of_step(repo, old, new):
    """'values' (a value path changed: the game must be exported), 'look' (only a look path changed: only the pictures can change) or 'none'."""
    if changed_files(repo, old, new, VALUE_PATHS):
        return 'values'
    return 'look' if changed_files(repo, old, new, LOOK_PATHS) else 'none'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--cache', default=str(CLONE), help='the clone (default cache/bar.git)')
    ap.add_argument('--steps', action='store_true', help='classify every step of the exported chain (needs the rapid list of the server)')
    a = ap.parse_args()
    repo = ensure_clone(a.cache)
    dates = commit_dates(repo)
    print(f'{len(dates)} commits on {BRANCH}, newest {max(dates.values())}')
    if a.steps:
        import update_versions
        chain = update_versions.year_versions(dates)
        counts = {}
        for (_, v0, c0), (_, v1, c1) in zip(chain, chain[1:]):
            k = kind_of_step(repo, c0, c1)
            counts[k] = counts.get(k, 0) + 1
            print(f'{v1}  {dates[c1]}  {k}')
        print(counts)


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
