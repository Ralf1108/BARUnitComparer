# Documentation

A project that shows the units of Beyond All Reason next to each other. These documents describe how it is made: the formats, the decisions and the measurements. How to use the tools (parameters, double-click files) is in [TOOLS.md](../TOOLS.md) and the READMEs of the folders.

| Document | What is in it |
|---|---|
| [website.md](website.md) | the website: the data it reads (`website/assets/`), catalog, compare, game versions, publishing with GitHub Pages |
| [exporter.md](exporter.md) | the exporter (`exporter/`): data of all units from the running game, `units-<version>.json`, `counterparts.json`, the start script |
| [versions.md](versions.md) | several game versions: the base version and the changes step by step (built) |
| [plan-versions-2026.md](plan-versions-2026.md) | the plan for every version of the year from 2026-01-01, and the version compare page (decided, not built) |
| [renderer.md](renderer.md) | the pictures of the units rendered from the game's 3D models (`render_unit/`) |
| [pipeline.md](pipeline.md) | everything in one go: `export and render all units.bat` |
| [game-files.md](game-files.md) | the game's files: data folder and pool, the S3O format, textures, in-game pictures |
| [licence.md](licence.md) | the licences of the game's content and the decision about the pictures |

| Part of the repository | What it does | Document |
|---|---|---|
| `exporter/` | starts the installed game once and writes all unit data as JSON | [exporter.md](exporter.md) |
| `render_unit/` | renders a picture of every unit from the game's 3D models | [renderer.md](renderer.md) |
| `export and render all units.bat` | both in one go, with progress | [pipeline.md](pipeline.md) |
| `update game versions.bat` | new game versions from the BAR package server, each only against the version before | [versions.md](versions.md) |
| `shared/` | what the Python and PowerShell tools share: data folder, game files, faction and version rules | [game-files.md](game-files.md) |
| `exporter/export_counterparts.py`, `export_counters.py` | counterparts and counters from beyondallreason.info, without the game | [exporter/README.md](../exporter/README.md) |
| `website/` | the website: unit catalog and comparison | [website.md](website.md) |
| `tests/` | data tests, chain tests, helper tests and a smoke test of the page | [website.md](website.md), section "Publishing with GitHub Pages" |

## Next steps and open points

- **Build the plan of [plan-versions-2026.md](plan-versions-2026.md)** (the versions of the year from 2026-01-01 on, step by step, with the prefilter, the engine per version, `history.json.gz`, the grouping by month). Open there: where the downloaded engines lie (data folder of the installation or an own cache folder), and which entry of a commit of the launcher configuration is the standard engine.
- Ask the BAR developers whether the published pictures and the site are in order ([licence.md](licence.md)).
- Correct `website/assets/counterparts.json` by hand.
- Choose the final picture format and quality for the website (AVIF 70 is the default so far).
- Not covered: units of other games or mods (the file has what the running game knows); animations; shine and glow in the 3D view (texture 2 of the S3O) if it is built with colour only at first.
