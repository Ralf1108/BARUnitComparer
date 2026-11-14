# Documentation

A project that shows the units of Beyond All Reason next to each other. These documents describe how it is made: the formats, the decisions and the measurements. How to use the tools (parameters, double-click files) is in [TOOLS.md](../TOOLS.md) and the READMEs of the folders.

| Document | What is in it |
|---|---|
| [website.md](website.md) | the website: the data it reads (`website/assets/`), catalog, compare, game versions, publishing with GitHub Pages |
| [exporter.md](exporter.md) | the exporter (`exporter/`): data of all units from the running game, `units-<version>.json`, `counterparts.json`, the start script |
| [versions.md](versions.md) | several game versions: the base version and the changes step by step; the year run (built) |
| [plan-versions-2026.md](plan-versions-2026.md) | the plan for every version of the year from 2026-01-01, and the version compare page (built; the plan is the reasoning) |
| [renderer.md](renderer.md) | the pictures of the units rendered from the game's 3D models (`render_unit/`) |
| [pipeline.md](pipeline.md) | everything in one go: `export and render all units.bat` |
| [game-files.md](game-files.md) | the game's files: data folder and pool, the S3O format, textures, in-game pictures |
| [licence.md](licence.md) | the licences of the game's content and the decision about the pictures |

| Part of the repository | What it does | Document |
|---|---|---|
| `exporter/` | starts the installed game once and writes all unit data as JSON | [exporter.md](exporter.md) |
| `render_unit/` | renders a picture of every unit from the game's 3D models | [renderer.md](renderer.md) |
| `export and render all units.bat` | both in one go, with progress | [pipeline.md](pipeline.md) |
| `update game versions.bat` | every game version of the year from the BAR package server, each only against the version before; Git prefilter, engine per version | [versions.md](versions.md) |
| `exporter/git_history.py`, `make_engine_table.py`, `engines.json`, `broken_versions.json` | the clone of the game repository (versions, dates, prefilter), the engine per day, game versions that do not start | [versions.md](versions.md) |
| `shared/` | what the Python and PowerShell tools share: data folder, game files, faction and version rules | [game-files.md](game-files.md) |
| `exporter/export_counterparts.py`, `export_counters.py` | counterparts and counters from beyondallreason.info, without the game | [exporter/README.md](../exporter/README.md) |
| `website/` | the website: unit catalog and comparison | [website.md](website.md) |
| `tests/` | data tests, chain tests, year tests (Git, engines), helper tests and a smoke test of the page (also on a made-up chain of versions) | [website.md](website.md), section "Publishing with GitHub Pages" |

## Keeping it current

- **New game versions:** `update game versions.bat` (it also brings the table of engines, the counterparts and the counters up to date).
- **A game version that does not start:** name it in `exporter/broken_versions.json` (the run stops at it and prints the reason).

## Open points

- Set the description and topics of the GitHub repository ("About", by hand).
- Ask the BAR developers whether the published pictures and the site are in order ([licence.md](licence.md)).
- Correct `website/assets/counterparts.json` by hand.
- Choose the final picture format and quality for the website (AVIF 70 is the default so far).
- The control export is repeated after a version without a change under a new engine (costs a little time, the result is right).
- Not covered: units of other games or mods (the file has what the running game knows); animations; shine and glow in the 3D view.
