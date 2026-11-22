# Unit comparison website

The website of the project: a unit catalog and a comparison of any number of units. The tools that produce its content are described in the other documents ([README](README.md)); the reduced data comes from `exporter/reduce_units.py` (the rules: `exporter/unit_rules.py`). Look and layout follow the unit pages and the compare page of beyondallreason.info (black background, Poppins, faction colours). The sizes in `style.css` are a little smaller than on that site, so that more units fit next to each other; below 900 px width the unit selection goes under the columns, below 600 px (phones) everything is a step smaller and the header has two lines.

| Part | What it is |
|---|---|
| `website/index.html`, `style.css`, `app.js` | the page: plain HTML, CSS and JavaScript, no build step |
| `website/fonts/`, `favicon.svg`, `preview.png` | the font Poppins (self-hosted), the icon of the tab, the picture for link previews (Open Graph tags in `index.html`) |
| `website/serve.py`, `serve.bat` | small local web server for testing (a page opened from a file cannot load its data) |

## 1. Data

The page reads everything from `website/assets/` (in Git; the full `units-<version>.json` of any version stays local, `.gitignore`, and is not published, section 6; base version and differences: [versions.md](versions.md)):

```
website/assets/                                everything the tools make
  counterparts.json                            unit name -> counterpart id, for all versions; groups of beyondallreason.info win, the rest can be corrected by hand (exporter/export_counterparts.py)
  counters.json                                unit name -> the units that counter it, from the counter charts of beyondallreason.info (exporter/export_counters.py)
  versions.json                                the game versions shown, oldest first, with date, engine and counts (the first is the base version); `history` (the name of the next file); `checkedUpTo` (the newest version looked at)
  history.json.gz                              the diff files of all versions after the base in ONE file (made by reduce_units.py; the page loads it with one request)
  <base version>/                              the base version (the first of the year, test-29183): everything
    data/units-<version>.json                  all data of the exporter (local only, not in Git: .gitignore)
    data/units-<version>.reduced.json.gz       what the website shows
    data/pictures.json                         the fingerprint of every unit's picture (model, textures, hidden pieces, faction)
    images/<unit>.<format>                     the pictures
    images/icons/<file>.png                    the role icons of the game version
  <later version>/                             every later version: only what changed against the version before it (nothing changed: no files, not shown)
    data/units-<version>.json                  all data of the exporter (local only, not in Git: .gitignore)
    data/units-<version>.diff.json.gz          the units whose values, picture or icon changed, the new units, the names of the units that are gone
    data/pictures.json                         the fingerprints of the pictures that changed
    images/<unit>.<format>                     only the pictures that changed
    images/icons/<file>.png                    only the icons that changed
```

A missing AVIF picture: the page tries WebP, PNG and JPEG, and all of them once more a moment later (a failed request is not always a missing file). The reduced file has 55 KB (the full file 15.7 MB).

**Loaded dynamically:** the page contains no unit data. It reads `versions.json` and loads with `fetch` the reduced file of the base version and `history.json.gz`, the diff files of all later versions in one file (45 KB for the 63 versions of 2026; without that file, with an older `versions.json`, one diff file per version). The units of a version are the base's with the changes of every version up to it, in order (changed and new units, without the ones that are gone). A unit's picture and icon come from the folder of the version in which they last changed (`ownPicture`, `ownIcon` in the diff file), else from the base's folder. The version shown is chosen at the top (default the newest; the list appears as soon as there are two versions, with the date of each and how many units changed in it, grouped by month from 12 versions on).

**The year of versions (built; [plan-versions-2026.md](plan-versions-2026.md)):** the page reads the diff files of all versions from **one file** `assets/history.json.gz` (`versions.json` names it: `history`; made by `reduce_units.py`; the reduced file of the base stays separate, the pictures stay in the folders of their versions). Without that field (an older `versions.json`) it reads one diff file per version. The list of game versions is **grouped by month** (`<optgroup>`, for example "2026-03 (5 versions)") from 12 versions on. `versions.json` has `checkedUpTo` (the newest version looked at, the status of the exporter; the page ignores it) and, per version, `engine` (and `engineOnly` where values differ only because of the engine). The page **Changes** is described in section 4b.

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
| `buildTime` | Build time | `game.buildTime / 100` in seconds (at a build power of 100), shown as mm:ss |
| `buildPower` | Build power | `game.buildSpeed` |
| `energyMake` | Energy income | `game.energyMake - game.energyUpkeep` if above 0 (a solar collector has a negative upkeep), plus `game.windGenerator` and `game.tidalGenerator` |
| `hitpoints` | Hitpoints | `game.health` |
| `radar` | Radar range | `game.radarDistance` |
| `speed` | Speed | `game.speed`, shown without decimals |
| `weapons` | Weapons | the different `type` values of `editor.weapons` (`BeamLaser`, ...), without the `bogus` weapons (`customParams.bogus`) |
| `dps` | DPS | sum over the weapons of `max(damages.default, damages.vtol) * projectiles * salvoSize / reload`; left out: `bogus` weapons, shields, interceptors, paralyzers, stockpile weapons (nukes) and manual-fire weapons (D-gun): their figures do not say what a unit deals continuously |
| `range` | Weapon range | `game.maxWeaponRange` |

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
- **For the first visit:** a line under the category menu says what to do (click units, then Compare) and links to the Help page; its cross hides it for good (`intro` in the browser's storage).
- **Categories:** a category in which the faction has no unit is not offered (Raptors have no vehicles, ships and buildings); the same in the unit selection of the compare (`hasUnits`).
- **Units without a name** (the name is the code name, for example `armcomnew`: test and helper units of the game) are listed last and say "Internal unit". Two units with the same name in the list (for example the commanders) also show their code names.
- **Help** (`#/help`, link in the header): the page in three steps, every button of the compare, every value, the game versions and the search (`renderHelp`).

## 4. Compare (`#/compare/<unit>,<unit>@<version>,...?view=table&scav=1&ref=<unit>&versions=1&v=<version>`)

**The link** carries the units in their order and how they are shown, so that a shared link looks the same for the other one:

- `view` = `table` or `graphic`; `scav=1` if **+ Scav** is on; `ref` = the unit of the reference column (also a Scavenger copy, `corak_scav`); `versions=1` for the filter **Changed units only**.
- `v` = the game version chosen at the top, if it is not the newest one (a link without it keeps the version that is chosen).
- A column with a game version of its own is `<unit>@<version folder>` (`armpw@test-31450-6562fb1`); without it the column shows the version chosen at the top.
- The address is kept up to date with every change (without a new entry in the history of the browser).
- An older link with only the units shows them without Ref and + Scav, in the view the browser remembers.

**Layout:**

- The heading "Compare" with a row of buttons below it: **Undo**, **Redo**, **Table view** / **Graphic view**, the star (**Favorite**), **+ Scav**, **Changed units only** (the filter, only with more than one game version), **Clear all units**. A button that cannot be used now is grey with a dashed frame.
- Below that the columns on the left and the unit selection at the right edge. The selection can be folded away to the right (the compare is laid out the same way without it).
- Columns and selection fill the height of the window, so that the page needs no scrollbar and the footer stays at the bottom: the pictures of the units shrink (60 to 300 px) when the values would not fit, the selection takes the rest. On a narrow window (up to 900 px) the pictures are 200 px and the page scrolls.
- **Without units** the page says what to do in three steps and offers comparisons to start with (`emptyCompareHtml`): light infantry bots, light tanks and light laser towers as a unit and its counterparts; the commanders of the three factions, destroyers, light hovercraft and the fusion reactors with the cloakable one as fixed lists.
- **Game versions are shown with the date first** ("8 Nov 2026 · test-31891", `versionLabel`); the list at the top is grouped by month ("November 2026 (3 versions)") and is not shown on the pages Changes and Help, where it does nothing.

**Header of the page:** Catalog, Compare (number of units), **Favorites** (list, see below); at the right the game version and the link to the source on GitHub.

**Graphic view**
- A column is a unit: the name of its faction (in the faction colour), a row of icon buttons (grip, **Versions**, **Counters**, **Counterparts**, **Ref**, the reddish **X** that removes the column; see "The tools of a column" below), the picture, name, description, tech level, the **counterparts** and the values.
- Any number of columns, each at least 360 px wide (see "Width of the columns" below); they scroll sideways when they do not fit. An arrow with a fade at the left or right edge shows that more columns are hidden there; a click scrolls to the start of the next column.
- Values: Metal, Energy, Build time, Build power, Energy income, Hitpoints, Radar range, Speed, Weapons, DPS, Weapon range. Each label has a tooltip that says what the value means (`tip` in `STATS`; the page Help lists them). A row is shown only if at least one shown unit has a value for it; a unit without that value shows a grey dash. The bars are scaled to the largest value of the row among the shown units. A value of 0 shows no bar. With exactly two columns the bars are mirrored and meet in the middle, as on beyondallreason.info.

**Table view:** one row per value, one column per unit, plain text; a small picture, faction, name, tech level, description and the buttons stand in the header of each column. The largest value of a row is bold. The same red / green against the reference. The row names stay at the left when scrolling sideways. The choice (table or graphic) is remembered in the browser.

**Reference (Ref):** one unit at a time; pressed again it is off.

- **Place:** the column stays where it is (to have it at the left, move it by hand). Scrolled sideways, it moves with the others until it reaches the left edge, then it sticks there (`refStuckAt`: from which scroll position; in the grid it spans the whole grid and starts at its own place, `--i`).
- **Colours:** with a Ref **every** other column is coloured against it, also several versions of another unit: green better, red worse (bars in the graphic view, text in the table); for Metal, Energy and Build time less is better. A value equal to the reference is greyed out (`diff-same`: grey bar, dim number; the same weapons: grey text), so that only the differences stand out. If the reference has no such value, the value stays uncoloured.
- **Differences:** the other columns show the difference to the reference instead of the value (`valueText`): `+` better, `−` worse (the sign says better or worse, not more or less: 11 metal more is `−11`), `±0` equal, in the colour of the bar. The bars keep their length (the value itself). The value and the one of the Ref are in the tooltip of the number; a click or tap on the number shows them as a note (a phone has no tooltip). A difference that the format would show as 0 (speed) gets one decimal. Where the Ref has no such value, and without a Ref, the value is shown.
- **The reference column itself** shows all its values in one colour, yellow, the colour of Energy (`.stats.is-ref .fill`, `td.ref-col`).

**The tools of a column** are small icon buttons with a tooltip (`toolButton`, `ICONS` in `app.js`):

- **Order:** the grip (move) at the left; at the right, together: **Versions** (a clock turning back), **Counters** (crossed swords), **Counterparts** (arrows both ways), **Ref** (a balance) and remove (×) right of Ref. Above them, below the name of the faction, the list of the versions of the unit.
- **On a phone** they are smaller and fit in one line; the grip is two arrow buttons.
- **Pressed again:** Versions, Counters and Counterparts are lit (gold) while what they added is shown; pressed again they take out the columns they added, bring back the ones they put aside (Counters) and set the Ref as it was before (`toggleTool`, `c.active`). Columns added or removed by hand in between stay.
- Only the newest of these tools can be taken back like this, older ones with Undo; each press is one step of Undo.

**Width of the columns and the edge arrows:** a column is 360 px wide at least; if the columns are only a little too wide for the window, they get narrower (down to 280 px, `fitColumns`), so that a few pixels of scrolling do not bring the arrow and the shadow over the first column. An edge arrow scrolls to the start of the next column (behind the sticky reference column and the names of the table rows), so that no column is cut at the left edge; at the very start the left arrow is gone.

**Other buttons**
- **+ Scav** (top row, for all columns): adds the Scavenger copy of every shown unit as a column right of it ("Scavengers", only with a **Ref** button); pressed again they go away. Scavenger copies are stronger (about 10 % more cost, 25 % more hitpoints).
- **Counters:** replaces all other columns with the units that counter this unit (`counters.json`). Grey if the unit has none (the charts name 25 units); a Scavenger unit uses the counters of its normal unit. Pressed again (lit) it brings the columns back that it put aside.
- **Counterparts:** the icon in the tools adds all of them (pressed again: takes them out); also the label "Counterparts:" below the description and one button per counterpart (units with the same id in `counterparts.json`; Scavenger copies only for a Scavenger unit). A click on a unit adds it; a click on the label adds all of them. A unit is in the comparison only once.
- **Moving:** the grip at the start of the button row is dragged onto another column (left half: before it, right half: after it, marked by a gold line). Scavenger columns stay behind their unit.
- **Undo / Redo** (also Ctrl+Z, Ctrl+Y outside of input fields): every change of the set or the order of the columns (add, remove, counters, counterparts, move, clear, load of a favorite, also a unit marked or unmarked in the catalog), of the game version of a column and of the game version chosen at the top is a step, up to 100 (Undo also brings the old game version back). Ctrl+Z and Ctrl+Y also work in the catalog. Ref, + Scav and the views are not steps.
- **Favorites:** the star saves the current units as a favorite, together with **+ Scav** and the reference column (filled star: exactly this is saved, press again to remove it; the view, table or graphic, stays a setting of the browser). The header button **Favorites (n)** opens the list: the unit names in the colour of their faction, after them "+ Scav" and "Ref <unit>" if saved; a click loads them into the comparison with + Scav and Ref (also from the catalog; an Undo brings the old selection back), the X deletes an entry. Stored in the browser (`localStorage`, key `barunit.favorites`: a list of `{units, scav, ref}`; an older entry that is only a list of unit names still loads, without + Scav and Ref): per browser and address, not shared.

**The unit selection** (right edge, 3 columns of pictures of at most 150 px): at the top the search field with a clear button and the arrow that folds the selection away to the right (a strip remains, a click opens it again; remembered), below it the factions and the categories as buttons of the same size, then the list of units. The search looks in all factions and categories as you type; a faction or category click ends it. A click on a unit adds a column and scrolls to it; units already shown are dimmed.

**Search (selection and catalog):** a text finds the words of the name and the description at the start of a word (`pawn` finds Pawn and Pawn Launcher, not `armrespawn`). `<armpw>` (the closing bracket may be left out) finds a part of the code name; the field turns green then. The placeholder tells both.

**Game versions** (only with more than one version in `versions.json`; base version and differences: [versions.md](versions.md)):
- Every column has a list of the **versions of its unit** in its header, on a line of its own between the name of the faction and the tools: only the first version that has the unit and every version in which its values changed, newest first, each as "since 29 May 2026 · test-30236" (`versionSelect`). The column shows the newest of them that is not newer than its game version (`stateVersion`): with the newest game version at the top, a unit that last changed on 29 May shows "since 29 May 2026", not the date of the game version at the top (a version without a change of the unit is never listed, so the list does not change when another entry is chosen). A unit with only one version has a grey list. A column with a version of its own keeps it when the version at the top is changed; set back to the version it would show anyway, it has no version of its own any more (the unit counts as shown again); a Scavenger column of **+ Scav** shows the version of its unit.
- **Changed units only** (called "Versions" before; button in the row at the top of the compare page and in the catalog controls; only with more than one game version) is a **filter**: only the units that have at least 2 versions are listed, in the catalog and in the unit selection (the number on a unit in the selection: how many versions it has). A **version of a unit** is the first version that has it (the base, or the version it is new in) and every version in which it changed. The filter is in the link (`versions=1`). A click in the selection adds one column as usual.
- **Versions of a column** (icon in the column header, left of **Counters**, also in the table view; a a small gold number on it if the unit has more than one version: how many it has, 2 to 9, above 9 a ">"): adds **every other version** of that unit, older and newer than the one the column shows, as columns right of it (newest first), and makes the unit the **Ref** (where it is). The version a column's values come from is the newest version of the unit that is not newer than the version of the column (`stateVersion`); a version counts as shown if a column of the unit shows its values. A unit with only one version has a grey icon (its tooltip says why); if all versions are shown already, a press gives a short note (`note`). Pressed again (lit) it takes the added versions out; Undo does, too (the Ref stays, as with every Undo).
- **Marking of versions:** whenever columns of one unit show different versions, the values that differ from the same unit in its **Ref column** (without a Ref: from the nearest older version shown) are marked (gold label with a dot, gold background in the table; `anchorOf`, `cellChanged`). The colours (`referenceFor`): with a Ref every column is coloured against the Ref, also the versions of another unit (red worse, green better, an equal value greyed out); without a Ref the versions of a unit are coloured against its nearest older version shown, and an equal value stays uncoloured. The Ref column itself is not marked; all its bars (and its weapons, its numbers in the table) are yellow, the colour of Energy, so that the red and green of the other columns stand out.
- The catalog marks the units that changed in the version shown against the version before ("changed"): a changed value, never only a new picture (only values count, [versions.md](versions.md)).

**Keyboard:** everything can be reached with Tab; what has the focus gets a gold frame (not after a mouse click). Cards and rows of the catalog are toggle buttons (Enter or Space marks or unmarks the unit, the focus stays on it). The grip of a column moves it with the arrow keys left and right (an Undo step like a drag). Escape closes the favorites. Ctrl+Z / Ctrl+Y: Undo / Redo.

## 4b. Changes (`#/changes/<to version>?from=<version>`)

The version compare: the question is "what changed in the game", not "how do these units differ". The nav has the link **Changes** (only with more than one version).

- **From / To:** two selects with the versions (grouped by month, newest last; From without the newest one, To without the base, which has no version before it). The default is the newest version against the one before it; any range works (the units of the To version against the units of the From version, both known from the chain: a unit that changed twice shows the total). The address carries the range.
- **The list** (two columns of rows on a wide window): every unit that is **changed** (the values as `old → new`, the new number green if it is better for the unit and red if it is worse; cost and build time: lower is better: metal, energy, build time, build power, energy make, hitpoints, radar, speed, weapons, DPS, range, tech, name, description; a changed picture), **new** or **gone**, sorted by kind, tech level, cost. Each row has the picture, the name, the code name and the faction colour. A line above counts changed, new and gone units and the versions with changes in the range.
- **Scavenger copies:** every unit has a Scavenger copy that changes with it. A copy is left out while its unit is in the list with the same kind of change; the line above the list counts the copies left out. The switch **Scavenger copies** (or the faction Scavengers) lists them.
- **Filters:** units (all or one faction, also Scavengers and Raptors), value (only the units in which that value changed), search (a text, or `<codename>`).
- **Engine only:** values that differ only because the engine of the game was changed in a version of the range (`engineOnly` in `versions.json`, for example the build time of `armcomboss`) are named in a note, not listed as changes.
- **A click on a row** opens the unit compare with the From version and the To version of the unit side by side (`#/compare/<unit>@<from>,<unit>@<to>?view=graphic`); a new unit comes once (in the To version), a gone one in the From version.
- Code: `rangeChanges`, `changeRow`, `changesListHtml`, `renderChanges` in `website/app.js`; tested in `tests/website_smoke.mjs` ("Changes: ...").

## 4c. Phones and narrow windows

The page is built for a large monitor first; a narrow window gets its own compact layout (`isNarrow()` in `app.js`: up to 900 px; the rules at the end of `style.css`). Tested at 390 px in `tests/website_smoke.mjs` ("phone: ...").

- **Unit selection as a sheet (up to 900 px):** the selection is not below the columns but comes up from the bottom edge with the button **+ Add units** (fixed at the bottom right). It stays open while units are added; **Done** closes it. It is not remembered (`state.sheet`).
- **Moving a column (up to 900 px):** dragging does not work with a finger, so the grip is replaced by two buttons, left and right (`moveColumn`, also used by the arrow keys).
- **Compare (up to 600 px):** two columns fit on the screen (`--colmin: calc(50vw - 16px)`); the name of a value is above its bar, not left of it; the buttons of a column wrap; the heading "Compare" is left out.
- **Catalog (up to 600 px):** three units per row with the name only (the description is in the list view and in the compare); the categories are one row that is scrolled sideways; the search comes first and is as wide as the screen.
- **Tools of a column (up to 600 px):** the icons are 24 px and stay in one line, in the graphic and in the table view. The examples of the empty compare are as wide as the screen, with room below the last one for **+ Add units**.
- **Help:** a section "On a phone" (+ Add units, swipe, no tooltips: the Help page explains every icon and value).
- **Header (up to 600 px):** the links fit in one line (Favorites is only the star).
- **Changes (up to 600 px):** one row per unit, the lists From and To as wide as the screen.
- **The reference column stays in view** once it is scrolled to the left edge (it stays at its place until then), so that its values stay next to the ones they are compared with. There it **shrinks to a narrow strip** with a small picture, the Ref button and only its values (bars without names), so that more of the other columns can be seen:
  - The class `scrolled` on `.cmp-scroll` is set in `updateMore` (24 px after the column sticks, off below 4 px).
  - **Graphic view:** the column gets narrower with every pixel scrolled after it sticks (`--refw` = its whole width minus the scroll since then, at least the strip: 88 px, on a phone 76 px), so the next column always sits right beside it. On a phone a swipe also snaps to a column next to the strip (`scroll-snap`, `scroll-padding-left`).
  - **Table view:** it is the column next to the value names (`.ref-col`, 64 px / 56 px; the names of the rows get smaller, too; their width is `--lw`). Here the columns do not snap: a swipe can end with a part of the next column under the strip.
  - The arrow at the left edge starts behind the strip.
- The page is never wider than the screen (no sideways scrolling of the page; only the columns of the compare and the category row scroll sideways).

## 5. Running it

```
"export and render all units.bat"    (makes what is missing: data and pictures)
website\serve.bat                    (or python website/serve.py [--port 8000]; opens http://localhost:8000/)
```

The server listens only on `127.0.0.1` and serves the folder `website/` (the page takes its data from `assets/` next to it). It keeps its connections open (HTTP/1.1): one connection per picture used up the buffers of Windows on pages with hundreds of pictures. The font Poppins is part of the site (`website/fonts/`, latin subset, SIL Open Font License 1.1): the page loads nothing from other servers.

## 6. Publishing with GitHub Pages

The site is published from the folder `website/` by the workflow `.github/workflows/pages.yml`: every push to `main` that changes `website/` (or the workflow) publishes it again, "Run workflow" in the Actions tab does it by hand. The address is `https://ralf1108.github.io/BARUnitComparer/`.

- **Tests first:** `pages.yml` calls `.github/workflows/tests.yml` and publishes only if the tests pass; they also run for every pull request and every push to another branch.
  - `tests/test_data.py`: the rules of `unit_rules.py`; the data files: `versions.json` (the base first, dates, `checkedUpTo`), the reduced file, the chain of diff files (each against the version before: only units that changed; their pictures and icons), `history.json.gz`, a picture for every unit with lower case names, `counterparts.json`, `counters.json`.
  - `tests/test_chain.py`: the chain of `reduce_units.py` on made-up exports (base, diff files, versions without a change, changed pictures, gone units, `--redo`, a change of the engine with its control export).
  - `tests/test_year.py`: the year of versions (the versions from a Git clone, the prefilter on a small made-up repository, the engine per day, the plan of `update_versions.py`, the engine table).
  - `tests/test_tools.py`: helpers (pool, package lists, archive cache, script parser, icon table, the pages of beyondallreason.info).
  - `tests/website_smoke.mjs`: the page in a headless Chrome or Edge. Catalog (grid, list, tech filter, search, Ctrl+Z, the categories of a faction), compare (columns, Undo and Redo, drag and drop, arrow keys, table, + Scav, Ref with colours, differences and the sticky strip, the icon tools pressed twice, the folded unit selection), the link, favorites (save, load, delete), the game versions (the list by month, the filter, the versions of a unit, the version at the top in the link and in Undo), the page Changes (range, filters, search, Scavenger copies), the page Help, a phone (390 px), and at the end: no script error and **no missing file (404)**.
  - **A made-up chain:** `tests/make_chain_site.py <folder>` makes a copy of the site with a chain of three versions for the cases the real data need not have (a unit that is gone, a change of the engine, few versions). The data tests and the smoke test run on it, too (`BARUNIT_ASSETS=<folder>/assets`, `BARUNIT_SITE=<folder>`).
  - **Locally:** `python -m unittest discover -s tests -v` and `node tests/website_smoke.mjs` (after `npm install` in `render_unit/`; own port, the favorites of `localhost:8000` stay untouched).
- **One time:** in the repository **Settings > Pages > Build and deployment > Source: GitHub Actions**. Until that is done the workflow stops at the step `configure-pages`; after switching it on, "Run workflow" starts it.
- The workflow publishes `website/` without what the page does not read: the full `units-<version>.json` (15.7 MB per game version) and the local server (`serve.py`, `serve.bat`). The published site has 28 MB and about 2100 files (the limit of Pages is 1 GB).
- It needs no build: the page is static, its paths are relative (`assets/...`) and its addresses use `#`, so it works in a sub folder as well. This was tested with a plain static server under `/BARUnitComparer/`, with the full JSON removed as the workflow does, and with the exact upper and lower case of all picture and icon names (Pages is case sensitive, Windows is not; all names are lower case). The deployment itself can only be tested on GitHub.
- A new game version: `update game versions.bat` (checks for new versions, exports them, refreshes the counterparts and counters), check in `website/assets/`, push: the site is published again. The first run of the year (every version from 2026-01-01) was done on 2026-11-13 ([versions.md](versions.md)).
- The page ends with a notice: unofficial fan project, not affiliated with the BAR team, content is removed on request, a link to the licence of the game and to the source.
- **Licence:** the pictures and icons are derived from content under CC BY-NC-ND ([licence.md](licence.md)). The site is published first and the BAR developers are asked afterwards whether it is in order; if they object, the pictures are taken down.
- With a plain one-connection-per-file server (such as `python -m http.server`) a page with hundreds of pictures can show single `ERR_NO_BUFFER_SPACE` errors on Windows; the page tries a failed picture once more, and `serve.py` keeps its connections open. Pages itself is not affected (HTTP/2).

## 7. Open

- The BAR developers still have to be asked whether the published pictures are in order (section 6, [licence.md](licence.md)).
- `counters.json` has only 25 units, as many as the counter charts name; the charts show only Armada and Cortex.
- A 3D view of the model is not built ([game-files.md](game-files.md), "Models in the website").
- `counterparts.json` comes from the names and the unit pages; groups can be larger than wanted (several units of one faction in one group, the exporter lists them). The groups of beyondallreason.info win over corrections by hand ([exporter.md](exporter.md), `counterparts.json`).
