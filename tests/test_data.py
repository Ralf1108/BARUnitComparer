"""Tests of the website's data: the rules of exporter/reduce_units.py (SPECIFICATION_WEBSITE.md, section 1) and the files in website/assets/ that the page reads.

    python -m unittest discover -s tests -v

Needs no game installation (the icons are not made here). Run by the workflow .github/workflows/pages.yml before the site is published.
"""
import gzip, json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'website' / 'assets'
sys.path.insert(0, str(ROOT / 'exporter'))
sys.path.insert(0, str(ROOT / 'shared'))
import reduce_units as ru  # noqa: E402
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

    def test_shared_rules(self):
        self.assertEqual([bar_common.faction_of(u) for u in ('armpw', 'corak_scav', 'raptor_land_x', 'legcom')], ['arm', 'scv', 'rap', 'leg'])
        self.assertEqual(bar_common.version_name('Beyond All Reason test-1 a/b'), 'test-1_a_b')


class Assets(unittest.TestCase):
    """The files the page reads (website/assets/): versions.json, the reduced files, counterparts.json, counters.json."""
    @classmethod
    def setUpClass(cls):
        cls.versions = json.loads((ASSETS / 'versions.json').read_text(encoding='utf-8'))['versions']
        cls.data = {}
        for v in cls.versions:
            with gzip.open(ASSETS / v['dir'] / 'data' / v['file'], 'rt', encoding='utf-8') as f:
                cls.data[v['dir']] = json.load(f)

    def test_versions(self):
        self.assertTrue(self.versions, 'versions.json lists no version')
        for v in self.versions:
            self.assertEqual(self.data[v['dir']]['gameVersion'], v['version'])

    def test_reduced_units(self):
        for folder, data in self.data.items():
            units = data['units']
            self.assertEqual(len(units), data['count'], folder)
            for name, u in units.items():
                self.assertEqual(set(u) - {'icon'}, FIELDS, name)
                self.assertIn(u['faction'], {'arm', 'cor', 'leg', 'scv', 'rap'}, name)
                self.assertIn(u['category'], CATEGORIES, name)
                self.assertIn(u['tech'], (1, 2, 3), name)
                self.assertTrue(u['name'], name)
                if 'icon' in u:
                    self.assertTrue((ASSETS / folder / 'images' / 'icons' / u['icon']).exists(), f'{name}: icon {u["icon"]}')

    def test_pictures(self):
        """Every unit has a picture in one of the formats the page tries, and the names are lower case (GitHub Pages is case sensitive)."""
        for folder, data in self.data.items():
            images = ASSETS / folder / 'images'
            files = {p.name for p in images.iterdir() if p.is_file()}
            self.assertEqual([f for f in files if f != f.lower()], [], 'upper case in picture names')
            missing = [n for n in data['units'] if not any(f'{n}.{ext}' in files for ext in ('avif', 'webp', 'png', 'jpg'))]
            self.assertLessEqual(len(missing), 5, f'{folder}: units without a picture: {missing[:20]}')

    def test_counterparts_and_counters(self):
        newest = set(self.data[self.versions[-1]['dir']]['units'])
        counterparts = json.loads((ASSETS / 'counterparts.json').read_text(encoding='utf-8'))['units']
        self.assertTrue(all(isinstance(i, str) and i for i in counterparts.values()))
        self.assertTrue(newest <= set(counterparts), f'units without counterpart id: {sorted(newest - set(counterparts))[:20]}')
        counters = json.loads((ASSETS / 'counters.json').read_text(encoding='utf-8'))['counters']
        unknown = {u for t, by in counters.items() for u in [t, *by]} - newest
        self.assertEqual(unknown, set(), 'counters.json names units the newest version does not know')


if __name__ == '__main__':
    unittest.main()
