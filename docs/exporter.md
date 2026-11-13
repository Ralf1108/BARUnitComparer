# The exporter (`exporter/`)

Counts in this document (units, sizes) are those of `test-31820` (1663 units); the base of the year, `test-29183`, has 1678 units, the newest, `test-31943`, 1663. The exporter runs with the engine of the day of a version (`-Engine`, [versions.md](versions.md)).

The data comes from the **running normal game** (not from the Level Editor): it gives exactly the numbers the game uses after it has processed its unit files and game options. One game start per game version.

| File | What it is |
|---|---|
| `unit-export.lua` | widget for a plain BAR game: a moment after the start (game frame 5) it writes `units-<version>.json`, `counterparts.json` and `status.txt` ("ok ..." or "error ...") into `LuaUI/Config/WebsiteExport/` (a user widget may write only into `LuaUI/Config` and `LuaUI/Widgets`); if `quit.txt` is there, the game ends itself (`quitforce`) |
| `export_units.ps1`, `export_units.bat` | start script (PowerShell, Windows; the `.bat` is a double click): starts the game in a sandbox folder with the widget, waits, moves the result to `-Out`, deletes the sandbox, runs `reduce_units.py` |
| `reduce_units.py`, `unit_rules.py` | makes the small data file of the website (`unit_rules.py`: the rules that make the values of a unit; `reduce_units.py`: the files, the chain of versions, `versions.json`) from `units-<version>.json` ([website.md](website.md), section "Data"); it is written next to the full file, the icons to `images/icons/` of that version |
| `lua/led_export.lua` | the export code the widget calls: `exportUnits()`, `exportCounterparts()` |
| `lua/unit_catalog.lua`, `lua/bar_rules.lua` | the unit catalog (faction, type, tech level, water, filler: `buildUnitCache`), the main weapon figures (`shotInfo`) and their rules |

The three Lua files are **copies** of `LevelEditor/scripts/led_export.lua`, `shared/editor_common.lua` and `shared/bar_rules.lua` of the BARLevelEditor repository (state 2026-11-05, commit `86df38f`); `unit_catalog.lua` is the part of `editor_common.lua` the export needs (`FACTIONS`, `GROUPS`, `factionOf`, `shotInfo`, `buildUnitCache` and their helpers, copied unchanged; the Level Editor takes the same file over and loads it from `editor_common.lua`). One change was made: `exportUnits()` / `exportCounterparts()` also return whether they succeeded, and a failed write is an error (a new copy has to keep this). The Level Editor's own export buttons are **not** a source: the editor game changes data (the `builds` lists of 66 builders and the model fields of 16 units differ).

## `units-<game version>.json`

The file name carries the version, e.g. `units-test-31820-45ea098.json` (every character other than letters, digits, `.`, `_`, `-` becomes `_`). The version is read from the loaded archive `Beyond All Reason <version>` (`VFS.GetLoadedArchives()`) and is also in the file. (`test-...` is the version the tag `byar:test` in `rapid/repos-cdn.beyondallreason.dev/byar/versions.gz` points to, the one installed here; `byar:stable` there points to `Beyond All Reason 0.01`.)

```
{ "format": 1, "gameName": "Beyond All Reason", "gameVersion": "<version>", "count": <units>, "units": {
"armllt": { "game": { ... }, "editor": { ... } },
...
}}
```

One unit per line, sorted by unit name, keys sorted (two exports of the same game give the same file, except random units such as the Scavenger lootboxes). UTF-8. About 15.7 MB, 1663 units in `test-31820`: 244 Armada, 249 Cortex, 235 Legion, 808 Scavenger, 127 Raptor.

**`game`: all fields of the unit definition.** The engine gives every unit and weapon definition a function `pairs` (`rawget(def, "pairs")`; the global `pairs()` shows only a few fields) that walks over all fields it knows (255 per unit, 127 per weapon in `test-31820`). The export writes all of them, so nothing depends on a list of names: a field that a game or engine adds appears without a code change, a field that an older version lacks is simply missing (no error). `UNIT_FIELDS` / `WEAPON_FIELDS` in `led_export.lua` only supplement the walk and are the fallback for an engine without that function. Numbers that are not finite are `null`; left out (large): `sounds`, `weapons`, `buildOptions`, `visuals`, `cmdDescs`, `decoyFor`, `model`; tables to a depth of 3. The file is the full data set, the website takes the subset it needs.

**`editor`: what the export adds** (the key name is historical: the code comes from the Level Editor). These fields come from rules in the code (faction and group from the unit name and `customParams`, tech level from `customParams.techlevel`) and depend on the game version:

| Field | Meaning |
|---|---|
| `faction` | `arm`, `cor`, `leg`, `scv` (Scavenger copy), `rap` (raptor) |
| `group` | `buildings`, `turrets`, `bot`, `vehicle`, `hover`, `air`, `ships` |
| `tech` | 1, 2, 3 ("Epic" units count as 3) |
| `water`, `filler` | water building / sea plane; dragon teeth, walls and similar |
| `humanName`, `description` | name and description as the game shows them (English; the same fields in `game` are only keys) |
| `author` | `customParams.model_author` (credits, [licence.md](licence.md)) |
| `model` | model as the game names it, e.g. `objects3d/Units/ARMLLT.s3o` (in the pool in lower case) |
| `buildpic` | file name of the in-game picture, e.g. `ARMLLT.DDS` (`unitpics/<lower case>`, 256 x 256, DDS) |
| `shotDamage`, `shotsPerSecond`, `antiAir` | the main weapon (`Shared.shotInfo`) |
| `weapons` | one entry per weapon: all fields of the weapon definition plus `damages` (damage per armor class name: `default`, `vtol`, ...) |
| `builds` | unit names this unit can build |

Damage per second of a weapon: `damages.default * projectiles * salvoSize / reload` (anti-air weapons: class `vtol`).

## `counterparts.json`

```
{ "version": 1, "units": { "armsolar": "solar", "corsolar": "solar", "legsolar": "solar" } }
```

Unit name -> counterpart id. The id is a free text; units with the same id belong together. **One file for all game versions** (not versioned): a name without a unit in the chosen version is simply unused. The file is **meant to be corrected by hand** and kept in `website/assets/`: the first export writes a proposal, later exports only **add** units that are not in it yet; an id that is there is never changed, no line is removed. The proposal: the unit name without the three faction letters (`armsolar` -> `solar`), a Scavenger copy gets the id of its unit, a raptor its own name. Not all will be right (there is no `legllt`, the Legion light laser tower has another name and gets an id of its own until corrected). To correct: same id for units that belong together, a unique id for a unit alone; units of one faction may share an id too.

**beyondallreason.info wins over the file:** `exporter/export_counterparts.py` (without the game) reads the "counterpart" part of the unit pages of the official site and gives every group found there one id, **also over an id corrected by hand**. A correction by hand stays only for the units that the site names in no group (and for their Scavenger copies, which always get the id of their unit). The game export itself never changes an id (above).

An existing `website/assets/counterparts.json` is given to the game first. It is read with a small JSON reader (ids may contain any character, also quotes, backslashes, escapes). A file that cannot be read completely (no `"units"` object, a broken line) is left as it is and the export fails with the line number, so no id is lost. Other top-level keys are not kept.

## Using the start script

```
.\export_units.ps1 [-Out <folder>] [-Data <folder>] [-Work <folder>] [-WaitSec 300] [-Map "<name>"] [-Game "<name and version>"] [-Engine "<folder>"] [-Headless] [-PrintGame]
```

- `-Out` (default `website/assets/`, layout: [website.md](website.md), section "Data"): receives the files; at the end of the export `reduce_units.py` makes the reduced file there.
- `-Work` (default `%TEMP%\unit_export`): the sandbox with its own write folder `<Work>\data` (widget, Lua files, game script, config); the game writes only there. Removed after a successful run, kept after an error with the log `<Work>\data\infolog.txt`. The installed game is read through `SPRING_DATADIR`; no junctions are used (a leftover junction sandbox of an old script version is unlinked before anything is deleted).
- `-Map` (default `Hooked 1.1.1`, else the first installed map): any map will do; the default is small (19 MB) so that the game loads fast. Game and map are checked in the archive cache before the start, because otherwise the engine waits at a message box.
- `-Game`: default the installed one (`byar:test`, else `byar:stable`, whichever has its package installed). `-Engine`: folder name in `<Data>\engine`, default the newest (an engine that `pr-downloader` unpacked is `windows64\<version>`). `-Headless`: starts `spring-headless.exe` instead of `spring.exe`: no window and no dialog box (a message box of the installed game cannot block it), about 30 instead of 45 seconds, the same data (only the Scavenger loot boxes differ, they get a model by chance). `-PrintGame`: only prints the game that would be exported and ends, without starting anything.
- The game opens in a small framed window that is put to the back (with `-Headless`: no window) and ends itself; only the process the script started is ever stopped (after `-WaitSec`). The script explains why the game is started (the values come from the running game) and shows four steps: sandbox, game start, waiting (a note every 15 s), result.
- Exit code 1 and `ERROR: ...` on stderr if the game or map is not installed, the game ended or timed out without a result, or the widget reports an error (no units, unwritable file, broken `counterparts.json`, memory limit, ...). Nothing is copied to `-Out` then.

What the script sets (relevant if the game is started another way):
- the Lua files into `LuaUI/Include/`, the widget into `LuaUI/Widgets/`, `LuaUI/Config/WebsiteExport/quit.txt`;
- **`LuaUI/Config/BYAR.lua`** (`order = { ["Website Unit Export"] = 12345 }`, `allowUserWidgets = true`): the widget handler of older game versions (test-29183: `luaui/barwidgets.lua`, line 541) does not start a *new* user widget by itself, the game would run and the export wait for the timeout; a newer game turns it on itself;
- a random host port (20000 to 39999) in the game script, so that two exports at the same time do not meet;
- game option **`forceallunits=1`** (without it the Scavenger and Raptor units do not exist: 656 instead of 1663 units); `experimentallegionfaction=1` turns Legion on;
- engine config **`UserWidgetMemoryLimits = 0`** (BAR otherwise stops the widget with `error memory limit exceeded`; the export builds about 15 MB of text; set it only for this game instance).

## Alternative, not built: reading the unit files without the game

The unit files are Lua files in the pool (`units/<folder>/<name>.lua`) and could be read with a Lua reader (e.g. `lupa`); names and descriptions come from the language files. This would need no started game and could read older versions from their packages. Not the source because the game **changes the data when it loads it**, which a script would have to rebuild: the Scavenger copies (`*_scav`) do not exist as files, the post-processing at game start (game options, balance changes, raptors), and the derived values (damage per second, tech level, type). If it is ever built, compare its numbers with the exporter's file; the exporter stays the reference.
