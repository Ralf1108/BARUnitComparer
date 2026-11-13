"""unit_rules.py: the rules that make the values of the website from the exporter's data of a unit (docs/website.md, section "Fields of a unit in the reduced file").
Pure functions without files: category, dps, texts, reduce_unit; natural is the sort key of game version names. Used by reduce_units.py; tested in tests/test_data.py.
"""
import re

CATEGORY_OF_GROUP = {'bot': 'bots', 'vehicle': 'vehicles', 'air': 'air', 'ships': 'sea', 'hover': 'hover', 'turrets': 'defense'}


def category(game, editor):
    if game.get('isFactory'):
        return 'factories'
    if editor.get('filler'):
        return 'defense'
    return CATEGORY_OF_GROUP.get(editor.get('group'), 'buildings')


def dps(weapons):
    """Damage per second of all weapons that deal damage continuously (docs/website.md)."""
    total = 0.0
    for w in weapons:
        if (w.get('customParams') or {}).get('bogus') or w.get('isShield') or w.get('type') == 'Shield' or w.get('interceptor') or w.get('paralyzer') or w.get('stockpile') or w.get('manualFire'):
            continue
        damages = w.get('damages') or {}
        reload = w.get('reload') or 0
        if reload > 0:
            total += max(damages.get('default') or 0, damages.get('vtol') or 0) * (w.get('projectiles') or 1) * (w.get('salvoSize') or 1) / reload
    return total


def texts(unit_name, editor):
    """Name and description. Some units have no translation in the game: the text is then only a key (`units.names.armprowl`). The description is the name then if it is a real
    text (armprowl: "Prowler"), otherwise the name of the unit."""
    name, description = editor.get('humanName') or '', editor.get('description') or ''
    name_missing, description_missing = name.startswith('units.'), description.startswith('units.')
    if name_missing:
        name, description = (description, '') if description and not description_missing else (unit_name, '')
    elif description_missing:
        description = ''
    return name, description


def reduce_unit(unit_name, unit):
    game, editor = unit['game'], unit['editor']
    weapons = editor.get('weapons') or []
    name, description = texts(unit_name, editor)
    types = list(dict.fromkeys(w['type'] for w in weapons if w.get('type') and not (w.get('customParams') or {}).get('bogus')))
    energy_make = max(0, (game.get('energyMake') or 0) - (game.get('energyUpkeep') or 0)) + (game.get('windGenerator') or 0) + (game.get('tidalGenerator') or 0)
    return {
        'name': name, 'description': description, 'faction': editor.get('faction'), 'category': category(game, editor),
        'tech': editor.get('tech') or 1, 'metal': game.get('metalCost') or 0, 'energy': game.get('energyCost') or 0, 'buildTime': round((game.get('buildTime') or 0) / 100, 1),
        'buildPower': game.get('buildSpeed') or 0, 'energyMake': round(energy_make, 1), 'hitpoints': round(game.get('health') or 0, 1), 'radar': game.get('radarDistance') or 0,
        'speed': round(game.get('speed') or 0, 1), 'weapons': types, 'dps': round(dps(weapons), 1), 'range': game.get('maxWeaponRange') or 0,
    }


def natural(text):
    """Sort key with the numbers in the text as numbers: test-31450 before test-31820."""
    return [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', text)]
