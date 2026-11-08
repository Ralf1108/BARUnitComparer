# BAR Unit Comparer: the tools

The project shows the units of Beyond All Reason (BAR) next to each other, to compare units of different factions. This document describes the tools that get the content out of the game: the **exporter** (unit data, section 3) and **render_unit** (pictures of the units, section 5). The website is described in [SPECIFICATION_WEBSITE.md](SPECIFICATION_WEBSITE.md).

| Part | What it does | Section |
|---|---|---|
| `exporter/` | starts the installed game once and writes all unit data as JSON | 3 |
| `render_unit/` | renders a picture of every unit from the game's 3D models | 5 |
| `export and render all units.bat` | both in one go, with progress | 6 |
| `shared/` | what the Python and PowerShell tools share: data folder, game files, faction and version rules | 2 |
| `exporter/export_counterparts.py`, `export_counters.py` | counterparts and counters from beyondallreason.info, without the game | [exporter/README.md](exporter/README.md) |
| `website/` | the website: unit catalog and comparison | [SPECIFICATION_WEBSITE.md](SPECIFICATION_WEBSITE.md) |

## 1. The website

Unit catalog and comparison of any number of units: [SPECIFICATION_WEBSITE.md](SPECIFICATION_WEBSITE.md). It takes its data from the files of section 2, the values from `units-<version>.reduced.json.gz` (section 3), the pictures from section 5.

## 2. How the game's files are organised

The data folder of the BAR installation (e.g. `C:\Games\Beyond-All-Reason\data`) holds the files in a pool: `packages/<hash>.sdp` is a gzip stream of entries `[1 byte length of the name][name][16 bytes md5][4 bytes crc][4 bytes size]` (the biggest `.sdp` is the game), the file of an entry is `pool/<first two hex digits of the md5>/<the other 30 digits>.gz` (gzip). Names are in lower case: `objects3d/units/armllt.s3o`, `unittextures/arm_color.dds`, `unitpics/armllt.dds`, `scripts/units/armllt.bos`. `cache/ArchiveCache*.lua` lists the installed archives (games, maps) as the engine knows them. All tools only **read** this folder.

All tools write into `website/assets/`, per game version (checked in, so a deleted or overwritten result can be restored; of a later version only what differs from the base version, section 3.5):

```
website/assets/                                everything the tools make
  counterparts.json                            unit name -> counterpart id, for all versions; groups of beyondallreason.info win, the rest can be corrected by hand (section 3.2)
  counters.json                                unit name -> the units that counter it (exporter/export_counters.py, SPECIFICATION_WEBSITE.md)
  versions.json                                the game versions there are, oldest first, with their date; one of them is the base version
  <base version>/                              the base version (the first one exported): everything
    data/units-<version>.json                  all data of the exporter
    data/units-<version>.reduced.json.gz       what the website shows
    data/pictures.json                         the fingerprint of every unit's picture (model, textures, hidden pieces, faction)
    images/<unit>.<format>                     the pictures
    images/icons/<file>.png                    the role icons of the game version
  <other version>/                             every other version: only what differs from the base version
    data/units-<version>.json                  all data of the exporter (local only, not in Git: .gitignore)
    data/units-<version>.diff.json.gz          the units whose values or picture differ, the new units, the names of the units that are gone
    images/<unit>.<format>                     only the pictures that differ from the base
    images/icons/<file>.png                    only the icons that differ from the base
```

All tools find the data folder the same way: `--data` / `-Data`, otherwise the environment variable `BAR_DATA`, otherwise the usual places (`shared/data_dirs.txt`); a data folder has the folders `packages` and `pool`, a given folder that is none is an error.

What the tools share is in `shared/`: `bar_common.py` for the Python tools (data folder, archive cache and pool of the game, faction of a unit by its name, version in file names, pages of beyondallreason.info, unit names of the newest version) and `BarCommon.ps1` for the PowerShell scripts (data folder, faction, version in file names, picture extension), with the same rules; both read `data_dirs.txt`. The Lua files of the exporter keep their own copies (they run inside the game).

## 3. The exporter (`exporter/`)

The data comes from the **running normal game** (not from the Level Editor): it gives exactly the numbers the game uses after it has processed its unit files and game options. One game start per game version.

| File | What it is |
|---|---|
| `unit-export.lua` | widget for a plain BAR game: a moment after the start (game frame 5) it writes `units-<version>.json`, `counterparts.json` and `status.txt` ("ok ..." or "error ...") into `LuaUI/Config/WebsiteExport/` (a user widget may write only into `LuaUI/Config` and `LuaUI/Widgets`); if `quit.txt` is there, the game ends itself (`quitforce`) |
| `export_units.ps1`, `export_units.bat` | start script (PowerShell, Windows; the `.bat` is a double click): starts the game in a sandbox folder with the widget, waits, moves the result to `-Out`, deletes the sandbox, runs `reduce_units.py` |
| `reduce_units.py` | makes the small data file of the website from `units-<version>.json` (`SPECIFICATION_WEBSITE.md`, section 1); it is written next to the full file, the icons to `images/icons/` of that version |
| `lua/led_export.lua` | the export code the widget calls: `exportUnits()`, `exportCounterparts()` |
| `lua/unit_catalog.lua`, `lua/bar_rules.lua` | the unit catalog (faction, type, tech level, water, filler: `buildUnitCache`), the main weapon figures (`shotInfo`) and their rules |

The three Lua files are **copies** of `LevelEditor/scripts/led_export.lua`, `shared/editor_common.lua` and `shared/bar_rules.lua` of the BARLevelEditor repository (state 2026-11-05, commit `86df38f`); `unit_catalog.lua` is the part of `editor_common.lua` the export needs (`FACTIONS`, `GROUPS`, `factionOf`, `shotInfo`, `buildUnitCache` and their helpers, copied unchanged; the Level Editor takes the same file over and loads it from `editor_common.lua`). One change was made: `exportUnits()` / `exportCounterparts()` also return whether they succeeded, and a failed write is an error (a new copy has to keep this). The Level Editor's own export buttons are **not** a source: the editor game changes data (the `builds` lists of 66 builders and the model fields of 16 units differ).

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

### 3.2 `counterparts.json`

```
{ "version": 1, "units": { "armsolar": "solar", "corsolar": "solar", "legsolar": "solar" } }
```

Unit name -> counterpart id. The id is a free text; units with the same id belong together. **One file for all game versions** (not versioned): a name without a unit in the chosen version is simply unused. The file is **meant to be corrected by hand** and kept in `website/assets/`: the first export writes a proposal, later exports only **add** units that are not in it yet; an id that is there is never changed, no line is removed. The proposal: the unit name without the three faction letters (`armsolar` -> `solar`), a Scavenger copy gets the id of its unit, a raptor its own name. Not all will be right (there is no `legllt`, the Legion light laser tower has another name and gets an id of its own until corrected). To correct: same id for units that belong together, a unique id for a unit alone; units of one faction may share an id too.

**beyondallreason.info wins over the file:** `exporter/export_counterparts.py` (without the game) reads the "counterpart" part of the unit pages of the official site and gives every group found there one id, **also over an id corrected by hand**. A correction by hand stays only for the units that the site names in no group (and for their Scavenger copies, which always get the id of their unit). The game export itself never changes an id (above).

An existing `website/assets/counterparts.json` is given to the game first. It is read with a small JSON reader (ids may contain any character, also quotes, backslashes, escapes). A file that cannot be read completely (no `"units"` object, a broken line) is left as it is and the export fails with the line number, so no id is lost. Other top-level keys are not kept.

### 3.3 Using the start script

```
.\export_units.ps1 [-Out <folder>] [-Data <folder>] [-Work <folder>] [-WaitSec 300] [-Map "<name>"] [-Game "<name and version>"] [-Engine "<folder>"]
```

- `-Out` (default `website/assets/`, layout in section 2): receives the files; at the end of the export `reduce_units.py` makes the reduced file there.
- `-Work` (default `%TEMP%\unit_export`): the sandbox with its own write folder `<Work>\data` (widget, Lua files, game script, config); the game writes only there. Removed after a successful run, kept after an error with the log `<Work>\data\infolog.txt`. The installed game is read through `SPRING_DATADIR`; no junctions are used (a leftover junction sandbox of an old script version is unlinked before anything is deleted).
- `-Map` (default `Hooked 1.1.1`, else the first installed map): any map will do; the default is small (19 MB) so that the game loads fast. Game and map are checked in the archive cache before the start, because otherwise the engine waits at a message box.
- `-Game`: default the installed one (`byar:test`, else `byar:stable`, whichever has its package installed). `-Engine`: folder name in `<Data>\engine`, default the newest. `-PrintGame`: only prints the game that would be exported and ends, without starting anything.
- The game opens in a small framed window that is put to the back and ends itself; only the process the script started is ever stopped (after `-WaitSec`). The script explains why the game is started (the values come from the running game) and shows four steps: sandbox, game start, waiting (a note every 15 s), result.
- Exit code 1 and `ERROR: ...` on stderr if the game or map is not installed, the game ended or timed out without a result, or the widget reports an error (no units, unwritable file, broken `counterparts.json`, memory limit, ...). Nothing is copied to `-Out` then.

What the script sets (relevant if the game is started another way):
- the Lua files into `LuaUI/Include/`, the widget into `LuaUI/Widgets/`, `LuaUI/Config/WebsiteExport/quit.txt`;
- game option **`forceallunits=1`** (without it the Scavenger and Raptor units do not exist: 656 instead of 1663 units); `experimentallegionfaction=1` turns Legion on;
- engine config **`UserWidgetMemoryLimits = 0`** (BAR otherwise stops the widget with `error memory limit exceeded`; the export builds about 15 MB of text; set it only for this game instance).

### 3.4 Alternative, not built: reading the unit files without the game

The unit files are Lua files in the pool (`units/<folder>/<name>.lua`) and could be read with a Lua reader (e.g. `lupa`); names and descriptions come from the language files. This would need no started game and could read older versions from their packages. Not the source because the game **changes the data when it loads it**, which a script would have to rebuild: the Scavenger copies (`*_scav`) do not exist as files, the post-processing at game start (game options, balance changes, raptors), and the derived values (damage per second, tech level, type). If it is ever built, compare its numbers with the exporter's file; the exporter stays the reference.

### 3.5 Several game versions: the base version and the differences

Every game version that is installed can be exported (`-Game "Beyond All Reason <version>"`; the launcher keeps the older packages: on this machine twelve versions from test-31450 to test-31836). Tried with test-31450 (2026-09-29), test-31820 and test-31836: each starts with the newest engine.

**Base version:** the first version exported (test-31820) keeps everything: the reduced file of all units and all pictures. **Every other version keeps only what differs from it** (`exporter/reduce_units.py`): `units-<version>.diff.json.gz` with the units whose values (the reduced fields) or picture differ, the units that are new (both with their whole reduced entry) and the names of the units that are gone; in its `images/` only the pictures (and icons) that differ. Its full export stays local (`.gitignore`). Measured: test-31450 against test-31820: 149 of 1660 units differ, 111 of them with another picture, 4 are gone; diff file 5.6 KB, pictures 1.3 MB (instead of 54 KB and 27 MB for a full version). test-31836 against test-31820: nothing the page shows differs (diff file 0.1 KB, no picture).

**A picture differs** if its **fingerprint** differs: an md5 over the md5 of the model file, the three textures (the pool knows the md5 of every file, nothing has to be read but the model), the pieces the script hides when the unit is created and the faction colour (`render_unit.picture_fingerprints`, the same inputs as the rendering). Of the script only the hidden pieces count: test-31836 changed the script of `legkark`, but not what it hides. The fingerprints of the base are kept in `data/pictures.json`, so a later version is compared without rendering anything; only the pictures that differ are rendered (`reduce_units.py --pictures <folder>` lists them for `export_and_render_all_units.ps1`). Without the game installed there are no fingerprints: then only the values are compared.

**Chance in the game:** the Scavenger loot boxes (`lootbox*`) get one of two models by chance at every start of the game (`unitbasedefs/lootboxes/lootboxnano.lua`: `math.random(1, 2)`): two exports of the same version differ there. Their pictures are not compared (`RANDOM_MODEL` in `reduce_units.py`).

**Date of a version:** the version name ends with the short hash of the commit of the Beyond All Reason repository it was built from (`test-31836-b250a16`); the date of that commit (GitHub API, `/repos/beyond-all-reason/Beyond-All-Reason/commits/<hash>`) is the date in `versions.json`. It is asked once per version; the dates there are kept.

A renamed unit shows up as gone and new. If the base version is ever to be changed: make the new base's reduced file with everything (delete the old one, `--force`), then all diff files again.

## 4. Models, textures, pictures in the game

### 4.1 The S3O format (little endian)

Header (52 bytes): `"Spring unit\0"` (12), `uint32` version (0), `float` radius, height, midX, midY, midZ, `uint32` offset of the root piece, collision data (0), offset of the name of texture 1 (colour), of texture 2 (shine, glow); names end with a 0 byte.

Piece: ten `uint32`: offset of the name, number of children, offset of the child list (`uint32` offsets of pieces), number of vertices, offset of the vertices, vertex type, primitive type (0 triangles, 1 strip, 2 quads), number of index entries, offset of the index table (`uint32` indices), collision data; then three `float` x, y, z: the offset to the parent. A vertex is eight `float`s: position, normal, u, v.

The model is the sum of all pieces, each moved by the sum of its parents' offsets. Positions are used **as they are, not mirrored**; the model's front is at +z (checked with `legnavyscout`, `legnavyconship`, `legnavyfrigate` against the website's pictures: only the unmirrored model shows the same turret and the same side with the lamps). In three.js the camera that looks at the front is on the +z side.

### 4.2 Models in the website

A 3D view is not built yet. The plan: no conversion in advance, the website reads the `.s3o` files in the browser (JavaScript, e.g. three.js with OrbitControls: left mouse drag turns, wheel zooms, optional automatic turning). The files are small (780 models without wrecks: 99 MB, 127 KB on average, largest 911 KB) and the textures are shared. Animations are not available; the pieces are not moved.

### 4.3 Textures

All units of a faction share **one colour atlas** (the file named in the S3O, `unittextures/arm_color.dds`, `cor_color.dds`, `leg_color.dds`): 4096 x 4096, DDS, 22.4 MB each. A browser cannot read DDS: a 3D view on the website would need the three atlases converted once (e.g. WebP/JPEG, 2048 x 2048, 1 to 3 MB each). Raptors and some special units have their own smaller textures (`chicken_*_color.dds`). Channels (from the game's shader `modelmaterials_gl4/templates/cus_gl4.frag.glsl`): colour texture `rgb` = albedo, `a` = mask of the team colour; second texture (`*_other.dds` for Armada and Cortex, `leg_shader.dds` for Legion) `r` = emissive, `g` = metalness, `b` = roughness; normal map (`*_normal.dds`) `rgb` = normal.

### 4.4 In-game pictures

`unitpics/<buildpic>`: 256 x 256, DDS, RGBA, about 430 KB (15 to 30 KB as JPEG/WebP). They are small and show the unit from above; the website uses the rendered pictures of section 5 instead.

## 5. Pictures rendered from the models (`render_unit/`)

`render_unit.py` renders one picture per unit from the game's files, in the look of the pictures on beyondallreason.info (400 x 400 pixels, checked against that site). Needs Python with numpy and Pillow (scipy for the quality check), Node.js (the first run installs three.js and playwright-core with npm) and Microsoft Edge or Chrome.

```
python render_unit/render_unit.py [--out DIR] [--units FILE] [--format png|bmp|jpeg|avif|webp|all] [--size 400] [--jobs 4] [--software] [--team R,G,B] [-v] <unit> [<unit> ...]    (or @file with one name per line)
```

`render_unit.bat` (double click) asks for the units (Enter = `armllt`), the format (several separated by commas or `all`, default all five), the quality per format (`avif=80 jpeg=95`, Enter = defaults), the quality check and the units file; the pictures go to `website/assets/<version>/images/`. Further options: `--game`, `--data`, `--work` (cache, default `%TEMP%\render_unit`), `--tex-size 2048`, `--browser`, `--param key=value` (any value of `renderer/index.html`, e.g. `sun=2.5`).

**Which model.** By default only unit names are given: the model is `objects3d/units/<unit>.s3o` (a `<unit>_scav` uses the model of its unit), the script `scripts/units/<unit>.bos`, the faction comes from the name (`_scav` = Scavengers, `raptor_` = Raptors, else the first three letters). With `--units FILE` (the `units-<version>.json` of the exporter; an error if the file is missing) model, script and faction come from `editor.model`, `game.scriptPath`, `editor.faction`. That is needed for the Raptors: the model of 1019 of the 1663 units is not named like the unit.

**Model formats.** One module per format, on both sides, with the same interface; `render_unit.py` and `renderer/index.html` are the shared part (textures, material, light, shadow, camera, formats). Game side (`render_unit/`): `s3o_model.py` (S3O: the texture names are in the header) and `dae_model.py` (Collada: the texture names come from the Lua file next to the model, `<model>.dae.lua` with `tex1`/`tex2`, and the normal map from `customParams.normaltex`); each has `EXTENSION`, `recognizes(model, data)` and `textures(...)`. Browser side (`render_unit/renderer/`): `s3o_loader.js` and `dae_loader.js`, each `loadModel(url, hidden)` -> one `BufferGeometry` (Y up, front at +z); `index.html` picks the loader by the extension of the model file and loads it only when needed. S3O is used by 1662 of the 1663 units of `test-31820`; the one Collada model is `objects3d/raptors/raptorartillery.dae` (Blender export, Z up, one skinned mesh with 29 bones, no animation): it is read with the three.js `ColladaLoader` in the rest pose, the Z-up to Y-up rotation puts the front (Blender -Y) at +z like with S3O (checked with the bone positions: front legs at -Y, tail at +Y). A model in a format without a module is skipped with a note (`SKIP ...`), not an error. A new format needs one Python and one JavaScript module and an entry in `MODEL_FORMATS` (`render_unit.py`) and `loaders` (`index.html`).

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

**Speed.** The browser renders on the **graphics card** by default (`--software` renders on the processor with SwiftShader, which is what it falls back to by itself when no usable GPU is there; the first line of the log shows which renderer is used). `--jobs N` browsers work at the same time (default: half of the processor cores, at most 4); each keeps one page open for all its pictures (renderer, environment, lights and the compiled shader are made once, only model and textures change). The units are sorted by texture set and given to the browsers in contiguous parts, and the page keeps the textures of the last unit, so a texture set is decoded once for all units that use it. Texture conversion and encoding are spread over `--jobs` as well. Measured with 30 mixed units on 8 cores and an NVIDIA RTX 3070 (rendering only, lossless PNG): processor, 4 browsers, first version 15.6 s; processor with the texture cache 13.8 s; **GPU** 1 browser 7.2 s, 2 browsers 4.2 s, **4 browsers 3.4 s**, 8 browsers 3.6 s (more than 4 does not help: the rest is decoding the textures and taking the screenshot on the processor). End to end with AVIF: 4.4 s on the GPU (about 0.15 s per picture including the start), 14.7 s on the processor. The GPU pictures are not pixel-identical to the software ones, but very close: PSNR 43 dB on average (lowest 40), SSIM 0.998 (lowest 0.996), differences only at edges (anti-aliasing and texture filtering); the pictures with and without the texture cache are identical. `-v` shows the time of each phase, `--param timing=1` the times inside the page. `renderer/render.mjs` runs a tiny web server on `127.0.0.1` (random port) for the time of the run, because a page opened from a file cannot load models and modules; it has nothing to do with the website.

## 6. Everything in one go: `export and render all units.bat`

In the root of the repository (starts `export_and_render_all_units.ps1`). It asks for the factions (`all`, or `arm`, `cor`, `leg`, `scv`, `rap`) and the picture format (`avif` = default, `webp`, `jpeg`, `png`, `bmp`, several separated by commas, or `all`), finds the game version without starting the game, shows what is to do and asks for confirmation. Then, **every step only if its result is missing**:

1. **Export:** `website/assets/<version>/data/units-<version>.json`; if it is missing the exporter runs and shows only its four steps.
2. **Reduced data of the website:** `website/assets/<version>/data/units-<version>.reduced.json.gz` of the base version, `units-<version>.diff.json.gz` of every other one (`exporter/reduce_units.py`; section 3.5, `SPECIFICATION_WEBSITE.md`, section 1). The pictures of step 3 are then only the ones that differ from the base.
3. **Pictures:** `website/assets/<version>/images/<unit>.<format>`, only for the units whose files are missing (`render_unit.py --units <that file> --game <that version>`, default quality and size), 80 units per call. One line shows the progress, rewritten every 20 pictures and never longer than the window: `done / total`, percentage, the size of the finished pictures, elapsed time, the ETA with the seconds per picture it is calculated from, the last unit.

So a run can be stopped at any time and started again: it goes on where it stopped. Files are written complete or not at all (`<file>.part`, then renamed). A new game version gets its own folder.

Summary at the end: pictures done, made now, there already and failed (failed ones in `website/assets/<version>/images/render_errors.txt`), total size, size per picture, times; then it waits for a key. PowerShell parameters (the `.bat` passes them on): `-Faction <list>` and `-Format <list>` instead of the questions, `-Game "Beyond All Reason <version>"` (another installed version), `-Force` (all three steps again), `-Out <folder>` (instead of `website/assets/`, for tests), `-Limit <n>` (first n units, for tests), `-Yes` (no questions). Rendering all 1663 units takes about 2.5 minutes on an RTX 3070, the export 30 seconds.

## 7. Licence

The licence file of the game (`LICENSE.md` of the Beyond-All-Reason repository): the **code** is GPL v2; **models by Cremuss** are CC BY-SA 4.0; **all other models and textures** are CC BY-NC-ND 4.0 (Beherith): no derivative work, no repackaging, no use outside BAR; **animations** CC BY-NC-ND 4.0; pictures and icons have their own licence files (without them: all rights reserved). The numbers (code of the unit definitions) are GPL v2.

The rendered pictures, the role icons and the converted textures are probably derivative work of the CC BY-NC-ND content. **Decision of the project owner (2026-11-05):** the repository stays public, `website/assets/` (data, pictures, icons) is checked in and the site is published with GitHub Pages (`SPECIFICATION_WEBSITE.md`, section 6) first; the BAR developers are asked afterwards whether that is in order, so that they can look at the site, and the pictures are taken down if they object. The site says on every page that it is an unofficial fan project and that content is removed on request. The risk of this order is that the pictures stay in the history of the repository even after they are taken down (removing them from it means rewriting the history).

## 8. Next steps and open points

- Ask the BAR developers whether the published pictures and the site are in order (section 7).
- Correct `website/assets/counterparts.json` by hand.
- Choose the final picture format and quality for the website (AVIF 70 is the default so far).
- Not covered: units of other games or mods (the file has what the running game knows); animations; shine and glow in the 3D view (texture 2 of the S3O) if it is built with colour only at first.
