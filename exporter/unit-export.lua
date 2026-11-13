function widget:GetInfo()
	return {
		name = "Website Unit Export",
		desc = "Writes the data of all units (units-<game version>.json) and the counterpart ids (counterparts.json) of the running game into LuaUI/Config/WebsiteExport/",
		author = "BARLevelEditor",
		date = "2026",
		license = "GNU GPL v2",
		layer = 0,
		enabled = true,
	}
end

-- Unit export for the unit comparison website (docs/exporter.md): a widget for a plain Beyond All Reason game (no Level Editor).
-- It runs once, a moment after the game has started, and writes
--   LuaUI/Config/WebsiteExport/units-<game version>.json   all units with their values, the version of Beyond All Reason in the file name and in the file
--   LuaUI/Config/WebsiteExport/counterparts.json              the counterpart id of every unit (kept if it is there already, only new units are added)
--   LuaUI/Config/WebsiteExport/status.txt                   "ok ..." or the error (for a script that starts the game and waits for the end)
-- (a user widget may write only into LuaUI/Config and LuaUI/Widgets). If the file LuaUI/Config/WebsiteExport/quit.txt exists, the game ends itself afterwards
-- (quitforce), so that a script can run the game once per game version; without that file the game goes on.
--
-- Needs three files that the script which starts the game (export_units.ps1) puts into LuaUI/Include/ (they are in the folder lua/ next to this file):
--   unit_catalog.lua    (the unit catalog: faction, type, tech level, the best shot of a unit)
--   bar_rules.lua       (the tech level rule, loaded by unit_catalog.lua)
--   led_export.lua      (the export itself, the same code as the buttons of the settings page of the Level Editor)
-- and this file in LuaUI/Widgets/. What the files contain: docs/exporter.md.

local DIR = "LuaUI/Config/WebsiteExport/"
local startFrame = 5 -- the game frame at which the export runs (everything is loaded)
local done = false

local function status(text)
	local f = io.open(DIR .. "status.txt", "w")
	if f then
		f:write(text .. "\n")
		f:close()
	end
end

local function exists(name)
	local f = io.open(DIR .. name, "r")
	if f then
		f:close()
		return true
	end
	return false
end

local function run()
	Spring.CreateDir("LuaUI/Config")
	Spring.CreateDir(DIR)
	local Shared = VFS.Include("LuaUI/Include/unit_catalog.lua", nil, VFS.RAW_FIRST)
	local ex = VFS.Include("LuaUI/Include/led_export.lua", nil, VFS.RAW_FIRST)({
		Shared = Shared, dir = DIR,
		say = function(s) Spring.Echo("[Website Unit Export] " .. s) end,
	})
	local a, aOk = ex.exportUnits()
	local b, bOk = ex.exportCounterparts()
	local text = a:gsub("\n", " ") .. " | " .. b:gsub("\n", " ")
	if not (aOk and bOk) then
		Spring.Echo("[Website Unit Export] error: " .. text)
	end
	status(((aOk and bOk) and "ok " or "error ") .. text)
end

function widget:Update()
	if done or Spring.GetGameFrame() < startFrame then
		return
	end
	done = true
	local ok, err = pcall(run)
	if not ok then
		Spring.Echo("[Website Unit Export] error: " .. tostring(err))
		pcall(status, "error " .. tostring(err))
	end
	if exists("quit.txt") then
		Spring.SendCommands("quitforce")
	end
end
