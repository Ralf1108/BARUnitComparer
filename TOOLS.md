# The tools: exporter and renderer

The website (see the [README](README.md)) shows data and pictures that these tools get out of the installed game. Everything lands in `website/assets/<version>/`.

## Contents

- [Export and render everything](#export-and-render-everything)
- [Exporter](#exporter)
- [Counterparts and counters](#counterparts-and-counters)
- [Unit pictures (render_unit)](#unit-pictures-render_unit)
- [Requirements](#requirements)

## Export and render everything

`export and render all units.bat` asks for the factions (all, or one or more of Armada, Cortex, Legion, Scavengers, Raptors) and the picture format (AVIF, WebP, JPEG, PNG, BMP or all) and then does three steps, each only if its result is missing: the export, the reduced data of the website and the pictures of the units without a picture, all per game version in `website/assets/<version>/data/` and `website/assets/<version>/images/`. It shows the progress live (counter, last unit, size so far, elapsed time, remaining time with the seconds per picture) and ends with a summary. An aborted run can simply be started again.

## Exporter

Reads the data of **all units from the running game** and writes it as JSON. Details and all parameters: [exporter/README.md](exporter/README.md).

- Starts the installed game once, in a small window in the background, and ends it by itself; the installation is only read, nothing in it is changed.
- Writes `units-<game version>.json`: every field the game has for a unit and its weapons (about 15 MB, 1663 units), plus faction, type, tech level, names, the list of what a unit can build and damage figures.
- Writes `counterparts.json`: which units of the different factions belong together (a proposal, to be corrected by hand; later exports only add new units).
- Works with any BAR installation and any game version that is installed; the version is part of the file name, so exports of several versions lie side by side.
- Writes a reduced version of the unit data for the website (`reduce_units.py`).
- Clear error messages instead of a hanging game (missing game or map, timeout, broken files).

## Counterparts and counters

Two separate scripts get this from beyondallreason.info, they do not need the game:

| File | What happens |
|---|---|
| `exporter/export_counterparts.bat` | updates `website/assets/counterparts.json`: starts from the file that is there, gives new units an id from their name and then reads the counterpart part of the unit pages (about 640 pages, a minute). Units that name each other get one id; the official site wins over an id corrected by hand |
| `exporter/export_counters.bat` | writes `website/assets/counters.json` from the counter charts of Armada and Cortex: for a unit the units that counter it |

Details: [exporter/README.md](exporter/README.md).

## Unit pictures (render_unit)

Renders a picture of a unit from the game's own 3D model and textures, in the look of the pictures on beyondallreason.info. Details and all parameters: [render_unit/README.md](render_unit/README.md).

- Input is just the unit name: `python render_unit/render_unit.py armllt legnavyscout`.
- Reads model (S3O and Collada), textures and unit script straight from the game files; pieces that the unit script hides (crowns, muzzle flares, ...) are left out.
- Team colours by faction (Armada blue, Cortex red, Legion green, Scavengers purple, Raptors black).
- Formats: PNG, JPEG, BMP, AVIF, WebP (or all); the size is 400 x 400 pixels like on the website.
- Measures the quality of each format against the lossless picture (PSNR, SSIM) when several formats are made.
- Fast: renders on the graphics card (about 0.15 seconds per picture with four browsers at the same time; without a graphics card it falls back to the processor, about 0.5 seconds).

## Requirements

- Windows with a BAR installation (the launcher's data folder; found automatically, or give it with the environment variable `BAR_DATA`).
- Exporter: Windows PowerShell (part of Windows).
- Python 3.12 or newer (the scripts use its syntax).
- Website: `zopfli` for the data (`pip install zopfli`; without it the file is a little larger), Python for the local web server, a current browser (AVIF).
- Pictures: Python with `numpy`, `Pillow` and (for the quality check) `scipy`; Node.js; Microsoft Edge or Google Chrome. The first run installs three.js and playwright-core with npm.
