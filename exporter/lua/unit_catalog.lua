-- The unit catalog of Beyond All Reason: which units there are, sorted by faction, group (buildings, turrets, bots ...) and tech level, and the best
-- shot of a unit. Taken out of editor_common.lua (Level Editor and BluePrinter), so that the unit export of the comparison website (led_export.lua,
-- unit-export.lua) needs only this file and bar_rules.lua, not the whole editor code with its menus and drawing.
-- Needs the game state of a widget (UnitDefs, WeaponDefs, Game), draws nothing. Loaded with
--   local Catalog = VFS.Include("luaui/Include/unit_catalog.lua", nil, VFS.ZIP_FIRST)
-- editor_common.lua takes its fields over (M.FACTIONS = Catalog.FACTIONS ...), so the code that uses them there does not change.
local C = {}

-- rules about unit definitions, shared with the gadgets (bar_rules.lua lies next to this file)
local Rules = VFS.Include("luaui/Include/bar_rules.lua", nil, VFS.ZIP_FIRST)
assert(Rules, "bar_rules.lua missing (run the installer again)")
local techLevel = Rules.techLevel

-- "scv" (Scavengers: the *_scav copies of all units) and "rap" (Raptors: raptor_*) are no side of the game: the units exist only with the game option
-- forceallunits (the editor and the scenarios of such levels set it), and nobody controls them (no Scavenger or Raptor AI in the team)
C.FACTIONS = { { "arm", "Armada" }, { "cor", "Cortex" }, { "leg", "Legion" }, { "scv", "Scavengers" }, { "rap", "Raptors" } }
C.GROUPS = {
	{ "buildings", "Buildings" }, { "turrets", "Turrets" }, { "bot", "Bots" }, { "vehicle", "Vehicles" }, { "hover", "Hover" },
	{ "air", "Air" }, { "ships", "Ships" },
}

-- The group of a unit definition: "buildings", "turrets", "bot", "vehicle", "hover", "air" or "ships"
local function unitGroup(ud)
	local mc = ud.modCategories or {}
	if ud.isBuilding or not ud.canMove then
		-- turrets: buildings with a weapon (no factories, no mines and other explosive buildings)
		if #(ud.weapons or {}) > 0 and not ud.isFactory and (ud.customParams or {}).unitgroup ~= "explo" then
			return "turrets"
		end
		return "buildings"
	elseif mc.ship or mc.underwater then
		return "ships"
	elseif ud.canFly then
		return "air"
	elseif ud.name:sub(1, 7) == "raptor_" then
		return "bot" -- the raptors walk, although their movement classes are called ...HOVER
	elseif mc.hover then
		return "hover"
	elseif mc.bot then
		return "bot"
	end
	-- The category BOT no longer exists in BAR: sort by movement type (BOT2, ABOT3, TANK3, HOVER3, BOAT4 ...)
	local mv = ud.moveDef
	local mcName = string.upper(tostring((type(mv) == "table" and mv.name) or ud.movementClass or ud.movementclass or ""))
	if mcName:find("BOAT", 1, true) then
		return "ships"
	elseif mcName:find("HOVER", 1, true) then
		return "hover"
	elseif mcName:find("BOT", 1, true) then
		return "bot"
	end
	return "vehicle"
end
C.unitGroup = unitGroup

-- Sort rank within a group (smaller = further front). Water/land and fillers are handled separately.
-- Buildings: economy, factories, turrets, other. Bots: builders, combat, support, commanders.
-- Vehicles/hover/ships: builders, rest. Air: builders, scouts, interceptors, attack, transport; seaplanes after that.
local function unitRank(ud, group, cp)
	local ug = cp.unitgroup
	local weapons = (ud.weapons and #ud.weapons) or 0
	local mc = ud.modCategories or {}
	if group == "turrets" then
		return 2
	end
	if group == "buildings" then
		if ud.isFactory then
			return 1
		elseif ug == "energy" or ug == "metal" or (tonumber(ud.extractsMetal) or 0) > 0 then
			return 0
		elseif weapons > 0 and ug ~= "explo" then
			return 2
		end
		return 3
	end
	if cp.iscommander ~= nil then
		return 3
	end
	if ud.isBuilder then
		return 0
	end
	if group == "bot" then
		return (weapons > 0) and 1 or 2
	elseif group == "air" then
		if (tonumber(ud.transportCapacity) or 0) > 0 and weapons == 0 then
			return 4 -- transport aircraft at the very back
		elseif mc.lightairscout or ug == "util" then
			return 1
		elseif ug == "aa" then
			return 2
		end
		return 3
	end
	return 1
end

-- Weapon with the highest damage per projectile (ground weapons before anti-air): returns damage per projectile, projectiles per second and
-- "anti-air" (true/false) (0, 0, false without a weapon), then the energy and metal cost of one shot of that weapon.
-- Anti-air weapons in BAR carry almost no default damage (e.g. 1), but the actual damage in the
-- armor class "vtol"; if that is higher than the default damage, it counts and the weapon is anti-air.
-- Projectiles per second = projectiles per shot * salvo size / reload time (as with the DPS figure).
local shotCache = {}
function C.shotInfo(unitDefID)
	local c = shotCache[unitDefID]
	if c then
		return c[1], c[2], c[3], c[4], c[5]
	end
	local bestDmg, bestSps, bestAA, bestEnergy, bestMetal = 0, 0, false, 0, 0
	local ud = UnitDefs[unitDefID]
	if ud and WeaponDefs then
		local types = (Game and Game.armorTypes) or {}
		local defIdx, vtolIdx = types.default or 0, types.vtol or 14
		for _, w in ipairs(ud.weapons or {}) do
			local wd = WeaponDefs[w.weaponDef]
			if wd and wd.damages then
				local d = tonumber(wd.damages[defIdx]) or 0
				local v = tonumber(wd.damages[vtolIdx]) or 0
				local aa = v > d
				if aa then
					d = v
				end
				local perShot = (tonumber(wd.projectiles) or 1) * (tonumber(wd.salvoSize) or 1)
				local reload = tonumber(wd.reload) or 0
				local sps = (reload > 0) and (perShot / reload) or 0
				-- Weapons against ground targets take priority; pure anti-air only if there are none
				if (bestDmg == 0) or (bestAA and not aa and d > 0) or (bestAA == aa and d > bestDmg) then
					bestDmg, bestSps, bestAA, bestEnergy, bestMetal = d, sps, aa, tonumber(wd.energyCost) or 0, tonumber(wd.metalCost) or 0
				end
			end
		end
	end
	bestDmg = math.floor(bestDmg + 0.5)
	shotCache[unitDefID] = { bestDmg, bestSps, bestAA, bestEnergy, bestMetal }
	return bestDmg, bestSps, bestAA, bestEnergy, bestMetal
end

-- The faction key of a unit name: arm / cor / leg, scv for the *_scav copies, rap for the raptors (nil: not offered, e.g. critters)
-- Second value: the name without _scav
function C.factionOf(name)
	if name:sub(-5) == "_scav" then
		return "scv", name:sub(1, -6)
	elseif name:sub(1, 7) == "raptor_" then
		return "rap", name
	end
	return name:sub(1, 3), name
end

-- [faction][group][tech] = { { name, id, filler, water, rank } ... }, built once from UnitDefs
function C.buildUnitCache()
	local cache = {}
	for _, f in ipairs(C.FACTIONS) do
		cache[f[1]] = {}
		for _, g in ipairs(C.GROUPS) do
			cache[f[1]][g[1]] = { {}, {}, {} }
		end
	end
	for id, ud in pairs(UnitDefs) do
		local name = ud.name
		local key, base = C.factionOf(name) -- base: the name without _scav (the checks below are about the normal unit)
		local fac = cache[key]
		local cp = ud.customParams or {}
		-- without decoration (arm_leftshoulder_..., cor_hat_..., armpw_wings): names with "_" at the 4th position or "_wings"
		if fac and (key == "scv" or key == "rap" or not name:find("scav")) and not base:find("scav") and not base:find("decom") and not base:find("comlvl%d")
			and not base:find("dummy") and not base:find("drone") and not cp.isdrone and (key == "rap" or base:sub(4, 4) ~= "_") and not name:find("_wings", 1, true) then
			local tech = math.max(1, math.min(3, math.floor(techLevel(ud))))
			local group = unitGroup(ud)
			local list = fac[group][tech]
			local filler = group == "buildings" and cp.objectify ~= nil -- dragon teeth, walls ... you hardly need
			local minW = tonumber(ud.minWaterDepth) or 0
			local water = ((group == "buildings" or group == "turrets") and (minW > 0 or (ud.floatOnWater and minW >= 0)))
				or (group == "air" and (tonumber(ud.maxWaterDepth) or 0) > 0) -- water buildings or seaplanes
			water = water and true or false
			-- the Scavengers hold the units of all three factions: first all of Armada, then Cortex, then Legion (and the units of their own), each in the order of the other factions
			local sub = key == "scv" and ({ arm = 1, cor = 2, leg = 3 })[base:sub(1, 3)] or 0
			if key == "scv" and sub == 0 then
				sub = 4
			end
			list[#list + 1] = { name = name, id = id, filler = filler, water = water, rank = sub * 10000 + (filler and 1000 or 0) + (water and 100 or 0) + unitRank(ud, group, cp) }
		end
	end
	for _, fac in pairs(cache) do
		for _, g in pairs(fac) do
			for _, list in ipairs(g) do
				table.sort(list, function(a, b)
					if a.rank ~= b.rank then
						return a.rank < b.rank -- land before water, then by kind; fillers (teeth, walls) at the very back
					end
					return a.name < b.name
				end)
			end
		end
	end
	return cache
end

return C
