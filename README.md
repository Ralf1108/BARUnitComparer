# BARUnitComparer

Visual and data comparison of the units of [Beyond All Reason](https://www.beyondallreason.info/) (BAR) of all factions: Armada, Cortex, Legion, Scavengers and Raptors.

The comparison website is planned, it does not exist yet. What exists are the tools that get its content out of the game: an **exporter** for the unit data and a **renderer** for the unit pictures.

## Contents

- [Quick start](#quick-start)
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
| `export and render all units.bat` | exports the unit data and renders a picture of every unit into `out/` |
| `exporter/export_units.bat` | only the export, into `exporter/out/` |
| `render_unit/render_unit.bat` | asks for unit names and formats, renders into `render_unit/out/` |

## Exporter

Reads the data of **all units from the running game** and writes it as JSON. Details and all parameters: [exporter/README.md](exporter/README.md).

- Starts the installed game once, in a small window in the background, and ends it by itself; the installation is only read, nothing in it is changed.
- Writes `units-<game version>.json`: every field the game has for a unit and its weapons (about 15 MB, 1663 units), plus faction, type, tech level, names, the list of what a unit can build and damage figures.
- Writes `equivalences.json`: which units of the different factions belong together (a proposal, to be corrected by hand; later exports only add new units).
- Works with any BAR installation and any game version that is installed; the version is part of the file name, so exports of several versions lie side by side.
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

`export and render all units.bat` does both steps in one go: it asks for the factions (all, or one or more of Armada, Cortex, Legion, Scavengers, Raptors) and the picture format (AVIF, WebP, JPEG, PNG, BMP or all), exports the data, then renders every unit into `out/`. It shows the progress live (counter, last unit, size so far, elapsed time, remaining time with the seconds per picture) and ends with a summary. Pictures that are there already are skipped, so an aborted run can simply be started again.

## Requirements

- Windows with a BAR installation (the launcher's data folder; found automatically, or give it with the environment variable `BAR_DATA`).
- Exporter: Windows PowerShell (part of Windows).
- Pictures: Python 3 with `numpy`, `Pillow` and (for the quality check) `scipy`; Node.js; Microsoft Edge or Google Chrome. The first run installs three.js and playwright-core with npm.

## More documentation

- [exporter/README.md](exporter/README.md): exporter parameters and output files
- [render_unit/README.md](render_unit/README.md): renderer parameters, formats, quality, speed
- [SPECIFICATION.md](SPECIFICATION.md): the complete description: data formats, game file formats, decisions, plans for the website

## Licence

The code of this repository is under the [MIT licence](LICENSE). The game data, models and textures of Beyond All Reason have their own licences (mostly CC BY-NC-ND 4.0, see section 7 of the specification): the exported data and the pictures are for home use and are not part of this repository.
