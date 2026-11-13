"""s3o_model.py: S3O models of Beyond All Reason units (render_unit.py, docs/game-files.md and docs/renderer.md). The browser side is renderer/s3o_loader.js.

Every model format of render_unit.py is a module with the same three things: EXTENSION (of the model file in the work folder), recognizes(model, data) and
textures(pool, model, data, normal_hint) -> (colour texture, second texture, normal map or None); see dae_model.py for the other format.
"""
import struct

EXTENSION = 's3o'


def recognizes(model, data):
    return data[:12] == b'Spring unit\0'


def textures(pool, model, data, normal_hint=None):
    """The names of the two textures in the header of an .s3o (under unittextures/, lower case): the colour texture and the second one (glow, metal, roughness); the normal
    map is None here: render_unit.py takes the one named like the colour texture (`_color` -> `_normal`)."""
    if not recognizes(model, data):
        raise ValueError('not an S3O file')
    h = struct.unpack('<I2f3f4I', data[12:52])
    text = lambda o: data[o:data.index(b'\0', o)].decode('latin-1').lower()
    return text(h[8]), text(h[9]), None
