-- Export buttons of the settings page (button O) of the Level Editor: "Export Units Info" and "Export Comparison".
-- Loaded by lvl_level_editor.lua (VFS.Include("luaui/Include/led_export.lua")) as a function that gets the host and returns the table `ex`:
-- ex.actions (the buttons for Shared.newOptions: { label, tip, fn }; fn returns the message shown under the buttons), ex.exportUnits(), ex.exportComparison()
-- (both return the message and true if they succeeded, false if not).
--   host.Shared, host.outDir ("LevelEditor/"), host.say(text); host.dir (optional): the folder of the two files, with a "/" at the end
-- (default <outDir>Other/; unit-extraction.lua, a user widget, sets it to a folder it may write to)
-- Both files go to <outDir>Other/ in the data folder of the game (units-<game version>.json, comparison.json). Their content and use: SPECIFICATION.md.
return function(host)
	local Shared = host.Shared
	local DIR = host.dir or (host.outDir .. "Other/")
	local ex = {}

	---------------------------------------------------------------- JSON text (sorted keys, so that two runs give the same file)
	local ESC = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
	local function quote(s)
		return '"' .. s:gsub('[%c"\\]', function(c) return ESC[c] or string.format("\\u%04x", c:byte()) end) .. '"'
	end

	local function number(v)
		if v ~= v or v == math.huge or v == -math.huge then
			return "null"
		elseif v == math.floor(v) and math.abs(v) < 1e15 then
			return string.format("%d", v)
		end
		return (string.format("%.6g", v))
	end

	-- keys of a table that the raw dump leaves out: sounds and the like (large, no use on a page), what is written by hand below
	local SKIP = { sounds = true, weapons = true, buildOptions = true, visuals = true, cmdDescs = true, decoyFor = true, model = true }

	-- The names of the fields of a unit definition and of a weapon definition (the engine file LuaUnitDefs.cpp / LuaWeaponDefs.cpp of the Recoil engine, the names of its
	-- parameter maps): UnitDefs[id] gives most of them only when asked by name (pairs() lists a few), so the fields are asked one by one
	local UNIT_FIELDS = {
	"activateWhenBuilt", "airLosRadius", "airSightDistance", "airStrafe", "armorType", "armoredMultiple", "autoHeal", "bankingAllowed", "buildDistance",
	"buildOptions", "buildOptionsCount", "buildPic", "buildRange3D", "buildSpeed", "buildTime", "buildeeBuildRadius", "buildingDecalDecaySpeed",
	"buildingDecalSizeX", "buildingDecalSizeY", "buildingDecalType", "buildpicname", "canAssist", "canAttack", "canAttackWater", "canBeAssisted",
	"canCapture", "canCloak", "canDropFlare", "canFight", "canFireControl", "canFly", "canGuard", "canKamikaze", "canLoopbackAttack", "canManualFire",
	"canMove", "canParalyze", "canPatrol", "canReclaim", "canRepair", "canRepeat", "canRestore", "canResurrect", "canSelfD", "canSelfDestruct",
	"canSelfRepair", "canStockpile", "canSubmerge", "cantBeTransported", "capturable", "captureSpeed", "cloakCost", "cloakCostMoving", "cobID",
	"collide", "collisionVolume", "corpse", "crashDrag", "cruiseAltitude", "customParams", "deathExplosion", "decloakDistance", "decloakOnFire",
	"decloakSpherical", "decoyDef", "description", "dlHoverFactor", "energyCost", "energyMake", "energyStorage", "energyUpkeep", "extractRange",
	"extractsMetal", "factoryHeadingTakeoff", "fallSpeed", "fireState", "flankingBonusDirX", "flankingBonusDirY", "flankingBonusDirZ",
	"flankingBonusMax", "flankingBonusMin", "flankingBonusMobilityAdd", "flankingBonusMode", "flareDelay", "flareDropVectorX", "flareDropVectorY",
	"flareDropVectorZ", "flareEfficiency", "flareReloadTime", "flareSalvoDelay", "flareSalvoSize", "flareTime", "floatOnWater", "frontToSpeed",
	"fullHealthFactory", "groundFrictionCoefficient", "harvestEnergyStorage", "harvestMetalStorage", "hasShield", "health", "height", "hideDamage",
	"highTrajectoryType", "holdSteady", "hoverAttack", "humanName", "iconType", "id", "idleAutoHeal", "idleTime", "isAirUnit", "isBomberAirUnit",
	"isBuilder", "isBuilding", "isExtractor", "isFactory", "isFeature", "isFighterAirUnit", "isFirePlatform", "isGroundUnit", "isHoveringAirUnit",
	"isImmobile", "isMobileBuilder", "isStaticBuilder", "isStrafingAirUnit", "isTargetingUpgrade", "isTransport", "jammerRadius", "kamikazeDist",
	"kamikazeDistance", "kamikazeUseLOS", "leaveTracks", "leavesGhost", "levelGround", "loadingRadius", "losHeight", "losRadius", "makesMetal", "mass",
	"maxAcc", "maxAileron", "maxBank", "maxCoverage", "maxDec", "maxElevator", "maxHeightDif", "maxPitch", "maxRange", "maxRepairSpeed", "maxRudder",
	"maxThisUnit", "maxWaterDepth", "maxWeaponRange", "metalCost", "metalMake", "metalStorage", "metalUpkeep", "minCollisionSpeed", "minWaterDepth",
	"modCategories", "model", "modelname", "modelpath", "modeltype", "moveDef", "moveState", "myGravity", "name", "nanoColorB", "nanoColorG",
	"nanoColorR", "needGeo", "noChaseCategories", "onOffable", "power", "rSpeed", "radarDistance", "radarDistanceJam", "radarEmitHeight", "radarRadius",
	"radius", "reclaimSpeed", "reclaimable", "releaseHeld", "repairSpeed", "repairable", "resurrectSpeed", "rollingResistanceCoefficient", "scriptName",
	"scriptPath", "seismicDistance", "seismicRadius", "seismicSignature", "selectionVolume", "selfDCountdown", "selfDExplosion",
	"selfDestructCountdown", "shieldWeaponDef", "showNanoFrame", "showNanoSpray", "showPlayerName", "sightDistance", "sightEmitHeight",
	"slideTolerance", "sonarDistance", "sonarDistanceJam", "sonarJamRadius", "sonarRadius", "sonarStealth", "sounds", "speed", "speedToFront",
	"springCategories", "startCloaked", "stealth", "stockpileWeaponDef", "stopToAttack", "strafeToAttack", "targfac", "terraformSpeed",
	"tidalGenerator", "tooltip", "totalEnergyOut", "trackOffset", "trackStrength", "trackStretch", "trackType", "trackWidth", "transportByEnemy",
	"transportCapacity", "transportMass", "transportSize", "transportUnloadMethod", "turnInPlace", "turnInPlaceSpeedLimit", "turnRadius", "turnRate",
	"unitFallSpeed", "upDirSmoothing", "upright", "useBuildingGroundDecal", "useSmoothMesh", "verticalSpeed", "wantedHeight", "waterline", "weapons",
	"windGenerator", "wingAngle", "wingDrag", "wreckName", "xsize", "zsize",
	}
	local WEAPON_FIELDS = {
	"accuracy", "avoidFeature", "avoidFriendly", "avoidNeutral", "beamTTL", "beamburst", "beamtime", "bouncerebound", "canAttackGround", "cegTag",
	"collisionSize", "coverageRange", "craterAreaOfEffect", "customParams", "cylinderTargeting", "cylinderTargetting", "damageAreaOfEffect", "damages",
	"dance", "description", "duration", "dynDamageExp", "dynDamageInverted", "dynDamageMin", "dynDamageRange", "edgeEffectiveness", "energyCost",
	"explosionSpeed", "exteriorShield", "fireSound", "fireStarter", "flightTime", "gravityAffected", "groundbounce", "groundslip", "heightBoostFactor",
	"heightMod", "highTrajectory", "hitSound", "id", "impactOnly", "intensity", "interceptSolo", "interceptedByShieldType", "interceptor", "isShield",
	"largeBeamLaser", "laserHardStop", "leadBonus", "leadLimit", "manualFire", "maxAngle", "metalCost", "minIntensity", "movingAccuracy", "myGravity",
	"name", "noAutoTarget", "noEnemyCollide", "noExplode", "noFeatureCollide", "noFireBaseCollide", "noFriendlyCollide", "noGroundCollide",
	"noNeutralCollide", "noNonTargetCollide", "noSelfDamage", "numbounce", "onlyForward", "paralyzer", "predictBoost", "projectiles", "projectilespeed",
	"proximityPriority", "range", "reload", "salvoDelay", "salvoSize", "selfExplode", "shieldAlpha", "shieldBadColorA", "shieldBadColorB",
	"shieldBadColorG", "shieldBadColorR", "shieldEnergyUse", "shieldForce", "shieldGoodColorA", "shieldGoodColorB", "shieldGoodColorG",
	"shieldGoodColorR", "shieldInterceptType", "shieldMaxSpeed", "shieldPower", "shieldPowerRegen", "shieldPowerRegenEnergy", "shieldRadius",
	"shieldRechargeDelay", "shieldRepulser", "size", "sizeGrowth", "smartShield", "soundTrigger", "sprayAngle", "startvelocity", "stockpile",
	"stockpileTime", "subMissile", "sweepFire", "targetBorder", "targetMoveError", "targetable", "tracks", "trajectoryHeight", "turnRate", "turret",
	"type", "uptime", "visibleShield", "visibleShieldHitFrames", "visibleShieldRepulse", "visuals", "waterWeapon", "waterbounce", "weaponAcceleration",
	"windup", "wobble",
	}

	-- a copy of the listed fields of a definition that have a value
	local function fields(def, list)
		local t = {}
		for _, k in ipairs(list) do
			local ok, v = pcall(function() return def[k] end)
			if ok and v ~= nil then
				t[k] = v
			end
		end
		return t
	end

	local enc
	local function encTable(t, depth, skip)
		local n = #t
		local isArray = n > 0
		if isArray then
			for k in pairs(t) do
				if type(k) ~= "number" or k < 1 or k > n or k ~= math.floor(k) then
					isArray = false
					break
				end
			end
		end
		local out = {}
		if isArray then
			for i = 1, n do
				out[#out + 1] = enc(t[i], depth + 1) or "null"
			end
			return "[" .. table.concat(out, ",") .. "]"
		end
		local keys = {}
		for k in pairs(t) do
			if (type(k) == "string" or type(k) == "number") and not (skip and skip[k]) then
				keys[#keys + 1] = k
			end
		end
		table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
		for _, k in ipairs(keys) do
			local v = enc(t[k], depth + 1)
			if v then
				out[#out + 1] = quote(tostring(k)) .. ":" .. v
			end
		end
		return "{" .. table.concat(out, ",") .. "}"
	end

	-- the JSON text of a value; nil for what has no JSON form (functions, userdata); tables only to a depth of 3
	enc = function(v, depth, skip)
		local ty = type(v)
		if ty == "number" then
			return number(v)
		elseif ty == "string" then
			return quote(v)
		elseif ty == "boolean" then
			return tostring(v)
		elseif ty == "table" and depth < 3 then
			return encTable(v, depth, skip)
		end
		return nil
	end

	---------------------------------------------------------------- files
	local function readFile(name)
		local f = io.open(DIR .. name, "r")
		if not f then
			return nil
		end
		local s = f:read("*a")
		f:close()
		return s
	end

	-- opens a file of the folder for writing (the folder is created); nil and the reason if that fails
	local function openFile(name)
		if Spring.CreateDir then
			if host.outDir then
				pcall(Spring.CreateDir, host.outDir)
			end
			pcall(Spring.CreateDir, DIR)
		end
		local f, err = io.open(DIR .. name, "w")
		if not f then
			return nil, tostring(err)
		end
		return f
	end

	local function writeFile(name, text)
		local f, err = openFile(name)
		if not f then
			return false, err
		end
		local written, werr = f:write(text)
		f:close()
		if not written then
			return false, tostring(werr)
		end
		return true
	end

	---------------------------------------------------------------- the units
	-- the catalog of the Place menu (faction, type, tech level: the filters of the page): { { name, id, faction, group, tech, water, filler } ... }, sorted by name
	local function catalog()
		local out = {}
		local cache = Shared.buildUnitCache()
		for _, f in ipairs(Shared.FACTIONS) do
			for _, g in ipairs(Shared.GROUPS) do
				for tech, list in ipairs(cache[f[1]][g[1]]) do
					for _, e in ipairs(list) do
						out[#out + 1] = { name = e.name, id = e.id, faction = f[1], group = g[1], tech = tech, water = e.water and true or false, filler = e.filler and true or false }
					end
				end
			end
		end
		table.sort(out, function(a, b) return a.name < b.name end)
		return out
	end

	-- all fields of a weapon: the raw values of the definition, the damage by armor class name
	local function weaponEntry(wd)
		local t = fields(wd, WEAPON_FIELDS)
		t.damages = nil
		local text = enc(t, 1, SKIP)
		if not text then
			return nil
		end
		local dmg = {}
		for name, idx in pairs((Game and Game.armorTypes) or {}) do
			if type(name) == "string" and type(idx) == "number" and wd.damages then
				local d = tonumber(wd.damages[idx])
				if d then
					dmg[#dmg + 1] = quote(name) .. ":" .. number(d)
				end
			end
		end
		table.sort(dmg)
		return text:sub(1, -2) .. ',"damages":{' .. table.concat(dmg, ",") .. "}}"
	end

	-- one unit: one flat object: the fields of the unit definition as they are (humanName and description replaced by the English text the game shows), followed by
	-- what the unit definition does not hold: faction, type, tech level, the model with its path, the weapons with all their values, the names of what it builds,
	-- the best damage per second figure (the one of the info under the preview)
	local function unitText(e)
		local ud = UnitDefs[e.id]
		local game = fields(ud, UNIT_FIELDS)
		game.humanName = ud.translatedHumanName or ud.humanName or e.name
		game.description = ud.translatedTooltip or ud.tooltip or ""
		local raw = enc(game, 0, SKIP) or "{}"
		local weapons, builds = {}, {}
		for _, w in ipairs(ud.weapons or {}) do
			local wd = WeaponDefs[w.weaponDef]
			local t = wd and weaponEntry(wd)
			if t then
				weapons[#weapons + 1] = t
			end
		end
		for _, id in ipairs(ud.buildOptions or {}) do
			local b = UnitDefs[id]
			if b then
				builds[#builds + 1] = quote(b.name)
			end
		end
		local dmg, sps, aa = Shared.shotInfo(e.id)
		local extra = string.format('"faction":%s,"group":%s,"tech":%d,"water":%s,"filler":%s,"model":%s,"shotDamage":%s,"shotsPerSecond":%s,"antiAir":%s,"weapons":[%s],"builds":[%s]',
			quote(e.faction), quote(e.group), e.tech, tostring(e.water), tostring(e.filler), quote(tostring(ud.modelpath or "")),
			number(dmg), number(sps), tostring(aa and true or false), table.concat(weapons, ","), table.concat(builds, ","))
		return raw:sub(1, -2) .. (raw == "{}" and "" or ",") .. extra .. "}"
	end

	-- the version of the game (e.g. "Beyond All Reason test-30001-abc1234") and the file name that carries it: units-<version>.json (characters other than
	-- letters, digits, "." "_" "-" become "_"), so that the exports of several game versions lie side by side
	-- Game.gameVersion is the version of the Level Editor game ("1"), not of Beyond All Reason: the base game is the loaded archive whose name starts with
	-- "Beyond All Reason" (the name carries the version, e.g. "Beyond All Reason test-30001-abc1234"); gameName and gameVersion are its two parts
	local function baseGame()
		local ok, list = pcall(function() return VFS.GetLoadedArchives() end)
		if ok and type(list) == "table" then
			for _, a in ipairs(list) do
				local name, version = tostring(a):match("^(Beyond All Reason)%s+(.+)$")
				if name then
					return name, version
				end
			end
		end
		return tostring((Game and Game.gameName) or "unknown"), tostring((Game and Game.gameVersion) or "unknown")
	end

	local function gameVersion()
		local _, version = baseGame()
		return version
	end

	function ex.unitsFileName()
		return "units-" .. (gameVersion():gsub("[^%w%._%-]", "_")) .. ".json"
	end

	function ex.exportUnits()
		local list = catalog()
		if #list == 0 then
			return "No units found in the game, nothing exported", false
		end
		local file = ex.unitsFileName()
		-- the file is written unit by unit: all of it as one text would be 15 MB, more than a user widget may hold in memory
		local f, err = openFile(file)
		if not f then
			return "Could not write " .. DIR .. file .. ": " .. err, false
		end
		local size = 0
		local function put(s)
			local written, werr = f:write(s)
			if not written then
				error("Could not write " .. DIR .. file .. ": " .. tostring(werr))
			end
			size = size + #s
		end
		put('{"format":1,"gameName":' .. quote((baseGame())) .. ',"gameVersion":' .. quote(gameVersion()) .. ',"count":' .. #list .. ',"units":{\n')
		for i, e in ipairs(list) do
			put((i > 1 and ",\n" or "") .. quote(e.name) .. ":" .. unitText(e))
		end
		put("\n}}\n")
		f:close()
		return string.format("Exported %d units (%.1f MB) to\n%s%s", #list, size / 1e6, DIR, file), true
	end

	---------------------------------------------------------------- the comparison ids
	-- Proposal of the comparison id of a unit: the name without the faction letters (armllt, corllt, legllt -> llt); a Scavenger copy gets the id of its unit,
	-- a raptor and a unit of no faction its own name. The proposals are only a start: the file is corrected by hand (SPECIFICATION.md).
	local function proposal(name)
		local key, base = Shared.factionOf(name)
		if key == "rap" then
			return name
		end
		local pre = base:sub(1, 3)
		if (pre == "arm" or pre == "cor" or pre == "leg") and #base > 3 then
			return base:sub(4)
		end
		return base
	end

	-- The unit names and ids of a comparison.json: { name = id }; nil if the text has no "units" object. The file has a simple shape (written by this module, corrected
	-- by hand), so no JSON library is needed (the unit extraction widget of a plain game cannot load the game's json.lua): the pairs "name": "id" inside "units".
	local UNESC = { b = "\b", f = "\f", n = "\n", r = "\r", t = "\t", ['"'] = '"', ["\\"] = "\\", ["/"] = "/" }

	local function utf8char(cp)
		if cp < 0x80 then
			return string.char(cp)
		elseif cp < 0x800 then
			return string.char(0xC0 + math.floor(cp / 0x40), 0x80 + cp % 0x40)
		elseif cp < 0x10000 then
			return string.char(0xE0 + math.floor(cp / 0x1000), 0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
		end
		return string.char(0xF0 + math.floor(cp / 0x40000), 0x80 + math.floor(cp / 0x1000) % 0x40, 0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
	end

	-- The JSON text that starts with the quote at position i of s: returns the decoded text and the position after the closing quote, nil if it is not valid
	local function readString(s, i)
		local out, j = {}, i + 1
		while true do
			local c = s:sub(j, j)
			if c == "" then
				return nil
			elseif c == '"' then
				return table.concat(out), j + 1
			elseif c == "\\" then
				local e = s:sub(j + 1, j + 1)
				if UNESC[e] then
					out[#out + 1] = UNESC[e]
					j = j + 2
				elseif e == "u" and s:match("^%x%x%x%x", j + 2) then
					local cp = tonumber(s:sub(j + 2, j + 5), 16)
					j = j + 6
					local lo = cp >= 0xD800 and cp < 0xDC00 and s:match("^\\u(%x%x%x%x)", j)
					lo = lo and tonumber(lo, 16)
					if lo and lo >= 0xDC00 and lo < 0xE000 then -- a pair of surrogates is one character
						cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
						j = j + 6
					end
					out[#out + 1] = utf8char(cp)
				else
					return nil
				end
			else
				local run = s:match('^[^"\\]+', j)
				out[#out + 1] = run
				j = j + #run
			end
		end
	end

	-- The unit names and ids of a comparison.json: { name = id }. Returns nil and the reason (with the line) if the file cannot be read completely, so that nothing is
	-- lost when it is written again. Small JSON reader for the "units" object only (the widget of a plain game cannot load the game's json.lua); texts may have escapes.
	local function parseComparison(text)
		local function fail(at, why)
			local _, lines = text:sub(1, at):gsub("\n", "")
			return nil, string.format("line %d: %s", lines + 1, why)
		end
		local _, p = text:find('"units"%s*:%s*{')
		if not p then
			return nil, 'no "units" object'
		end
		local out, first = {}, true
		p = p + 1
		while true do
			p = text:find("%S", p)
			if not p then
				return fail(#text, 'the file ends inside "units"')
			end
			local c = text:sub(p, p)
			if c == "}" then
				return out
			end
			if not first then
				if c ~= "," then
					return fail(p, "',' or '}' expected")
				end
				p = text:find("%S", p + 1)
				if not p then
					return fail(#text, 'the file ends inside "units"')
				end
				c = text:sub(p, p)
			end
			first = false
			if c ~= '"' then
				return fail(p, "a unit name in quotes expected")
			end
			local name, q = readString(text, p)
			if not name then
				return fail(p, "this unit name is not a valid text")
			end
			local at = text:match("^%s*:%s*()", q)
			if not at then
				return fail(q, "':' expected")
			end
			if text:sub(at, at) ~= '"' then
				return fail(at, "the id of " .. name .. " is not a text")
			end
			local id, after = readString(text, at)
			if not id then
				return fail(at, "the id of " .. name .. " is not a valid text")
			end
			out[name] = id
			p = after
		end
	end

	-- Writes comparison.json: { "version": 1, "units": { "<unit name>": "<comparison id>", ... } }, one unit per line. An existing file is kept as it is:
	-- the ids that are in it stay (they were corrected by hand), only the units that are not in it yet are added, with a proposed id.
	function ex.exportComparison()
		local old = {}
		local text = readFile("comparison.json")
		if text then
			local data, why = parseComparison(text)
			if not data then
				return "comparison.json cannot be read (" .. why .. "), left as it is:\n" .. DIR .. "comparison.json", false
			end
			old = data
		end
		local ids, added, kept = {}, 0, 0
		for name, id in pairs(old) do
			if type(id) == "string" then
				ids[name] = id
				kept = kept + 1
			end
		end
		for _, e in ipairs(catalog()) do
			if not ids[e.name] then
				ids[e.name] = proposal(e.name)
				added = added + 1
			end
		end
		local names = {}
		for name in pairs(ids) do
			names[#names + 1] = name
		end
		table.sort(names)
		local lines = {}
		for _, name in ipairs(names) do
			lines[#lines + 1] = "\t" .. quote(name) .. ": " .. quote(ids[name])
		end
		local out = '{\n"version": 1,\n"units": {\n' .. table.concat(lines, ",\n") .. "\n}\n}\n"
		local ok, err = writeFile("comparison.json", out)
		if not ok then
			return "Could not write " .. DIR .. "comparison.json: " .. err, false
		end
		return string.format("comparison.json: %d units kept, %d added\n(%s)", kept, added, DIR), true
	end

	ex.actions = {
		{ label = "Export Units Info", tip = "Writes the data of all units (the ones of the Place menu, all factions) into units-<game version>.json in the folder LevelEditor/Other of the game's data folder (the version is in the file name and in the file)",
			fn = function() local m = ex.exportUnits(); host.say((m:gsub("\n", " "))); return m end },
		{ label = "Export Comparison", tip = "Writes comparison.json (unit name and comparison id) into LevelEditor/Other: the units with the same id are shown side by side on the website. An existing file is kept, only new units are added",
			fn = function() local m = ex.exportComparison(); host.say((m:gsub("\n", " "))); return m end },
	}
	-- test hooks (the test widget is a user widget and may not open files in the data folder)
	ex.actions.read, ex.actions.write, ex.actions.unitsFile = readFile, writeFile, ex.unitsFileName
	return ex
end
