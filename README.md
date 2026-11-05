# BARUnitComparer

Visual and data comparison of the units of [Beyond All Reason](https://www.beyondallreason.info/) (BAR) of all factions: Armada, Cortex, Legion, Scavengers and Raptors.

It consists of the **website** (unit catalog and comparison) and the tools that get its content out of the game: an **exporter** for the unit data and a **renderer** for the unit pictures.

## Contents

- [Quick start](#quick-start)
- [Website](#website)
- [Exporter](#exporter)
- [Unit pictures (render_unit)](#unit-pictures-render_unit)
- [Export and render everything](#export-and-render-everything)
- [Requirements](#requirements)
- [More documentation](#more-documentation)
- [Licence](#licence)

## Quick start

Install BAR and start it once (so that a game has been loaded), then double click:

| File | What happens |
|---|---|
| `export and render all units.bat` | makes everything that is missing for the installed game version: unit data and data of the website in `website/assets/<version>/data/`, pictures in `website/assets/<version>/images/` |
| `exporter/export_units.bat` | only the export, into `website/assets/<version>/data/` |
| `render_unit/render_unit.bat` | asks for unit names and formats, renders into `website/assets/<version>/images/` |
| `website/serve.bat` | starts the local web server and opens the website (after the first file above) |

## Website

Unit catalog and comparison in the look of beyondallreason.info, plain HTML, CSS and JavaScript. Details: [SPECIFICATION_WEBSITE.md](SPECIFICATION_WEBSITE.md).

- **Catalog:** all units by faction (Armada, Cortex, Legion, Scavengers, Raptors) and category (Bots, Vehicles, Air, Sea, Hover, Factories, Defense, Buildings), as grid or list, with names on or off, search and tech level filter.
- **Compare:** any number of units side by side, each column with its own faction, search and category filter; picture, values as bars and the equivalent units of the other factions. The comparison can be kept as a link.
- **Online:** published with GitHub Pages from the folder `website/` (workflow `.github/workflows/pages.yml`): https://ralf1108.github.io/BARUnitComparer/
- **Data:** the page loads a small file with the values it shows, per game version: 55 KB as gzip instead of 15.7 MB, made by the exporter.

## Exporter

Reads the data of **all units from the running game** and writes it as JSON. Details and all parameters: [exporter/README.md](exporter/README.md).

- Starts the installed game once, in a small window in the background, and ends it by itself; the installation is only read, nothing in it is changed.
- Writes `units-<game version>.json`: every field the game has for a unit and its weapons (about 15 MB, 1663 units), plus faction, type, tech level, names, the list of what a unit can build and damage figures.
- Writes `equivalences.json`: which units of the different factions belong together (a proposal, to be corrected by hand; later exports only add new units).
- Works with any BAR installation and any game version that is installed; the version is part of the file name, so exports of several versions lie side by side.
- Writes a reduced version of the unit data for the website (`reduce_units.py`).
- Clear error messages instead of a hanging game (missing game or map, timeout, broken files).

## Unit pictures (render_unit)

Renders a picture of a unit from the game's own 3D model and textures, in the look of the pictures on beyondallreason.info. Details and all parameters: [render_unit/README.md](render_unit/README.md).

- Input is just the unit name: `python render_unit/render_unit.py armllt legnavyscout`.
- Reads model (S3O and Collada), textures and unit script straight from the game files; pieces that the unit script hides (crowns, muzzle flares, ...) are left out.
- Team colours by faction (Armada blue, Cortex red, Legion green, Scavengers purple, Raptors black).
- Formats: PNG, JPEG, BMP, AVIF, WebP (or all); the size is 400 x 400 pixels like on the website.
- Measures the quality of each format against the lossless picture (PSNR, SSIM) when several formats are made.
- Fast: renders on the graphics card (about 0.15 seconds per picture with four browsers at the same time; without a graphics card it falls back to the processor, about 0.5 seconds).

## Export and render everything

`export and render all units.bat` asks for the factions (all, or one or more of Armada, Cortex, Legion, Scavengers, Raptors) and the picture format (AVIF, WebP, JPEG, PNG, BMP or all) and then does three steps, each only if its result is missing: the export, the reduced data of the website and the pictures of the units without a picture, all per game version in `website/assets/<version>/data/` and `website/assets/<version>/images/`. It shows the progress live (counter, last unit, size so far, elapsed time, remaining time with the seconds per picture) and ends with a summary. An aborted run can simply be started again.

## Requirements

- Windows with a BAR installation (the launcher's data folder; found automatically, or give it with the environment variable `BAR_DATA`).
- Exporter: Windows PowerShell (part of Windows).
- Website: Python 3 with `zopfli` for the data (without it the file is a little larger), Python 3 for the local web server, a current browser (AVIF).
- Pictures: Python 3 with `numpy`, `Pillow` and (for the quality check) `scipy`; Node.js; Microsoft Edge or Google Chrome. The first run installs three.js and playwright-core with npm.

## More documentation

- [exporter/README.md](exporter/README.md): exporter parameters and output files
- [render_unit/README.md](render_unit/README.md): renderer parameters, formats, quality, speed
- [SPECIFICATION_WEBSITE.md](SPECIFICATION_WEBSITE.md): the website
- [SPECIFICATION.md](SPECIFICATION.md): the complete description of the tools: data formats, game file formats, decisions, plans for the website

## Licence

The code of this repository is under the [MIT licence](LICENSE). The game data, models and textures of Beyond All Reason have their own licences (mostly CC BY-NC-ND 4.0, see section 7 of the specification). The unit data, the rendered pictures and the icons in `website/assets/` are derived from them: this is an unofficial fan project, the pictures are published with the site, and they are taken down on request of the BAR developers.
