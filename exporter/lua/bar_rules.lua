-- Rules about BAR unit definitions that the Level Editor, the BluePrinter and the gadgets of the editor and its scenarios need in the
-- same way. Small and free of game state, so gadgets (synced) and widgets can load it with VFS.Include("luaui/Include/bar_rules.lua").
local R = {}

-- BAR files some Epic units under a lower tech level (Epic Grunt: T1, Epic Skater: T2): every Epic unit counts as T3
function R.techLevel(ud)
	local t = tonumber(ud.customParams and ud.customParams.techlevel) or 1
	if t < 3 then
		local human = ud.translatedHumanName or ud.humanName or ""
		local mv = ud.moveDef and ud.moveDef.name or ""
		if human:find("^Epic") or tostring(mv):find("epic", 1, true) then
			return 3
		end
	end
	return t
end

-- Kind of a structure for the Tower Defense build restriction: "economy" = metal and energy structures (extractors, solar,
-- wind, geothermal, fusion, storage, converters), "tower" = armed structure, "radar", nil = the rest (factories included)
function R.buildClass(ud)
	local cp = ud.customParams or {}
	if ud.isFactory then
		return nil
	end
	local ug = cp.unitgroup
	if ug == "energy" or ug == "metal" or (tonumber(ud.extractsMetal) or 0) > 0 then
		return "economy"
	elseif #ud.weapons > 0 and ug ~= "explo" then
		return "tower"
	elseif (tonumber(ud.radarDistance) or 0) > 0 then
		return "radar"
	end
	return nil
end

-- True when at least one weapon can hit the ground (pure anti-air units are of no use against walking enemies)
function R.hitsGround(ud)
	for _, w in ipairs(ud.weapons) do
		local wd = WeaponDefs[w.weaponDef]
		if wd and wd.canAttackGround then
			return true
		end
	end
	return false
end

-- Spring heading (-32768 to 32767) -> facing 0 to 3 (south, east, north, west): the nearest of the four directions
function R.headingToFacing(h)
	return math.floor(((tonumber(h) or 0) + 8192) / 16384) % 4
end

-- Text from base64url (the form the scenario builder puts into game options: "-" and "_" instead of "+" and "/", no "=")
local ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local B64 = {}
for i = 1, #ALPHA do
	B64[ALPHA:byte(i)] = i - 1
end

function R.decode64(s)
	s = (s:gsub("-", "+")):gsub("_", "/")
	local out, acc, bits = {}, 0, 0
	for i = 1, #s do
		local v = B64[s:byte(i)]
		if v then
			acc, bits = acc * 64 + v, bits + 6
			if bits >= 8 then
				bits = bits - 8
				local b = math.floor(acc / 2 ^ bits)
				out[#out + 1] = string.char(b)
				acc = acc - b * 2 ^ bits
			end
		end
	end
	return table.concat(out)
end

-- The three buttons Area Attack, Split Attack and Focus Attack of the command menu (custom commands of type ICON: pressing one arms the circle mode of
-- the area attack, see newAreaAttack in editor_common.lua). The BluePrinter adds them as a widget (widgetHandler.customCommands); the Level Editor
-- gives every unit these commands in its gadget (unit_level_editor.lua: a widget of a game archive may not add commands, a gadget may).
R.ATTACK_BUTTONS = {
	base = 43020, -- command ids base + 1 .. base + 3
	{ mode = "circle", name = "Area Attack",
		tip = "Area Attack (XC): drag a circle on the map, the selected units attack the area. Press the button again or right click to end." },
	{ mode = "split", name = "Split Attack",
		tip = "Split Attack (XS, experimental): drag a circle, the selected units spread their fire evenly over the visible enemies in it." },
	{ mode = "focus", name = "Focus Attack",
		tip = "Focus Attack (XF, experimental): drag a circle, the selected units kill the visible enemies in it one after the other." },
}

-- The order menu of BAR shows the text of "commands.<action>" and the tooltip of "commands.<action>_tooltip" from its translation table (it draws no
-- pictures for custom commands: showIcons is off): R.attackButtonTexts() is the table for Spring.I18N.load
function R.attackButtonTexts()
	local commands = {}
	for _, b in ipairs(R.ATTACK_BUTTONS) do
		commands["led_" .. b.mode .. "_attack"] = b.name
		commands["led_" .. b.mode .. "_attack_tooltip"] = b.tip
	end
	return { en = { commands = commands } }
end

-- The command descriptions of the three buttons (a new table every call: the engine may change what it gets)
function R.attackButtonDescs()
	local out = {}
	for i, b in ipairs(R.ATTACK_BUTTONS) do
		out[#out + 1] = { id = R.ATTACK_BUTTONS.base + i, type = CMDTYPE.ICON, name = b.name, action = "led_" .. b.mode .. "_attack", cursor = "Attack",
			tooltip = b.tip }
	end
	return out
end

return R
