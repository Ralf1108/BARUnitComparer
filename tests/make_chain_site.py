"""make_chain_site.py: a copy of website/ whose assets hold a CHAIN of game versions, so that the version code of the page and of the data tests can be tried
(the real website/assets/ has only the base version for now, and then those parts are skipped).

    python tests/make_chain_site.py <destination folder>
    BARUNIT_ASSETS=<destination>/assets python -m unittest discover -s tests
    BARUNIT_SITE=<destination> node tests/website_smoke.mjs

The destination gets everything of website/ and, next to the real base version, two made-up later versions and one that is only looked at (checkedUpTo):
  test-31821-1111111: armllt has a higher metal cost (its picture is the same)
  test-31822-2222222: corllt has a higher metal cost and a picture of its own (a copy of the old one), and one Scavenger unit is gone
  test-31823-3333333: unchanged (no files; checkedUpTo names it)
Run with the Python of the tools; needs nothing else. Existing destination: an error (nothing is deleted).
"""
import json, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'exporter'))
import reduce_units as ru  # noqa: E402


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    dest = Path(sys.argv[1])
    if dest.exists():
        sys.exit(f'ERROR: {dest} exists already.')
    shutil.copytree(ROOT / 'website', dest)
    assets = dest / 'assets'
    listing = json.loads((assets / 'versions.json').read_text(encoding='utf-8'))
    base = listing['versions'][0]
    base_units = ru.read_gz(assets / base['dir'] / 'data' / base['file'])['units']
    counters = json.loads((assets / 'counters.json').read_text(encoding='utf-8'))['counters']
    named = {u for t, by in counters.items() for u in [t, *by]}
    gone = next(n for n in sorted(base_units) if n.endswith('_scav') and n not in named)
    count = len(base_units)

    def make(version, date, before, units, removed, own_picture=()):
        folder = assets / version
        (folder / 'data').mkdir(parents=True)
        diff = {n: {**u, **({'ownPicture': True} if n in own_picture else {})} for n, u in units.items()}
        header = {'gameName': 'Beyond All Reason', 'gameVersion': version, 'before': before, 'count': count - len(removed), 'removed': removed}
        (folder / 'data' / f'units-{version}.diff.json.gz').write_bytes(ru.compress(ru.text_of(header, diff)))
        for n in own_picture:   # a picture of its own: here a copy of the old one
            (folder / 'images').mkdir(exist_ok=True)
            shutil.copy2(assets / base['dir'] / 'images' / f'{n}.avif', folder / 'images' / f'{n}.avif')
        return {'version': version, 'dir': version, 'file': f'units-{version}.diff.json.gz', 'date': date, 'changed': len(units), **({'removed': len(removed)} if removed else {})}

    v2, v3 = 'test-31821-1111111', 'test-31822-2222222'
    listing['versions'] += [
        make(v2, '2026-11-06', base['version'], {'armllt': {**base_units['armllt'], 'metal': base_units['armllt']['metal'] + 10}}, []),
        make(v3, '2026-11-07', v2, {'corllt': {**base_units['corllt'], 'metal': base_units['corllt']['metal'] + 10}}, [gone], own_picture=('corllt',)),
    ]
    listing['checkedUpTo'] = 'test-31823-3333333'
    (assets / 'versions.json').write_text(json.dumps(listing, indent=1) + '\n', encoding='utf-8', newline='\n')
    print(f'{dest}: base {base["version"]}, then {v2}, {v3} ({gone} gone), test-31823-3333333 unchanged (checkedUpTo)')


if __name__ == '__main__':
    main()
