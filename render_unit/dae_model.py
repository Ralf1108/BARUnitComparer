"""dae_model.py: Collada (.dae) models of Beyond All Reason units (render_unit.py, docs/game-files.md and docs/renderer.md).

Of the 1663 units one has a Collada model instead of an S3O (the format modules: s3o_model.py, this file) (`objects3d/raptors/raptorartillery.dae`). Its parts, the browser side: renderer/dae_loader.js (the geometry).
This file is the game side: a .dae has no texture names in a header like an S3O has; the textures come from the Lua file next to the model in the game
(`objects3d/raptors/raptorartillery.dae.lua`: `tex1 = "raptorArtillery_1.dds"`, `tex2 = "raptorArtillery_2.dds"`) and the normal map from the unit definition
(`customParams.normaltex`, here `unittextures/raptorArtillery_n.png`).
"""
import re

EXTENSION = 'dae'


def recognizes(model, data):
    return model.lower().endswith('.dae')


def textures(pool, model, data=None, normal_hint=None):
    """(tex1, tex2, normal): tex1 / tex2 are the names under unittextures/ (lower case, like in s3o_model.py), `normal` the whole name of the normal map in the
    pool or None. Raises ValueError if the .dae.lua next to the model does not name the colour texture."""
    lua_name = model.lower() + '.lua'
    if not pool.has(lua_name):
        raise ValueError(f'{lua_name} not found: no texture names for the Collada model')
    lua = pool.read(lua_name).decode('utf-8', errors='replace')
    lua = re.sub(r'--[^\n]*', '', lua)
    found = {k: (re.search(rf'\b{k}\s*=\s*"([^"]+)"', lua) or [None, None])[1] for k in ('tex1', 'tex2')}
    if not found['tex1']:
        raise ValueError(f'{lua_name} has no tex1')
    tex1 = found['tex1'].lower()
    tex2 = (found['tex2'] or '').lower()
    normal = None
    for name in (normal_hint, re.sub(r'_1(?=\.)', '_n', f'unittextures/{tex1}').rsplit('.', 1)[0] + '.png'):
        if name and pool.has(name.lower()):
            normal = name.lower()
            break
    return tex1, tex2, normal
