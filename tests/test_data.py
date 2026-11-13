"""Tests of the website's data: the rules of exporter/unit_rules.py (docs/website.md) and the files in website/assets/ that the page reads.

    python -m unittest discover -s tests -v

Needs no game installation (the icons are not made here). The environment variable BARUNIT_ASSETS: another assets folder (a test of the exporter, or the chain of tests/make_chain_site.py).
Run by the workflow .github/workflows/tests.yml (before the site is published, and for every pull request); the chain tests are in test_chain.py, the helpers in test_tools.py.
"""
import gzip, json, os, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = Path(os.environ.get('BARUNIT_ASSETS') or ROOT / 'website' / 'assets')
sys.path.insert(0, str(ROOT / 'exporter'))
sys.path.insert(0, str(ROOT / 'shared'))
import unit_rules as ru  # noqa: E402   (category, dps, texts, reduce_unit, natural)
import reduce_units  # noqa: E402   (the chain: compare)
import bar_common  # noqa: E402

FIELDS = {'name', 'description', 'faction', 'category', 'tech', 'metal', 'energy', 'buildTime', 'buildPower', 'energyMake', 'hitpoints', 'radar', 'speed', 'weapons', 'dps', 'range'}
CATEGORIES = {'bots', 'vehicles', 'air', 'sea', 'hover', 'factories', 'defense', 'buildings'}


def weapon(**kw):
    return {'type': 'BeamLaser', 'reload': 1.0, 'damages': {'default': 100}, **kw}


class Rules(unittest.TestCase):
    def test_category(self):
        self.assertEqual(ru.category({'isFactory': True}, {'group': 'bot'}), 'factories')
        self.assertEqual(ru.category({}, {'group': 'buildings', 'filler': True}), 'defense')
        self.assertEqual(ru.category({}, {'group': 'turrets'}), 'defense')
        self.assertEqual(ru.category({}, {'group': 'ships'}), 'sea')
        self.assertEqual(ru.category({}, {'group': 'buildings'}), 'buildings')

    def test_dps(self):
        self.assertAlmostEqual(ru.dps([weapon(projectiles=2, salvoSize=3, reload=2.0)]), 300)
        self.assertAlmostEqual(ru.dps([weapon(damages={'default': 10, 'vtol': 50})]), 50)   # the larger of ground and air
        for left_out in ({'paralyzer': True}, {'stockpile': True}, {'manualFire': True}, {'interceptor': 1}, {'isShield': True}, {'customParams': {'bogus': 1}}):
            self.assertEqual(ru.dps([weapon(**left_out)]), 0, left_out)
        self.assertEqual(ru.dps([weapon(reload=0)]), 0)

    def test_texts(self):
        self.assertEqual(ru.texts('armx', {'humanName': 'Pawn', 'description': 'Fast bot'}), ('Pawn', 'Fast bot'))
        self.assertEqual(ru.texts('armprowl', {'humanName': 'units.names.armprowl', 'description': 'Prowler'}), ('Prowler', ''))
        self.assertEqual(ru.texts('armx', {'humanName': 'units.names.armx', 'description': 'units.descriptions.armx'}), ('armx', ''))
        self.assertEqual(ru.texts('armx', {'humanName': 'Pawn', 'description': 'units.descriptions.armx'}), ('Pawn', ''))

    def test_reduce_unit(self):
        unit = {'game': {'metalCost': 50, 'energyCost': 900, 'buildTime': 1500, 'health': 370, 'speed': 81.3, 'energyMake': 5, 'energyUpkeep': 1, 'windGenerator': 2, 'maxWeaponRange': 180},
                'editor': {'faction': 'arm', 'group': 'bot', 'tech': 1, 'humanName': 'Pawn', 'description': 'Fast bot', 'weapons': [weapon(), weapon(customParams={'bogus': 1}, type='Cannon')]}}
        r = ru.reduce_unit('armpw', unit)
        self.assertEqual(set(r), FIELDS)
        self.assertEqual((r['category'], r['buildTime'], r['energyMake'], r['weapons'], r['dps']), ('bots', 15, 6, ['BeamLaser'], 100))

    def test_compare_with_version_before(self):
        base = {'a': {'metal': 1, 'icon': 'x.png'}, 'b': {'metal': 1}, 'lootboxnano_t1': {'metal': 1}, 'gone': {'metal': 1}}
        units = {'a': {'metal': 2, 'icon': 'y.png'}, 'b': {'metal': 1}, 'lootboxnano_t1': {'metal': 1}, 'new': {'metal': 1}}
        changed, pictures = reduce_units.compare(units, {'b': '2', 'lootboxnano_t1': '2'}, base, {'b': '1', 'lootboxnano_t1': '1'})
        self.assertEqual((changed, pictures), ({'a', 'b', 'new'}, {'b', 'new'}))   # the loot boxes get a model by chance: no change
        self.assertEqual(reduce_units.compare({'b': {'metal': 1}}, {}, {'b': {'metal': 1}}, {'b': '1'}), (set(), set()))   # without fingerprints only the values count

    def test_shared_rules(self):
        self.assertEqual([bar_common.faction_of(u) for u in ('armpw', 'corak_scav', 'raptor_land_x', 'legcom')], ['arm', 'scv', 'rap', 'leg'])
        self.assertEqual(bar_common.version_name('Beyond All Reason test-1 a/b'), 'test-1_a_b')


class Assets(unittest.TestCase):
    """The files the page reads (website/assets/): versions.json, the reduced file of the base version, the diff files of the later ones (each against the version
    before it), counterparts.json, counters.json."""
    @classmethod
    def setUpClass(cls):
        listing = json.loads((ASSETS / 'versions.json').read_text(encoding='utf-8'))
        cls.versions, cls.checked = listing['versions'], listing.get('checkedUpTo', '')
        cls.data = {}
        for v in cls.versions:
            with gzip.open(ASSETS / v['dir'] / 'data' / v['file'], 'rt', encoding='utf-8') as f:
                cls.data[v['dir']] = json.load(f)
        cls.base = next(v['dir'] for v in cls.versions if v.get('base'))

    def test_history_is_all_diff_files(self):
        listing = json.loads((ASSETS / 'versions.json').read_text(encoding='utf-8'))
        later = [v for v in self.versions if not v.get('base')]
        if not listing.get('history'):
            return   # the older way (tests/make_chain_site.py): one diff file per version
        with gzip.open(ASSETS / listing['history'], 'rt', encoding='utf-8') as f:
            history = json.load(f)['diffs']
        self.assertEqual(list(history), [v['dir'] for v in later], 'the diff files of all versions after the base, in order')
        for v in later:
            self.assertEqual(history[v['dir']], self.data[v['dir']], f'{v["dir"]}: history.json.gz differs from its diff file: run exporter/reduce_units.py')

    def test_versions(self):
        self.assertTrue(self.versions, 'versions.json lists no version')
        self.assertTrue(self.versions[0].get('base') and sum(1 for v in self.versions if v.get('base')) == 1, 'exactly one base version, the first one')
        names = [v['version'] for v in self.versions]
        self.assertEqual(names, sorted(names, key=ru.natural), 'oldest first')
        self.assertNotIn('unchanged', json.loads((ASSETS / 'versions.json').read_text(encoding='utf-8')), 'replaced by checkedUpTo')
        self.assertTrue(self.checked and ru.natural(self.checked) >= ru.natural(names[-1]), 'checkedUpTo is the newest version looked at: the newest listed one or a later one')
        for before, v in zip([None, *self.versions], self.versions):
            d = self.data[v['dir']]
            self.assertEqual(d['gameVersion'], v['version'])
            self.assertRegex(v.get('date', ''), r'^(\d{4}-\d\d-\d\d)?$')
            if v.get('base'):
                self.assertTrue(v['file'].endswith('.reduced.json.gz'))
            else:   # against the version before it
                self.assertTrue(v['file'].endswith('.diff.json.gz'))
                self.assertEqual((d['before'], v['changed']), (before['version'], len(d['units'])), v['dir'])
                self.assertTrue(d['units'] or d['removed'], f'{v["dir"]}: an empty diff file')

    def test_reduced_units(self):
        """The chain: every diff file against the units of the version before (the base with the diff files before it applied)."""
        state, icons = {}, {}   # the units of the version before; {icon file: folder}
        plain = lambda x: {k: v for k, v in x.items() if k not in ('icon', 'ownIcon', 'ownPicture')}
        for v in self.versions:
            folder, data = v['dir'], self.data[v['dir']]
            units, is_base = data['units'], folder == self.base
            if is_base:
                self.assertEqual(len(units), data['count'], folder)
            else:   # the units of a diff file: changed or new; the ones that are gone are only names
                self.assertLessEqual(len(units), data['count'], folder)
                self.assertFalse(set(data['removed']) & set(units), folder)
                self.assertTrue(set(data['removed']) <= set(state), folder)
            for name, u in units.items():
                self.assertEqual(set(u) - {'icon', 'ownPicture', 'ownIcon'}, FIELDS, name)
                self.assertIn(u['faction'], {'arm', 'cor', 'leg', 'scv', 'rap'}, name)
                self.assertIn(u['category'], CATEGORIES, name)
                self.assertIn(u['tech'], (1, 2, 3), name)
                self.assertTrue(u['name'], name)
                if not is_base and name in state and not u.get('ownPicture') and not u.get('ownIcon') and u.get('icon') == state[name].get('icon'):
                    self.assertNotEqual(plain(u), plain(state[name]), f'{folder}: {name} is the same as in the version before')
                if 'icon' in u:
                    at = folder if is_base or u.get('ownIcon') else icons.get(u['icon'], self.base)
                    self.assertTrue((ASSETS / at / 'images' / 'icons' / u['icon']).exists(), f'{folder}: {name}: icon {u["icon"]}')
            if is_base:
                icons = {u['icon']: folder for u in units.values() if 'icon' in u}
            else:
                icons.update({u['icon']: folder for u in units.values() if u.get('ownIcon')})
            state.update(units)
            for name in data.get('removed', []):
                del state[name]
        self.assertEqual(set(state), bar_common.newest_units(ASSETS), 'newest_units: the same chain')

    def test_pictures(self):
        """Every unit of the base has a picture in one of the formats the page tries, every unit of a diff file with ownPicture one in its version's folder;
        the names are lower case (GitHub Pages is case sensitive)."""
        for folder, data in self.data.items():
            images = ASSETS / folder / 'images'
            files = {p.name for p in images.iterdir() if p.is_file()} if images.exists() else set()
            self.assertEqual([f for f in files if f != f.lower()], [], 'upper case in picture names')
            wanted = data['units'] if folder == self.base else [n for n, u in data['units'].items() if u.get('ownPicture')]
            missing = [n for n in wanted if not any(f'{n}.{ext}' in files for ext in ('avif', 'webp', 'png', 'jpg'))]
            self.assertEqual(missing, [], f'{folder}: units without a picture')

    def test_counterparts_and_counters(self):
        newest = bar_common.newest_units(ASSETS)
        counterparts = json.loads((ASSETS / 'counterparts.json').read_text(encoding='utf-8'))['units']
        self.assertTrue(all(isinstance(i, str) and i for i in counterparts.values()))
        self.assertTrue(newest <= set(counterparts), f'units without counterpart id: {sorted(newest - set(counterparts))[:20]}')
        counters = json.loads((ASSETS / 'counters.json').read_text(encoding='utf-8'))['counters']
        unknown = {u for t, by in counters.items() for u in [t, *by]} - newest
        self.assertEqual(unknown, set(), 'counters.json names units the newest version does not know')


if __name__ == '__main__':
    unittest.main()
