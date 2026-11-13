# The game's files and formats

What the tools read from an installed Beyond All Reason: the data folder with its pool of files, the model and texture formats. Nothing here is written by the tools.

## The data folder and the pool

The data folder of the BAR installation (e.g. `C:\Games\Beyond-All-Reason\data`) holds the files in a pool: `packages/<hash>.sdp` is a gzip stream of entries `[1 byte length of the name][name][16 bytes md5][4 bytes crc][4 bytes size]` (the biggest `.sdp` is the game), the file of an entry is `pool/<first two hex digits of the md5>/<the other 30 digits>.gz` (gzip). Names are in lower case: `objects3d/units/armllt.s3o`, `unittextures/arm_color.dds`, `unitpics/armllt.dds`, `scripts/units/armllt.bos`. `cache/ArchiveCache*.lua` lists the installed archives (games, maps) as the engine knows them. All tools only **read** this folder.

All tools write into `website/assets/`, per game version, and check the results in (the layout: [website.md](website.md), section "Data"; which game versions keep what: [versions.md](versions.md)).

All tools find the data folder the same way: `--data` / `-Data`, otherwise the environment variable `BAR_DATA`, otherwise the usual places (`shared/data_dirs.txt`); a data folder has the folders `packages` and `pool`, a given folder that is none is an error.

What the tools share is in `shared/`: `bar_common.py` for the Python tools (data folder, archive cache and pool of the game, faction of a unit by its name, version in file names, pages of beyondallreason.info, unit names of the newest version) and `BarCommon.ps1` for the PowerShell scripts (data folder, faction, version in file names, picture extension), with the same rules; both read `data_dirs.txt`. The Lua files of the exporter keep their own copies (they run inside the game).


## Models, textures, pictures in the game

### The S3O format (little endian)

Header (52 bytes): `"Spring unit\0"` (12), `uint32` version (0), `float` radius, height, midX, midY, midZ, `uint32` offset of the root piece, collision data (0), offset of the name of texture 1 (colour), of texture 2 (shine, glow); names end with a 0 byte.

Piece: ten `uint32`: offset of the name, number of children, offset of the child list (`uint32` offsets of pieces), number of vertices, offset of the vertices, vertex type, primitive type (0 triangles, 1 strip, 2 quads), number of index entries, offset of the index table (`uint32` indices), collision data; then three `float` x, y, z: the offset to the parent. A vertex is eight `float`s: position, normal, u, v.

The model is the sum of all pieces, each moved by the sum of its parents' offsets. Positions are used **as they are, not mirrored**; the model's front is at +z (checked with `legnavyscout`, `legnavyconship`, `legnavyfrigate` against the website's pictures: only the unmirrored model shows the same turret and the same side with the lamps). In three.js the camera that looks at the front is on the +z side.

### Models in the website

A 3D view is not built yet. The plan: no conversion in advance, the website reads the `.s3o` files in the browser (JavaScript, e.g. three.js with OrbitControls: left mouse drag turns, wheel zooms, optional automatic turning). The files are small (780 models without wrecks: 99 MB, 127 KB on average, largest 911 KB) and the textures are shared. Animations are not available; the pieces are not moved.

### Textures

All units of a faction share **one colour atlas** (the file named in the S3O, `unittextures/arm_color.dds`, `cor_color.dds`, `leg_color.dds`): 4096 x 4096, DDS, 22.4 MB each. A browser cannot read DDS: a 3D view on the website would need the three atlases converted once (e.g. WebP/JPEG, 2048 x 2048, 1 to 3 MB each). Raptors and some special units have their own smaller textures (`chicken_*_color.dds`). Channels (from the game's shader `modelmaterials_gl4/templates/cus_gl4.frag.glsl`): colour texture `rgb` = albedo, `a` = mask of the team colour; second texture (`*_other.dds` for Armada and Cortex, `leg_shader.dds` for Legion) `r` = emissive, `g` = metalness, `b` = roughness; normal map (`*_normal.dds`) `rgb` = normal.

### In-game pictures

`unitpics/<buildpic>`: 256 x 256, DDS, RGBA, about 430 KB (15 to 30 KB as JPEG/WebP). They are small and show the unit from above; the website uses the rendered pictures of [renderer.md](renderer.md) instead.
