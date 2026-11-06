"""export_counters.py: fetches the counter charts of Armada and Cortex from beyondallreason.info and writes counters.json.

    python exporter/export_counters.py [--out website/assets/counters.json]

On a chart page every row has two sides: "Destroy this" (units of the other faction) and "With This" (the units that counter them).
The result maps a unit to the units that counter it:

    { "version": 1, "sources": [...], "counters": { "corak": ["armwar", "armllt", ...], ... } }

The names are the unit codenames (the pages link to /unit/<codename>). Codenames that the unit data of the newest game version does not know are reported.
"""
import argparse, gzip, json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ['https://www.beyondallreason.info/armada-unit-chart-2', 'https://www.beyondallreason.info/cortex-unit-chart']
ROW = 'class="flex-split botline"'
SIDE = 'class="flex-split-child'
ROW_END = 'role="listitem" class="w-dyn-item"'   # the next row (the counters inside a row are "unitagainst w-dyn-item")
UNIT = re.compile(r'href="/unit/([^"/?#]+)"')   # empty slots link to "#"


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'BARUnitComparer export_counters'})
    with urllib.request.urlopen(request, timeout=60) as r:
        return r.read().decode('utf-8')


def rows(html):
    """[(targets, counters)] of one chart page."""
    result = []
    for row in html.split(ROW)[1:]:
        row = row.split(ROW_END)[0]
        left, sep, right = row.partition(SIDE)
        if not sep:
            raise ValueError('a row without the "With This" side: the page has changed')
        targets, counters = UNIT.findall(left), UNIT.findall(right)
        if not targets or not counters:
            raise ValueError('a row without units: the page has changed')
        result.append((targets, counters))
    if not result:
        raise ValueError('no rows found: the page has changed')
    return result


def known_units(assets):
    versions = json.loads((assets / 'versions.json').read_text(encoding='utf-8'))['versions']
    v = versions[-1]
    with gzip.open(assets / v['dir'] / 'data' / v['file'], 'rt', encoding='utf-8') as f:
        return set(json.load(f)['units'])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=str(ROOT / 'website' / 'assets' / 'counters.json'))
    args = ap.parse_args()

    counters = {}
    for url in PAGES:
        found = rows(fetch(url))
        print(f'{url}: {len(found)} rows')
        for targets, by in found:
            for target in targets:
                mine = counters.setdefault(target, [])
                mine.extend(c for c in by if c not in mine)

    try:
        known = known_units(Path(args.out).parent)
        unknown = sorted({u for t, by in counters.items() for u in [t, *by] if u not in known})
        if unknown:
            print('WARNING: not in the unit data of the newest game version: ' + ', '.join(unknown), file=sys.stderr)
    except (OSError, KeyError, ValueError) as e:
        print(f'(the codenames were not checked against the unit data: {e})')

    out = {'version': 1, 'sources': PAGES, 'counters': dict(sorted(counters.items()))}
    Path(args.out).write_text(json.dumps(out, indent=1) + '\n', encoding='utf-8', newline='\n')
    print(f'{len(counters)} units with counters written to {args.out}')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(1)
