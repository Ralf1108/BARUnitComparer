# Unit comparison website

A website that shows the units of Beyond All Reason (BAR) next to each other, to compare units of different factions. This repository holds this document and the tools that get the content out of the game: the **exporter** (unit data, section 3) and **render_unit** (pictures of the units, section 5). The website itself does not exist yet.

| Part | What it does | Section |
|---|---|---|
| `exporter/` | starts the installed game once and writes all unit data as JSON | 3 |
| `render_unit/` | renders a picture of every unit from the game's 3D models | 5 |
| `export and render all units.bat` | both in one go, with progress | 6 |

## 1. What the website does

- Lists **all units**: Armada, Cortex, Legion, Scavengers (the `_scav` copies) and Raptors.
- **Filters:** faction, type (`buildings`, `turrets`, `bot`, `vehicle`, `hover`, `air`, `ships`), tech level (T1 to T3); water buildings / sea planes (`water`) and fillers such as dragon teeth and walls (`filler`) are marked.
- **Equivalence:** every unit has an **equivalence id**; units with the same id are shown next to each other (one per faction, or more). A unit without partner has an id of its own.
- **Per unit:** the picture (section 5), optionally a 3D view that turns by itself or with the mouse (S3O read in the browser, section 4.2), and the values (health, costs, speed, weapons, ...).
- **Versions:** every export carries the game version; the website can offer two versions and show what changed per unit name, which units are new and which are gone (section 3.5).
- Runs locally first (a small local web server: a page opened from a file cannot load the model files); the internet only after the licence question (section 7).

## 2. How the game's files are organised

The data folder of the BAR installation (e.g. `C:\Games\Beyond-All-Reason\data`) holds the files in a pool: `packages/<hash>.sdp` is a gzip stream of entries `[1 byte length of the name][name][16 bytes md5][4 bytes crc][4 bytes size]` (the biggest `.sdp` is the game), the file of an entry is `pool/<first two hex digits of the md5>/<the other 30 digits>.gz` (gzip). Names are in lower case: `objects3d/units/armllt.s3o`, `unittextures/arm_color.dds`, `unitpics/armllt.dds`, `scripts/units/armllt.bos`. `cache/ArchiveCache*.lua` lists the installed archives (games, maps) as the engine knows them. All tools only **read** this folder.

All tools find the data folder the same way: `--data` / `-Data`, otherwise the environment variable `BAR_DATA`, otherwise the usual places; a given folder that is none is an error.

## 3. The exporter (`exporter/`)

The data comes from the **running normal game** (not from the Level Editor): it gives exactly the numbers the game uses after it has processed its unit files and game options. One game start per game version.

| File | What it is |
|---|---|
| `unit-export.lua` | widget for a plain BAR game: a moment after the start (game frame 5) it writes `units-<version>.json`, `equivalences.json` and `status.txt` ("ok ..." or "error ...") into `LuaUI/Config/WebsiteExport/` (a user widget may write only into `LuaUI/Config` and `LuaUI/Widgets`); if `quit.txt` is there, the game ends itself (`quitforce`) |
| `export_units.ps1`, `export_units.bat` | start script (PowerShell, Windows; the `.bat` is a double click): starts the game in a sandbox folder with the widget, waits, moves the result to `-Out`, deletes the sandbox |
| `lua/led_export.lua` | the export code the widget calls: `exportUnits()`, `exportEquivalence()` |
| `lua/editor_common.lua`, `lua/bar_rules.lua` | the unit catalog (faction, type, tech level, water, filler: `buildUnitCache`), the main weapon figures (`shotInfo`) and their rules |

The three Lua files are **copies** of `LevelEditor/scripts/led_export.lua`, `shared/editor_common.lua` and `shared/bar_rules.lua` of the BARLevelEditor repository (state 2026-11-05, commit `86df38f`). One change was made: `exportUnits()` / `exportEquivalence()` also return whether they succeeded, and a failed write is an error (a new copy has to keep this). `editor_common.lua` is large because the Level Editor's menus live in it; only the catalog is used. The Level Editor's own export buttons are **not** a source: the editor game changes data (the `builds` lists of 66 builders and the model fields of 16 units differ).

### 3.1 `units-<game version>.json`

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
| `author` | `customParams.model_author` (credits, section 7) |
| `model` | model as the game names it, e.g. `objects3d/Units/ARMLLT.s3o` (in the pool in lower case) |
| `buildpic` | file name of the in-game picture, e.g. `ARMLLT.DDS` (`unitpics/<lower case>`, 256 x 256, DDS) |
| `shotDamage`, `shotsPerSecond`, `antiAir` | the main weapon (`Shared.shotInfo`) |
| `weapons` | one entry per weapon: all fields of the weapon definition plus `damages` (damage per armor class name: `default`, `vtol`, ...) |
| `builds` | unit names this unit can build |

Damage per second of a weapon: `damages.default * projectiles * salvoSize / reload` (anti-air weapons: class `vtol`).

### 3.2 `equivalences.json`

```
{ "version": 1, "units": { "armsolar": "solar", "corsolar": "solar", "legsolar": "solar" } }
```

Unit name -> equivalence id. The id is a free text; units with the same id belong together. **One file for all game versions** (not versioned): a name without a unit in the chosen version is simply unused. The file is **meant to be corrected by hand** and kept in the website project: the first export writes a proposal, later exports only **add** units that are not in it yet; an id that is there is never changed, no line is removed. The proposal: the unit name without the three faction letters (`armsolar` -> `solar`), a Scavenger copy gets the id of its unit, a raptor its own name. Not all will be right (there is no `legllt`, the Legion light laser tower has another name and gets an id of its own until corrected). To correct: same id for units that belong together, a unique id for a unit alone; units of one faction may share an id too.

An existing `equivalences.json` in `-Out` is given to the game first. It is read with a small JSON reader (ids may contain any character, also quotes, backslashes, escapes). A file that cannot be read completely (no `"units"` object, a broken line) is left as it is and the export fails with the line number, so no id is lost. Other top-level keys are not kept.

### 3.3 Using the start script

```
.\export_units.ps1 [-Out <folder>] [-Data <folder>] [-Work <folder>] [-WaitSec 300] [-Map "<name>"] [-Game "<name and version>"] [-Engine "<folder>"]
```

- `-Out` (default `out` next to the script): receives both files.
- `-Work` (default `%TEMP%\unit_export`): the sandbox with its own write folder `<Work>\data` (widget, Lua files, game script, config); the game writes only there. Removed after a successful run, kept after an error with the log `<Work>\data\infolog.txt`. The installed game is read through `SPRING_DATADIR`; no junctions are used (a leftover junction sandbox of an old script version is unlinked before anything is deleted).
- `-Map` (default `Hooked 1.1.1`, else the first installed map): any map will do; the default is small (19 MB) so that the game loads fast. Game and map are checked in the archive cache before the start, because otherwise the engine waits at a message box.
- `-Game`: default the installed one (`byar:test`, else `byar:stable`, whichever has its package installed). `-Engine`: folder name in `<Data>\engine`, default the newest.
- The game opens in a small framed window that is put to the back and ends itself; only the process the script started is ever stopped (after `-WaitSec`). The script explains why the game is started (the values come from the running game) and shows four steps: sandbox, game start, waiting (a note every 15 s), result.
- Exit code 1 and `ERROR: ...` on stderr if the game or map is not installed, the game ended or timed out without a result, or the widget reports an error (no units, unwritable file, broken `equivalences.json`, memory limit, ...). Nothing is copied to `-Out` then.

What the script sets (relevant if the game is started another way):
- the Lua files into `LuaUI/Include/`, the widget into `LuaUI/Widgets/`, `LuaUI/Config/WebsiteExport/quit.txt`;
- game option **`forceallunits=1`** (without it the Scavenger and Raptor units do not exist: 656 instead of 1663 units); `experimentallegionfaction=1` turns Legion on;
- engine config **`UserWidgetMemoryLimits = 0`** (BAR otherwise stops the widget with `error memory limit exceeded`; the export builds about 15 MB of text; set it only for this game instance).

### 3.4 Alternative, not built: reading the unit files without the game

The unit files are Lua files in the pool (`units/<folder>/<name>.lua`) and could be read with a Lua reader (e.g. `lupa`); names and descriptions come from the language files. This would need no started game and could read older versions from their packages. Not the source because the game **changes the data when it loads it**, which a script would have to rebuild: the Scavenger copies (`*_scav`) do not exist as files, the post-processing at game start (game options, balance changes, raptors), and the derived values (damage per second, tech level, type). If it is ever built, compare its numbers with the exporter's file; the exporter stays the reference.

### 3.5 Several game versions (plan, not tried)

Idea: for every release get that game version, start it once with the widget, collect `units-<version>.json`; the website compares two versions per unit name (changed values, new units, gone units; a renamed unit shows up as gone and new). Open is **getting an old version to run**:
- as a package from the rapid repository (whether old versions are still on the server and how `pr-downloader` names them is unknown) or as a game folder: the BAR source (GitHub `beyond-all-reason/Beyond-All-Reason`, one tag per release) in `<data>/games/<name>.sdd`;
- the **engine** has to fit the game version (`-Engine`); an old game may not start with a new one;
- the **version string** comes from the archive name `Beyond All Reason <version>`; a checked-out folder has another name, so the version would have to be given or read from `modinfo.lua`.

A first step: two versions side by side (the installed one and one older one).

## 4. Models, textures, pictures in the game

### 4.1 The S3O format (little endian)

Header (52 bytes): `"Spring unit\0"` (12), `uint32` version (0), `float` radius, height, midX, midY, midZ, `uint32` offset of the root piece, collision data (0), offset of the name of texture 1 (colour), of texture 2 (shine, glow); names end with a 0 byte.

Piece: ten `uint32`: offset of the name, number of children, offset of the child list (`uint32` offsets of pieces), number of vertices, offset of the vertices, vertex type, primitive type (0 triangles, 1 strip, 2 quads), number of index entries, offset of the index table (`uint32` indices), collision data; then three `float` x, y, z: the offset to the parent. A vertex is eight `float`s: position, normal, u, v.

The model is the sum of all pieces, each moved by the sum of its parents' offsets. Positions are used **as they are, not mirrored**; the model's front is at +z (checked with `legnavyscout`, `legnavyconship`, `legnavyfrigate` against the website's pictures: only the unmirrored model shows the same turret and the same side with the lamps). In three.js the camera that looks at the front is on the +z side.

### 4.2 Models in the website

Not converted in advance: the website reads the `.s3o` files in the browser (JavaScript, e.g. three.js with OrbitControls: left mouse drag turns, wheel zooms, optional automatic turning). The files are small (780 models without wrecks: 99 MB, 127 KB on average, largest 911 KB) and the textures are shared. Animations are not available; the pieces are not moved.

### 4.3 Textures

All units of a faction share **one colour atlas** (the file named in the S3O, `unittextures/arm_color.dds`, `cor_color.dds`, `leg_color.dds`): 4096 x 4096, DDS, 22.4 MB each. A browser cannot read DDS: convert the three atlases once (e.g. WebP/JPEG, 2048 x 2048, 1 to 3 MB each). Raptors and some special units have their own smaller textures (`chicken_*_color.dds`). Channels (from the game's shader `modelmaterials_gl4/templates/cus_gl4.frag.glsl`): colour texture `rgb` = albedo, `a` = mask of the team colour; second texture (`*_other.dds` for Armada and Cortex, `leg_shader.dds` for Legion) `r` = emissive, `g` = metalness, `b` = roughness; normal map (`*_normal.dds`) `rgb` = normal.

### 4.4 In-game pictures

`unitpics/<buildpic>`: 256 x 256, DDS, RGBA, about 430 KB (15 to 30 KB as JPEG/WebP). They are small and show the unit from above; the website can use the rendered pictures of section 5 instead.

## 5. Pictures rendered from the models (`render_unit/`)

`render_unit.py` renders one picture per unit from the game's files, in the look of the pictures on beyondallreason.info (400 x 400 pixels, checked against that site). Needs Python with numpy and Pillow (scipy for the quality check), Node.js (the first run installs three.js and playwright-core with npm) and Microsoft Edge or Chrome.

```
python render_unit/render_unit.py [--out DIR] [--units FILE] [--format png|bmp|jpeg|avif|webp|all] [--size 400] [--jobs 4] [--team R,G,B] [-v] <unit> [<unit> ...]    (or @file with one name per line)
```

`render_unit.bat` (double click) asks for the units (Enter = `armllt`), the format (several separated by commas or `all`, default all five), the quality per format (`avif=80 jpeg=95`, Enter = defaults), the quality check and the units file; the pictures go to `render_unit/out`. Further options: `--game`, `--data`, `--work` (cache, default `%TEMP%\render_unit`), `--tex-size 2048`, `--browser`, `--param key=value` (any value of `renderer/index.html`, e.g. `sun=2.5`).

**Which model.** By default only unit names are given: the model is `objects3d/units/<unit>.s3o` (a `<unit>_scav` uses the model of its unit), the script `scripts/units/<unit>.bos`, the faction comes from the name (`_scav` = Scavengers, `raptor_` = Raptors, else the first three letters). With `--units FILE` (the `units-<version>.json` of the exporter; an error if the file is missing) model, script and faction come from `editor.model`, `game.scriptPath`, `editor.faction`. That is needed for the Raptors: the model of 1019 of the 1663 units is not named like the unit.

**Hidden pieces.** The pieces are not animated, but pieces that the unit script hides in `Create()` are left out (crown and medals of the commanders, `flare`, `nano`, `teleport`, ...). The game's script is compiled (`.cob`); its source (`.bos`, or `.lua` for 49 units; 1612 + 49 of 1663 units have one) lies next to it in the pool, and its `hide <piece>;` / `Hide(<piece>)` statements are read. Children of a hidden piece stay. Not handled: pieces hidden later than `Create()` (still drawn); 2 units without script source (all pieces shown).

**Look.** three.js in a headless browser: physical material (albedo, metalness, roughness, normal map, emissive), a light from the upper right (shadow to the lower left), own studio environment with a warm ground, saturation x1.25 and gamma 1.2, soft shadow on an invisible ground a little below the unit. Camera from the front left (azimuth 324, 34 degrees up, tilted 12 degrees), the unit fills 80 % of the square. Compared with the website (three units): shadow offset and size, brightness and saturation within a few percent; the underside of the hull is a bit lighter, lamps glow a bit less. The colour atlases are scaled to 2048 pixels once per texture set (RGB and alpha separately: Pillow scales RGBA with premultiplied alpha and would wipe out the team mask colour).

**Team colours** (the mask is the alpha of the colour texture): Armada blue (90, 140, 235), Cortex red (235, 85, 75), Legion green (130, 218, 105), Scavengers purple (175, 105, 225), Raptors black (20, 20, 20); `--team R,G,B` sets one colour for all. The raptor textures have a small mask (about 6 % of the pixels, faction atlases 4 to 11 %), so only those parts become black; the rest keeps its own colours.

**Formats and quality.** The browser renders a lossless PNG with transparent background (the shadow is semi-transparent); the wanted formats are made from it. BMP and JPEG have no transparency (white background). Defaults: `--avif-quality 70`, `--webp-quality 85`, `--jpeg-quality 90` (each 0 to 100), `--avif-speed 6`, `--webp-method 4`, `--jpeg-subsampling 0` (4:4:4). With two or more formats a **quality check** measures every format against the lossless picture (PSNR in dB, SSIM, PSNR of the alpha channel, mean size) and prints a table; `--no-quality-check` switches it off, `render_unit/compare_quality.py` does the same for a grid of settings. Measured on `armllt`, `legnavyscout`, `armcom`, `corkarg`, `legcom` (PNG 87 KB; PSNR above 40 dB is hardly visible, SSIM above 0.99 looks the same):

| Format and setting | Size | PSNR | SSIM |
|---|---|---|---|
| JPEG 90, 4:2:0 | 21.8 KB | 37.5 | 0.9942 |
| JPEG 90, 4:4:4 (default) | 27.7 KB | 41.4 | 0.9942 |
| WebP 80 | 13.6 KB | 37.4 | 0.9920 |
| WebP 85 (default) | 15.4 KB | 38.1 | 0.9946 |
| AVIF 60 | 9.3 KB | 36.9 | 0.9901 |
| AVIF 70 (default) | 11.8 KB | 38.0 | 0.9945 |
| AVIF 90 | 18.8 KB | 39.3 | 0.9986 |

At the same SSIM AVIF is the smallest (12 KB, WebP 15 KB, JPEG 28 KB). The alpha (shadow) keeps 57 to 63 dB in AVIF and is lossless in WebP. The defaults were chosen so that edges and fine textures show no visible noise; 1663 pictures at AVIF 70 are about 20 MB.

**Speed.** The browser renders with software OpenGL, i.e. on the processor. `--jobs N` browsers work at the same time (default: half of the processor cores, at most 4: 8 cores give 4); each keeps one page open for all its pictures (renderer, environment, lights and compiled shader are made once, only model and textures change); texture conversion and encoding are spread over `--jobs` as well. Measured with 20 units on 8 cores: 1 browser 20 s, 2 browsers 14 s, 4 browsers 12 s, 8 browsers 14 s (one browser alone already uses about 3.5 cores). About 0.6 s per picture with 4 browsers. `-v` shows the time of each phase, `--param timing=1` the times inside the page. `renderer/render.mjs` runs a tiny web server on `127.0.0.1` (random port) for the time of the run, because a page opened from a file cannot load models and modules; it has nothing to do with the website.

## 6. Everything in one go: `export and render all units.bat`

In the root of the repository (starts `export_and_render_all_units.ps1`). It asks which factions to render (`all`, or `arm`, `cor`, `leg`, `scv`, `rap`, several separated by commas) and in which format (`avif` = default, `webp`, `jpeg`, `png`, `bmp`, several separated by commas, or `all` = all five; nothing more is asked: quality and size are the defaults), shows what it will do and asks for confirmation on the console. Then:
1. runs the exporter (always complete) and shows only its four steps; the result is in `exporter/out`;
2. renders every wanted unit of the new `units-<version>.json` with `render_unit.py --units <that file>` in the chosen format (default quality and size, no quality check) into `out/` of the repository (`.gitignore`), 80 units per call. One line shows the progress while it works (the pictures of a call are counted as they appear): `done / total`, percentage, the unit that was rendered last, the size of the finished pictures, elapsed time, and the ETA together with the seconds per picture it is calculated from.

**Going on after an abort:** pictures that are there already are skipped (all files of the chosen formats present and not older than the start of the first run for this game version, kept in `out/.render_state.json`; a new game version or `-Force` starts again). Files are written complete or not at all (`render_unit.py` writes `<file>.part` and renames it), so a run can be stopped at any time and started again; `render_unit.py --skip-existing` does the same for the single script.

Summary at the end: pictures made and failed (failed ones in `out/render_errors.txt`), total size, size per picture, times; then it waits for a key. PowerShell parameters (the `.bat` passes them on): `-Faction <list>` and `-Format <list>` instead of the questions, `-Force` (render everything again), `-Limit <n>` (first n units, for tests), `-Yes` (no questions). A test run (`-Faction rap,leg -Limit 25`) took 71 s with the first, slower version (export 29 s); the full set of about 1700 units is estimated at 20 minutes.

## 7. Licence (home use first)

The licence file of the game (`LICENSE.md` of the Beyond-All-Reason repository): the **code** is GPL v2; **models by Cremuss** are CC BY-SA 4.0; **all other models and textures** are CC BY-NC-ND 4.0 (Beherith): no derivative work, no repackaging, no use outside BAR; **animations** CC BY-NC-ND 4.0; pictures and icons have their own licence files (without them: all rights reserved). So the website is for **home use**: the files stay in the own game and project folders and are **not published**. Putting it on the internet needs the permission of the BAR developers, or has to be limited to what the licences allow (models by Cremuss with credit, `editor.author`); the numbers (code of the unit definitions) are GPL v2. Rendered pictures and converted textures are probably derivative work as well: ask before publishing them.

## 8. Next steps and open points

- Correct `equivalences.json` by hand and keep it in the website project.
- Choose the final picture format and quality for the website (AVIF 70 is the default so far).
- Build the website: filter bar (faction, type, tech level, search), list, comparison view (all units of an id side by side), optional 3D view; first as a local page with a small web server.
- Try the exporter with an older game version (section 3.5).
- Not covered: units of other games or mods (the file has what the running game knows); animations; shine and glow in the 3D view (texture 2 of the S3O) if it is built with colour only at first.
