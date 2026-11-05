# render_unit

Renders pictures of Beyond All Reason units from the game's own 3D models, in the look of the pictures on beyondallreason.info (400 x 400 pixels, shadow, soft light). The details of the look, the formats and the measurements are in [SPECIFICATION.md](../SPECIFICATION.md), section 5.

```
python render_unit.py [options] <unit> [<unit> ...]        (or @file: one unit name per line)
render_unit.bat                                              (double click: asks for units, format, quality)
```

Examples:

```
python render_unit.py armllt legnavyscout                                  PNG of two units
python render_unit.py --format avif --avif-quality 80 armllt               AVIF with quality 80
python render_unit.py --format all armllt                                  all five formats and a quality table
python render_unit.py --units ../website/assets/<version>/data/units-<version>.json raptor_land_swarmer_basic_t1_v1
```

## How it works

1. Model (`.s3o`), textures and unit script are read from the game files (the game is only read).
2. Pieces that the script hides when the unit is created are left out.
3. A headless browser (Edge or Chrome, three.js) renders a lossless PNG with transparent background; the wanted formats are made from it.

## Options

| Option | Default | Meaning |
|---|---|---|
| `<unit> ...` | | Unit names (`armllt`, `legnavyscout`, ...); `@file` reads names from a file |
| `--out DIR` | `website/assets/<game version>/images` of the repository | Folder for the pictures: `<unit>.<format>` |
| `--units FILE` | none | `units-<version>.json` of the exporter. Gives model, script and faction of every unit. **Needed for the Raptors** (their models are not named like the unit). Without it the model is looked for as `objects3d/units/<unit>.s3o` (Scavenger copies use the model of their unit). An error if the file is missing |
| `--format` | `png` | `png`, `jpeg` (or `jpg`), `bmp`, `avif`, `webp`, several separated by commas, or `all`. BMP and JPEG have no transparency (white background) |
| `--size` | 400 | Edge of the square picture in pixels (the size of the pictures on beyondallreason.info) |
| `--team R,G,B` | by faction | One colour for the team colour parts of all units. By default: Armada blue, Cortex red, Legion green, Scavengers purple, Raptors black |
| `--jobs N` | half of the processor cores, at most 4 | How many browsers render at the same time (also the number of processes for texture conversion and encoding). 1 = one after the other. More than 4 does not make it faster |
| `--software` | off | Render on the processor (SwiftShader) instead of the graphics card. By default the graphics card is used (about 3 times faster end to end) and the processor only if there is no usable GPU. The pictures are very close, not pixel-identical (SSIM 0.998) |
| `--data DIR` | `BAR_DATA`, else the usual places | Data folder of the BAR installation |
| `--game NAME` | the newest installed | `"Beyond All Reason <version>"`, to render with an older installed version (use the units file of that version) |
| `--work DIR` | `%TEMP%\render_unit` | Cache for converted textures and models (kept between runs, so that the next run is faster) |
| `--tex-size` | 2048 | The 4096 pixel texture atlases are scaled down to this size |
| `--browser EXE` | looked for (or `RENDER_BROWSER`) | Microsoft Edge or Google Chrome |
| `--param key=value` | | A value of the renderer (`renderer/index.html`), e.g. `sun=2.5`, `az=300`, `frame=0.7`; can be repeated |
| `-v`, `--verbose` | off | Says which pieces are left out, which team colour is used and how long each phase took |

`--skip-existing` (off): leave out the units whose pictures in all wanted formats are in `--out` already, to go on after an abort. Pictures are written as `<file>.part` and renamed when complete, so an abort leaves no half picture.

### Quality of the formats

| Option | Default | Meaning |
|---|---|---|
| `--avif-quality` | 70 | AVIF, 0 to 100 |
| `--avif-speed` | 6 | AVIF encoder speed: 0 (slowest, smallest) to 10 (fastest) |
| `--webp-quality` | 85 | WebP, 0 to 100 |
| `--webp-method` | 4 | WebP effort: 0 (fast) to 6 (slowest, smallest) |
| `--jpeg-quality` | 90 | JPEG, 0 to 100 |
| `--jpeg-subsampling` | 0 | JPEG colour subsampling: 0 = none (4:4:4), 1 = 4:2:2, 2 = 4:2:0 (smallest) |
| `--no-quality-check` | check on | With two or more formats the script measures each format against the lossless picture (PSNR, SSIM, alpha PSNR, mean size) and prints a table; this switches it off. Needs `scipy` |

Mean file sizes at 400 x 400 pixels (the lossless PNG is about 87 KB): AVIF 70 about 12 KB, WebP 85 about 15 KB, JPEG 90 about 28 KB, all with an SSIM of about 0.994.

## render_unit.bat

Asks for the unit names (Enter = `armllt`, a quick test), the format (default all five), the quality per format (`avif=80 jpeg=95`, Enter = defaults), whether to run the quality check and the units file (Enter = none). The pictures go to `website/assets/<game version>/images`.

## compare_quality.py

```
python compare_quality.py [--work DIR] [--size 400] [--units FILE] <unit> [<unit> ...]
```

Renders the units once and measures a grid of quality settings per format (JPEG 80 to 95, WebP 75 to 95, AVIF 50 to 90) against the lossless picture: size, PSNR, SSIM, alpha PSNR. To choose the settings for the website.

## Requirements

Python 3 with `numpy`, `Pillow` (a recent one with AVIF support; tested with 12.3.0) and `scipy` (quality check); Node.js (the first run runs `npm install` for three.js and playwright-core in this folder); Microsoft Edge or Google Chrome.

## Files

| File | |
|---|---|
| `render_unit.py` | the main script and the shared part: game files, textures, hidden pieces, output formats, quality check |
| `s3o_model.py`, `dae_model.py` | the model formats, game side: S3O (texture names in the header) and Collada (texture names from the `.dae.lua` next to the model) |
| `render_unit.bat` | double-click starter with questions |
| `compare_quality.py` | grid of quality settings |
| `renderer/index.html` | the 3D page (three.js), shared part: material, light, shadow, camera; picks the model loader by the file extension |
| `renderer/s3o_loader.js`, `renderer/dae_loader.js` | the model formats, browser side: each turns a model file into one geometry |
| `renderer/render.mjs` | starts the browser and a small local web server (only during the run, `127.0.0.1`) and takes the pictures |
| `package.json` | three.js and playwright-core |
