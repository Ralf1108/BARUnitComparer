"""Tests of the year of game versions (docs/plan-versions-2026.md): the versions from the clone, the prefilter (git_history.py), the engine per day, the plan and
checkedUpTo (update_versions.py), the engine table (make_engine_table.py). A small git repository is made in a temporary folder; no network, no game.

    python -m unittest discover -s tests -v
"""
import json, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'exporter'))
sys.path.insert(0, str(ROOT / 'shared'))
import git_history, make_engine_table, update_versions  # noqa: E402


def git(repo, *args, env=None):
    subprocess.run(['git', '-C', str(repo), *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)


def commit(repo, date, files):
    """A commit with the given files ({path: text}) on the date; returns the hash."""
    for name, text in files.items():
        f = Path(repo, name)
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding='utf-8')
    git(repo, 'add', '-A')
    import os
    env = {**os.environ, 'GIT_AUTHOR_DATE': f'{date}T12:00:00+00:00', 'GIT_COMMITTER_DATE': f'{date}T12:00:00+00:00',
           'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.com', 'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.com'}
    git(repo, 'commit', '-q', '-m', 'c', env=env)
    return subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], stdout=subprocess.PIPE, text=True).stdout.strip()


class Prefilter(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        git(self.repo, 'init', '-q', '-b', 'stable')

    def test_kinds_of_steps(self):
        c0 = commit(self.repo, '2026-01-01', {'units/arm/armpw.lua': '1', 'objects3d/armpw.s3o': 'm', 'luarules/gadgets/x.lua': 'g'})
        c1 = commit(self.repo, '2026-01-02', {'luarules/gadgets/x.lua': 'g2', 'README.md': 'r'})                     # a gadget, a readme: no change
        c2 = commit(self.repo, '2026-01-03', {'objects3d/armpw.s3o': 'm2'})                                          # the look only
        c3 = commit(self.repo, '2026-01-04', {'units/arm/armpw.lua': '2', 'objects3d/armpw.s3o': 'm3'})             # values (and the look)
        c4 = commit(self.repo, '2026-01-05', {'luarules/configs/quick_start_build_defs.lua': 'q'})                   # included by the definitions: values
        kind = lambda a, b: git_history.kind_of_step(self.repo, a, b)
        self.assertEqual([kind(c0, c1), kind(c1, c2), kind(c2, c3), kind(c3, c4)], ['none', 'none', 'values', 'values'])
        self.assertEqual(git_history.changed_files(self.repo, c2, c3, ['units']), ['units/arm/armpw.lua'])

    def test_commit_dates(self):
        c0 = commit(self.repo, '2026-01-01', {'a': '1'})
        c1 = commit(self.repo, '2026-02-03', {'a': '2'})
        self.assertEqual(git_history.commit_dates(self.repo), {c0: '2026-01-01', c1: '2026-02-03'})


class Versions(unittest.TestCase):
    FIELDS = [['byar:git:aaa111', 'm', '', 'Beyond All Reason test-10-aaa1111'],
              ['byar:git:bbb222', 'm', '', 'Beyond All Reason test-20-bbb2222'],
              ['byar:git:ccc333', 'm', '', 'Beyond All Reason test-30-ccc3333'],    # on another branch
              ['byar:git:ddd444', 'm', '', 'Beyond All Reason test-5-ddd4444'],      # before the year
              ['byar:test', 'm', '', 'Beyond All Reason test-31820-45ea098']]       # not built from a commit: left out

    def test_year_versions(self):
        dates = {'aaa111': '2026-01-01', 'bbb222': '2026-03-01', 'ddd444': '2025-12-31'}
        chain = update_versions.year_versions(dates, '2026-01-01', self.FIELDS)
        self.assertEqual(chain, [(10, 'test-10-aaa1111', 'aaa111'), (20, 'test-20-bbb2222', 'bbb222')])

    def test_plan(self):
        chain = [(10, 'v10', 'a'), (20, 'v20', 'b'), (30, 'v30', 'c')]
        saved = git_history.kind_of_step
        git_history.kind_of_step = lambda repo, old, new: {('a', 'b'): 'none', ('b', 'c'): 'values'}[(old, new)]
        self.addCleanup(lambda: setattr(git_history, 'kind_of_step', saved))
        self.assertEqual(update_versions.plan(chain, 0, None, True), [(10, 'v10', 'a', 'base'), (20, 'v20', 'b', 'none'), (30, 'v30', 'c', 'values')])
        self.assertEqual(update_versions.plan(chain, 10, None, True), [(20, 'v20', 'b', 'none'), (30, 'v30', 'c', 'values')])
        self.assertEqual([s[3] for s in update_versions.plan(chain, 10, None, False)], ['values', 'values'])   # --no-prefilter
        self.assertEqual(update_versions.plan(chain, 30, None, True), [])


class Engines(unittest.TestCase):
    TABLE = [{'from': '2025-12-10', 'engine': 'A'}, {'from': '2026-02-20', 'engine': 'B'}, {'from': '2026-05-26', 'engine': 'C'}]

    def test_engine_for(self):
        f = lambda d: update_versions.engine_for(d, self.TABLE)
        self.assertEqual([f('2025-01-01'), f('2026-01-01'), f('2026-02-19'), f('2026-02-20'), f('2026-12-01')], ['A', 'A', 'A', 'B', 'C'])

    def test_checked_up_to(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / 'versions.json').write_text(json.dumps({'versions': [{'version': 'test-10-a', 'base': True}], 'checkedUpTo': 'test-10-a', 'unchanged': ['x']}), encoding='utf-8')
            update_versions.move_checked(out, 'test-25-b')
            data = json.loads((out / 'versions.json').read_text(encoding='utf-8'))
            self.assertEqual((data['checkedUpTo'], 'unchanged' in data), ('test-25-b', False))
            self.assertEqual(update_versions.newest_done(out), 25)

    def test_engine_table_of_the_committed_file(self):
        t = json.loads((ROOT / 'exporter' / 'engines.json').read_text(encoding='utf-8'))
        self.assertEqual([e['from'] for e in t], sorted(e['from'] for e in t), 'oldest first')
        self.assertTrue(all(a['engine'] != b['engine'] for a, b in zip(t, t[1:])), 'one entry per change')
        self.assertTrue(t[0]['from'] <= '2026-01-01', 'the engine at the start of the year is known')

    def test_engine_table_from_commits(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            git(repo, 'init', '-q', '-b', 'main')
            setups = lambda e, t: json.dumps({'setups': [{'package': {'id': 'manual-win'}, 'launch': {'engine': 'recoil_' + e}},
                                                         {'package': {'id': 'manual-win-test-engine'}, 'launch': {'engine': 'recoil_' + t}}]})
            commit(repo, '2025-12-20', {'dist_cfg/config.json': setups('1', '9')})
            commit(repo, '2026-02-01', {'dist_cfg/config.json': setups('1', '8')})   # only the test engine changes: no entry
            commit(repo, '2026-03-01', {'dist_cfg/config.json': setups('2', '8')})
            self.assertEqual(make_engine_table.table(repo, '2025-12-01'), [{'from': '2025-12-20', 'engine': '1'}, {'from': '2026-03-01', 'engine': '2'}])


if __name__ == '__main__':
    unittest.main()
