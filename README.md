# BARUnitComparer

[![Tests and publish](https://github.com/Ralf1108/BARUnitComparer/actions/workflows/pages.yml/badge.svg)](https://github.com/Ralf1108/BARUnitComparer/actions/workflows/pages.yml)

## 👉 [**Open the website: https://ralf1108.github.io/BARUnitComparer/**](https://ralf1108.github.io/BARUnitComparer/) 👈

Unit catalog and comparison for [Beyond All Reason](https://www.beyondallreason.info/) (BAR): all units of Armada, Cortex, Legion, Scavengers and Raptors, with pictures and values. An unofficial fan project.

[![The compare page: three units side by side, Pawn as the reference](docs/compare.png)](https://ralf1108.github.io/BARUnitComparer/)

## How it works

```
installed game ──► exporter ──► unit data (JSON) ──┐
  (BAR)            (Lua, headless)                  ├──► website/assets/ ──► the website (GitHub Pages)
               └─► renderer ──► unit pictures ──────┘
                   (3D models, Python + browser)
```

You do not need the game to **use** the site: open the link above. You only need the game (and the tools below) to **make new data**, for example for a new game version. The finished data is part of this repository (`website/assets/`).

## Contents

**Catalog**
- All units by faction and category, as grid or list, with search and tech level filter.
- A click marks a unit for the comparison.

**Compare**
- Any number of units side by side: values as bars, scaled to the largest value in each row, or as a compact table.
- The unit selection at the right edge: search over all units, faction, category; a click on a unit adds a column. Columns can be moved by drag and drop.
- **Counterparts:** the units of the other factions that do the same job, one click adds them all.
- **Counters:** replaces the columns with the units that counter this unit (from the counter charts of beyondallreason.info).
- **Ref:** makes a unit the reference: the bars of all other units turn green (as good or better) or red (worse).
- **+ Scav:** shows the Scavenger copy of every unit next to it.
- **Changes:** a page with what changed in the game between any two versions of the year (from 2026-01-01): the changed values as `old → new`, new and gone units, filters by faction and value; a click opens the unit in the compare. In the side-by-side compare, a unit whose latest change was only visual (new picture, same values) has a golden frame on its picture; the tooltip names the version.
- **Versions:** (every version of the year, see [docs/plan-versions-2026.md](docs/plan-versions-2026.md)) the button at the top shows only units that have at least 2 versions; the button **Versions** of a unit adds all its older versions as columns right of it and makes the unit the Ref (grey if there is none), the changed values are marked. Every column can show any exported version. A version in which no unit changed is not shown.
- **Undo / Redo** of every change of the columns, **Favorites** for selections you want to keep (saved in your browser), and the comparison is kept in the link (units, view, Ref and + Scav), ready to share.

**Tools** (they get the content out of the installed game)
- Exporter: the data of all units as JSON.
- Renderer: pictures of the units from the game's own 3D models.

## Try it locally (without the game)

1. Install [Python 3](https://www.python.org/downloads/).
2. Download this repository (green **Code** button, *Download ZIP*) and unpack it.
3. Double click `website/serve.bat` (or run `python website/serve.py`). The browser opens `http://localhost:8000/`.

## Make new data (needs the game)

Install BAR and start it once (so that a game has been loaded), then double click:

| File | What happens |
|---|---|
| `export and render all units.bat` | makes everything that is missing for the installed game version: unit data and data of the website in `website/assets/<version>/data/`, pictures in `website/assets/<version>/images/` |
| `update game versions.bat` | goes through the game versions of the year (from 2026-01-01): downloads each one that changed a unit file, exports it with the engine of its time and keeps only what changed against the version before (`--list`: only show them), then refreshes the counterparts and counters |
| `website/serve.bat` | starts the local web server and opens the website |

All tools, their parameters and requirements: [TOOLS.md](TOOLS.md).

## Folders

| Folder | Content |
|---|---|
| `website/` | the page (HTML, CSS, JavaScript) and its data in `assets/` |
| `exporter/` | gets the unit data out of the game |
| `render_unit/` | makes the pictures from the 3D models |
| `shared/` | code used by several tools |
| `tests/` | automatic tests (run by GitHub on every push: `python -m unittest discover -s tests`, `node tests/website_smoke.mjs`) |
| `docs/` | technical documents |

## Documentation

- [TOOLS.md](TOOLS.md): exporter, renderer, counterparts and counters, requirements
- [exporter/README.md](exporter/README.md), [render_unit/README.md](render_unit/README.md): parameters and output files
- [docs/README.md](docs/README.md): the index of the technical documents: [the website](docs/website.md), [the exporter](docs/exporter.md), [game versions](docs/versions.md) and [the plan for the year](docs/plan-versions-2026.md), [the renderer](docs/renderer.md), [the game's files and formats](docs/game-files.md)

## Licence

The code of this repository is under the [MIT licence](LICENSE). The game data, models and textures of Beyond All Reason have their own licences (mostly CC BY-NC-ND 4.0, see [docs/licence.md](docs/licence.md)). The unit data, the rendered pictures and the icons in `website/assets/` are derived from them: this is an unofficial fan project, the pictures are published with the site, and they are taken down on request of the BAR developers.
