# Unit comparison website

The website of the project: a unit catalog, a comparison of any number of units and the changes between game versions. Plain HTML, CSS and JavaScript, no build step. Look and layout follow beyondallreason.info (black background, Poppins, faction colours), a little smaller so that more units fit; phones get their own layout (section 4c). The data comes from `exporter/reduce_units.py` (the rules: `exporter/unit_rules.py`).

| Part | What it is |
|---|---|
| `website/index.html`, `style.css`, `app.js` | the page |
| `website/fonts/`, `favicon.svg`, `preview.png` | the font Poppins (self-hosted, SIL OFL 1.1: the page loads nothing from other servers), the tab icon, the picture for link previews |
| `website/serve.py`, `serve.bat` | the local web server (a page opened from a file cannot load its data) |

**Pages** (the address uses `#`, so the site works in a sub folder): `#/catalog/<faction>/<category>` (section 3), `#/compare/...` (4), `#/changes/...` (4b), `#/help`. The header has Catalog, Compare, Changes (with more than one version) and Help, each with an icon (`NAV_ICONS`), the star **Favorites**, the game version (catalog and compare only) and GitHub.

## 1. Data

Everything is in `website/assets/` (base version and differences: [versions.md](versions.md)):

```
website/assets/
  versions.json                          the game versions shown, oldest first (the first is the base): date, engine, number of changed units,
                                         `engineOnly`; `history` (the name of the next file); `checkedUpTo` (the newest version looked at)
  history.json.gz                        the diff files of all versions after the base in one file (one request)
  counterparts.json                      unit -> counterpart group (exporter/export_counterparts.py)
  counters.json                          unit -> the units that counter it, from the counter charts of beyondallreason.info (exporter/export_counters.py)
  <base version>/                        everything of the base version (test-29183)
    data/units-<version>.reduced.json.gz what the page shows
    data/pictures.json                   the fingerprint of every picture (model, textures, hidden pieces, faction)
    images/<unit>.avif, images/icons/    the pictures, the role icons
    data/units-<version>.json            all data of the exporter: local only (.gitignore), not published
  <later version>/                       only what changed against the version before (nothing changed: no folder, not shown)
    data/units-<version>.diff.json.gz    changed and new units, the names of the gone ones
    data/pictures.json, images/          only the pictures and icons that changed
```

- **Loading:** the page has no unit data of its own. It reads `versions.json`, the reduced file of the base and `history.json.gz` (without `history`: one diff file per version). The units of a version are the base's with the changes of every version up to it. A picture and an icon come from the folder of the version in which they last changed (`ownPicture`, `ownIcon`). A missing AVIF picture: the page tries WebP, PNG and JPEG, and all of them once more a moment later.
- **The reduced file:** JSON, one unit per line, gzip written with Zopfli (55 KB instead of 15.7 MB; `pip install zopfli`, else `gzip -9`). Not Brotli or zstd, though smaller: a browser unpacks them only with a `Content-Encoding` header, which GitHub Pages cannot set; the page unpacks gzip itself (`DecompressionStream`).
- `exporter/export_units.ps1` runs `reduce_units.py` after every export; alone: `python exporter/reduce_units.py` (`--force`: again). Without the game everything but the icons is made.

### Fields of a unit

| Field | Shown as | From `units-<version>.json` |
|---|---|---|
| `name`, `description` | name, description | `editor.humanName`, `editor.description` (no translation in the game: the name, else the code name) |
| `faction` | faction | `editor.faction`: `arm`, `cor`, `leg`, `scv`, `rap` |
| `category` | kind of unit | see below |
| `tech` | T1, T2, T3 | `editor.tech` |
| `icon` | role icon | `game.iconType` -> `bitmap` in `gamedata/icontypes.lua` |
| `metal`, `energy` | Metal, Energy | `game.metalCost`, `game.energyCost` |
| `buildTime` | Build time (mm:ss) | `game.buildTime / 100` (seconds at a build power of 100) |
| `buildPower` | Build power | `game.buildSpeed` |
| `energyMake` | Energy income | `energyMake - energyUpkeep` if above 0, plus wind and tidal |
| `hitpoints` | Hitpoints | `game.health` |
| `radar` | Radar range | `game.radarDistance` |
| `speed` | Speed | `game.speed` |
| `weapons` | Weapons | the different `type` values of the weapons, without `bogus` ones |
| `shotDamage` | Damage per shot | sum over the counted weapons of one shot: `max(damages.default, damages.vtol) * projectiles * salvoSize` (counted: all but bogus weapons, shields, interceptors, paralyzers, stockpile and manual-fire weapons; `counted` in `unit_rules.py`) |
| `shotsPerSecond` | Shots per second | `dps / shotDamage`: with one weapon 1 / `reload`; with several of different reload the rate that gives their DPS together |
| `dps` | DPS | sum over the counted weapons of one shot / `reload` (= damage per shot × shots per second) |
| `range` | Weapon range | `game.maxWeaponRange` |
| (worked out) | HP per metal, DPS per metal | `derive` in `app.js` (`derived` in `STATS`); not listed on Changes |

Checked against beyondallreason.info: `armwar` (Centurion) 270 metal, 3100 energy, 00:42, 1590 hitpoints, speed 45, BeamLaser, DPS 183, range 325.

### Category

| Category | The first rule that fits |
|---|---|
| `factories` | `game.isFactory` |
| `defense` | `editor.group` = `turrets`, or `editor.filler` (walls) |
| `bots`, `vehicles`, `air`, `sea`, `hover` | `editor.group` = `bot`, `vehicle`, `air`, `ships`, `hover` |
| `buildings` | all other units |

## 2. Faction colours

As on the pictures: Armada blue (90, 140, 235), Cortex red (235, 85, 75), Legion green (130, 218, 105), Scavengers purple (175, 105, 225), Raptors black, shown with light text and a light outline (black cannot be read on the black page).

## 3. Catalog

- **The choice of units** (`filterHtml`, `.filt`; the same on all three pages): one line with the factions and the tech levels T1 / T2 / T3 (several can be pressed; none: all), below it the kinds of units with icons (Bots, Vehicles, Aircraft, Ships, Hovercraft, Factories, Defenses, Buildings; a kind the faction has no unit of is left out, `hasUnits`). In the catalog the factions and kinds are links; the unit selection of the compare shows it smaller (`.filt.small`); Changes adds **All factions**, **All kinds** and the number of units behind each name.
- **List** or **Grid**, **Show names** (off: the grid shows the pictures only), **Changed units only** (section 4), the search.
- Units by tech level, then metal cost; units without a name (test and helper units) last, as "Internal unit"; two units with the same name also show their code names. A card: tech level, role icon, picture, name, description, "changed" if a value changed in the version shown.
- **A click** marks a unit for the comparison; a bar at the bottom (`#tray`) shows the marked units and leads to the compare.
- **Unit card** (`detailHtml`, `state.detail`): a right-click or a long press (550 ms) on a unit (catalog, unit selection, the menu of a column) shows every value, the counterparts and the counters (a click on one shows that unit) and a button that adds or removes the unit. Android sends `contextmenu` for a long press, iOS does not: a timer on `touchstart` does the same, and the click after it is swallowed (`quietUntil`). Closed with ×, **Close**, a click beside it or Escape.
- **For the first visit:** a line says what to do and links to Changes and Help (gold links); its cross hides it for good (`intro` in the browser's storage).

## 4. Compare

**The link** `#/compare/<unit>,<unit>@<version>,...?view=table&scav=1&ref=<unit>&versions=1&v=<version>` holds the units in their order, the view, **+ Scav**, the Ref, the filter and the game version at the top (`v`, if not the newest); `<unit>@<version folder>` is a column with a game version of its own. It is kept up to date without new history entries.

**Layout:** the toolbar (`toolbarHtml`), the columns, at the right the unit selection (it can be folded away; remembered). Columns and selection fill the window: the pictures shrink (60 to 300 px) so that the page needs no scrollbar. Without units the page says what to do and offers examples (`emptyCompareHtml`).

**The toolbar,** groups of buttons with icons (`ICONS`), a lit button is on: **Undo** / **Clear** / **Redo** (a gold badge with the number of steps; no step: no badge) · **Graphic / Table** · **+ Scav** · **Save** (star, filled for a favorite) / **Share**. A button that cannot be used now is grey. On a phone only the icons, in one line.

**Graphic view:** a column is a unit: faction, the list of its versions, its tools, picture, name, description, tech level, counterparts, then the values as bars, scaled to the largest value of the row; a row is shown only if a unit has the value. Two columns: the bars are mirrored. Each label has a tooltip (`tip` in `STATS`). Columns are 360 px wide at least, a little narrower (down to 280 px) when that saves a few pixels of scrolling (`fitColumns`); arrows at the edges show hidden columns and scroll to the next one.

**Table view:** one row per value, one column per unit, the largest value bold, the row names stay at the left. The view is remembered in the browser.

**The versions of a column:** below the faction the list of the versions of its unit (`versionSelect`: the first version and each one in which its values changed, by date, "29 May 2026 · test-30236"; white if there are several, grey with one), right of it **Versions** (a clock with the number of versions; it adds the others as columns, see below).

**The tools of a column** (`toolButton`): at the left the grip (drag to move; arrow keys), at the right **Counters** (swords), **Counterparts** (arrows), **Ref** (balance), × (remove). Versions, Counters and Counterparts are lit while what they added is shown; pressed again they take it out and bring back what they put aside (`toggleTool`; only the newest one, older ones with Undo).

- **Ref:** one unit at a time. Every other column is coloured against it (green better, red worse; less is better for costs and build time; equal values grey) and shows the difference instead of the value (`valueText`: **+** better, **−** worse, ±0), the value itself small beside it (`absText`), both in the tooltip and as a note on a click. The Ref column itself is yellow. It stays at its place; scrolled to the left edge it sticks there and shrinks to a strip with its values (see below).
- **Versions:** adds every other version of the unit as columns right of it and makes it the Ref. A column shows the newest version of its unit that is not newer than its game version (`stateVersion`). Values that differ between versions of a unit are marked gold (`anchorOf`, `cellChanged`).
- **Counters:** replaces the other columns with the units that counter this unit (`counters.json`; grey if none is known).
- **Counterparts:** adds the units of the other factions with the same group in `counterparts.json`; also one button per counterpart under the description.

**The other buttons**

- **+ Scav:** the Scavenger copy of every unit right of it (about 10 % more cost, 25 % more hitpoints).
- **Changed units only:** the catalog and the unit selection list only units with at least 2 versions (`versions=1`).
- **Undo / Redo** (Ctrl+Z / Ctrl+Y, also in the catalog): every change of the columns, their order and the game versions, up to 100 steps. Ref, + Scav and the view are not steps.
- **Save:** a favorite holds the units, + Scav and the Ref (`localStorage`, `barunit.favorites`); **Favorites** in the header lists them (load, delete).
- **Share:** copies the link and says so; on a touch device it opens the share menu (`navigator.share`).
- **Sorting:** a click on the name of a value orders the columns by it, the best first, again: the other way round (`state.sort`, an Undo step).

**The unit selection:** the heading **Select units** (gold, bold like the faction names of the columns), the search, **Changed units only** (only with more than one game version), the choice of units (section 3, with tech levels), the units as pictures; a click adds a column, units already shown are dimmed.

**Search** (everywhere): a text finds the start of a word in the name or description (`pawn`: Pawn, Pawn Launcher); `<armpw` finds a part of the code name (the field turns green).

**Game versions:** the list at the top (date first, grouped by month) shows the units as they were. The catalog marks the units changed in the version shown. Only values count as a change, never a new picture alone.

**Keyboard:** everything can be reached with Tab (gold frame); Enter or Space marks a unit in the catalog; arrow keys move a column by its grip; Escape closes a menu, the unit card and the favorites.

**The reference strip** (all widths): the class `scrolled` on `.cmp-scroll` is set in `updateMore` (24 px after the column sticks, off below 4 px; `refStuckAt`).

- Graphic view: the column gets narrower with every pixel scrolled (`--refw`, down to 88 px, 76 px on a phone), so the next column stays beside it.
- Table view: the column next to the row names (`.ref-col`, 64 / 56 px; `--lw`). An empty cell behind the last column (`.t-pad`, sized in `updateMore`) takes the width the strip gives up, so the scrolled area keeps its width (a width that changed while the bar was dragged made the columns jump to and fro), and on a narrow window gives the room to bring the last column beside the strip.
- On a touch device (class `touch` on the page: coarse pointer or first touch) a swipe ends with a column beside the strip (`scroll-snap`, `snapTable`); not with the mouse, where it pulled the columns back while the bar was dragged.

**The names stay in view** (`updatePin`): scrolled down so far that the names are gone, a line at the top shows a small picture and the name above each column.

## 4b. Changes

`#/changes/<to version>?from=<version>`: what changed in the game between two versions.

- **◀ Older / Newer ▶** move From and To by one version together (`chg-step`), to click through the patches; **From / To** choose any range (default: the newest version against the one before). The address holds the range.
- **The list:** every changed unit with its changed values as `old → new` (green: better for the unit, red: worse), a changed picture, new and gone units. One column per faction (`.chg-grid`, Armada at the left): a unit and its counterparts in one row (`changeGroup`), the rows by name, first the ones with an Armada unit. One faction only, or up to 900 px: a plain list.
- **Filters:** the choice of units (section 3; all five factions always offered, one without an entry pale), **Value** (only units in which it changed), the search, **Scavenger copies** (off: a copy that changes with its unit is left out and counted). Not part of the address.
- **Engine only:** values that differ only because the engine changed (`engineOnly`) are named in a note, not listed.
- **A click on a unit** opens the compare with the unit before and after, side by side.
- Code: `rangeChanges`, `changeRow`, `changeGroup`, `changesListHtml`, `renderChanges`.

## 4c. Phones and narrow windows

`isNarrow()`: up to 900 px, `isPhone()`: up to 600 px; the rules at the end of `style.css`. The page is never wider than the screen.

- **Up to 900 px:** the unit selection comes up from the bottom edge with **+ Add units** (**Done** closes it); a column is moved with two arrow buttons instead of the grip; the pictures are 200 px and the page scrolls.
- **Up to 600 px:** two columns on the screen; the header without the word Favorites; the name of a value above its bar; the toolbar as icons in one line; the head of a column in one line: faction, **Ref** and a menu (three dots, 36 px); pictures 104 px (72 px in a window up to 500 px high).
- **The menu of a column** (`menuHtml`): a sheet from the bottom with one entry per tool, each with a line that says what it does: reference, all values, versions, counterparts, counters, move, the game version, remove.
- **Catalog:** three units per row, the categories in one row to swipe; **Changes:** one column, the selects as wide as the screen; **Header:** two lines.

## 5. Running it

```
"export and render all units.bat"    makes what is missing: data and pictures
website\serve.bat                    or: python website/serve.py [--port 8000] [--no-browser]
```

The server listens on `127.0.0.1` only. It keeps its connections open (HTTP/1.1: one connection per picture used up the buffers of Windows, `ERR_NO_BUFFER_SPACE`) and sends `Cache-Control: no-cache` for everything but pictures and fonts, so that the browser does not show an old style or script after a change.

## 6. Publishing with GitHub Pages

`.github/workflows/pages.yml` publishes `website/` at `https://ralf1108.github.io/BARUnitComparer/` on every push to `main` that changes it (or by hand: "Run workflow"). One time: **Settings > Pages > Source: GitHub Actions**.

- **Tests first** (`tests.yml`, also for pull requests and other branches); the site is published only if they pass:
  - `tests/test_data.py`: the rules and the data files (versions, reduced file, chain of diffs, history, pictures with lower case names, counterparts, counters).
  - `tests/test_chain.py`, `tests/test_year.py`: the chain of `reduce_units.py` on made-up exports; the versions of the year (Git, engines, the plan of `update_versions.py`).
  - `tests/test_tools.py`: helpers.
  - `tests/website_smoke.mjs`: the page in a headless Edge or Chrome: catalog, the choice of units, the unit card, compare (all buttons, Ref, the strip, sorting, Share, steady scrolling), the link, favorites, game versions, Changes (range, Older / Newer, columns, filters), Help, a phone (390 px), and no script error and no missing file.
  - `python tests/make_chain_site.py <folder>` makes a copy of the site with a made-up chain of versions (a gone unit, an engine change); the tests run on it with `BARUNIT_ASSETS=<folder>/assets`, `BARUNIT_SITE=<folder>`.
  - Locally: `python -m unittest discover -s tests` and `node tests/website_smoke.mjs` (after `npm install` in `render_unit/`; own port).
- The workflow leaves out what the page does not read (the full `units-<version>.json`, `serve.py`, `serve.bat`): about 28 MB, 2100 files. All file names are lower case (Pages is case sensitive).
- **A new game version:** `update game versions.bat` (exports the new versions, refreshes counterparts and counters), check in `website/assets/`, push. Checked up to: `checkedUpTo` in `versions.json`.
- The page ends with a notice: unofficial fan project, content removed on request, the licences ([licence.md](licence.md)).

## 7. Open

- The BAR developers still have to be asked whether the published pictures are in order ([licence.md](licence.md)).
- `counters.json` has only 25 units (Armada and Cortex), as many as the counter charts name.
- `counterparts.json`: some groups have several units of one faction (the exporter lists them).
- A 3D view of the model is not built ([game-files.md](game-files.md)).
