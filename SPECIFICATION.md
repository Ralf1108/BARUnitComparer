# Unit comparison website

A website that shows the units of Beyond All Reason next to each other, to compare units of different factions. This project holds this document (`SPECIFICATION.md`) and the extractor (`extractor/`, section 10), which gets the unit data out of the normal game. The website itself does not exist yet; this document describes the plan and the data, and what the website still has to take from the game files itself.

## 1. What the website does

- Lists **all units** of the game: Armada, Cortex, Legion, Scavengers (the `_scav` copies) and Raptors.
- **Filters**: faction, type (`buildings`, `turrets`, `bot`, `vehicle`, `hover`, `air`, `ships`) and tech level (T1, T2, T3). Water buildings / sea planes are marked (`water`), fillers (dragon teeth, walls) are marked (`filler`).
- **Equivalence:** every unit has an **equivalence id**. All units with the same id are shown next to each other (two, three or more: one per faction, and so on). A unit without partner has an id of its own and is shown alone.
- **Per unit:** the picture, the 3D model that turns by itself or with the mouse, and the values (health, costs, speed, weapons, ...).
- **3D view:** left mouse button held and dragged turns the model, the mouse wheel zooms in and out, and the model may also turn by itself (switchable). Only the colour texture is used (no shine, no glow, no normal map for now).
- Runs locally first (a small local web server, `http://localhost`); putting it on the internet may come later (see section 7).

## 2. What the extractor exports

The data is written by `extractor/lua/led_export.lua`, called by the extraction widget in a normal game (section 10). The data comes from the game's unit definitions (`UnitDefs` and `WeaponDefs`). The files are UTF-8. The start script copies them to its folder `-Out`.

### 2.1 `units-<game version>.json`

The **name of the file carries the version of the game** it was exported from, e.g. `units-test-31820-45ea098.json` (every character other than letters, digits, `.`, `_` and `-` in the version becomes `_`), so the exports of several versions lie side by side. The version is read from the loaded archive named `Beyond All Reason <version>` (`VFS.GetLoadedArchives()`). It is also **in the file** (`gameVersion`, with `gameName` "Beyond All Reason"), so the website can show it and offer several versions (section 11).

```
{ "format": 1, "gameName": "<game name>", "gameVersion": "<game version as the game reports it>", "count": <number of units>, "units": {
"armllt": { "game": { ... }, "editor": { ... } },
...
}}
```

One unit per line, sorted by unit name; keys inside are sorted, so two exports of the same game give the same file. Size and number of units: section 10.

- `game`: **the fields of the unit definition as they are** (everything that is a number, a text, a truth value or a table, e.g. `health`, `metalCost`, `energyCost`, `buildTime`, `speed`, `sightDistance`, `radarDistance`, `xsize`, `zsize`, `canFly`, `buildSpeed`, `customParams`, `modCategories`, `moveDef`, ...). Numbers that are not finite are `null`. Left out (large, no use on a page): `sounds`, `weapons`, `buildOptions`, `visuals`, `cmdDescs`, `decoyFor`, `model`. Tables are written to a depth of 3.
- `editor`: what the export adds (the key is called `editor` because the code comes from the Level Editor, section 10; the file format stays as it is):

| Field | Meaning |
|---|---|
| `faction` | `arm`, `cor`, `leg`, `scv` (Scavenger copy), `rap` (raptor) |
| `group` | `buildings`, `turrets`, `bot`, `vehicle`, `hover`, `air`, `ships` |
| `tech` | 1, 2 or 3 (`customParams.techlevel`, "Epic" units count as 3) |
| `water` | true for water buildings and sea planes |
| `filler` | true for dragon teeth, walls and similar |
| `humanName`, `description` | the name and the description as the game shows them (English) |
| `author` | `customParams.model_author`: who made the model (needed for the credits, see section 7) |
| `model` | the model of the unit as the game names it, e.g. `objects3d/Units/ARMLLT.s3o` (the file in the game is in lower case, see section 5) |
| `buildpic` | the file name of the picture (see section 4) |
| `shotDamage`, `shotsPerSecond`, `antiAir` | the main weapon (`Shared.shotInfo`): damage per shot, shots per second, true if it is an anti-air weapon |
| `weapons` | one entry per weapon: **all fields of the weapon definition** (`range`, `reload`, `projectiles`, `salvoSize`, `areaOfEffect`, `weaponType`, `customParams`, ...) and `damages`: the damage per armor class name (`default`, `vtol`, ...) |
| `builds` | the unit names this unit can build (empty if none) |

The damage per second of a weapon is `damages.default * projectiles * salvoSize / reload` (anti-air weapons carry their damage in the class `vtol`).

### 2.2 `equivalences.json`

```
{
"version": 1,
"units": {
	"armsolar": "solar",
	"corsolar": "solar",
	"legsolar": "solar"
}
}
```

Unit name -> equivalence id. **The id is a free text**, units with the same id belong together. **There is only one `equivalences.json`, for all game versions: it is not versioned.** It only maps unit names to ids; a name that has no unit in the chosen game version is simply not used. This file is **meant to be corrected by hand** (and kept in the website project): the first extraction writes a proposal, and afterwards an extraction only **adds** the units that are not in the file yet (new units of a game update); it never changes an id that is already there and never removes a line. The proposal: the unit name without the three faction letters (`armsolar`, `corsolar`, `legsolar` give `solar`); a Scavenger copy gets the id of its unit (`armllt_scav` gives `llt`), a raptor its own name. Many pairs will be right, but not all: factions name some units differently (there is no `legllt`: the Legion light laser tower has another name, so it gets an id of its own until it is corrected), and some units have no partner. The file is read with a small JSON reader (ids may contain any character, also quotes, backslashes and escapes like `é`). A file that cannot be read completely (no `"units"` object, a broken line) is left as it is and the extraction reports an error with the line (section 10), so no id is lost. The file is written again with the unit/id pairs alone; other top-level keys are not kept.

How to correct: give the units that belong together the same id (any text), give a unit alone an id that nobody else has. Several units of one faction may share an id as well (for example an `llt` and an upgraded version of it, if they should be shown together).

## 3. The 3D models (S3O in the browser)

The models are **not** converted in advance: the game's own files (`.s3o`) are read by the website in the browser (JavaScript, e.g. with three.js; OrbitControls give the mouse control of section 1). Reason: the model files are small (780 models without wrecks: 99 MB in all, 127 KB each on average, the largest 911 KB), and the textures are shared (section 3.2), so nothing is saved by converting them into a bigger format with the texture inside.

### 3.1 The S3O format (little endian)

Header (52 bytes): 12 bytes `"Spring unit\0"`, `uint32` version (0), `float` radius, `float` height, `float` midX, midY, midZ, `uint32` offset of the root piece, `uint32` collision data (0), `uint32` offset of the name of texture 1 (colour), `uint32` offset of the name of texture 2 (the "other" texture: shine, glow), the names are texts ending with a 0 byte.

Piece at an offset: ten `uint32`: offset of the name, number of children, offset of the list of children (`uint32` offsets of pieces), number of vertices, offset of the vertices, vertex type, primitive type (0 triangles, 1 triangle strip, 2 quads), number of entries of the index table, offset of the index table (`uint32` indices into the vertices), collision data; then three `float` x, y, z: the offset of the piece to its parent. A vertex is eight `float`s: position (3), normal (3), texture coordinate u, v (2).

The model is the sum of all pieces, each moved by the sum of the offsets of its parents (the pieces are not animated in the website). The vertex positions are used **as they are**, without mirroring: the game draws them in an OpenGL-style right-handed system, the unit looks along +z, and the model's front is at +z. (An earlier draft of this document said that z has to be mirrored and the triangle corners reversed; that was wrong and gives a mirror image of the unit. Checked with three units, `legnavyscout`, `legnavyconship` and `legnavyfrigate`: only the unmirrored model, seen from the right camera side, shows the same picture as the website: the same turret, the same side with the lamps.) In three.js the camera that looks at the front of the unit is therefore on the +z side.

### 3.2 Textures

All units of a faction share **one colour atlas**: the file named in the S3O (`Arm_color.dds`, `cor_color.dds`, `leg_color.dds`; the files are under `unittextures/`, name in lower case), 4096 x 4096 pixels, DDS, 22.4 MB each. A browser cannot read DDS: the website project converts the **three colour atlases once** (e.g. to WebP or JPEG, 2048 x 2048, about 1 to 3 MB each) and keeps them as its own files. Raptors and some special units have their own, smaller textures (`chicken_*_color.dds`, about 1.4 MB; `unittextures/` of the game: the texture name is in the S3O of the unit). The textures with shine, glow and normals (`*_other`, `*_normal`, `*_shader`; `leg_normal` alone is 89 MB) are **not** used.

## 4. The pictures

`editor.buildpic` is the file name of the unit's picture (e.g. `ARMLLT.DDS`); the file is `unitpics/<name in lower case>` in the game, 256 x 256 pixels, DDS, RGBA, about 430 KB. The website project converts them once to JPEG or WebP (about 15 to 30 KB each). Instead of these in-game pictures (they are small and show the unit from above on water or terrain), the website can use pictures rendered from the models like the ones on beyondallreason.info: section 12.

## 5. Where the files are in the game

The game's files are in the data folder of the BAR installation (`C:\Games\Beyond-All-Reason\data` for the standard installation) in a pool: `packages/<hash>.sdp` is a gzip stream of entries `[1 byte length of the name][name][16 bytes md5][4 bytes crc][4 bytes size]` (the biggest `.sdp` is the game), and the file of an entry is `pool/<first two hex digits of the md5>/<the other 30 digits>.gz` (gzip). The names in an `.sdp` are in lower case: `objects3d/units/armllt.s3o`, `unittextures/arm_color.dds`, `unitpics/armllt.dds`. A script of the website project reads the model and picture files of the units of `units-<game version>.json` from there. Python with `gzip` and `Pillow` (can read DDS) is enough for the conversion of the pictures and textures.

## 6. Order of work for the website project

1. Run `extractor/extract_units.ps1` once per game version to get the `units-<game version>.json` files and the one `equivalences.json` (section 10); correct the ids and keep `equivalences.json` in the website project.
2. Script: copy the S3O files of all units, convert the three colour atlases and the pictures (sections 3.2, 4).
3. Page: the filter bar (faction, type, tech level, search), the list of the units, the comparison view (all units of an id next to each other, with picture, 3D view and the values), the 3D view with the mouse control.
4. A small local web server for development (a page opened from a file cannot load the model files).

## 7. Licence (home use first)

The licence file of the game (`LICENSE.md` in the Beyond-All-Reason repository) says: the **code** is GPL v2; **models by Cremuss** are CC BY-SA 4.0; **all other models and textures** are CC BY-NC-ND 4.0 (Beherith) - no derivative work, no repackaging, no use outside BAR; **animations** are CC BY-NC-ND 4.0; pictures and icons have their own licence files (without them: all rights reserved). So the website is for **home use** (on the own computer, in the family): the files stay in the own game folder and project folder and are **not published**. Putting the website on the internet needs the permission of the BAR developers first, or has to be limited to what the licences allow (models by Cremuss with credit, `author` in the units file); the numbers (code of the unit definitions) are GPL v2.

## 8. Open points

- The units of other games or mods are not covered: `units-<game version>.json` has what the running game knows.
- Animations of the units (walking, turning towers) are not available; the model is shown as it stands (the pieces are not moved).
- Shine and glow are left out for now and can be added later (texture 2 of the S3O).

## 9. Where the unit data comes from (decision and alternative)

**Decision: the normal game is the source**, through the extraction widget (section 10). It gives exactly the numbers the running game uses, after the game has processed its unit files, and it does not need the Level Editor. The catalog rules (faction, type, tech level: `Shared.unitGroup`, `Shared.techLevel`, `buildUnitCache`) are the code of the Level Editor's unit menu (the Place menu), copied into `extractor/lua/`. Limits: it needs a started game and can only export a game version that is installed.

The Level Editor's own export buttons are **not** a source for this project: the editor game changes some data. The same game exported both ways gives the same 1663 units, but 66 differ: the `builds` list of 66 builders (the editor game lets builders build some more things, e.g. `armaca` also `armgatet3`, `armlwall`, `armnanotct2`) and the model fields (`modelpath`, `modelname`, `scriptName`, `scriptPath`, `height`, `radius`, `editor.model`) of 16 units.

**Alternative, not built (a script of the website project):** the unit files are Lua files in the game's pool and can be read without starting the game (same way as the models, section 5): `units/<folder>/<name>.lua` with the weapons and `customparams`, the names and descriptions from the language files. It needs a Lua reader (e.g. the Python package `lupa`). Advantages: no started game, a new BAR version is processed with one command, and **older game versions** can be read (the game's packages of older versions, if they are still in `packages/`, or the files of the versions in the game's GitHub repository), which the version comparison (section 11) needs when only the newest version has ever been exported. Why it is not the source: the game **changes the files when it loads them**, and a script would have to rebuild that:
- the Scavenger copies (`*_scav`) do not exist as files: the game generates them from the normal units (the unit files of the game package contain only `units/armbuildings/landdefenceoffence/armllt.lua`, no `armllt_scav`);
- the post-processing of the unit definitions at game start (game options, balance changes, the raptors);
- the derived values: damage per second and tech level (section 2.1), type from movement class and categories.

If it is built, the first test is to compare its numbers for the installed version with the widget's file: the differences show what the post-processing does. The widget's file stays the reference.

## 10. The extractor: one game start per game version

The folder `extractor/` holds everything that is needed to get the data out of the normal game:

| File | What it is |
|---|---|
| `extractor/unit-extraction.lua` | the widget for a **plain Beyond All Reason game**: once, a moment after the game has started (game frame 5), it writes `units-<game version>.json`, `equivalences.json` and a short `status.txt` ("ok ..." or "error ...") into `LuaUI/Config/WebsiteExport/` in the data folder of the game (a user widget may write only into `LuaUI/Config` and `LuaUI/Widgets`). If the file `LuaUI/Config/WebsiteExport/quit.txt` exists, the game ends itself afterwards (`quitforce`), otherwise it goes on |
| `extractor/extract_units.ps1` | the start script (PowerShell, Windows): starts the installed game once in a sandbox folder with the widget, waits for the end, moves the result to `-Out` and deletes the sandbox |
| `extractor/lua/led_export.lua` | the export code the widget calls: `exportUnits()`, `exportEquivalence()` |
| `extractor/lua/editor_common.lua`, `extractor/lua/bar_rules.lua` | what `led_export.lua` uses: the unit catalog (`buildUnitCache`: faction, type, tech level, water, filler), the main weapon figures (`shotInfo`) and the rules behind them |

The three files in `extractor/lua/` are **copies** of `LevelEditor/scripts/led_export.lua`, `shared/editor_common.lua` and `shared/bar_rules.lua` of the BARLevelEditor repository (state of 2026-11-05, commit `86df38f`). One change was made here: `exportUnits()` and `exportEquivalence()` of `led_export.lua` also return whether they succeeded, and a failed write is an error (a new copy has to keep this). `editor_common.lua` is large because the Level Editor's menus live in it; the extraction uses only the unit catalog. When the rules for faction, type or tech level change in the Level Editor, the files are copied again; they can also be cut down or replaced by an own implementation of the catalog (section 2.1 says what every field means).

### Using the start script

```
.\extract_units.ps1 [-Out <folder>] [-Data <data folder of BAR>] [-Work <folder>] [-WaitSec 300] [-Map "<map name>"] [-Game "<game name and version>"] [-Engine "<engine folder>"]
```

- `-Out` (default `out` next to the script): receives `units-<game version>.json` and `equivalences.json`. An existing `equivalences.json` there is **given to the game first**: its ids stay, only new units are added (section 2.2).
- `-Data` (default: the environment variable `BAR_DATA`, otherwise the first of the usual places, e.g. `C:\Games\Beyond-All-Reason\data`): the data folder of the BAR installation, i.e. the one with `packages`, `pool`, `engine` and `cache`; a given folder that is none is an error, not replaced by another one (the engine is started from there; the packages, pool, rapid and maps are read from there through the environment variable `SPRING_DATADIR`; nothing in it is changed, nothing is written into it, and no junctions are needed).
- `-Work` (default `%TEMP%\unit_extraction`): the sandbox: an own write folder `<Work>\data` with the widget, the three files, the game script and the config. The game writes only there. After a successful run the result is moved to `-Out` and the sandbox is deleted; after an error it stays, with the log of the game `<Work>\data\infolog.txt`. (Sandboxes of older versions of the script contain junctions to the game folders; the script removes such links first, before it deletes anything.)
- `-Map` (default `Hooked 1.1.1`, and if that is not installed the first installed map): the map to load, as the engine names it. Any map will do, only the units are read; the default is a small 1v1 map (19 MB), so that the game loads fast. The script checks game and map in the engine's archive cache (`cache/ArchiveCache*.lua`) before it starts the game, because otherwise the engine stops at a message box that waits for a click; something that was just downloaded is known after BAR has been started once.
- `-Game`: the game as the engine names it, default the installed one (`byar:test`, otherwise `byar:stable`, whose package is installed).
- `-Engine`: the engine, the name of its folder in `<Data>\engine`; default the newest. An old game version may need the engine of its time (see "Several game versions").
- The game opens in a small framed window and is put to the back; it ends itself. Only the process the script started is ever stopped (after `-WaitSec`).
- Exit code 1 and a message on stderr (`ERROR: ...`) if the extraction failed: game or map are not installed, the game ended or timed out without a result of the widget, or the widget reports `error ...` in `status.txt` (no units found, a file that cannot be written, a `equivalences.json` without `"units"`, an error in the export). Nothing is copied to `-Out` then, so an existing `equivalences.json` stays as it is. The log is named in the message.

What the script sets, and why (this matters if the start is done another way):
- the three Lua files are put into `LuaUI/Include/`, the widget into `LuaUI/Widgets/`;
- the game option **`forceallunits=1`**: without it the Scavenger and Raptor units do not exist (656 units instead of 1663); `experimentallegionfaction=1` turns the Legion on;
- in the config of that game instance **`UserWidgetMemoryLimits = 0`**: BAR limits the memory of user widgets and stops this widget otherwise (status `error memory limit exceeded`; the export writes about 15 MB of text, unit by unit); the setting is meant for widget authors, set it only for the instance that does the export;
- `LuaUI/Config/WebsiteExport/quit.txt` for an automatic run (without it the game stays open).

Result of the first run (game `Beyond All Reason test-31820-45ea098`): 1663 units, 15.5 MB, `units-test-31820-45ea098.json`; 244 Armada, 249 Cortex, 235 Legion, 808 Scavenger, 127 Raptor units.

### Several game versions (the plan, not tried)

The idea: for every release of Beyond All Reason, get that version of the game, start it once with the widget and collect `units-<version>.json`. The widget and the start script need nothing else; what is open is **getting an old game version** to run:
- The game must be there as a package the engine can load: either from the rapid repository of BAR (the tags `byar:test` and `byar:stable` in `rapid/repos-cdn.beyondallreason.dev/byar/versions.gz` point to the newest versions; whether older versions are still on the server and how to name them for `pr-downloader` has to be found out), or as a **game folder**: the source of BAR (the GitHub repository `beyond-all-reason/Beyond-All-Reason`, one tag or commit per release) checked out into `<data>/games/<name>.sdd`; the engine runs such a folder as a game (`gametype` = the name in its `modinfo.lua`).
- The **engine** has to fit the game version: every game version wants a certain engine (the game's `modinfo`/launcher setting), an old game may not start with a new engine and the other way round. The start script has to choose (or download) the engine too.
- The **version string** in the file name comes from the loaded archive named `Beyond All Reason <version>`; for a checked-out folder the archive name is different, so the start script must give the version (a file or an argument) or the widget has to read it from the game's `modinfo.lua`. Not solved yet.
- Units that differ between versions are matched by unit name (section 11).

A first step would be to try two versions side by side (the installed one and one older one) before building the loop over all releases.

## 11. Comparing game versions (the idea behind the version in the file name)

Every export carries the version of Beyond All Reason (file name and `gameVersion`, section 2.1). The website offers a choice of two versions and shows, per unit name, the values that changed (health, costs, speed, range, damage, ...), the units that are new in the newer version and the ones that are gone. `equivalences.json` is the same for all versions (section 2.2). Units are matched by their unit name (`armllt`); a unit that was renamed in a game version shows up as gone and new.

## 12. The pictures of the units, rendered from the models (`render_unit/`)

`render_unit/render_unit.py` renders one picture per unit from the game's own files, in the look of the pictures on beyondallreason.info (checked against `legnavyscout`, `legnavyconship` and `legnavyfrigate`):

```
python render_unit/render_unit.py [--out DIR] [--units FILE] [--no-units] [--format png|bmp|avif|webp|all] [--size 400] [--tex-size 2048] [--team R,G,B] [-v] <unit> [<unit> ...]    (or @file)
```

- **Source:** the model and the textures named in its header, read from the game's pool (section 5); the newest installed game, or `--game "Beyond All Reason <version>"` for an older one that is installed. The data folder is `--data`, otherwise `BAR_DATA`, otherwise the usual places (as with the extractor); it is only read. The model and the script of every unit come from the `units-<game version>.json` of the extractor (`--units`, default: `extractor/out/units-<version of the game>.json`; data of another version of the game are never taken by themselves; if the file is missing the script stops with an error): `editor.model` and `game.scriptPath`; the model of 1019 of the 1663 units is not named like the unit (Scavenger copies, Raptors). With `--no-units` (the way without the file) the model is looked for as `objects3d/units/<unit>.s3o`.
- **Texture channels** (from the game's shader `modelmaterials_gl4/templates/cus_gl4.frag.glsl`): colour texture `rgb` = albedo, `a` = mask of the team colour; second texture (`*_other.dds` for Armada and Cortex, `leg_shader.dds` for Legion) `r` = emissive, `g` = metalness, `b` = roughness; normal map `rgb` = normal. The colour atlases are scaled from 4096 to 2048 pixels once per faction (cached in `--work`); RGB and alpha are scaled separately, because Pillow scales RGBA with premultiplied alpha and would wipe out the colour where the team colour mask is 0.
- **Model:** the vertices are used as they are, **not mirrored** (section 3.1). The pieces are not animated, but the pieces that the unit's script hides when the unit is created are left out (the crown and the medals of the commanders, muzzle flares `flare`, `nano`, `teleport` and so on): the script of the game is compiled (`.cob`), its source (`.bos`, or `.lua` for 49 units) lies next to it in the pool, and the `hide <piece>;` / `Hide(<piece>)` statements of `Create()` are read (for 1612 of the 1663 units a BOS source exists, for 49 a Lua source, for 2 none). Children of a hidden piece stay.
- **Look:** three.js in a browser without window (Microsoft Edge or Chrome, started with `playwright-core`), physical material (albedo, metalness, roughness, normal map, emissive), a light from the upper right (the shadow falls to the lower left), a studio environment with a warm ground for the reflections, saturation x1.25 and gamma 1.2 as colour grading, a soft shadow on an invisible ground a little below the unit. The camera looks from the front left (azimuth 324 degrees, 34 degrees up, tilted by 12 degrees) and frames every unit to 80 % of the square. The team colour parts (mask in the alpha channel of the colour texture) get the colour of the faction: Armada blue (90, 140, 235), Cortex red (235, 85, 75), Legion green (130, 218, 105, the green of the website), Scavengers purple (175, 105, 225), Raptors black (20, 20, 20); `--team R,G,B` sets one colour for all units. On the textures of the raptors (`chicken_*_color.dds`) the mask covers only a small part (about 6 % of the pixels, against 4 to 11 % on the faction atlases), so black changes little: the raptors keep the purple, green and brown of their textures, only the parts of the mask become black. All values are in `render_unit/renderer/index.html` and can be changed per run with `--param key=value`.
- **Check against the website** (three units): shadow offset and size, mean brightness and saturation are within a few percent; not the same: the underside of the hull is a bit lighter, lamps glow a bit less.
- **Output formats:** the browser renders a lossless PNG with transparent background; `--format` makes PNG, BMP (no transparency: white background), AVIF and WebP from it, `all` puts them side by side with a table of the file sizes. For `legnavyscout` at 400 x 400 pixels: PNG 91 KB, BMP 480 KB, AVIF (quality 60) 8 KB, WebP (quality 80) 12 KB. Rendering is the slow part (about 1 to 2 seconds per unit with one browser start for all units), encoding is fast, so rendering and encoding are separate steps.
- **A small web server:** `renderer/render.mjs` starts a tiny web server on `127.0.0.1` (random port) for the time of the run only: a page opened from a file cannot load the models, textures and three.js modules. It has nothing to do with the website of section 1 and is stopped when the pictures are done.
- **Open:** the final encoding settings (AVIF); pieces that a script hides later (not in `Create()`) are still drawn; a `.cob` without source (2 units) shows all pieces.

