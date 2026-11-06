"""export_counterparts.py: makes counterparts.json, the units of the different factions that belong together (Grunt - Pawn - Goblin).

    python exporter/export_counterparts.py [--out website/assets/counterparts.json] [--threads 6] [--no-web]

The result maps a unit name to a counterpart id; units with the same id are counterparts. Where the ids come from:
  1. the file that is already there (corrected by hand), else the name without the faction letters (armllt, corllt, legllt -> llt);
  2. the unit pages of beyondallreason.info: every page has a "counterpart" part. All units that a page names are put in one group with the unit, groups that share
     a unit are joined. The group gets the id of its Armada unit (else Cortex, else Legion). The official site wins: this overrides 1., also an id corrected by hand,
     for the units that are in such a group;
  3. a Scavenger copy (<name>_scav) always gets the id of its unit.
The unit pages to read come from the sitemap of the website; only units that the unit data of the newest game version knows are used. Without --no-web nothing is
changed for a unit that has no counterpart on its page. Groups with two units of one faction are reported, they are probably not wanted.
"""
import argparse, json, re, sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'shared'))
from bar_common import fetch, newest_units  # noqa: E402

SITE = 'https://www.beyondallreason.info'
HEAD = '<h3 class="us-subheading">counterpart</h3>'
LINK = re.compile(r'href="/unit/([^"/?#]+)"')
PREFIXES = ('arm', 'cor', 'leg')


def counterparts_on_page(html):
    i = html.find(HEAD)
    if i < 0:
        return []
    part = html[i + len(HEAD):].split('class="mobileonly"')[0]
    return list(dict.fromkeys(LINK.findall(part)))


def default_id(name):
    base = name.removesuffix('_scav')
    if base[:3] in PREFIXES and len(base) > 3:
        return base[3:]
    return base


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=str(ROOT / 'website' / 'assets' / 'counterparts.json'))
    ap.add_argument('--threads', type=int, default=6)
    ap.add_argument('--no-web', action='store_true', help='only the file and the names, do not read the website')
    args = ap.parse_args()
    out = Path(args.out)
    units = sorted(newest_units(out.parent))

    ids = {}
    if out.exists():
        ids = json.loads(out.read_text(encoding='utf-8'))['units']
    for u in units:   # the old file stays (also units of other game versions), new units get the name proposal
        ids.setdefault(u, default_id(u))

    if not args.no_web:
        names = set(units)
        sitemap = fetch(SITE + '/sitemap.xml')
        pages = sorted({s for s in re.findall(r'<loc>[^<]*/unit/([^<]+)</loc>', sitemap) if s in names and not s.endswith('_scav')})
        print(f'{len(pages)} unit pages to read')
        found = {}
        def read(name):
            return name, counterparts_on_page(fetch(f'{SITE}/unit/{name}'))
        with ThreadPoolExecutor(args.threads) as pool:
            for n, (name, others) in enumerate(pool.map(read, pages), 1):
                found[name] = [o for o in others if o in names]
                if n % 100 == 0:
                    print(f'  {n} / {len(pages)}')

        parent = {}
        def root(x):
            parent.setdefault(x, x)
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for name, others in found.items():
            for o in others:
                parent[root(o)] = root(name)
        groups = defaultdict(list)
        for x in list(parent):
            groups[root(x)].append(x)
        groups = [sorted(g) for g in groups.values() if len(g) > 1]

        member = {u for g in groups for u in g}
        taken = {ids[u] for u in units if u not in member and not u.endswith('_scav')}
        order = {p: i for i, p in enumerate(PREFIXES)}
        for g in sorted(groups):
            g.sort(key=lambda u: (order.get(u[:3], 9), u))
            gid, k = default_id(g[0]), 2
            while gid in taken:   # the id of a unit that is not in the group: another one
                gid, k = f'{default_id(g[0])}{k}', k + 1
            taken.add(gid)
            for u in g:
                ids[u] = gid
            same = [p for p in PREFIXES if sum(u.startswith(p) for u in g) > 1]
            if same:
                print(f'NOTE: two units of one faction in one group ({gid}): {", ".join(g)}')
        print(f'{len(groups)} groups from the website, {len(member)} units')

    for u in list(ids):   # a Scavenger copy: the id of its unit
        if u.endswith('_scav') and u[:-5] in ids:
            ids[u] = ids[u[:-5]]

    lines = ',\n'.join(f'\t{json.dumps(u)}: {json.dumps(ids[u])}' for u in sorted(ids))
    out.write_text('{\n"version": 1,\n"units": {\n' + lines + '\n}\n}\n', encoding='utf-8', newline='\n')   # LF like the exporter's file and .gitattributes
    print(f'{len(ids)} units written to {out}')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(1)
