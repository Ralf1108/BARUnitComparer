"""unit_rules.py: the rules that make the values of the website from the exporter's data of a unit (docs/website.md, section "Fields of a unit in the reduced file").
Pure functions without files: category, skipped, high_modes, firing, counted, dps, shots, hits_air, targets, air_dps, area, weapon_list, texts, reduce_unit; natural is the sort key of game version names. Used by reduce_units.py; tested in tests/test_data.py.
"""
import re

CATEGORY_OF_GROUP = {'bot': 'bots', 'vehicle': 'vehicles', 'air': 'air', 'ships': 'sea', 'hover': 'hover', 'turrets': 'defense'}


def category(game, editor):
    if game.get('isFactory'):
        return 'factories'
    if editor.get('filler'):
        return 'defense'
    return CATEGORY_OF_GROUP.get(editor.get('group'), 'buildings')


def skipped(w):
    """A weapon that the totals leave out: bogus, shield, interceptor, paralyzer, stockpile (nuke), manual fire (D-gun)."""
    return bool((w.get('customParams') or {}).get('bogus') or w.get('isShield') or w.get('type') == 'Shield' or w.get('interceptor') or w.get('paralyzer') or w.get('stockpile') or w.get('manualFire'))


def high_modes(weapons):
    """The ids (Python id) of the weapons that are the high trajectory of a cannon that can switch between a high and a low one (armguard: plasma and plasma_high,
    armvang: shocker_low and shocker_high): the same name with `_high` at the end as another weapon of the unit (without it or with `_low`), the same description.
    Only one of the two fires, so the totals count the low one."""
    base = lambda n: re.sub(r'_(high|low)$', '', n or '')
    out = set()
    for w in weapons:
        n = w.get('name') or ''
        if n.endswith('_high') and any(o is not w and base(o.get('name')) == base(n) and not (o.get('name') or '').endswith('_high')
                                       and o.get('description') == w.get('description') for o in weapons):
            out.add(id(w))
    return out


def firing(weapons):
    """The weapons that the totals count: not skipped, and of a cannon with two trajectories only the low one."""
    high = high_modes(weapons)
    return [w for w in weapons if not skipped(w) and id(w) not in high]


def counted(weapons):
    """The weapons that deal damage continuously: (damage of one shot, seconds to the next shot) of each one (docs/website.md). Left out: bogus weapons, shields,
    interceptors, paralyzers, stockpile weapons (nukes) and manual-fire weapons (D-gun). One shot: all projectiles of a salvo, against ground or air, the larger."""
    out = []
    for w in firing(weapons):
        damages = w.get('damages') or {}
        reload = w.get('reload') or 0
        if reload > 0:
            out.append((max(damages.get('default') or 0, damages.get('vtol') or 0) * (w.get('projectiles') or 1) * (w.get('salvoSize') or 1), reload))
    return out


def dps(weapons):
    """Damage per second of all weapons that deal damage continuously."""
    return sum(shot / reload for shot, reload in counted(weapons))


def shots(weapons):
    """(damage per shot, shots per second): the damage of one shot of all these weapons together, and how often per second they fire; damage per shot times
    shots per second is the DPS. With one weapon: its shot and 1 / reload; with several of different reload: the rate that gives their DPS together."""
    w = counted(weapons)
    shot = sum(s for s, _ in w)
    return shot, (dps(weapons) / shot if shot else 0)


# the categories that every aircraft has (modCategories of the units that fly): a weapon whose targets (onlyTargets of its mount) name one of them can aim at aircraft
AIR = {'all', 'mobile', 'notsub', 'nothover', 'notship', 'vtol', 't4air', 'lightairscout'}
NOT_UP = {'AircraftBomb', 'TorpedoLauncher'}   # these fall or swim: they never hit an aircraft, whatever their targets say


def hits_air(w):
    """Can the weapon hit aircraft: its targets (none named: every unit; an export without them: yes) share a category with every aircraft, and it is no bomb or torpedo."""
    targets = w.get('onlyTargets')
    return w.get('type') not in NOT_UP and (not targets or bool(AIR & set(targets)))


# the categories that only aircraft have: a weapon whose targets are all among them aims at aircraft only (an anti-air weapon)
AIR_ONLY = {'vtol', 't4air', 'lightairscout'}


def targets(w):
    """What the weapon aims at: 'air' (aircraft only), 'both' (aircraft and units on the ground or the water), 'ground' (no aircraft)."""
    if not hits_air(w):
        return 'ground'
    named = set(w.get('onlyTargets') or [])
    return 'air' if named and named <= AIR_ONLY else 'both'


def air_dps(weapons):
    """Damage per second against aircraft (the damage to the armour class vtol) of the weapons that dps counts and that can hit aircraft."""
    total = 0.0
    for w in firing(weapons):
        if hits_air(w) and (w.get('reload') or 0) > 0:
            total += ((w.get('damages') or {}).get('vtol') or 0) * (w.get('projectiles') or 1) * (w.get('salvoSize') or 1) / w['reload']
    return total


def area(weapons):
    """The largest area of effect (radius, in elmos) of the weapons that dps counts."""
    return max((w.get('damageAreaOfEffect') or 0 for w in firing(weapons) if (w.get('reload') or 0) > 0), default=0)


# the weapons that the total leaves out but the list of weapons shows, marked (in this order of precedence)
KINDS = (('interceptor', 'antinuke'), ('stockpile', 'nuke'), ('paralyzer', 'emp'), ('manualFire', 'dgun'))


def weapon_list(unit_name, weapons):
    """Every real weapon of the unit with its own values (docs/website.md): the page can show one of them instead of all together. Left out: bogus weapons (helpers
    of the animation), shields and weapons without damage. The same weapon mounted twice is one entry with `n` (its values count all mounts).
    id: the name of the weapon without the unit's name in front (the same in the Scavenger copy and in every game version), name: the game's description."""
    out, high = {}, high_modes(weapons)
    for w in weapons:
        damages = w.get('damages') or {}
        hit = max(damages.get('default') or 0, damages.get('vtol') or 0)
        if (w.get('customParams') or {}).get('bogus') or w.get('isShield') or w.get('type') == 'Shield' or not hit:
            continue
        code = w.get('name') or ''
        for prefix in (unit_name + '_', unit_name.removesuffix('_scav') + '_'):
            if code.startswith(prefix):
                code = code[len(prefix):]
                break
        if code in out:
            out[code]['n'] += 1
            continue
        reload, many = w.get('reload') or 0, (w.get('projectiles') or 1) * (w.get('salvoSize') or 1)
        rate = 1 / reload if reload > 0 else 0
        entry = {'id': code, 'name': (w.get('description') or code).strip(), 'type': w.get('type') or '', 'n': 1, 'shot': hit * many, 'air': (damages.get('vtol') or 0) * many if hits_air(w) else 0,
                 'rate': rate, 'range': w.get('range') or 0, 'aoe': w.get('damageAreaOfEffect') or 0, 'targets': targets(w)}
        kind = next((k for flag, k in KINDS if w.get(flag)), 'high' if id(w) in high else None)   # high: the high trajectory of a cannon (high_modes)
        if kind:
            entry['kind'] = kind
        out[code] = entry
    result = []
    for e in out.values():
        n = e.pop('n')
        shot, air, rate = e.pop('shot') * n, e.pop('air') * n, e.pop('rate')
        e.update({'shotDamage': round(shot, 1), 'shotsPerSecond': round(rate, 2), 'dps': round(shot * rate, 1), 'airDps': round(air * rate, 1), 'aoe': round(e['aoe'])})
        if n > 1:
            e['n'] = n
        result.append(e)
    return result


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
    shot, rate = shots(weapons)
    return {
        'name': name, 'description': description, 'faction': editor.get('faction'), 'category': category(game, editor),
        'tech': editor.get('tech') or 1, 'metal': game.get('metalCost') or 0, 'energy': game.get('energyCost') or 0, 'buildTime': round((game.get('buildTime') or 0) / 100, 1),
        'buildPower': game.get('buildSpeed') or 0, 'energyMake': round(energy_make, 1), 'hitpoints': round(game.get('health') or 0, 1), 'radar': game.get('radarDistance') or 0,
        'speed': round(game.get('speed') or 0, 1), 'weapons': types, 'shotDamage': round(shot, 1), 'shotsPerSecond': round(rate, 2), 'dps': round(dps(weapons), 1), 'airDps': round(air_dps(weapons), 1),
        'range': game.get('maxWeaponRange') or 0, 'aoe': round(area(weapons)), 'weaponList': weapon_list(unit_name, weapons),
    }


def natural(text):
    """Sort key with the numbers in the text as numbers: test-31450 before test-31820."""
    return [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', text)]
