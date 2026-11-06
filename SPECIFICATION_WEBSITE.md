# Unit comparison website

The website of the project: a unit catalog and a comparison of any number of units. The tools that produce its content are described in [SPECIFICATION.md](SPECIFICATION.md); the reduced data comes from `exporter/reduce_units.py`. Look and layout follow the unit pages and the compare page of beyondallreason.info (black background, Poppins, faction colours).

| Part | What it is |
|---|---|
| `website/index.html`, `style.css`, `app.js` | the page: plain HTML, CSS and JavaScript, no build step |
| `website/serve.py`, `serve.bat` | small local web server for testing (a page opened from a file cannot load its data) |

## 1. Data

The page reads everything from `website/assets/` (all of it is in Git; the full `units-<version>.json` is not published, section 6):

```
website/assets/                                everything the tools make
  counterparts.json                            unit name -> counterpart id, for all versions; groups of beyondallreason.info win, the rest can be corrected by hand (exporter/export_counterparts.py)
  counters.json                                unit name -> the units that counter it, from the counter charts of beyondallreason.info (exporter/export_counters.py)
  versions.json                                the game versions there are, newest last
  <version>/
    data/units-<version>.json                  all data of the exporter
    data/units-<version>.reduced.json.gz       what the website shows
    images/<unit>.<format>                     the pictures
    images/icons/<file>.png                    the role icons of the game version
```

A missing AVIF picture: the page tries WebP, PNG and JPEG, and all of them once more a moment later (a failed request is not always a missing file). The reduced file has 55 KB (the full file 15.7 MB).

**Loaded dynamically:** the page contains no unit data. It reads `versions.json` and loads the `.reduced.json.gz` of the chosen version with `fetch` (default the newest; the choice appears as soon as there are two versions). Pictures and icons come from the folder of that version.

`exporter/export_units.ps1` runs `exporter/reduce_units.py` at the end of every export. It can also be run alone (`python exporter/reduce_units.py`): it makes what is missing, `--force` makes it again. If it fails, the export has still worked and the script only warns. Without the game installed everything but the icons is made; the page works without icons.

### The reduced file

Normal JSON (`{ "format": 1, "gameName": ..., "gameVersion": ..., "count": ..., "units": { "<unit>": { ... } } }`, one unit per line), as **gzip at its maximum** (written with Zopfli, 100 iterations; a normal gzip file, 7-Zip opens it). There is no unpacked version. Measured on `test-31820`:

| Format | Size |
|---|---|
| unpacked | 526 KB |
| gzip -9 | 57.8 KB |
| **gzip with Zopfli** | **54.6 KB** |
| for comparison: zstd level 22 | 41 KB |
| for comparison: Brotli 11 | 37 KB |

**Why gzip and not Brotli or zstd:** they are smaller, but a browser unpacks them only if the server sends the header `Content-Encoding`, and GitHub Pages cannot set headers; the browser's `DecompressionStream` reads gzip everywhere (Edge 156: gzip and deflate, not Brotli or zstd). The page unpacks the file itself, so no server setting is needed (tested with the local server, not on GitHub Pages itself). Of these formats, 7-Zip 26 reads gzip and zstd, not Brotli.

`reduce_units.py` needs `pip install zopfli`; without it it writes the same format with `gzip -9`.

### Fields of a unit in the reduced file

| Field | Page | From `units-<version>.json` |
|---|---|---|
| `name`, `description` | name, description | `editor.humanName`, `editor.description`; some units have no translation in the game (the text is a key like `units.names.armprowl`, 14 units): the description is then the name if it is a real text, otherwise the unit name |
| `faction` | faction filter | `editor.faction`: `arm`, `cor`, `leg`, `scv`, `rap` |
| `category` | category filter (new property) | see below |
| `tech` | T1, T2, T3 | `editor.tech` |
| `icon` | role icon | `game.iconType` -> `bitmap` in `gamedata/icontypes.lua` of the game |
| `metal`, `energy` | Metal, Energy | `game.metalCost`, `game.energyCost` |
| `buildTime` | Buildtime | `game.buildTime / 100` in seconds (at a build power of 100), shown as mm:ss |
| `buildPower` | Buildpower | `game.buildSpeed` |
| `energyMake` | Energy Make | `game.energyMake - game.energyUpkeep` if above 0 (a solar collector has a negative upkeep), plus `game.windGenerator` and `game.tidalGenerator` |
| `hitpoints` | Hitpoints | `game.health` |
| `radar` | Radar Range | `game.radarDistance` |
| `speed` | Speed | `game.speed`, shown without decimals |
| `weapons` | Weapons | the different `type` values of `editor.weapons` (`BeamLaser`, ...), without the `bogus` weapons (`customParams.bogus`) |
| `dps` | DPS | sum over the weapons of `max(damages.default, damages.vtol) * projectiles * salvoSize / reload`; left out: `bogus` weapons, shields, interceptors, paralyzers, stockpile weapons (nukes) and manual-fire weapons (D-gun): their figures do not say what a unit deals continuously |
| `range` | Weapon Range | `game.maxWeaponRange` |

Checked against the compare page of beyondallreason.info: `armwar` (Centurion) 270 metal, 3100 energy, 00:42, 1590 hitpoints, speed 45, BeamLaser, DPS 183, range 325; `corstorm` (Aggravator) 110, 1150, 00:20, 740, 47, MissileLauncher, 41, 475.

### Category

| Category | Rule, the first that fits |
|---|---|
| `factories` | `game.isFactory` |
| `defense` | `editor.group` = `turrets`, or `editor.filler` (dragon's teeth, walls) |
| `bots`, `vehicles`, `air`, `sea`, `hover` | `editor.group` = `bot`, `vehicle`, `air`, `ships`, `hover` |
| `buildings` | all other units |

## 2. Faction colours

As on the rendered pictures: Armada blue (90, 140, 235), Cortex red (235, 85, 75), Legion green (130, 218, 105), Scavengers purple (175, 105, 225), Raptors black (20, 20, 20). Black text cannot be read on the black page: for the Raptors, names and active buttons are black with a light outline or light text.

## 3. Catalog (`#/catalog/<faction>/<category>`)

- Title: faction and category, next to it "Switch to" with the other factions.
- Category menu with icons: Bots, Vehicles, Air, Sea, Hover, Factories, Defense, Buildings.
- **List** or **Grid**, the switch **Show names**; search and T1 / T2 / T3 as additional filters.
- Units sorted by tech level, then by metal cost. A card has the tech level, the role icon, the picture, the name and the description.
- A click on a unit marks it for the comparison, a bar at the bottom shows the marked units and leads to the compare page.

## 4. Compare (`#/compare/<unit>,<unit>,...`)

**Layout:** the heading "Compare" with a row of buttons below it: **Undo**, **Redo**, **Table view** / **Graphic view**, the star (**Favorite**), **+ Scav**, **Clear all units**. Below that the columns on the left and the unit selection at the right edge. Columns and selection fill the height of the window, so that the page needs no scrollbar and the footer stays at the bottom: the pictures of the units shrink (60 to 300 px) when the values would not fit, the selection takes the rest.

**Header of the page:** Catalog, Compare (number of units), **Favorites** (list, see below); at the right the game version and the link to the source on GitHub.

**Graphic view**
- A column is a unit: the name of its faction (in the faction colour), a row of buttons (grip, **Counters**, **Ref**, the reddish **X** that removes the column), the picture, name, description, tech level, the **counterparts** and the values.
- Any number of columns, each at least 400 px wide; they scroll sideways when they do not fit. An arrow with a fade at the left or right edge shows that more columns are hidden there; a click scrolls by one column.
- Values: Metal, Energy, Buildtime, Buildpower, Energy Make, Hitpoints, Radar Range, Speed, Weapons, DPS, Weapon Range. A row is shown only if at least one shown unit has a value for it. The bars are scaled to the largest value of the row among the shown units. A value of 0 shows no bar. With exactly two columns the bars are mirrored and meet in the middle, as on beyondallreason.info.

**Table view:** one row per value, one column per unit, plain text; a small picture, faction, name, tech level, description and the buttons stand in the header of each column. The largest value of a row is bold. The same red / green against the reference. The row names stay at the left when scrolling sideways. The choice (table or graphic) is remembered in the browser.

**Reference (Ref):** one unit at a time; pressed again it is off. The values of all other columns turn green (as good or better) or red (worse) in comparison with the reference (bars in the graphic view, text in the table); for Metal, Energy and Buildtime less is better. The reference column is moved to the first place and stays at the left edge when scrolling.

**Other buttons**
- **+ Scav** (top row, for all columns): adds the Scavenger copy of every shown unit as a column right of it ("Scavengers", only with a **Ref** button); pressed again they go away. Scavenger copies are stronger (about 10 % more cost, 25 % more hitpoints).
- **Counters:** replaces all other columns with the units that counter this unit (`counters.json`). Grey if the unit has none (the charts name 25 units); a Scavenger unit uses the counters of its normal unit.
- **Counterparts:** the label "Counterparts:" below the description and one button per counterpart (units with the same id in `counterparts.json`; Scavenger copies only for a Scavenger unit). A click on a unit adds it; a click on the label adds all of them. A unit is in the comparison only once.
- **Moving:** the grip at the start of the button row is dragged onto another column (left half: before it, right half: after it, marked by a gold line). Scavenger columns stay behind their unit.
- **Undo / Redo** (also Ctrl+Z, Ctrl+Y outside of input fields): every change of the set or the order of the columns (add, remove, counters, counterparts, move, clear, load of a favorite, also a unit marked or unmarked in the catalog) is a step, up to 100. Ref, + Scav and the views are not steps.
- **Favorites:** the star saves the current units as a favorite (filled star: press again to remove it). The header button **Favorites (n)** opens the list: the unit names in the colour of their faction; a click loads them into the comparison (also from the catalog; an Undo brings the old selection back), the X deletes an entry. Stored in the browser (`localStorage`, key `barunit.favorites`): per browser and address, not shared.

**The unit selection** (right edge, 3 columns of pictures of at most 150 px): at the top the search field with a clear button and the arrow that folds the selection away to the right (a strip remains, a click opens it again; remembered), below it the factions and the categories as buttons of the same size, then the list of units. The search looks in all factions and categories as you type; a faction or category click ends it. A click on a unit adds a column and scrolls to it; units already shown are dimmed.

**Search (selection and catalog):** a text finds the words of the name and the description at the start of a word (`pawn` finds Pawn and Pawn Launcher, not `armrespawn`). `<armpw>` (the closing bracket may be left out) finds a part of the code name; the field turns green then. The placeholder tells both.

## 5. Running it

```
"export and render all units.bat"    (makes what is missing: data and pictures)
website\serve.bat                    (or python website/serve.py [--port 8000]; opens http://localhost:8000/)
```

The server listens only on `127.0.0.1` and serves the folder `website/` (the page takes its data from `assets/` next to it). It keeps its connections open (HTTP/1.1): one connection per picture used up the buffers of Windows on pages with hundreds of pictures. The font Poppins comes from Google Fonts; without internet the page uses a system font.

## 6. Publishing with GitHub Pages

The site is published from the folder `website/` by the workflow `.github/workflows/pages.yml`: every push to `main` that changes `website/` (or the workflow) publishes it again, "Run workflow" in the Actions tab does it by hand. The address is `https://ralf1108.github.io/BARUnitComparer/`.

- **One time:** in the repository **Settings > Pages > Build and deployment > Source: GitHub Actions**. Until that is done the workflow stops at the step `configure-pages`; after switching it on, "Run workflow" starts it.
- The workflow publishes `website/` without what the page does not read: the full `units-<version>.json` (15.7 MB per game version) and the local server (`serve.py`, `serve.bat`). The published site has 27 MB and about 2000 files (the limit of Pages is 1 GB).
- It needs no build: the page is static, its paths are relative (`assets/...`) and its addresses use `#`, so it works in a sub folder as well. This was tested with a plain static server under `/BARUnitComparer/`, with the full JSON removed as the workflow does, and with the exact upper and lower case of all 1663 picture and 329 icon names (Pages is case sensitive, Windows is not; all names are lower case). The deployment itself can only be tested on GitHub.
- A new game version: export and render locally, check in `website/assets/`, push: the site is published again.
- The page ends with a notice: unofficial fan project, not affiliated with the BAR team, content is removed on request, a link to the licence of the game and to the source.
- **Licence:** the pictures and icons are derived from content under CC BY-NC-ND (`SPECIFICATION.md`, section 7). The site is published first and the BAR developers are asked afterwards whether it is in order; if they object, the pictures are taken down.
- With a plain one-connection-per-file server (such as `python -m http.server`) a page with hundreds of pictures can show single `ERR_NO_BUFFER_SPACE` errors on Windows; the page tries a failed picture once more, and `serve.py` keeps its connections open. Pages itself is not affected (HTTP/2).

## 7. Open

- The BAR developers still have to be asked whether the published pictures are in order (section 6).
- `counters.json` has only 25 units, as many as the counter charts name; the charts show only Armada and Cortex.
- Showing the differences between two game versions (`SPECIFICATION.md`, section 3.5) is not built; the data of several versions is already loaded per version (section 1).
- A 3D view of the model is not built (`SPECIFICATION.md`, section 4.2).
- `counterparts.json` comes from the names and the unit pages; groups can be larger than wanted (several units of one faction in one group, the exporter lists them). The groups of beyondallreason.info win over corrections by hand (`SPECIFICATION.md`, section 3.2).
