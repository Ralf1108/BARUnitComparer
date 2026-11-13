"""Tests of the helpers of the tools that need neither the game nor a network: the game's pool and package lists (shared/bar_common.py), the script parser and the icon table
(render_unit), the version list of the package server (exporter/update_versions.py), the pages of beyondallreason.info (export_counters.py, export_counterparts.py).

    python -m unittest discover -s tests -v
"""
import gzip, hashlib, os, struct, sys, tempfile, textwrap, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for folder in ('shared', 'exporter', 'render_unit'):
    sys.path.insert(0, str(ROOT / folder))
import bar_common  # noqa: E402
import export_counterparts, export_counters, update_versions  # noqa: E402
import reduce_units  # noqa: E402

try:
    import render_unit
except ImportError:   # numpy or Pillow is not installed (requirements.txt): the tests of render_unit are skipped
    render_unit = None


class FakePool:
    """What the script parser and the icon table need of a pool: has(name) and read(name)."""
    def __init__(self, files):
        self.files = {k: v.encode() if isinstance(v, str) else v for k, v in files.items()}
        self.entries = {k: hashlib.md5(v).hexdigest() for k, v in self.files.items()}

    def has(self, name):
        return name in self.files

    def read(self, name):
        return self.files[name]


def make_data_dir(root, files, games=()):
    """A data folder with packages/ and pool/: `files` {name: bytes} are one package (the biggest .sdp), `games` [(name, md5 of the package)] are listed in a rapid list."""
    data = Path(root)
    (data / 'pool').mkdir()
    (data / 'packages').mkdir()
    entries = b''
    for name, content in files.items():
        md5 = hashlib.md5(content).digest()
        raw = name.encode('latin-1')
        entries += bytes([len(raw)]) + raw + md5 + b'\0\0\0\0' + struct.pack('<I', len(content))
        (data / 'pool' / md5.hex()[:2]).mkdir(exist_ok=True)
        (data / 'pool' / md5.hex()[:2] / (md5.hex()[2:] + '.gz')).write_bytes(gzip.compress(content))
    (data / 'packages' / ('a' * 32 + '.sdp')).write_bytes(gzip.compress(entries))
    (data / 'rapid' / 'server' / 'byar').mkdir(parents=True)
    lines = ''.join(f'byar:git:{n},{md5},,{n}\n' for n, md5 in games)
    (data / 'rapid' / 'server' / 'byar' / 'versions.gz').write_bytes(gzip.compress(lines.encode()))
    return data


class Game(unittest.TestCase):
    def test_pool_reads_a_package(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = make_data_dir(tmp, {'objects3d/units/armpw.s3o': b'model', 'scripts/units/armpw.bos': b'script'})
            pool = bar_common.Pool(data, data / 'packages' / ('a' * 32 + '.sdp'))
            self.assertTrue(pool.has('objects3d/units/armpw.s3o') and not pool.has('x'))
            self.assertEqual(pool.read('scripts/units/armpw.bos'), b'script')
            self.assertEqual(pool.find_model('armpw'), 'objects3d/units/armpw.s3o')
            self.assertEqual(pool.find_model('armpw_scav'), 'objects3d/units/armpw.s3o')   # a Scavenger copy uses the model of its unit
            self.assertIsNone(pool.find_model('nothing'))

    def test_rapid_package_needs_the_package_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            md5 = 'b' * 32
            data = make_data_dir(tmp, {}, games=[('Beyond All Reason test-5-abc1234', md5)])
            self.assertIsNone(bar_common.rapid_package(data, 'Beyond All Reason test-5-abc1234'), 'listed, but the .sdp is not downloaded')
            (data / 'packages' / f'{md5}.sdp').write_bytes(b'')
            self.assertEqual(bar_common.rapid_package(data, 'Beyond All Reason test-5-abc1234'), data / 'packages' / f'{md5}.sdp')
            self.assertIsNone(bar_common.rapid_package(data, 'Beyond All Reason test-6-abc1234'))

    def test_find_game_from_the_archive_cache(self):
        def entry(sdp, name, modified):
            return f'\t\t{{\n\t\t\tname = "{sdp}",\n\t\t\tmodified = "{modified}",\n\t\t\tarchivedata = {{\n\t\t\t\tname = "{name}",\n\t\t\t}},\n\t\t}},\n'
        with tempfile.TemporaryDirectory() as tmp:
            data = make_data_dir(tmp, {})
            (data / 'cache').mkdir()
            (data / 'cache' / 'ArchiveCache1.lua').write_text('return {\n\tarchives = {\n' + entry('old.sdp', 'Beyond All Reason test-1-aaaaaaa', 10)
                                                                + entry('new.sdp', 'Beyond All Reason test-2-bbbbbbb', 20) + '\t},\n}\n', encoding='utf-8')
            self.assertEqual(bar_common.find_game(data), (data / 'packages' / 'new.sdp', 'Beyond All Reason test-2-bbbbbbb'))   # the newest
            self.assertEqual(bar_common.find_game(data, 'Beyond All Reason test-1-aaaaaaa')[1], 'Beyond All Reason test-1-aaaaaaa')
            with self.assertRaises(SystemExit):
                bar_common.find_game(data, 'Beyond All Reason test-3-ccccccc')

    def test_data_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit):
                bar_common.find_data_dir(tmp)   # a given folder without packages and pool
            data = make_data_dir(Path(tmp) / 'x' if Path(tmp, 'x').mkdir() is None else tmp, {})
            self.assertEqual(bar_common.find_data_dir(str(data)), data)
            old = os.environ.get('BAR_DATA')
            os.environ['BAR_DATA'] = str(data)
            try:
                self.assertEqual(bar_common.find_data_dir(), data)
            finally:
                if old is None:
                    del os.environ['BAR_DATA']
                else:
                    os.environ['BAR_DATA'] = old

    def test_rapid_lines(self):
        raw = gzip.compress(b'byar:test,aa,,Beyond All Reason test-1-abc1234\nshort\n\nbyar:git:x,bb,dep,Beyond All Reason test-2-def5678\n')
        self.assertEqual(bar_common.rapid_lines(raw), [['byar:test', 'aa', '', 'Beyond All Reason test-1-abc1234'], ['byar:git:x', 'bb', 'dep', 'Beyond All Reason test-2-def5678']])


class Versions(unittest.TestCase):
    def test_server_versions(self):
        fields = [['byar:test', 'a', '', 'Beyond All Reason test-9-aaaaaaa'],        # a tag, not a commit
                  ['byar:git:2', 'b', '', 'Beyond All Reason test-20-bbbbbbb'],
                  ['byar:git:1', 'c', '', 'Beyond All Reason test-3-ccccccc'],
                  ['byar:git:3', 'd', '', 'Beyond All Reason 0.01']]                 # not a test build
        self.assertEqual(update_versions.parse_versions(fields), [(3, 'test-3-ccccccc', 'Beyond All Reason test-3-ccccccc'), (20, 'test-20-bbbbbbb', 'Beyond All Reason test-20-bbbbbbb')])

    def test_newest_done(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            self.assertEqual(update_versions.newest_done(out), 0)
            (out / 'versions.json').write_text('{"versions": [{"version": "test-31-abc1234"}], "unchanged": ["test-35-def5678", "test-33-1234567"]}', encoding='utf-8')
            self.assertEqual(update_versions.newest_done(out), 35)   # an unchanged version counts as done

    def test_natural_order(self):
        names = ['test-1000-a', 'test-99-b', 'test-100-c']
        self.assertEqual(sorted(names, key=reduce_units.natural), ['test-99-b', 'test-100-c', 'test-1000-a'])


@unittest.skipUnless(render_unit, 'numpy or Pillow is not installed')
class Scripts(unittest.TestCase):
    def hidden(self, name, text):
        """The pieces hidden by the script `name` (a game script is looked for as .cob and read as its .bos source; a Lua script as it is)."""
        pool = FakePool({f'scripts/units/{name}': textwrap.dedent(text)})
        return render_unit.hidden_pieces(pool, f'scripts/units/{name[:-4] + ".cob" if name.endswith(".bos") else name}')[0]

    def test_bos_script(self):
        text = '''
        // hide commented;
        Create()
        {
            hide flare;
            hide nano;
            show nano;     /* a show takes it back */
            /* hide inside; */
            start-script Go();
        }
        Go() { hide later; }
        '''
        self.assertEqual(self.hidden('armpw.bos', text), {'flare'})

    def test_lua_script(self):
        text = '''
        local base, flare = piece("base", "flare")
        function script.Create()
            Hide(flare)
            Hide(piece("nano"))
            Hide(base) Show(base)
        end
        function script.Other() Hide(base) end
        '''
        self.assertEqual(self.hidden('armcom.lua', text), {'flare', 'nano'})

    def test_no_script(self):
        self.assertEqual(render_unit.hidden_pieces(FakePool({}), 'scripts/units/x.cob'), (set(), None))
        self.assertEqual(render_unit.hidden_pieces(FakePool({}), None), (set(), None))

    def test_icon_table(self):
        pool = FakePool({'gamedata/icontypes.lua': 'icontypes = {\n armpw = { bitmap = "icons/Armpw.png", size = 1 },\n corak = { bitmap = "icons/missing.png" },\n}', 'icons/armpw.png': b'x'})
        # the file names are lower case; an icon type without a file in the pool is left out; a Scavenger icon type uses the one of its unit
        self.assertEqual(reduce_units.icon_files(pool, ['armpw', 'armpw_scav', 'corak', 'nothing']), {'armpw': 'icons/armpw.png', 'armpw_scav': 'icons/armpw.png'})

    def test_fingerprint_depends_on_what_the_picture_shows(self):
        files = {'objects3d/units/x.s3o': b'S' + b'\0' * 60, 'scripts/units/x.bos': 'Create() { hide a; }', 'unittextures/x_color.dds': b'c', 'unittextures/x_other.dds': b'o', 'unittextures/x_normal.dds': b'n'}
        info = {'x': {'editor': {'faction': 'arm', 'model': 'objects3d/units/x.s3o'}, 'game': {'scriptPath': 'scripts/units/x.cob'}}}
        # the model file here is no real S3O: the unit has no picture and no fingerprint
        self.assertEqual(render_unit.picture_fingerprints(FakePool(files), info, ['x']), {'x': None})


class Pages(unittest.TestCase):
    def test_counter_chart_rows(self):
        html = ('<div class="flex-split botline"><a href="/unit/corak">c</a><a href="#">empty</a><div class="flex-split-child"><a href="/unit/armwar">a</a><a href="/unit/armllt">b</a></div></div>'
                '<div class="flex-split botline"><a href="/unit/corstorm">c</a><div class="flex-split-child"><a href="/unit/armpw">a</a></div></div>')
        self.assertEqual(export_counters.rows('head' + html), [(['corak'], ['armwar', 'armllt']), (['corstorm'], ['armpw'])])
        for broken in ('no rows at all', '<div class="flex-split botline"><a href="/unit/corak">c</a></div>', '<div class="flex-split botline"><div class="flex-split-child"></div></div>'):
            with self.assertRaises(ValueError):
                export_counters.rows(broken)

    def test_counterparts_page(self):
        html = '<h3 class="us-subheading">counterpart</h3><a href="/unit/corak">x</a><a href="/unit/leggob">y</a><a href="/unit/corak">z</a><div class="mobileonly"><a href="/unit/other">no</a></div>'
        self.assertEqual(export_counterparts.counterparts_on_page('<a href="/unit/before">no</a>' + html), ['corak', 'leggob'])
        self.assertEqual(export_counterparts.counterparts_on_page('<p>no such part</p>'), [])

    def test_counterpart_ids_and_groups(self):
        self.assertEqual([export_counterparts.default_id(n) for n in ('armsolar', 'corsolar_scav', 'raptor_x', 'arm')], ['solar', 'solar', 'raptor_x', 'arm'])   # three letters alone are a name
        groups = export_counterparts.make_groups({'armpw': ['corak'], 'leggob': ['corak'], 'armllt': [], 'x': ['y'], 'z': []})
        self.assertEqual(sorted(groups), [['armpw', 'corak', 'leggob'], ['x', 'y']])   # units that name each other, and groups that share a unit, are one group; a unit alone is none


if __name__ == '__main__':
    unittest.main()
