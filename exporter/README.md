# Exporter

Writes the data of all units of the installed Beyond All Reason as JSON. The data is taken from the **running game** (after it has processed its unit files and game options), so it is exactly what the game uses. The format of the files is described in [SPECIFICATION.md](../SPECIFICATION.md), section 3.

## How it works

`export_units.ps1` starts the game once with a small widget (`unit-export.lua`) in a sandbox folder. The widget writes the files a moment after the game has started and ends the game. The installed game is only read; the sandbox is deleted after a successful run (after an error it stays, with the game's log).

```
export_units.bat                      (double click, default values; parameters can be added)
powershell -File export_units.ps1 [-Out <folder>] [-Data <folder>] [-Work <folder>] [-WaitSec 300] [-Map "<name>"] [-Game "<name and version>"] [-Engine "<folder>"]
```

## Parameters

| Parameter | Default | Meaning |
|---|---|---|
| `-Out` | `website/assets` | Folder for the results, see below. A `counterparts.json` that is already there is given to the game first: its ids stay, only new units are added |
| `-Data` | `BAR_DATA`, else the usual places | The data folder of the BAR installation (the one with `packages`, `pool`, `engine`, `cache`). A given folder that is none is an error |
| `-Work` | `%TEMP%\unit_export` | Sandbox: the game's own write folder with widget, config and log |
| `-WaitSec` | 300 | How long to wait for the export before the game is ended (the first start of a version can take a while) |
| `-Map` | `Hooked 1.1.1`, else the first installed map | Map to load. Any map will do, only the units are read; a small one loads fast |
| `-Game` | the installed one | Game as the engine names it, e.g. `Beyond All Reason test-31820-45ea098` (to export an older installed version) |
| `-Engine` | the newest | Name of the engine folder in `<Data>\engine` (an old game version may need the engine of its time) |
| `-PrintGame` | off | Only prints the game that would be exported and ends |

Game and map are checked in the engine's archive cache before the start (otherwise the engine would wait at a message box). Exit code 1 and `ERROR: ...` on stderr if the export failed; nothing is copied then.

## Output

| File | Content |
|---|---|
| `<version>/data/units-<version>.json` | One line per unit: `game` (all fields of the unit definition) and `editor` (faction, group, tech level, names, model, weapons with all fields and damage per armor class, what it builds, main shot figures) |
| `counterparts.json` | Unit name -> counterpart id. Units with the same id belong together. One file for all game versions; meant to be corrected by hand |
| `<version>/data/units-<version>.reduced.json.gz` | Only the values the website shows, plus the new property `category`; also `<version>/images/icons/` (the role icons of the game) and `versions.json`. Made by `reduce_units.py`, which also runs alone and makes only what is missing: `python exporter/reduce_units.py [--units FILE] [--out DIR] [--data DIR] [--force]`. Needs Python, for the smallest file with `zopfli` (`pip install zopfli`); if it fails the export has still worked and the script warns |

The export does not depend on a list of fields: everything the engine knows about a unit and a weapon is written, so new fields of a newer version appear by themselves.

## What the script sets

- Game option `forceallunits=1`: without it there are no Scavenger and Raptor units (656 instead of 1663 units). `experimentallegionfaction=1` turns the Legion on.
- Engine setting `UserWidgetMemoryLimits = 0` for this one game instance: BAR would stop the widget otherwise (the export builds about 15 MB of text).
- The three Lua files from `lua/` and the widget are copied into the sandbox, not into the installation.

## Files

| File | |
|---|---|
| `export_units.ps1`, `export_units.bat` | start script and double-click starter |
| `reduce_units.py` | the reduced data for the website |
| `export_counterparts.py`, `export_counterparts.bat` | separate from the game export: updates `website/assets/counterparts.json` (`python exporter/export_counterparts.py [--out FILE] [--threads N] [--no-web]`). Starts from the file that is there (corrected by hand), gives new units the id from their name (armllt, corllt, legllt -> llt) and then reads the unit pages of beyondallreason.info (about 640 pages, a minute): the units that a page names as `counterpart` are put in one group, which gets one id. Scavenger copies get the id of their unit. Groups with two units of one faction are listed as a note |
| `export_counters.py`, `export_counters.bat` | separate from the game export: fetches the counter charts of Armada and Cortex from beyondallreason.info and writes `website/assets/counters.json` (`python exporter/export_counters.py [--out FILE]`). The file maps a unit codename to the codenames of the units that counter it: `{"counters": {"corak": ["armwar", "armllt", "armbeamer"], ...}}`. The website's **Counters** button uses it. Codenames that the newest unit data does not know are reported |
| `unit-export.lua` | the widget that runs in the game |
| `lua/led_export.lua` | the export code (JSON writing, field walk, counterparts) |
| `lua/editor_common.lua`, `lua/bar_rules.lua` | the unit catalog (faction, type, tech level) and the rules behind it; copies from the BARLevelEditor project |
