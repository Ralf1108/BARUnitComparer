"""Tests of the chain of game versions in exporter/reduce_units.py (docs/versions.md): the base version, the diff file of every later version against the one before,
the versions in which nothing changed, picture changes, units that are gone, --redo, versions.json. They run on small made-up exports in a temporary folder and need
neither the game nor a network: the game's pool (icons, picture fingerprints) is replaced by a table of fingerprints, the date of a version by a fixed text.

    python -m unittest discover -s tests -v
"""
import contextlib, io, json, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'exporter'))
sys.path.insert(0, str(ROOT / 'shared'))
import reduce_units as ru  # noqa: E402

V1, V2, V3, V4 = 'test-100-aaaaaaa', 'test-110-bbbbbbb', 'test-120-ccccccc', 'test-130-ddddddd'


def unit(name, metal):
    return {'game': {'metalCost': metal, 'energyCost': 1, 'buildTime': 100, 'health': 10}, 'editor': {'faction': 'arm', 'group': 'bot', 'tech': 1, 'humanName': name, 'description': 'd', 'weapons': []}}


# the made-up game versions: {unit: metal} and {unit: fingerprint of its picture}
VERSIONS = {
    V1: ({'a': 10, 'b': 20, 'c': 30}, {'a': 'p1', 'b': 'p2', 'c': 'p3'}),
    V2: ({'a': 11, 'b': 20, 'd': 5}, {'a': 'p1', 'b': 'p22', 'd': 'p4'}),    # a: value, b: picture, c: gone, d: new
    V3: ({'a': 11, 'b': 20, 'd': 5}, {'a': 'p1', 'b': 'p22', 'd': 'p4'}),    # nothing changed
    V4: ({'a': 12, 'b': 20, 'd': 5}, {'a': 'p1', 'b': 'p22', 'd': 'p4'}),    # a: value
}


def write_export(out, version, metals):
    folder = out / version / 'data'
    folder.mkdir(parents=True)
    full = {'format': 1, 'gameName': 'Beyond All Reason', 'gameVersion': version, 'count': len(metals), 'units': {n: unit(n, m) for n, m in metals.items()}}
    (folder / f'units-{version}.json').write_text(json.dumps(full), encoding='utf-8')


def fake_load_export(f, data_dir):
    """Instead of the game's pool: the units reduced, the fingerprints from the table above, no icons."""
    full = json.loads(Path(f).read_text(encoding='utf-8'))
    units = {name: ru.reduce_unit(name, u) for name, u in full['units'].items()}
    return full, units, {}, dict(VERSIONS[full['gameVersion']][1]), None


class Patched(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name)
        self.saved = ru.load_export, ru.commit_date
        ru.load_export = fake_load_export
        ru.commit_date = lambda version: '2026-01-02'
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(lambda: setattr(ru, 'load_export', self.saved[0]))
        self.addCleanup(lambda: setattr(ru, 'commit_date', self.saved[1]))

    def run_main(self, *args):
        argv, sys.argv = sys.argv, ['reduce_units.py', '--out', str(self.out), *args]
        try:
            with contextlib.redirect_stdout(io.StringIO()) as text:
                ru.main()
        finally:
            sys.argv = argv
        return text.getvalue()

    def read(self, version, kind):
        return ru.read_gz(next((self.out / version / 'data').glob(f'units-*.{kind}.json.gz')))


class Chain(Patched):
    def make_all(self):
        for v, (metals, _) in VERSIONS.items():
            write_export(self.out, v, metals)
        return self.run_main()

    def test_base_diffs_and_checked_up_to(self):
        self.make_all()
        listing = json.loads((self.out / 'versions.json').read_text(encoding='utf-8'))
        self.assertEqual([(v['version'], v.get('base'), v.get('changed'), v.get('removed')) for v in listing['versions']],
                         [(V1, True, None, None), (V2, None, 3, 1), (V4, None, 1, None)])
        self.assertEqual(listing['checkedUpTo'], V4)
        history = ru.read_gz(self.out / listing['history'])['diffs']   # all diff files in one
        self.assertEqual(list(history), [V2, V4])
        self.assertEqual(history[V2], self.read(V2, 'diff'))
        self.assertNotIn('unchanged', listing)
        self.assertTrue(all(v['date'] == '2026-01-02' for v in listing['versions']))
        self.assertEqual(sorted(self.read(V1, 'reduced')['units']), ['a', 'b', 'c'])
        d2 = self.read(V2, 'diff')
        self.assertEqual((d2['before'], d2['removed'], sorted(d2['units'])), (V1, ['c'], ['a', 'b', 'd']))
        self.assertEqual({n for n, u in d2['units'].items() if u.get('ownPicture')}, {'b', 'd'})   # the value change of `a` has no new picture
        self.assertEqual(d2['units']['a']['metal'], 11)
        self.assertEqual(json.loads((self.out / V2 / 'data' / 'pictures.json').read_text(encoding='utf-8')), {'b': 'p22', 'd': 'p4'})
        self.assertEqual(self.read(V4, 'diff')['before'], V2)   # the version before is the last one WITH a diff file
        self.assertFalse(list((self.out / V3 / 'data').glob('*.gz')), 'a version without a change has no file')
        self.assertFalse((self.out / V3 / 'data' / 'pictures.json').exists())

    def test_chain_gives_the_units_of_the_last_version(self):
        self.make_all()
        base = ru.find_base(self.out)
        chain = ru.Chain(base)
        for v in (V2, V4):
            folder = self.out / v
            chain.apply(folder, ru.read_gz(ru.diff_file(folder)))
        self.assertEqual(chain.version, V4)
        self.assertEqual({n: u['metal'] for n, u in chain.units.items()}, {'a': 12, 'b': 20, 'd': 5})
        self.assertEqual(chain.prints, {'a': 'p1', 'b': 'p22', 'd': 'p4'})   # c is gone with its fingerprint

    def test_picture_units(self):
        self.make_all()
        self.assertEqual(ru.picture_units(self.out / V1), ['a', 'b', 'c'])   # the base: every unit
        self.assertEqual(ru.picture_units(self.out / V2), ['b', 'd'])
        self.assertEqual(ru.picture_units(self.out / V4), [])               # a value only
        self.assertEqual(ru.picture_units(self.out / V3), [])               # no files
        self.assertEqual(ru.picture_units(self.out / 'no-such-version'), [])

    def test_second_run_changes_nothing(self):
        self.make_all()
        before = {p: p.read_bytes() for p in self.out.rglob('*') if p.is_file()}
        text = self.run_main()
        self.assertIn('done already', text)
        self.assertEqual(before, {p: p.read_bytes() for p in self.out.rglob('*') if p.is_file()})

    def test_redo_makes_only_that_version(self):
        self.make_all()
        v4_before = (ru.diff_file(self.out / V4)).read_bytes()
        VERSIONS[V2] = ({'a': 15, 'b': 20, 'd': 5}, VERSIONS[V2][1])
        try:
            write_export_again = json.loads((self.out / V2 / 'data' / f'units-{V2}.json').read_text(encoding='utf-8'))
            write_export_again['units']['a'] = unit('a', 15)
            (self.out / V2 / 'data' / f'units-{V2}.json').write_text(json.dumps(write_export_again), encoding='utf-8')
            self.run_main('--redo', V2)
            self.assertEqual(self.read(V2, 'diff')['units']['a']['metal'], 15)
            self.assertEqual(ru.diff_file(self.out / V4).read_bytes(), v4_before, '--redo makes only that version')
        finally:
            VERSIONS[V2] = ({'a': 11, 'b': 20, 'd': 5}, {'a': 'p1', 'b': 'p22', 'd': 'p4'})

    def test_a_diff_of_another_version_is_an_error(self):
        self.make_all()
        chain = ru.Chain(ru.find_base(self.out))   # still at the base: V4's diff was made against V2
        with self.assertRaises(SystemExit) as e:
            ru.check_before(chain, self.out / V4, ru.diff_file(self.out / V4))
        self.assertIn(V2, str(e.exception))
        ru.check_before(chain, self.out / V2, ru.diff_file(self.out / V2))   # against the base: fine

    def test_pictures_are_not_lost_without_fingerprints(self):
        write_export(self.out, V1, VERSIONS[V1][0])
        write_export(self.out, V2, VERSIONS[V2][0])
        self.run_main()
        self.assertTrue((self.out / V2 / 'data' / 'pictures.json').exists())
        ru.load_export = lambda f, d: (lambda full, units, icons, prints, pool: (full, units, icons, {}, pool))(*fake_load_export(f, d))   # the game is gone
        with self.assertRaises(SystemExit):
            self.run_main('--redo', V2)
        self.assertTrue((self.out / V2 / 'data' / 'pictures.json').exists())

    def test_versions_older_than_the_base_are_left_out(self):
        write_export(self.out, V2, VERSIONS[V2][0])
        write_export(self.out, V1, VERSIONS[V1][0])
        self.run_main()   # the first export made is not the oldest: the oldest (V1) becomes the base, nothing is older
        listing = json.loads((self.out / 'versions.json').read_text(encoding='utf-8'))
        self.assertEqual([v['version'] for v in listing['versions']], [V1, V2])
        self.assertTrue(listing['versions'][0]['base'])

    def test_a_unit_that_gets_a_picture(self):
        changed, pictures = ru.compare({'a': {'metal': 1}}, {'a': 'x'}, {'a': {'metal': 1}}, {'z': 'y'})
        self.assertEqual((changed, pictures), ({'a'}, {'a'}))
        self.assertEqual(ru.compare({'a': {'metal': 1}}, {'a': 'x'}, {'a': {'metal': 1}}, {}), (set(), set()))   # the version before has no fingerprints at all

    def test_change_of_the_engine(self):
        """The version before, exported again with the new engine (control), is what the diff is made against: a value that differs only because of the engine is
        not a change of the game; it is named in engineOnly. The engines are named in versions.json."""
        write_export(self.out, V1, {'a': 10, 'b': 20, 'c': 30})
        self.run_main('--engine', '1.0')
        write_export(self.out, V2, {'a': 15, 'b': 20, 'c': 30, 'd': 5})   # a: only the engine (the control has it too); b: a picture; d: new
        write_export(Path(self.tmp.name) / 'control', V1, {'a': 15, 'b': 20, 'c': 30})
        control = Path(self.tmp.name) / 'control' / V1 / 'data' / f'units-{V1}.json'
        self.run_main('--redo', V2, '--engine', '2.0', '--control', str(control))
        d2 = self.read(V2, 'diff')
        self.assertEqual(sorted(d2['units']), ['b', 'd'])
        self.assertEqual((d2['engine'], d2['engineOnly']), ('2.0', {'a': {'metal': [10, 15]}}))
        listing = json.loads((self.out / 'versions.json').read_text(encoding='utf-8'))
        self.assertEqual([(v['version'], v.get('engine')) for v in listing['versions']], [(V1, '1.0'), (V2, '2.0')])
        self.assertEqual(listing['versions'][1]['engineOnly'], {'a': {'metal': [10, 15]}})


if __name__ == '__main__':
    unittest.main()
