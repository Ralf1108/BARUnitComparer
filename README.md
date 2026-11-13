# BARUnitComparer

## 👉 [**Open the website: https://ralf1108.github.io/BARUnitComparer/**](https://ralf1108.github.io/BARUnitComparer/) 👈

Unit catalog and comparison for [Beyond All Reason](https://www.beyondallreason.info/) (BAR): all units of Armada, Cortex, Legion, Scavengers and Raptors, with pictures and values. An unofficial fan project.

[![The compare page: three units side by side, Pawn as the reference](docs/compare.png)](https://ralf1108.github.io/BARUnitComparer/)

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
- **Versions:** (planned: every version of the year from 2026-01-01, see [docs/plan-versions-2026.md](docs/plan-versions-2026.md)) compares game versions: only the units that changed, the version before and the changed version side by side, the changed values marked. Every column can show any exported version. A version in which no unit changed is not shown.
- **Undo / Redo** of every change of the columns, **Favorites** for selections you want to keep (saved in your browser), and the comparison is kept in the link (units, view, Ref and + Scav), ready to share.

**Tools** (they get the content out of the installed game)
- Exporter: the data of all units as JSON.
- Renderer: pictures of the units from the game's own 3D models.

## Quick start

Install BAR and start it once (so that a game has been loaded), then double click:

| File | What happens |
|---|---|
| `export and render all units.bat` | makes everything that is missing for the installed game version: unit data and data of the website in `website/assets/<version>/data/`, pictures in `website/assets/<version>/images/` |
| `update game versions.bat` | looks for new game versions on the BAR package server, downloads each one, exports it and keeps only what changed against the version before (`--list`: only show them) |
| `website/serve.bat` | starts the local web server and opens the website |

All tools, their parameters and requirements: [TOOLS.md](TOOLS.md).

## Documentation

- [TOOLS.md](TOOLS.md): exporter, renderer, counterparts and counters, requirements
- [exporter/README.md](exporter/README.md), [render_unit/README.md](render_unit/README.md): parameters and output files
- [docs/README.md](docs/README.md): the index of the technical documents: [the website](docs/website.md), [the exporter](docs/exporter.md), [game versions](docs/versions.md) and [the plan for the year](docs/plan-versions-2026.md), [the renderer](docs/renderer.md), [the game's files and formats](docs/game-files.md)

## Licence

The code of this repository is under the [MIT licence](LICENSE). The game data, models and textures of Beyond All Reason have their own licences (mostly CC BY-NC-ND 4.0, see [docs/licence.md](docs/licence.md)). The unit data, the rendered pictures and the icons in `website/assets/` are derived from them: this is an unofficial fan project, the pictures are published with the site, and they are taken down on request of the BAR developers.
