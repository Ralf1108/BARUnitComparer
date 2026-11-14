# Several game versions: the base version and the changes, step by step

**In short:** the first version of the year (the *base*) is kept completely. Every later version keeps only the units whose **values** changed against the version before it. A version in which no value changed is not kept and not shown.

- [Where the versions come from](#where-the-versions-come-from)
- [New versions: what `update game versions.bat` does](#new-versions-what-update-game-versionsbat-does)
- [What is kept per version](#what-is-kept-per-version)
- [Only values count](#only-values-count)
- [When a picture is new](#when-a-picture-is-new)
- [Date of a version](#date-of-a-version)
- [Making versions again](#making-versions-again)
- [The year run](#the-year-run-done-2026-11-13)
- [A failure stops the run](#a-failure-stops-the-run)

## Where the versions come from

- The package server of BAR (rapid, `https://repos-cdn.beyondallreason.dev/byar/versions.gz`) has a package for **every commit** of the Beyond All Reason repository: `byar:git:<full hash>` = "Beyond All Reason test-<number>-<short hash>". There are 12,593 of them, back to test-11420; 455 in 2026 up to November, 333 of them on the branch `stable` (see [plan-versions-2026.md](plan-versions-2026.md)).
- The packages and their files stay on the server, so any version can be downloaded again and gives the same export: what the players had.
- `pr-downloader` of the BAR installation (`<BAR>/bin/pr-downloader.exe`, with the settings of the launcher) downloads a version into the data folder (only the files that are missing). The export then runs with `-Game "Beyond All Reason <version>"`.
- A package just downloaded is not in the archive cache of the installation yet: the tools find it through the rapid lists of the data folder (`bar_common.rapid_package`, `Test-RapidPackage` in `export_units.ps1`); the engine adds it when it starts.
- Tried with test-31450 (2026-09-29) to test-31836: each starts with the installed engine (recoil 2026.07.04).

The decisions for the whole year from 2026-01-01 (another base, the engine of each version, the prefilter, the status `checkedUpTo`) are in [plan-versions-2026.md](plan-versions-2026.md).

## New versions: what `update game versions.bat` does

`update game versions.bat` starts `exporter/update_versions.py`. Options: `--list` only shows the versions, `--max N` takes only the first N, `--data` is passed to every tool.

1. **The table of engines** is brought up to date (`make_engine_table.py`: a new standard engine of the launcher is picked up).
2. **The versions** are the ones of the server whose commit is on `stable` and dated 2026-01-01 or later (the clone `cache/bar.git`, `exporter/git_history.py`), and of these every one newer than `checkedUpTo` (`versions.json`), oldest first.
3. **Prefilter with Git:** a version for which Git shows no change of the files that reach the values (`git_history.py`: `VALUE_PATHS`; a change of the look alone is no change, see below) is not downloaded or started: `checkedUpTo` moves on. `--no-prefilter` exports every version.
4. **For every other version:**
   - the package (`pr-downloader`),
   - the engine of its date (`exporter/engines.json`, made by `make_engine_table.py` from the history of BYAR-Chobby; the engines lie in `cache/engines/`, not in the installation),
   - then `export_and_render_all_units.ps1 -Game <it> -Engine <engine> -Yes`: export, diff, the pictures that changed.
5. **A change of the engine:** if the engine differs from the one of the version before, that version is exported again with the new engine (`cache/control/`) and the diff is made against that export. Units that differ only because of the engine are named in `engineOnly` of the version.
6. **The full export** of every version is removed after it is done (`--keep-exports` keeps it).
7. **At the end**, after exported versions, `counterparts.json` and `counters.json` are refreshed from beyondallreason.info (`export_counterparts.py`, `export_counters.py`; only for `website/assets`; `--no-lists` skips it, a failure is a warning).

A run that stops can be started again. A folder with another base is refused (use a new `--out`). The first run takes hours (about 230 exports).

## What is kept per version

**The base version** (the first version of the year: test-29183, 2026-01-01; before the year run it was test-31820) keeps everything: the reduced file of all units and all pictures.

**Every later version keeps only what changed against the version before it** (`exporter/reduce_units.py`; the version before = the base with the changes of every version in between):

| File | Content |
|---|---|
| `data/units-<version>.diff.json.gz` | `before`: the version before; the units whose **values** (the reduced fields) changed and the units that are new, both with their whole reduced entry; the names of the units that are gone |
| `data/pictures.json` | the fingerprints of the changed pictures |
| `images/` | only the pictures (and icons) that changed |

**A version in which nothing changed gets no files** and is not shown; `versions.json` only moves `checkedUpTo` (the newest version looked at) on, so it is not compared again. Its full export stays local (`.gitignore`).

Measured:
- test-31836 against test-31820: nothing the page shows changed (unchanged).
- A test chain (in a scratch folder, `update_versions.py --max 2`) from test-31450 as base: test-31465 (downloaded, it was not installed) 10 units changed, diff file 0.8 KB; test-31479 24 units against test-31465, 1.4 KB; about 50 seconds per version (export 45 s, pictures a few seconds).

## Only values count

A unit whose model, textures, script or icon changed but **no value** is **not** a change: it gets no entry, no new picture and no new version.

- Why: an export showed that most of such "picture changes" render pixel-identically (the model file changes without changing the picture), and the few visible ones are not wanted.
- A version in which only the look changed is therefore not exported at all (the Git prefilter skips it).
- The picture and the icon of a unit are only renewed when one of its values changes in the same version.

## When a picture is new

In a version in which the values of a unit changed, its picture is new if its **fingerprint** differs from the one kept for the unit.

- **The fingerprint** is an md5 over the md5 of the model file, the three textures (the pool knows the md5 of every file, nothing has to be read but the model), the pieces the script hides when the unit is created, and the faction colour (`render_unit.picture_fingerprints`, the same inputs as the rendering).
- Of the script only the hidden pieces count: test-31836 changed the script of `legkark`, but not what it hides.
- The fingerprints are kept in `data/pictures.json` (of the base all, of a later version the changed ones), so a later version is compared without rendering anything. The fingerprint stays that of the picture that is shown: a look-only change does not move it, so a later value change brings the new picture along.
- Only the pictures that changed are rendered (`reduce_units.py --pictures <folder>` lists them for `export_and_render_all_units.ps1`).
- Without the game installed there are no fingerprints: then only the values are compared.
- **Chance in the game:** the Scavenger loot boxes (`lootbox*`) get one of two models by chance at every start of the game (`unitbasedefs/lootboxes/lootboxnano.lua`: `math.random(1, 2)`): two exports of the same version differ there. Their pictures are not compared (`RANDOM_MODEL` in `reduce_units.py`).

## Date of a version

The version name ends with the short hash of the commit of the Beyond All Reason repository it was built from (`test-31836-b250a16`). The date of that commit is the date in `versions.json`:

- read from the clone of the repository (`cache/bar.git`, `exporter/git_history.py`),
- without the clone from the GitHub API (`/repos/beyond-all-reason/Beyond-All-Reason/commits/<hash>`, which often answers with 503).

The dates that are in `versions.json` already are kept.

## Making versions again

- A renamed unit shows up as gone and new.
- A diff file depends on all files before it: if one in the middle is made again, the later ones have to be made again too.
- `reduce_units.py --redo <version folder>` makes only that version again (the export script does this for the version it has just exported, so a new export never rebuilds the chain); `--force` makes all of them again, from the full exports.
- A diff file made against another version than the one before it now is an error (`before` is checked).
- A version whose pictures were compared before and whose game is no longer installed is not made again without them (the fingerprints would be lost).
- If the base version is ever to be changed: make the new base's reduced file with everything (delete the old one, `--force`), then all diff files again. A version older than the base is left out.

## The year run (done 2026-11-13)

[plan-versions-2026.md](plan-versions-2026.md) is the reasoning. From the base test-29183 (2026-01-01) to test-31943 (2026-11-12):

| | |
|---|---|
| Versions of `stable` | 339 |
| Skipped by Git (no change of the unit files; no download, no game start) | 112 |
| Broken game versions (skipped, named with the reason in `exporter/broken_versions.json`) | 4: among them test-29940 `raptor_unitdefs_post.lua`, test-30553 `modoptions.lua`, test-31732 `scavengers/weapondef_post.lua`; the engine then crashes |
| Engines used (`exporter/engines.json`; about 24 MB each in `cache/engines/`) | 2025.06.12, 2025.06.19, 2025.06.24, 2026.06.11, 2026.06.12, 2026.07.04 |
| Versions listed | 53 (the base and 52 with a diff file) |
| Changed units in total | 1146; 37 units gone |
| Engine-only difference | one: test-30637, the build time of `armcomboss` (an overflow that differs between engines), named in `engineOnly` |
| Time | about 2.5 hours (30 to 40 seconds per exported version, the pictures cost almost nothing) |
| Result | about 28 MB in about 2100 files, the history file 39 KB |

The first result had 64 versions and 1306 entries. The clean-up of the changes that were only a look removed 160 entries and the 11 versions that held nothing else.

## A failure stops the run

The game itself can be broken in a version (the definitions do not load; the log of the engine says `forced quit with exception`): `update_versions.py` prints that line and stops. If it is a mistake in the game, the version is named in `exporter/broken_versions.json` and the next run skips it (the next version is compared with the one before the broken one).
