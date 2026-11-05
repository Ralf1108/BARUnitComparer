-- Shared code of the Level Editor and the BluePrinter (one file, loaded by both widgets with VFS.Include).
-- Contains: blueprint library (read, sort, rename, delete files), tile grid with dragging/renaming,
-- unit catalog with selection grid, settings (gear), 3D preview and small helper functions.
-- Nothing here knows the respective widget; special cases come as options/callbacks from there.
local M = {}

---------------------------------------------------------------- Dimensions (ui_scale)
M.S = 1
M.m = { TILE = 190, LABEL = 138, PAD = 8, UCELL = 284, UICON = 270, UPAD = 7, HB = 58, XSIZE = 52 }
local BASE = { TILE = 190, LABEL = 138, PAD = 8, UCELL = 284, UICON = 270, UPAD = 7, HB = 58, XSIZE = 52 }

-- Recompute all dimensions from the base value (cheap, can be called on every draw/click). The base values are designed for 4K
-- (height 2160); the factor is ui_scale times screen height / 2160, so the menu grows and shrinks with the
-- resolution (HD 1080 = half as big). ui_scale stays as a fine control.
local DESIGN_HEIGHT = 2160

function M.rescale()
	local s = tonumber(Spring.GetConfigFloat and Spring.GetConfigFloat("ui_scale", 1) or 1) or 1
	local _, vsy = Spring.GetViewGeometry()
	if vsy and vsy > 0 then
		s = s * vsy / DESIGN_HEIGHT
	end
	s = math.max(0.3, math.min(3, s))
	if s == M.S then
		return s
	end
	M.S = s
	for k, v in pairs(BASE) do
		M.m[k] = math.floor(v * s + 0.5)
	end
	return s
end

M.FACING_NAME = { [0] = "South", [1] = "East", [2] = "North", [3] = "West" }

---------------------------------------------------------------- Helper functions
-- Rotate an offset (dx, dz) by k quarter turns: south -> east -> north -> west
function M.rotateOffset(dx, dz, k)
	for _ = 1, (k or 0) % 4 do
		dx, dz = dz, -dx
	end
	return dx, dz
end

function M.fileText(path)
	local f = io.open(path, "r")
	if not f then
		return nil
	end
	local t = f:read("*a")
	f:close()
	return t
end

-- Writes a whole file safely: first <path>.tmp, then it replaces the old file, so an error or a crash in between never leaves a
-- half written file (the old one stays). Returns true, or nil and the error text.
function M.writeFile(path, text)
	local tmp = path .. ".tmp"
	local f, err = io.open(tmp, "w")
	if not f then
		return nil, err
	end
	local ok, werr = f:write(text)
	f:close()
	if not ok then
		pcall(os.remove, tmp)
		return nil, werr
	end
	if os.rename then
		pcall(os.remove, path) -- (Windows does not rename onto an existing file)
		if os.rename(tmp, path) then
			return true
		end
	end
	-- no rename: write the file itself (the text is complete already)
	f, err = io.open(path, "w")
	if not f then
		return nil, err
	end
	f:write(text)
	f:close()
	pcall(os.remove, tmp)
	return true
end

-- Runs the text of a data file (level, blueprint, settings: "return { ... }") in an empty environment, so a file from somewhere else cannot
-- call anything (no io, os, Spring ...): only tables, strings and numbers come out. Returns the value or nil, error text.
function M.loadData(text)
	if type(text) ~= "string" then
		return nil, "no text"
	end
	local chunk, err = (loadstring or load)(text)
	if not chunk then
		return nil, err
	end
	if setfenv then
		setfenv(chunk, {})
	end
	local ok, data = pcall(chunk)
	if not ok then
		return nil, data
	end
	return data
end

-- Reads the text of a blueprint file (returns the unit list or nil, error text)
function M.parseBlueprint(text)
	local data, err = M.loadData(text)
	if type(data) ~= "table" or type(data.blueprint) ~= "table" then
		return nil, err or "not a valid blueprint file"
	end
	return data.blueprint
end


-- rules about unit definitions, shared with the gadgets (bar_rules.lua lies next to this file)
local Rules = VFS.Include("luaui/Include/bar_rules.lua", nil, VFS.ZIP_FIRST)
assert(Rules, "bar_rules.lua missing (run the installer again)")
local techLevel = Rules.techLevel
M.techLevel = techLevel
M.buildClass = Rules.buildClass
M.headingToFacing = Rules.headingToFacing

local function isBuildingDef(ud)
	return ud and (ud.isBuilding or not ud.canMove)
end
M.isBuildingDef = isBuildingDef

---------------------------------------------------------------- Settings in a config file
-- file: path in the write folder, defaults: { name = value }, limits: { name = { min, max } }
function M.newConfig(file, header, defaults, limits)
	local c = { file = file, header = header, v = {}, limits = limits, keys = {} }
	for k, val in pairs(defaults) do
		c.v[k] = val
		c.keys[#c.keys + 1] = k
	end
	table.sort(c.keys)

	function c:sync()
		for k, lim in pairs(self.limits) do
			self.v[k] = math.max(lim[1], math.min(lim[2], math.floor(tonumber(self.v[k]) or lim[1])))
		end
	end

	-- c.transient[key] = true: the value is not written into the file and not read from it (it belongs to something else, e.g. the unit limit of a level)
	c.transient = {}

	function c:save()
		local parts = {}
		for _, k in ipairs(self.keys) do
			if not self.transient[k] then
				parts[#parts + 1] = string.format("%s = %d", k, self.v[k])
			end
		end
		M.writeFile(self.file, "-- " .. self.header .. "\nreturn { " .. table.concat(parts, ", ") .. " }\n")
	end

	function c:load()
		local text = M.fileText(self.file)
		if text then
			local data = M.loadData(text)
			if type(data) == "table" then
				for _, k in ipairs(self.keys) do
					if tonumber(data[k]) and not self.transient[k] then
						self.v[k] = tonumber(data[k])
					end
				end
			end
		end
		self:sync()
	end

	-- steps[key] = { v1, v2, ... }: the value moves along this list instead of by the delta (e.g. grid sizes)
	c.steps = {}

	function c:change(key, delta)
		local list = self.steps[key]
		if list then
			local at = 1
			for i, x in ipairs(list) do
				if x <= self.v[key] then
					at = i
				end
			end
			self.v[key] = list[math.max(1, math.min(#list, at + (delta > 0 and 1 or -1)))]
		else
			self.v[key] = self.v[key] + delta
		end
		self:sync()
		self:save()
	end

	c:sync()
	return c
end

---------------------------------------------------------------- 3D preview (models at the mouse pointer)
-- o: { owner = "name", say = fn, wg = fn -> WG table, max = 150 }
function M.newGhost(o)
	local g = { set = {}, used = {}, broken = false, mode = "auto", told = false, max = o.max or 150 }

	local function wg()
		return o.wg and o.wg() or nil
	end

	function g:stop()
		local W = wg()
		for key, e in pairs(self.set) do
			if e.id and W and W.StopDrawUnitShapeGL4 then
				pcall(W.StopDrawUnitShapeGL4, e.id)
			end
			self.set[key] = nil
		end
	end

	-- at the end of every frame: remove models that were not drawn any more
	function g:endFrame()
		local W = wg()
		for key, e in pairs(self.set) do
			if not self.used[key] then
				if e.id and W and W.StopDrawUnitShapeGL4 then
					pcall(W.StopDrawUnitShapeGL4, e.id)
				end
				self.set[key] = nil
			end
		end
		self.used = {}
	end

	local function note(text)
		if not g.told then
			g.told = true
			o.say(text)
		end
	end

	local function drawGL(defID, teamID, x, y, z, rotRad)
		gl.PushMatrix()
		gl.Translate(x, y, z)
		gl.Rotate(rotRad * 180 / math.pi, 0, 1, 0)
		gl.Color(1, 1, 1, 0.6)
		gl.DepthTest(true)
		gl.UnitShape(defID, teamID, false, false, false)
		gl.DepthTest(false)
		gl.PopMatrix()
		gl.Color(1, 1, 1, 1)
	end

	-- key = name of the entry; rotRad as in BAR: facing * 90 degrees or heading * pi / 32768
	function g:draw(key, defID, teamID, x, y, z, rotRad)
		if self.broken then
			return
		end
		self.used[key] = true
		local W = wg()
		local useWG = (self.mode == "wg" or self.mode == "auto") and W and W.DrawUnitShapeGL4
		if useWG then
			local cur = self.set[key]
			local ok, res = pcall(function()
				local upd = cur and cur.id
				if cur and cur.def ~= defID and upd and W.StopDrawUnitShapeGL4 then
					W.StopDrawUnitShapeGL4(upd)
					upd = nil
				end
				return W.DrawUnitShapeGL4(defID, x, y, z, rotRad, 0.6, teamID, nil, nil, upd, o.owner)
			end)
			if ok and res then
				self.set[key] = { id = res, def = defID }
				return
			end
			note("3D preview: widget 'DrawUnitShape GL4' returns nothing, using gl.UnitShape (" .. tostring(res) .. ")")
			self.mode = "gl"
			self:stop()
		elseif self.mode == "auto" then
			note("3D preview: widget 'DrawUnitShape GL4' not active, using gl.UnitShape")
		end
		local ok, err = pcall(drawGL, defID, teamID, x, y, z, rotRad)
		if not ok then
			self.broken = true
			o.say("3D preview disabled: " .. tostring(err))
		end
	end

	-- /led_ghost or /bp_ghost: set the mode (gl|wg|auto) and return the state as text
	function g:command(mode, cmdName)
		if mode == "gl" or mode == "wg" or mode == "auto" then
			self.mode, self.broken, self.told = mode, false, false
			self:stop()
		end
		local W = wg()
		return string.format("3D preview: mode %s, DrawUnitShape widget %s, disabled: %s. /%s gl|wg|auto",
			self.mode, (W and W.DrawUnitShapeGL4) and "da" or "missing", tostring(self.broken), cmdName)
	end

	return g
end

---------------------------------------------------------------- Blueprint library
-- o: { dirs = { "folder/", ... }, say = fn, buildingsOnly = bool, writeIndex = bool }
-- lib.list always stays the same table: { name, units, count, thumb, dir }
function M.newLibrary(o)
	local lib = { list = {}, dirs = o.dirs, say = o.say, buildingsOnly = o.buildingsOnly, writeIndex = o.writeIndex }

	-- Thumbnail: points in the range 0..1 (x, z), size relative
	local function makeThumb(units)
		local minX, maxX, minZ, maxZ
		for _, u in ipairs(units) do
			local dx, dz = tonumber(u.dx) or 0, tonumber(u.dz) or 0
			minX, maxX = math.min(minX or dx, dx), math.max(maxX or dx, dx)
			minZ, maxZ = math.min(minZ or dz, dz), math.max(maxZ or dz, dz)
		end
		if not minX then
			return {}
		end
		local wd, ht = math.max(maxX - minX, 1), math.max(maxZ - minZ, 1)
		local span = math.max(wd, ht) + 80
		local pts = {}
		local stride = math.max(1, math.floor(#units / 150))
		for i = 1, #units, stride do
			local u = units[i]
			local ud = UnitDefNames[u.name]
			if ud and (not o.buildingsOnly or isBuildingDef(ud)) or (not o.buildingsOnly and not ud) then
				-- Symbol size: half the footprint (buildings), otherwise radius
				local r = math.max((ud and ud.xsize and math.max(ud.xsize, ud.zsize or 0) * 4) or (ud and ud.radius) or 16, 10)
				pts[#pts + 1] = {
					id = ud and ud.id,
					x = ((tonumber(u.dx) or 0) - minX + (span - wd) / 2) / span,
					z = ((tonumber(u.dz) or 0) - minZ + (span - ht) / 2) / span,
					r = r / span,
					team = tonumber(u.team) or 0,
					air = ud and ud.canFly or false,
				}
			end
		end
		table.sort(pts, function(a, b) return a.r > b.r end) -- large ones first, small ones on top
		return pts
	end

	local function readOrderPositions()
		local pos = {}
		local text = M.fileText(lib.dirs[1] .. "_order.txt")
		if text then
			local i = 0
			for line in text:gmatch("[^\r\n]+") do
				local n = line:gsub("%s+", "")
				if n ~= "" and not pos[n] then
					i = i + 1
					pos[n] = i
				end
			end
		end
		return pos
	end

	-- Re-read the list: directories + index files, then own order (_order.txt in the first folder), rest alphabetical
	function lib:scan()
		local entries, seen = {}, {}
		for _, dir in ipairs(self.dirs) do
			local function add(n, viaIndex)
				if n and n ~= "" and n:sub(1, 1) ~= "_" and not seen[n] then
					if viaIndex and not M.fileText(dir .. n .. ".lua") then
						return
					end
					seen[n] = true
					entries[#entries + 1] = { name = n, dir = dir }
				end
			end
			local ok, files = pcall(VFS.DirList, dir, "*.lua", VFS.RAW)
			if ok and type(files) == "table" then
				for _, path in ipairs(files) do
					add(path:match("([^/\\]+)%.lua$"))
				end
			end
			local idx = M.fileText(dir .. "_index.txt")
			if idx then
				for line in idx:gmatch("[^\r\n]+") do
					add((line:gsub("%s+", "")), true)
				end
			end
		end
		local list = self.list
		for i = #list, 1, -1 do
			list[i] = nil
		end
		for _, e in ipairs(entries) do
			local text = M.fileText(e.dir .. e.name .. ".lua")
			local units = text and M.parseBlueprint(text)
			if units and #units > 0 then
				local count = #units
				if self.buildingsOnly then
					count = 0
					for _, u in ipairs(units) do
						if isBuildingDef(UnitDefNames[u.name]) then
							count = count + 1
						end
					end
				end
				if count > 0 then
					list[#list + 1] = { name = e.name, units = units, count = count, thumb = makeThumb(units), dir = e.dir }
				end
			end
		end
		local pos = readOrderPositions()
		table.sort(list, function(a, b)
			local pa, pb = pos[a.name], pos[b.name]
			if pa and pb then
				return pa < pb
			elseif pa then
				return true
			elseif pb then
				return false
			end
			return a.name:lower() < b.name:lower()
		end)
		return list
	end

	function lib:index(name)
		for i, bp in ipairs(self.list) do
			if bp.name == name then
				return i
			end
		end
	end

	function lib:find(name)
		local i = self:index(name)
		return i and self.list[i]
	end

	-- Save the order (and the index file)
	function lib:saveOrder()
		local d1 = self.dirs[1]
		if Spring.CreateDir then
			pcall(Spring.CreateDir, d1)
		end
		local names = {}
		for _, bp in ipairs(self.list) do
			names[#names + 1] = bp.name
		end
		local text = table.concat(names, "\n") .. (#names > 0 and "\n" or "")
		M.writeFile(d1 .. "_order.txt", text)
		if self.writeIndex then
			M.writeFile(d1 .. "_index.txt", text)
		end
	end

	-- Moves <dir><name>.lua to the trash (dir/_trash); true if the file is gone afterwards
	function lib:trashFile(bp)
		local src = bp.dir .. bp.name .. ".lua"
		local text = M.fileText(src)
		if not text then
			return true
		end
		if Spring.CreateDir then
			pcall(Spring.CreateDir, bp.dir .. "_trash")
		end
		local dst = bp.dir .. "_trash/" .. bp.name .. ".lua"
		if M.fileText(dst) then
			dst = bp.dir .. "_trash/" .. bp.name .. "_" .. os.date("%Y%m%d_%H%M%S") .. ".lua"
		end
		local fo = io.open(dst, "w")
		if not fo then
			self.say("Trash not writable (folder " .. bp.dir .. "_trash missing?). Nothing deleted.")
			return false
		end
		fo:write(text)
		fo:close()
		if os.remove then
			pcall(os.remove, src)
		end
		if M.fileText(src) then
			self.say("File could not be removed: " .. src)
			return false
		end
		return true
	end

	-- Blueprint to the trash, re-read the list; returns true if it worked
	function lib:remove(name)
		local bp = self:find(name)
		if not bp then
			return false
		end
		if not self:trashFile(bp) then
			return false
		end
		self:scan()
		self:saveOrder()
		self.say(string.format("Blueprint '%s' moved to the trash (%s_trash)", name, bp.dir))
		return true
	end

	-- Rename; returns true, new name
	function lib:rename(old, new)
		new = (tostring(new or ""):gsub("[^%w_%-]", "_"))
		if new == "" or new == old then
			return false
		end
		local bp = self:find(old)
		if self:find(new) or (bp and M.fileText(bp.dir .. new .. ".lua")) then
			self.say("Name already taken: " .. new)
			return false
		end
		if not bp then
			self.say("Blueprint not found: " .. old)
			return false
		end
		local text = M.fileText(bp.dir .. old .. ".lua")
		if not text then
			self.say("Blueprint not found: " .. old)
			return false
		end
		if not M.writeFile(bp.dir .. new .. ".lua", text) then
			self.say("Rename failed (file not writable)")
			return false
		end
		if not self:trashFile(bp) then
			return false
		end
		bp.name = new -- Keep the order: the new name takes the old place
		self:saveOrder()
		self:scan()
		self.say(string.format("Blueprint '%s' is now called '%s'", old, new))
		return true, new
	end

	function lib:move(from, to)
		if from == to or not self.list[from] or not self.list[to] then
			return false
		end
		local item = table.remove(self.list, from)
		table.insert(self.list, to, item)
		self:saveOrder()
		return true
	end

	-- Next free name bp_001, bp_002 ... in the first folder
	function lib:nextName()
		local n = 1
		while true do
			local name = string.format("bp_%03d", n)
			if not M.fileText(self.dirs[1] .. name .. ".lua") and not self:find(name) then
				return name
			end
			n = n + 1
		end
	end

	-- Writes a blueprint file into the first folder. lines: finished lines of the unit table.
	function lib:write(name, lines, header)
		local d1 = self.dirs[1]
		if Spring.CreateDir then
			pcall(Spring.CreateDir, d1)
		end
		local ok, err = M.writeFile(d1 .. name .. ".lua", "-- " .. header .. "\nreturn {\n\tblueprint = {\n" .. table.concat(lines, "\n") .. "\n\t},\n}\n")
		if not ok then
			return false, err
		end
		return true
	end

	-- Blueprint lines from selected units (positions relative to the center). opts: onlyBuildings, withTeam (team and neutral flag of the unit),
	-- withFlags (indestructible = true for a unit marked with FX in the Level Editor) (team and neutral flag of the unit),
	-- withFlags (indestructible = true for a unit marked with FX in the Level Editor)
	function lib.linesFromUnits(ids, opts)
		opts = opts or {}
		local list, minX, maxX, minZ, maxZ = {}, nil, nil, nil, nil
		for _, id in ipairs(ids) do
			local x, y, z = Spring.GetUnitPosition(id)
			local udef = UnitDefs[Spring.GetUnitDefID(id)]
			if x and udef and (not opts.onlyBuildings or isBuildingDef(udef)) then
				list[#list + 1] = { id = id, x = x, y = y, z = z, name = udef.name }
				minX, maxX = math.min(minX or x, x), math.max(maxX or x, x)
				minZ, maxZ = math.min(minZ or z, z), math.max(maxZ or z, z)
			end
		end
		if #list == 0 then
			return nil
		end
		local cx, cz = (minX + maxX) / 2, (minZ + maxZ) / 2
		local lines = {}
		for _, u in ipairs(list) do
			lines[#lines + 1] = string.format(
				"\t\t{ name = '%s', dx = %d, dz = %d, h = %d, rot = %d, team = %d, neutral = %s%s },",
				u.name, math.floor(u.x - cx + 0.5), math.floor(u.z - cz + 0.5),
				math.floor(u.y - Spring.GetGroundHeight(u.x, u.z) + 0.5),
				Spring.GetUnitHeading(u.id) or 0,
				opts.withTeam and (Spring.GetUnitTeam(u.id) or 0) or 0,
				opts.withTeam and tostring(Spring.GetUnitNeutral(u.id)) or "false",
				(opts.withFlags and Spring.GetUnitRulesParam(u.id, "indestructible") == 1) and ", indestructible = true" or ""
			)
		end
		table.sort(lines)
		return lines
	end

	return lib
end

---------------------------------------------------------------- Painting (hold the left mouse button and move)
-- d = { x, z, sx, sz }: the last point of the stroke and the distance to the next one (one footprint plus spacing, per axis). Moves d towards
-- (x, z) in steps of exactly that distance along the straight line and calls place(px, pz) for every step, so a fast mouse leaves no gaps.
function M.paintChain(d, x, z, place)
	for _ = 1, 200 do
		local dx, dz = x - d.x, z - d.z
		local k = math.max(math.abs(dx) / d.sx, math.abs(dz) / d.sz)
		if k < 1 then
			break
		end
		d.x, d.z = d.x + dx / k, d.z + dz / k
		place(d.x, d.z)
	end
end

---------------------------------------------------------------- Drag a row / rectangle (Shift or Shift+Alt)
-- Positions for a stamp from (x0, z0) to (x1, z1). rect = false: row (straight line), true: filled rectangle.
-- The spacing between two units is the footprint (depending on the facing) plus spacing * 16 Elmo.
function M.stampPositions(ud, facing, x0, z0, x1, z1, rect, spacing, maxN)
	local fx, fz = (ud.xsize or 4) * 8, (ud.zsize or 4) * 8
	if (facing or 0) % 2 == 1 then
		fx, fz = fz, fx
	end
	return M.stampPositionsSized(fx, fz, x0, z0, x1, z1, rect, spacing, maxN)
end

-- Width and depth (Elmo) of a blueprint after k quarter turns: hull of all units including footprint
function M.blueprintExtent(units, k)
	local minX, maxX, minZ, maxZ
	for _, u in ipairs(units) do
		local dx, dz = M.rotateOffset(tonumber(u.dx) or 0, tonumber(u.dz) or 0, k or 0)
		local ud = UnitDefNames[u.name]
		local r = ud and math.max(ud.xsize or 2, ud.zsize or 2) * 4 or 16
		minX, maxX = math.min(minX or dx - r, dx - r), math.max(maxX or dx + r, dx + r)
		minZ, maxZ = math.min(minZ or dz - r, dz - r), math.max(maxZ or dz + r, dz + r)
	end
	if not minX then
		return 32, 32
	end
	return maxX - minX, maxZ - minZ
end

-- like stampPositions, but with a given width/depth (fx, fz) instead of one unit (also for whole blueprints)
function M.stampPositionsSized(fx, fz, x0, z0, x1, z1, rect, spacing, maxN)
	local gap = (spacing or 0) * 16
	local sx, sz = fx + gap, fz + gap
	local dx, dz = x1 - x0, z1 - z0
	maxN = maxN or 2000
	local pts = {}
	if rect then
		local nx, nz = math.floor(math.abs(dx) / sx) + 1, math.floor(math.abs(dz) / sz) + 1
		while nx * nz > maxN do
			if nx >= nz then
				nx = nx - 1
			else
				nz = nz - 1
			end
		end
		local ix, iz = (dx >= 0) and 1 or -1, (dz >= 0) and 1 or -1
		for j = 0, nz - 1 do
			for i = 0, nx - 1 do
				pts[#pts + 1] = { x = x0 + ix * i * sx, z = z0 + iz * j * sz }
			end
		end
	else
		local len = math.sqrt(dx * dx + dz * dz)
		local step = (math.abs(dx) >= math.abs(dz)) and sx or sz
		local n = math.min(maxN, math.floor(len / step) + 1)
		for i = 0, n - 1 do
			local t = (len > 0) and (i * step / len) or 0
			pts[#pts + 1] = { x = x0 + dx * t, z = z0 + dz * t }
		end
	end
	return pts
end

-- Limit the spacing (in 16 Elmo steps) to 0 to 20
function M.clampSpacing(v)
	return math.max(0, math.min(20, v))
end

-- The BAR action "buildspacing inc|dec" (words[1]) and the keys Alt+Z / Alt+X (122 = +1, 120 = -1): the new spacing
function M.spacingFromWords(spacing, words)
	return M.clampSpacing(spacing + ((words and words[1] == "dec") and -1 or 1))
end

function M.spacingFromKey(spacing, key)
	return M.clampSpacing(spacing + ((key == 122) and 1 or -1))
end

---------------------------------------------------------------- Team color
function M.teamColor(t)
	local r, g, b = Spring.GetTeamColor(t)
	return r or 1, g or 1, b or 1
end

---------------------------------------------------------------- Cost of a blueprint
-- Sum over all units: metal, energy, build time (build effort) and count; computed once per units table
local costCache = setmetatable({}, { __mode = "k" })
-- Short number for small labels: 950, 12.4k, 250k
function M.shortNumber(n)
	n = math.floor((n or 0) + 0.5)
	if n >= 100000 then
		return string.format("%dk", math.floor(n / 1000 + 0.5))
	elseif n >= 10000 then
		return string.format("%.1fk", n / 1000)
	end
	return tostring(n)
end

local reachCache = setmetatable({}, { __mode = "k" })
function M.blueprintCost(units)
	local c = costCache[units]
	if not c then
		c = { metal = 0, energy = 0, buildTime = 0, health = 0, count = 0 }
		for _, u in ipairs(units) do
			local ud = UnitDefNames[u.name]
			if ud then
				c.metal = c.metal + (ud.metalCost or 0)
				c.energy = c.energy + (ud.energyCost or 0)
				c.buildTime = c.buildTime + (ud.buildTime or 0)
				c.health = c.health + (ud.health or 0)
				c.count = c.count + 1
			end
		end
		costCache[units] = c
	end
	return c
end

---------------------------------------------------------------- Search text and scrollbar (shared by the three grids)
-- All words of the query must appear in the text (name/code, description).
function M.matches(query, text)
	for word in query:lower():gmatch("%S+") do
		if not text:find(word, 1, true) then
			return false
		end
	end
	return true
end

local unitTextCache, featTextCache = {}, {}

-- code, human name and description of a unit, lower case
function M.unitSearchText(name)
	local s = unitTextCache[name]
	if not s then
		local ud = UnitDefNames[name]
		s = name:lower()
		if ud then
			s = s .. " " .. tostring(ud.translatedHumanName or ud.humanName or ""):lower() .. " " .. tostring(ud.translatedTooltip or ud.tooltip or ""):lower()
		end
		unitTextCache[name] = s
	end
	return s
end

-- code and description of a feature, lower case
function M.featureSearchText(name, id)
	local s = featTextCache[name]
	if not s then
		local fd = id and FeatureDefs[id]
		s = name:lower()
		if fd then
			s = s .. " " .. tostring(fd.translatedDescription or ""):lower() .. " " .. tostring(fd.description or ""):lower()
		end
		featTextCache[name] = s
	end
	return s
end

-- blueprint name plus code, name and description of every unit in it
function M.blueprintSearchText(bp)
	if bp._stName ~= bp.name or not bp._st then
		local seen, parts = {}, { bp.name:lower() }
		for _, u in ipairs(bp.units or {}) do
			if not seen[u.name] then
				seen[u.name] = true
				parts[#parts + 1] = M.unitSearchText(u.name)
			end
		end
		bp._st, bp._stName = table.concat(parts, " "), bp.name
	end
	return bp._st
end

-- Scrollbar at the right edge of a list area. The grid needs .scroll and :maxScroll(rect).
local sbDrag = nil

local function sbGeom(grid, rect)
	local ms = grid:maxScroll(rect)
	if ms <= 0 then
		return nil
	end
	local W = 24 * M.S
	local viewH = rect.top - rect.y0
	local thumbH = math.max(30 * M.S, viewH * viewH / (ms + viewH))
	local thumbTop = rect.top - (grid.scroll / ms) * (viewH - thumbH)
	return { x1 = rect.x2 - 2 - W, x2 = rect.x2 - 2, ms = ms, viewH = viewH, thumbH = thumbH, thumbTop = thumbTop }
end

function M.scrollbarDraw(grid, rect)
	local g = sbGeom(grid, rect)
	if not g then
		return
	end
	gl.Color(0, 0, 0, 0.4)
	gl.Rect(g.x1, rect.y0, g.x2, rect.top)
	if sbDrag and sbDrag.grid == grid then
		gl.Color(0.55, 0.75, 1, 0.95)
	else
		gl.Color(0.65, 0.7, 0.8, 0.75)
	end
	gl.Rect(g.x1 + 1, g.thumbTop - g.thumbH, g.x2 - 1, g.thumbTop)
	gl.Color(1, 1, 1, 1)
end

local function sbApply(my)
	local g = sbGeom(sbDrag.grid, sbDrag.rect)
	if not g then
		return
	end
	local top = my + sbDrag.grab
	local span = math.max(1, g.viewH - g.thumbH)
	sbDrag.grid.scroll = math.max(0, math.min(g.ms, (sbDrag.rect.top - top) / span * g.ms))
end

-- Mouse press: true if the click hit the scrollbar (the drag then follows with scrollbarMove)
function M.scrollbarPress(grid, rect, mx, my)
	local g = sbGeom(grid, rect)
	if not g or mx < g.x1 - 4 or mx > rect.x2 or my < rect.y0 or my > rect.top then
		return false
	end
	local grab = g.thumbH / 2 -- click on the track: the thumb jumps under the pointer
	if my <= g.thumbTop and my >= g.thumbTop - g.thumbH then
		grab = g.thumbTop - my -- click on the thumb: keep the grip
	end
	sbDrag = { grid = grid, rect = { x1 = rect.x1, y0 = rect.y0, x2 = rect.x2, top = rect.top }, grab = grab }
	sbApply(my)
	return true
end

function M.scrollbarMove(mx, my)
	if sbDrag then
		sbApply(my)
		return true
	end
	return false
end

function M.scrollbarRelease()
	local was = sbDrag ~= nil
	sbDrag = nil
	return was
end

---------------------------------------------------------------- Movable menu
-- The title row of a menu is the handle: dragging it moves the whole menu (with its button columns).
-- Host: in panelRect() the rectangle goes through mv:place(x1, y0, x2, y1, marginLeft, marginRight, marginBottom) and comes back moved
-- (and kept on the screen: the margins are the room for the strips next to the menu); a click in the title row calls mv:press(mx, my)
-- (button 1) or mv:reset() (button 3), MouseMove calls mv:move(mx, my), MouseRelease mv:release(); mv:save() / mv:load(t) for the config data
function M.newPanelMover()
	local p = { dx = 0, dy = 0, grab = nil }
	function p:place(x1, y0, x2, y1, ml, mr, mb)
		local vsx, vsy = Spring.GetViewGeometry()
		self.dx = math.max(ml - x1, math.min(vsx - mr - x2, self.dx))
		self.dy = math.max(mb - y0, math.min(vsy - y1, self.dy))
		return x1 + self.dx, y0 + self.dy, x2 + self.dx, y1 + self.dy
	end
	function p:press(mx, my)
		self.grab = { x = mx, y = my }
	end
	function p:move(mx, my)
		local g = self.grab
		if not g then
			return false
		end
		self.dx, self.dy = self.dx + mx - g.x, self.dy + my - g.y
		g.x, g.y = mx, my
		return true
	end
	function p:release()
		local was = self.grab ~= nil
		self.grab = nil
		return was
	end
	function p:reset()
		self.dx, self.dy = 0, 0
	end
	function p:save() -- as a fraction of the screen: stays right when the resolution changes
		local vsx, vsy = Spring.GetViewGeometry()
		return { x = self.dx / vsx, y = self.dy / vsy }
	end
	function p:load(t)
		if type(t) == "table" and tonumber(t.x) and tonumber(t.y) then
			local vsx, vsy = Spring.GetViewGeometry()
			self.dx, self.dy = t.x * vsx, t.y * vsy
		end
	end
	return p
end

---------------------------------------------------------------- Tile grid for blueprints
-- o: { lib, cfg, say, unitWord = "Units", ownText = fn(on), onSelect = fn(index), onArm = fn(bool) }
-- rect = { x1, y0, x2, top }: content area that the host passes every time.
-- The grid grows from top to bottom (first a column with up to bpRows tiles, then the next column
-- up to bpCols), after that it scrolls. State: selected (chosen blueprint), armed (stamp mode).
function M.newGrid(o)
	local g = {
		lib = o.lib, cfg = o.cfg, unitWord = o.unitWord or "Units",
		scroll = 0, selected = 0, armed = false,
		drag = nil, editing = nil, confirmDel = nil, lastClick = { idx = 0 },
		query = "", focus = false, searchLabel = o.searchLabel or "Search ...",
	}

	-- The tiles shown: the whole library, or only the blueprints whose name contains the search text.
	-- Indices into this list are "view" indices; realIndex() maps one to the index in the library.
	local view, viewKey = nil, nil

	local function list()
		if g.query == "" then
			return g.lib.list
		end
		local key = g.query .. "|" .. #g.lib.list .. "|" .. (g.viewStamp or 0)
		if viewKey ~= key then
			local out = {}
			for _, bp in ipairs(g.lib.list) do
				if M.matches(g.query, M.blueprintSearchText(bp)) then
					out[#out + 1] = bp
				end
			end
			view, viewKey = out, key
		end
		return view
	end

	local function touch() -- the library changed (rename, delete, move): rebuild the filtered view
		g.viewStamp = (g.viewStamp or 0) + 1
	end

	local function realIndex(i)
		local bp = list()[i]
		return bp and g.lib:index(bp.name) or i
	end

	function g:list() -- the tiles shown (filtered by the search)
		return list()
	end

	function g:rowsPer() -- tiles per column
		local n = #list()
		local maxc, maxr = self.cfg.v.bpCols, self.cfg.v.bpRows
		if n > maxc * maxr then
			return math.ceil(n / maxc) -- more than columns*rows: fixed column count, columns get longer, scrolling
		end
		return math.max(1, math.min(maxr, n))
	end

	function g:cols()
		return math.max(1, math.min(self.cfg.v.bpCols, math.ceil(#list() / self:rowsPer())))
	end

	-- Picture size: with more than 3 columns the menu stays as wide as with 3 and the pictures get smaller
	function g:tile()
		local cols = math.max(1, self.cfg.v.bpCols)
		if cols <= 3 then
			return M.m.TILE
		end
		return math.floor(3 * (M.m.TILE + 2 * M.m.PAD) / cols) - 2 * M.m.PAD
	end

	function g:cellW()
		return self:tile() + 2 * M.m.PAD
	end

	function g:tileH()
		return self:tile() + M.m.LABEL + M.m.PAD
	end

	-- wanted size of the content area (width, height)
	function g:size()
		local rows = math.max(1, math.min(self.cfg.v.bpRows, self:rowsPer()))
		return self:cols() * self:cellW() + 4, rows * self:tileH() + M.m.PAD
	end

	function g:maxScroll(rect)
		return math.max(0, self:rowsPer() * self:tileH() + M.m.PAD - (rect.top - rect.y0))
	end

	-- lower left corner of the preview of tile i
	function g:geom(rect, i)
		local rpc = self:rowsPer()
		local col, row = math.floor((i - 1) / rpc), (i - 1) % rpc
		-- with a wider area (host with a minimum width) center the grid
		local gx0 = rect.x1 + 2 + math.max(0, ((rect.x2 - rect.x1 - 4) - self:cols() * self:cellW()) / 2)
		local tx = gx0 + col * self:cellW() + M.m.PAD
		local top = rect.top - row * self:tileH() + self.scroll
		return tx, top - M.m.PAD - self:tile()
	end

	function g:tileAt(rect, mx, my)
		local gx0 = rect.x1 + 2 + math.max(0, ((rect.x2 - rect.x1 - 4) - self:cols() * self:cellW()) / 2)
		local col = math.floor((mx - gx0) / self:cellW())
		local row = math.floor((rect.top - my + self.scroll) / self:tileH())
		if col < 0 or col >= self:cols() or row < 0 then
			return nil
		end
		local idx = col * self:rowsPer() + row + 1
		if idx >= 1 and idx <= #list() then
			return idx
		end
	end

	function g:inXButton(rect, mx, my, i)
		local tx, ty = self:geom(rect, i)
		local T = self:tile()
		local X = M.m.XSIZE * T / M.m.TILE
		return mx >= tx + T - X and mx <= tx + T and my >= ty + T - X and my <= ty + T
	end

	function g:inLabel(rect, mx, my, i)
		local tx, ty = self:geom(rect, i)
		return mx >= tx and mx <= tx + self:tile() and my >= ty - M.m.LABEL and my < ty
	end

	function g:resetEdit()
		if self.editing and o.ownText then
			pcall(o.ownText, false)
		end
		self.drag, self.confirmDel, self.editing = nil, nil, nil
	end

	function g:setArmed(on)
		if self.armed ~= on then
			self.armed = on
			if o.onArm then
				o.onArm(on)
			end
		end
	end

	function g:select(i)
		self.selected = i
	end

	-- Ctrl + mouse wheel on the map: the next (wheel down) or the previous (wheel up) blueprint of the list shown (the search filter counts), at the ends it goes
	-- round. The blueprint is armed like after a click on its tile and the list scrolls to it. Returns true when there was a blueprint to choose.
	function g:cycle(rect, up)
		local shown = list()
		local n = #shown
		if n == 0 then
			return false
		end
		local cur = 0
		local sel = self.lib.list[self.selected]
		for vi, bp in ipairs(shown) do
			if bp == sel then
				cur = vi
			end
		end
		local nextView
		if cur == 0 then
			nextView = up and n or 1
		else
			nextView = (cur - 1 + (up and -1 or 1)) % n + 1
		end
		local real = realIndex(nextView)
		self.selected = real
		self:setArmed(true)
		if rect then
			self:scrollTo(rect, real)
		end
		if o.onSelect then
			o.onSelect(real, false)
		end
		return true
	end

	-- Scroll tile i into view
	function g:scrollTo(rect, i)
		if self.query ~= "" then
			local bp = self.lib.list[i]
			i = nil
			for vi, b in ipairs(list()) do
				if b == bp then
					i = vi
				end
			end
			if not i then
				return
			end
		end
		local top = ((i - 1) % self:rowsPer()) * self:tileH()
		if top < self.scroll or top + self:tileH() > self.scroll + (rect.top - rect.y0) then
			self.scroll = math.max(0, math.min(self:maxScroll(rect), top))
		end
	end

	local function drawTile(tx, ty, bp, i, ghost, self)
		local m, S = M.m, M.S
		local TILE, LABEL = self:tile(), m.LABEL
		local a = ghost and 0.6 or 1
		if bp == self.lib.list[self.selected] then
			gl.Color(0.25, 0.5, 1, 0.55 * a)
		else
			gl.Color(0.15, 0.15, 0.15, 0.9 * a)
		end
		gl.Rect(tx - 3, ty - LABEL, tx + TILE + 3, ty + TILE + 3)
		gl.Color(0.05, 0.08, 0.05, a)
		gl.Rect(tx, ty, tx + TILE, ty + TILE)
		for _, p in ipairs(bp.thumb) do
			local r, gg, b = M.teamColor(p.team)
			local s = math.max(p.r * TILE, 2)
			local px, py = tx + p.x * TILE, ty + (1 - p.z) * TILE
			if p.id then
				-- Unit picture instead of a dot (miniature view from above)
				local is = math.max(p.r * TILE, 6 * S)
				gl.Color(1, 1, 1, a)
				gl.Texture("#" .. p.id)
				gl.TexRect(px - is, py - is, px + is, py + is)
				gl.Texture(false)
			else
				if p.air then
					gl.Color(1, 1, 1, 0.9 * a)
					gl.Rect(px - s - 1, py - s - 1, px + s + 1, py + s + 1)
				end
				gl.Color(r, gg, b, a)
				gl.Rect(px - s, py - s, px + s, py + s)
			end
		end
		gl.Color(1, 1, 1, 1)
		local label = bp.name
		if #label > 13 then
			label = label:sub(1, 12) .. "~"
		end
		local cx = tx + TILE / 2
		local k = math.min(1, TILE / m.TILE) -- narrower tiles (more columns): smaller text
		if self.editing and self.editing.idx == i and not ghost then
			gl.Color(1, 1, 0.3, 1)
			local t = self.editing.text .. "_"
			if #t > 12 then
				t = "~" .. t:sub(-11)
			end
			gl.Text(t, cx, ty - 32 * S, 32 * S, "co")
			gl.Color(1, 1, 1, 1)
			gl.Text("Enter / Esc", cx, ty - 68 * S, 24 * S, "co")
		elseif self.confirmDel == bp.name and not ghost then
			gl.Color(1, 0.4, 0.4, 1)
			gl.Text("x again", cx, ty - 32 * S, 32 * S, "co")
			gl.Color(1, 1, 1, 1)
			gl.Text("(trash)", cx, ty - 68 * S, 24 * S, "co")
		else
			gl.Text(label, cx, ty - 32 * S, 32 * S * k, "co")
			gl.Text(bp.count .. " " .. self.unitWord, cx, ty - 68 * S, 24 * S * k, "co")
			-- total cost of the whole blueprint: metal left, energy right
			local cost = M.blueprintCost(bp.units)
			gl.Color(0.75, 0.88, 1, 1)
			gl.Text("M " .. M.shortNumber(cost.metal), tx + TILE * 0.27, ty - 98 * S, 22 * S * k, "co")
			gl.Color(1, 0.95, 0.5, 1)
			gl.Text("E " .. M.shortNumber(cost.energy), tx + TILE * 0.73, ty - 98 * S, 22 * S * k, "co")
			-- fourth line: how long the stable income needs for the whole blueprint (Eco time)
			gl.Color(0.72, 1, 0.72, 1)
			gl.Text("Eco " .. M.ecoTime(cost.metal, cost.energy), cx, ty - 128 * S, 22 * S * k, "co")
			gl.Color(1, 1, 1, 1)
		end
	end

	-- hot: mouse is over the panel (for the x buttons)
	function g:draw(rect, mx, my, hot)
		local m, S = M.m, M.S
		local TILE = self:tile()
		local XSIZE = m.XSIZE * TILE / m.TILE
		gl.Scissor(rect.x1, rect.y0, rect.x2 - rect.x1, rect.top - rect.y0)
		local th = self:tileH()
		local rpc = self:rowsPer()
		for i, bp in ipairs(list()) do
			local top = rect.top - ((i - 1) % rpc) * th + self.scroll
			local bottom = top - th
			if top > rect.y0 and bottom < rect.top then
				local tx, ty = self:geom(rect, i)
				if not (self.drag and self.drag.active and self.drag.idx == i) then
					drawTile(tx, ty, bp, i, false, self)
					-- X to delete at the top right of the preview
					local xhot = hot and self:inXButton(rect, mx, my, i)
					if self.confirmDel == bp.name then
						gl.Color(0.9, 0.1, 0.1, 1)
					elseif xhot then
						gl.Color(0.8, 0.25, 0.25, 0.95)
					else
						gl.Color(0, 0, 0, 0.55)
					end
					gl.Rect(tx + TILE - XSIZE, ty + TILE - XSIZE, tx + TILE, ty + TILE)
					gl.Color(1, 1, 1, xhot and 1 or 0.8)
					gl.Text("x", tx + TILE - XSIZE / 2, ty + TILE - XSIZE + 10 * S, 36 * S, "co")
				end
			end
		end
		-- Dragging: insertion mark
		if self.drag and self.drag.active and self.drag.target then
			local txx, tyy = self:geom(rect, self.drag.target)
			local lineY = (self.drag.target > self.drag.idx) and (tyy - m.LABEL - 3) or (tyy + TILE + 4)
			gl.Color(1, 0.85, 0.2, 1)
			gl.Rect(txx - 3, lineY - 2, txx + TILE + 3, lineY + 2)
		end
		gl.Scissor(false)
		M.scrollbarDraw(self, rect)
		-- Ghost tile at the mouse pointer
		if self.drag and self.drag.active and list()[self.drag.idx] then
			drawTile(mx - TILE / 2, my - TILE / 2, list()[self.drag.idx], self.drag.idx, true, self)
		end
		gl.Color(1, 1, 1, 1)
		-- Cost of the blueprint below the panel while the mouse is on a tile
		if hot and not (self.drag and self.drag.active) and not self.editing then
			local hi = self:tileAt(rect, mx, my)
			local bp = hi and list()[hi]
			if bp and bp.units then
				local size = M.PREVIEW_SIZE * S
				local c = M.blueprintCost(bp.units)
				local items = { { text = string.format("%s  (%d %s)", bp.name, c.count, self.unitWord), fs = 26 } }
				for _, it in ipairs(M.costItems(c.metal, c.energy, " (Sum)", c.health, c.buildTime)) do
					items[#items + 1] = it
				end
				-- the largest range, sight, radar, sonar and jammer value of all units in it
				local reach = reachCache[bp.units]
				if not reach then
					local ids = {}
					for _, u in ipairs(bp.units) do
						local d = UnitDefNames[u.name]
						if d then
							ids[#ids + 1] = d.id
						end
					end
					reach = M.reachItems(ids, true)
					reachCache[bp.units] = reach
				end
				for _, it in ipairs(reach) do
					items[#items + 1] = it
				end
				local lines, h = M.infoLayout(items, size + 2 * M.infoGap())
				local _, by = self:geom(rect, hi)
				local px, py = M.previewPos(rect, by, TILE, size, h + 4 * S)
				pcall(M.drawBlueprintPreview, bp, px, py, size)
				M.infoDraw(lines, px - M.infoGap(), py - 2 * S, size + 2 * M.infoGap(), h)
				gl.Color(1, 1, 1, 1)
			end
		end
	end

	-- Left click in the panel (content area). Returns true if the click was consumed here.
	function g:press(rect, mx, my)
		self:setFocus(false)
		local idx = self:tileAt(rect, mx, my)
		if self.editing and (not idx or idx ~= self.editing.idx) then
			-- Click elsewhere: accept the rename
			local e = self.editing
			self:resetEdit()
			self:commitRename(e.name, e.text)
			idx = self:tileAt(rect, mx, my)
		end
		if idx and not self.editing then
			local name = list()[idx].name
			if self:inXButton(rect, mx, my, idx) then
				if self.confirmDel == name then
					self.confirmDel = nil
					self:deleteByName(name)
				else
					self.confirmDel = name
				end
				return true
			end
			self.confirmDel = nil
			local now = Spring.GetTimer and Spring.DiffTimers(Spring.GetTimer(), self.lastClick.timer or Spring.GetTimer()) or 99
			if self:inLabel(rect, mx, my, idx) and self.lastClick.idx == idx and self.lastClick.timer and now < 0.5 then
				-- Double click on the name: rename
				self.editing = { idx = idx, name = name, text = name }
				self:setArmed(false) -- the first click of the double click had armed the stamp
				if o.ownText then
					pcall(o.ownText, true)
				end
				self.drag = nil
				self.lastClick = { idx = 0 }
				return true
			end
			self.lastClick = { idx = idx, timer = Spring.GetTimer and Spring.GetTimer() or nil }
			self.selected = realIndex(idx)
			self.drag = { idx = idx, x = mx, y = my, active = false }
		end
		return true
	end

	function g:commitRename(old, new)
		local ok, newName = self.lib:rename(old, new)
		touch()
		if ok then
			local i = self.lib:index(newName)
			if i then
				self.selected = i
			end
			self:setArmed(false) -- after renaming do not leave it hanging on the cursor
		end
		return ok
	end

	function g:deleteByName(name)
		local removed = self.lib:remove(name)
		touch()
		if removed then
			if self.selected > #self.lib.list then
				self.selected = #self.lib.list
			end
			self:setArmed(false)
		end
	end

	function g:move(rect, mx, my)
		local d = self.drag
		if not d then
			return
		end
		if not d.active and self.query == "" and (math.abs(mx - d.x) + math.abs(my - d.y)) > 8 then
			d.active = true
			self:setArmed(false)
		end
		if d.active then
			local S = M.S
			-- scroll along at the top/bottom edge
			if my > rect.top - 30 * S then
				self.scroll = math.max(0, self.scroll - 12 * S)
			elseif my < rect.y0 + 30 * S then
				self.scroll = math.min(self:maxScroll(rect), self.scroll + 12 * S)
			end
			local cx = math.max(rect.x1 + 3, math.min(rect.x2 - 3, mx))
			local cy = math.max(rect.y0 + 1, math.min(rect.top - 1, my))
			local t = self:tileAt(rect, cx, cy)
			if not t and my < rect.top and my > rect.y0 then
				-- empty cell in the last row: to the end
				local gx0 = rect.x1 + 2 + math.max(0, ((rect.x2 - rect.x1 - 4) - self:cols() * self:cellW()) / 2)
				local col = math.floor((cx - gx0) / self:cellW())
				local row = math.floor((rect.top - cy + self.scroll) / self:tileH())
				if col * self:rowsPer() + row + 1 > #list() then
					t = #list()
				end
			end
			d.target = t or (my < rect.y0 + 30 * S and #list() or 1)
		end
	end

	function g:release()
		local d = self.drag
		if not d then
			return
		end
		self.drag = nil
		if d.active then
			if d.target and d.target ~= d.idx and self.lib:move(d.idx, d.target) then
				self.selected = d.target
				touch()
				if o.onSelect then
					o.onSelect(d.target, true)
				end
			end
		else
			self:setArmed(true)
			if o.onSelect then
				o.onSelect(realIndex(d.idx), false)
			end
		end
	end

	-- Text input while renaming (only active while editing is set)
	function g:textInput(ch)
		local e = self.editing
		if e and ch and #ch == 1 and ch:match("[%w_%-]") and #e.text < 40 then
			e.text = e.text .. ch
			return true
		end
		if not e and self.focus and ch and #ch == 1 and ch:match("[%w_%- ]") and #self.query < 30 then
			self.query = self.query .. ch
			self.scroll = 0
			return true
		end
	end

	-- Search field above the tiles (same look as the feature and unit search)
	function g:filterRowCount()
		return 1
	end

	function g:filterRects(x1, x2, top, hb)
		local pad = M.m.PAD
		local label = self.query
		if self.focus then
			label = label .. "|"
		elseif label == "" then
			label = self.searchLabel
		end
		return {
			{ x1 = x1 + pad, x2 = x2 - pad - hb - 3, y0 = top - hb, y1 = top, kind = "search", value = "search", label = label, active = self.focus,
				tip = "Search: type words of the name, the code or the description of the units in it; the tiles filter at once.\nEnter = done, Esc = clear the search. (Sorting is off while a search is active.)" },
			{ x1 = x2 - pad - hb, x2 = x2 - pad, y0 = top - hb, y1 = top, kind = "searchclear", value = "searchclear", label = "X", tip = "Clear search" },
		}
	end

	function g:setFocus(on)
		on = on and true or false
		if self.focus ~= on then
			self.focus = on
			if o.ownText then
				pcall(o.ownText, on)
			end
		end
	end

	function g:applyFilter(r)
		if r.kind == "search" then
			self:resetEdit()
			self:setFocus(true)
			self.scroll = 0
			return true
		end
		if r.kind == "searchclear" then
			self.query = ""
			self.scroll = 0
			return true
		end
		return false
	end

	function g:key(key)
		if not self.editing then
			if not self.focus then
				return false
			end
			if key == 13 or key == 271 then
				self:setFocus(false)
			elseif key == 27 then
				self.query = ""
				self.scroll = 0
				self:setFocus(false)
			elseif key == 8 then
				self.query = self.query:sub(1, -2)
				self.scroll = 0
			end
			return true
		end
		if key == 13 or key == 271 then -- Enter
			local e = self.editing
			self:resetEdit()
			self:commitRename(e.name, e.text)
		elseif key == 27 then -- Esc
			self:resetEdit()
		elseif key == 8 then -- Backspace
			self.editing.text = self.editing.text:sub(1, -2)
		end
		return true
	end

	function g:wheel(rect, up)
		self.scroll = math.max(0, math.min(self:maxScroll(rect), self.scroll - (up and 1 or -1) * 234 * M.S))
	end

	return g
end

---------------------------------------------------------------- Unit catalog and selection grid
-- "scv" (Scavengers: the *_scav copies of all units) and "rap" (Raptors: raptor_*) are no side of the game: the units exist only with the game option
-- forceallunits (the editor and the scenarios of such levels set it), and nobody controls them (no Scavenger or Raptor AI in the team)
M.FACTIONS = { { "arm", "Armada" }, { "cor", "Cortex" }, { "leg", "Legion" }, { "scv", "Scavengers" }, { "rap", "Raptors" } }
-- Faction symbols (in the game under sidepics/), left in the faction button
M.FACTION_ICONS = { arm = "sidepics/armada.png", cor = "sidepics/cortex.png", leg = "sidepics/Legion.png", rap = "icons/raptor.png" }
M.GROUPS = {
	{ "buildings", "Buildings" }, { "turrets", "Turrets" }, { "bot", "Bots" }, { "vehicle", "Vehicles" }, { "hover", "Hover" },
	{ "air", "Air" }, { "ships", "Ships" },
}
M.TECHS = { { 1, "T1" }, { 2, "T2" }, { 3, "T3" } }

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
M.unitGroup = unitGroup

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
-- "anti-air" (true/false) (0, 0, false without a weapon).
-- Anti-air weapons in BAR carry almost no default damage (e.g. 1), but the actual damage in the
-- armor class "vtol"; if that is higher than the default damage, it counts and the weapon is anti-air.
-- Projectiles per second = projectiles per shot * salvo size / reload time (as with the DPS figure).
local shotCache = {}
function M.shotInfo(unitDefID)
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

-- Info lines Range, LoS, Speed, Radar, Radar jammer, Sonar, Sonar jammer (one line each) of a list of unit def ids. Only the values above 0.
-- blueprint = true: the largest value of each over all units, but for Speed the smallest one (the slowest unit that moves), marked "(Min)".
function M.reachItems(ids, blueprint)
	local best, slowest = {}, nil
	for _, id in ipairs(ids) do
		local ud = UnitDefs[id]
		if ud then
			if (tonumber(ud.speed) or 0) > 0 then
				slowest = math.min(slowest or ud.speed, ud.speed)
			end
			local v = { M.weaponRange(id), ud.losRadius or ud.sightDistance, ud.radarRadius, ud.sonarRadius, ud.jammerRadius, ud.sonarJamRadius, ud.buildSpeed }
			for i = 1, 7 do
				best[i] = math.max(best[i] or 0, tonumber(v[i]) or 0)
			end
		end
	end
	local items = {}
	for _, s in ipairs({ { "Range", 1 }, { "LoS", 2 }, { "Speed", 8 }, { "Build power", 7 }, { "Radar", 3 }, { "Radar jammer", 5 }, { "Sonar", 4 }, { "Sonar jammer", 6 } }) do
		local n = math.floor(((s[2] == 8) and slowest or best[s[2]] or 0) + 0.5)
		if n > 0 then
			items[#items + 1] = { text = string.format("%s %d%s", s[1], n, (s[2] == 8 and blueprint) and " (Min)" or ""), fs = 22 }
		end
	end
	return items
end

-- Longest range of a weapon that does damage (0 without one)
function M.weaponRange(unitDefID)
	local best = 0
	local ud = UnitDefs[unitDefID]
	if ud and WeaponDefs then
		for _, w in ipairs(ud.weapons or {}) do
			local wd = WeaponDefs[w.weaponDef]
			if wd and wd.damages and (tonumber(wd.range) or 0) > best and ((tonumber(wd.damages[(Game.armorTypes or {}).default or 0]) or 0) > 1
				or (tonumber(wd.damages[(Game.armorTypes or {}).vtol or 14]) or 0) > 1) then
				best = tonumber(wd.range)
			end
		end
	end
	return math.floor(best + 0.5)
end

-- Circles on the ground around (x, z), following the terrain, for a unit or blueprint at the mouse pointer in stamp mode:
-- red = weapon range, blue = line of sight (of the unit def)
local function ringAt(x, z, radius, r, g, b)
	gl.Color(r, g, b, 0.85)
	gl.BeginEnd(GL.LINE_LOOP, function()
		for a = 0, 47 do
			local ang = a / 48 * 2 * math.pi
			local px, pz = x + math.cos(ang) * radius, z + math.sin(ang) * radius
			gl.Vertex(px, Spring.GetGroundHeight(px, pz) + 6, pz)
		end
	end)
end

function M.drawRangeCircles(x, z, unitDefID)
	local ud = UnitDefs[unitDefID]
	if not ud then
		return false
	end
	local range, los = M.weaponRange(unitDefID), tonumber(ud.losRadius or ud.sightDistance) or 0
	if range <= 0 and los <= 0 then
		return false
	end
	gl.DepthTest(false)
	gl.LineWidth(2)
	if los > 0 then
		ringAt(x, z, los, 0.3, 0.55, 1)
	end
	if range > 0 then
		ringAt(x, z, range, 1, 0.2, 0.15)
	end
	gl.LineWidth(1)
	gl.Color(1, 1, 1, 1)
	return true
end

-- Explosion of a building: damage and radius when destroyed and on self-destruct.
-- Returns (damage, radius, selfDamage, selfRadius), 0 if there is no explosion.
local boomCache = {}
function M.explosionInfo(unitDefID)
	local c = boomCache[unitDefID]
	if c then
		return c[1], c[2], c[3], c[4]
	end
	local function one(name)
		local wd = name and WeaponDefNames and WeaponDefNames[string.lower(name)]
		if wd and wd.damages then
			return math.floor((tonumber(wd.damages[0]) or 0) + 0.5), math.floor((tonumber(wd.damageAreaOfEffect) or tonumber(wd.areaOfEffect) or 0) + 0.5)
		end
		return 0, 0
	end
	local ud = UnitDefs[unitDefID]
	local d, r, sd, sr = 0, 0, 0, 0
	if ud then
		d, r = one(ud.deathExplosion)
		sd, sr = one(ud.selfDExplosion)
	end
	boomCache[unitDefID] = { d, r, sd, sr }
	return d, r, sd, sr
end

local function fmtRate(v)
	if v >= 10 then
		return string.format("%d", math.floor(v + 0.5))
	end
	local t = string.format(v < 1 and "%.2f" or "%.1f", v)
	t = t:gsub("0+$", ""):gsub("%.$", "") -- drop superfluous zeros
	return t
end

-- The faction key of a unit name: arm / cor / leg, scv for the *_scav copies, rap for the raptors (nil: not offered, e.g. critters)
function M.factionOf(name)
	if name:sub(-5) == "_scav" then
		return "scv", name:sub(1, -6)
	elseif name:sub(1, 7) == "raptor_" then
		return "rap", name
	end
	return name:sub(1, 3), name
end

-- A copy of a list of unit names, sorted by faction (order of M.FACTIONS), then group (order of M.GROUPS), then the name shown for the unit
function M.sortUnitNames(names)
	local order = {}
	for i, f in ipairs(M.FACTIONS) do
		order[f[1]] = i
	end
	local gorder = {}
	for i, g in ipairs(M.GROUPS) do
		gorder[g[1]] = i
	end
	local keys = {}
	for _, n in ipairs(names) do
		local ud = UnitDefNames[n]
		local fac = M.factionOf(n)
		keys[n] = { order[fac] or 99, ud and gorder[unitGroup(ud)] or 99, string.lower(ud and (ud.translatedHumanName or ud.humanName) or n) }
	end
	local out = {}
	for i, n in ipairs(names) do
		out[i] = n
	end
	table.sort(out, function(a, b)
		local ka, kb = keys[a], keys[b]
		if ka[1] ~= kb[1] then
			return ka[1] < kb[1]
		end
		if ka[2] ~= kb[2] then
			return ka[2] < kb[2]
		end
		if ka[3] ~= kb[3] then
			return ka[3] < kb[3]
		end
		return a < b
	end)
	return out
end

-- [faction][group][tech] = { { name, id, filler, rank } ... }, built once from UnitDefs
function M.buildUnitCache()
	local cache = {}
	for _, f in ipairs(M.FACTIONS) do
		cache[f[1]] = {}
		for _, g in ipairs(M.GROUPS) do
			cache[f[1]][g[1]] = { {}, {}, {} }
		end
	end
	for id, ud in pairs(UnitDefs) do
		local name = ud.name
		local key, base = M.factionOf(name) -- base: the name without _scav (the checks below are about the normal unit)
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

-- o: { cfg, groups = { "buildings", ... } (offer only these groups; default all), factions = { "arm", "cor", "leg" } (offer only these; default all), factionUsable = fn(factionId) -> bool (a faction for which it says false gets no button), faction = "arm", canUse = fn(unitDefID) -> bool }
function M.newUnits(o)
	local u = {
		cfg = o.cfg, faction = o.faction or "arm", group = "buildings", tech = 1, scroll = 0, cache = nil, canUse = o.canUse, restrict = o.restrict, factionUsable = o.factionUsable, filter = o.filter, noPreview = o.noPreview,
		query = "", focus = false, ownText = o.ownText, searchOn = (o.search ~= false), searchLabel = o.searchLabel or "Search ...",
	}
	u.factions = {}
	for _, f in ipairs(M.FACTIONS) do
		local keep = not o.factions
		for _, name in ipairs(o.factions or {}) do
			keep = keep or name == f[1]
		end
		if keep then
			u.factions[#u.factions + 1] = f
		end
	end
	u.groups = {}
	for _, g in ipairs(M.GROUPS) do
		local keep = not o.groups
		if o.groups then
			for _, name in ipairs(o.groups) do
				if name == g[1] then
					keep = true
				end
			end
		end
		if keep then
			u.groups[#u.groups + 1] = g
		end
	end
	u.group = u.groups[1][1]

	-- The cache of this list: o.filter(unitDef, name) -> boolean keeps only the units it accepts (every list builds its own cache)
	function u:buildCache()
		local cache = M.buildUnitCache()
		local keep = o.filter
		if keep then
			for _, fac in pairs(cache) do
				for _, g in pairs(fac) do
					for t = 1, 3 do
						local out = {}
						for _, e in ipairs(g[t]) do
							if keep(UnitDefs[e.id], e.name) then
								out[#out + 1] = e
							end
						end
						g[t] = out
					end
				end
			end
		end
		return cache
	end

	-- Search across all factions, groups and tech levels: code, name or words of the description
	function u:searchList()
		if self.searchFor == self.query and self.searchResult then
			return self.searchResult
		end
		local q = self.query:lower()
		local out = {}
		for _, f in ipairs(self.factions) do
			for _, g in ipairs(self.groups) do
				for t = 1, 3 do
					for _, e in ipairs(self.cache[f[1]][g[1]][t]) do
						if M.matches(q, M.unitSearchText(e.name)) then
							out[#out + 1] = e
						end
					end
				end
			end
		end
		self.searchFor, self.searchResult = self.query, out
		return out
	end

	function u:list()
		if self.override then
			return self.override -- e.g. favorites view: fixed list
		end
		if not self.cache then
			self.cache = self:buildCache()
		end
		if self.query ~= "" then
			return self:searchList()
		end
		return self.cache[self.faction][self.group][self.tech]
	end

	-- Shows the tile of a unit (crosshair button of the Place menu, window of the restricted units): faction, group and tech are set to the unit's,
	-- the search is cleared and the next draw scrolls to the tile and lets its frame flash green. Returns true, or nil and a message.
	function u:locate(name)
		if not self.cache then
			self.cache = self:buildCache()
		end
		for _, f in ipairs(self.factions) do
			for _, g in ipairs(self.groups) do
				for t = 1, 3 do
					for _, e in ipairs(self.cache[f[1]][g[1]][t]) do
						if e.name == name then
							self.faction, self.group, self.tech = f[1], g[1], t
							self.query, self.override = "", nil
							self.locateName = name
							return true
						end
					end
				end
			end
		end
		return nil, name .. " is not in the list"
	end

	function u:setFocus(on)
		on = on and true or false
		if self.focus ~= on then
			self.focus = on
			if self.ownText then
				self.ownText(on)
			end
		end
	end

	-- Text input for the search field (only active while it has the focus)
	function u:textInput(ch)
		if self.focus and ch and #ch == 1 and ch:match("[%w_%- ]") and #self.query < 30 then
			self.query = self.query .. ch
			self.scroll = 0
			return true
		end
	end

	function u:key(key)
		if not self.focus then
			return false
		end
		if key == 13 or key == 271 then -- Enter: leave the field, the search stays
			self:setFocus(false)
		elseif key == 27 then -- Esc: clear the search
			self.query = ""
			self.scroll = 0
			self:setFocus(false)
		elseif key == 8 then -- Backspace
			self.query = self.query:sub(1, -2)
			self.scroll = 0
		end
		return true
	end

	-- Number of filter rows in the header (search, faction, group only if several, tech)
	function u:filterRowCount()
		return ((#self.groups > 1) and 3 or 2) + (self.searchOn and 1 or 0)
	end

	-- The names of the units a faction, group or tech X stands for: everything in it right now (faction: all groups and tech levels,
	-- group: all tech levels of that group of the chosen faction, tech level: all factions and groups)
	function u:namesOf(kind, value)
		if not self.cache then
			self.cache = self:buildCache()
		end
		local out = {}
		local function add(list)
			for _, e in ipairs(list) do
				out[#out + 1] = e.name
			end
		end
		if kind == "faction" then
			for _, g in ipairs(self.groups) do
				for t = 1, 3 do
					add(self.cache[value][g[1]][t])
				end
			end
		elseif kind == "group" then
			for t = 1, 3 do
				add(self.cache[self.faction][value][t])
			end
		elseif kind == "tech" then
			for _, f in ipairs(self.factions) do
				for _, g in ipairs(self.groups) do
					add(self.cache[f[1]][g[1]][value])
				end
			end
		end
		return out
	end

	-- Is there no unit at all behind a filter button? faction: in none of the groups and tech levels; group: in none of the tech levels (of the chosen faction);
	-- tech: none in the chosen group (of the chosen faction)
	function u:emptyButton(kind, value)
		if not self.cache then
			self.cache = self:buildCache()
		end
		local function count(fac, grp, tl)
			local list = self.cache[fac] and self.cache[fac][grp] and self.cache[fac][grp][tl]
			return list and #list or 0
		end
		if kind == "faction" then
			for _, g in ipairs(self.groups) do
				for tl = 1, 3 do
					if count(value, g[1], tl) > 0 then
						return false
					end
				end
			end
			return true
		elseif kind == "group" then
			for tl = 1, 3 do
				if count(self.faction, value, tl) > 0 then
					return false
				end
			end
			return true
		elseif kind == "tech" then
			return count(self.faction, self.group, value) == 0
		end
		return false
	end

	-- Buttons for faction/group/tech; top = top edge of the first row, hb = height of the buttons
	function u:filterRects(x1, x2, top, hb)
		local rects = {}
		local pad = M.m.PAD
		local rs = self.restrict
		local function row(r, items, kind, active)
			local n = #items
			local bw = (x2 - x1 - 2 * pad - (n - 1) * 3) / n
			local t = top - r * (hb + 3)
			for i, it in ipairs(items) do
				local bx = x1 + pad + (i - 1) * (bw + 3)
				local banned = false
				local allow = rs and rs.style == "allow"
				if rs then
					banned = rs.allBanned(self:namesOf(kind, it[1]))
				end
				local tint = banned and (allow and { 0.12, 0.4, 0.15 } or { 0.45, 0.12, 0.12 }) or nil
				if not tint and allow and rs.anyBanned and rs.anyBanned(self:namesOf(kind, it[1])) then
					tint = { 0.09, 0.26, 0.11 } -- only some of it is allowed: a light green shade
				end
				if not tint and self:emptyButton(kind, it[1]) then
					-- nothing behind this button: slightly red (lighter when it is the chosen one)
					tint = (it[1] == active) and { 0.8, 0.55, 0.55 } or { 0.38, 0.17, 0.17 }
				end
				rects[#rects + 1] = { x1 = bx, x2 = bx + bw, y0 = t - hb, y1 = t, kind = kind, value = it[1], label = it[2], active = (it[1] == active),
					icon = (kind == "faction") and M.FACTION_ICONS[it[1]] or nil, tint = tint,
					reserve = rs and (hb * 0.62 + 6) or nil }
				if rs then
					-- X in the right end of the button: restricts everything of it (the player cannot build it in the game)
					local xs = hb * 0.62
					local what = (kind == "faction" and "this faction") or (kind == "group" and "this group of the chosen faction") or "this tech level (all factions and groups)"
					rects[#rects + 1] = { x1 = bx + bw - xs - 3, x2 = bx + bw - 3, y0 = t - hb / 2 - xs / 2, y1 = t - hb / 2 + xs / 2, kind = kind .. "x", value = it[1],
						label = allow and "" or "X", tick = allow or nil, fs = xs * 0.8,
						tint = banned and (allow and { 0.1, 0.6, 0.15 } or { 0.85, 0.1, 0.1 }) or { 0.1, 0.1, 0.1 },
						tip = allow and (banned and ("Allowed: every unit of " .. what .. " is in this army. Click to remove them again.") or
								("Click: allow every unit of " .. what .. " in this army.")) or
							banned and ("Restricted: the player cannot build anything of " .. what .. " in the game. Click to allow it again.") or
							("Click: the player cannot build anything of " .. what .. " in the game (you can always place it in the editor).") }
				end
			end
		end
		local r = 0
		if self.searchOn then
			local label = self.query
			if self.focus then
				label = label .. "|"
			elseif label == "" then
				label = self.searchLabel
			end
			rects[#rects + 1] = { x1 = x1 + pad, x2 = x2 - pad - hb - 3, y0 = top - hb, y1 = top, kind = "search", value = "search", label = label,
				active = self.focus, tip = "Search: type words of the description or the code, the list filters at once.\nEnter = done, Esc = clear the search." }
			rects[#rects + 1] = { x1 = x2 - pad - hb, x2 = x2 - pad, y0 = top - hb, y1 = top, kind = "searchclear", value = "searchclear", label = "X",
				tip = "Clear search" }
			r = r + 1
		end
		local shown = {}
		for _, f in ipairs(self.factions) do
			if not self.factionUsable or self.factionUsable(f[1]) then
				shown[#shown + 1] = f
			end
		end
		if #shown == 0 then
			shown = self.factions
		end
		local isShown = false
		for _, f in ipairs(shown) do
			isShown = isShown or f[1] == self.faction
		end
		if not isShown then
			self.faction = shown[1][1]
		end
		row(r, shown, "faction", self.faction)
		r = r + 1
		if #self.groups > 1 then
			row(r, self.groups, "group", self.group)
			r = r + 1
		end
		row(r, M.TECHS, "tech", self.tech)
		return rects
	end

	function u:applyFilter(r)
		if r.kind == "search" then
			self:setFocus(true)
			self.scroll = 0
			return true
		end
		if r.kind == "searchclear" then
			self.query = ""
			self.scroll = 0
			return true
		end
		if self.focus then
			self:setFocus(false)
		end
		if self.restrict and (r.kind == "factionx" or r.kind == "groupx" or r.kind == "techx") then
			local rs, kind = self.restrict, r.kind:sub(1, -2)
			local names = self:namesOf(kind, r.value)
			rs.setBanned(names, not rs.allBanned(names))
			return true
		end
		if r.kind == "faction" then
			self.faction = r.value
		elseif r.kind == "group" then
			self.group = r.value
		elseif r.kind == "tech" then
			self.tech = r.value
		else
			return false
		end
		self.scroll = 0
		return true
	end

	-- Cell and picture size: with more than 3 columns the menu stays as wide as with 3 and the pictures get smaller
	function u:cell()
		local cols = math.max(1, self.cfg.v.uCols)
		return cols <= 3 and M.m.UCELL or math.floor(3 * M.m.UCELL / cols)
	end

	function u:icon()
		return self:cell() - (M.m.UCELL - M.m.UICON)
	end

	function u:colsFor(rect)
		return math.max(1, math.floor((rect.x2 - rect.x1 - 2 * M.m.UPAD) / self:cell()))
	end

	-- wanted size of the content area
	function u:size()
		return self.cfg.v.uCols * self:cell() + 2 * M.m.UPAD + 4, self.cfg.v.uRows * self:cell() + 2 * M.m.UPAD
	end

	function u:maxScroll(rect)
		local rows = math.ceil(#self:list() / self:colsFor(rect))
		return math.max(0, rows * self:cell() + M.m.UPAD * 2 - (rect.top - rect.y0))
	end

	-- lower left corner of the symbol of entry i
	function u:geom(rect, i)
		local cols = self:colsFor(rect)
		local col, row = (i - 1) % cols, math.floor((i - 1) / cols)
		local m = M.m
		return rect.x1 + m.UPAD + col * self:cell(), rect.top - m.UPAD - (row + 1) * self:cell() + self.scroll + (M.m.UCELL - M.m.UICON)
	end

	function u:at(rect, mx, my)
		local m = M.m
		local cols = self:colsFor(rect)
		local col = math.floor((mx - rect.x1 - m.UPAD) / self:cell())
		local row = math.floor((rect.top - m.UPAD - my + self.scroll) / self:cell())
		if col < 0 or col >= cols or row < 0 then
			return nil
		end
		local i = row * cols + col + 1
		if self:list()[i] then
			return i
		end
	end

	function u:wheel(rect, up)
		self.scroll = math.max(0, math.min(self:maxScroll(rect), self.scroll - (up and 1 or -1) * 234 * M.S))
	end

	-- The X in the upper right corner of a symbol (restrictions): box of the symbol at (ix, iy)
	function u:xBox(ix, iy)
		local xs = self:icon() * 0.3
		return ix + self:icon() - xs, iy + self:icon() - xs, ix + self:icon(), iy + self:icon()
	end

	-- Index of the tile whose X is under the mouse pointer (or nil)
	function u:xAt(rect, mx, my)
		if not self.restrict then
			return nil
		end
		local i = self:at(rect, mx, my)
		if i then
			local ix, iy = self:geom(rect, i)
			local x1, y0, x2, y1 = self:xBox(ix, iy)
			if mx >= x1 and mx <= x2 and my >= y0 and my <= y1 then
				return i
			end
		end
	end

	-- selectedName: highlighted unit (stamp mode), hint: text below the info, hot: mouse over the panel
	function u:draw(rect, mx, my, selectedName, hint, hot)
		local m, S = M.m, M.S
		local list = self:list()
		gl.Scissor(rect.x1, rect.y0, rect.x2 - rect.x1, rect.top - rect.y0)
		if self.locateName then
			-- crosshair button: bring the tile into the middle of the view, its frame flashes for about two seconds
			for i, e in ipairs(list) do
				if e.name == self.locateName then
					local row = math.floor((i - 1) / self:colsFor(rect))
					self.scroll = math.max(0, math.min(self:maxScroll(rect), row * self:cell() + self:cell() / 2 + m.UPAD - (rect.top - rect.y0) / 2))
					self.flashName, self.flashUntil = e.name, os.clock() + 2
				end
			end
			self.locateName = nil
		end
		local flash = self.flashName and os.clock() < self.flashUntil and self.flashName or nil
		local hoverIdx = hot and self:at(rect, mx, my) or nil
		for i, e in ipairs(list) do
			local ix, iy = self:geom(rect, i)
			if iy + self:icon() > rect.y0 and iy < rect.top then
				local usable = not self.canUse or self.canUse(e.id)
				if flash == e.name then
					local k = 0.5 + 0.5 * math.sin(os.clock() * 14)
					gl.Color(0.1, 1, 0.2, 0.45 + 0.5 * k)
					gl.Rect(ix - 6 * S, iy - 6 * S, ix + self:icon() + 6 * S, iy + self:icon() + 6 * S)
				end
				if selectedName and selectedName == e.name then
					gl.Color(0.25, 0.5, 1, 0.8)
					gl.Rect(ix - 3, iy - 3, ix + self:icon() + 3, iy + self:icon() + 3)
				elseif i == hoverIdx then
					gl.Color(1, 1, 1, 0.35)
					gl.Rect(ix - 2, iy - 2, ix + self:icon() + 2, iy + self:icon() + 2)
				end
				local rs = self.restrict
				local banned = rs and rs.isBanned(e.name) or false
				local allow = rs and rs.style == "allow"
				gl.Color(1, 1, 1, (usable and (allow or not banned)) and 1 or 0.3)
				gl.Texture("#" .. e.id)
				gl.TexRect(ix, iy, ix + self:icon(), iy + self:icon())
				gl.Texture(false)
				if rs then
					if banned and not allow then
						gl.Color(1, 0.1, 0.1, 1)
						gl.LineWidth(5 * S)
						gl.BeginEnd(GL.LINES, function()
							gl.Vertex(ix + 4 * S, iy + 4 * S)
							gl.Vertex(ix + self:icon() - 4 * S, iy + self:icon() - 4 * S)
							gl.Vertex(ix + 4 * S, iy + self:icon() - 4 * S)
							gl.Vertex(ix + self:icon() - 4 * S, iy + 4 * S)
						end)
						gl.LineWidth(1)
					end
					local bx1, by0, bx2, by1 = self:xBox(ix, iy)
					if rs.isBanned(e.name) then
						if allow then
							gl.Color(0.1, 0.55, 0.15, 0.95)
						else
							gl.Color(0.8, 0.1, 0.1, 0.95)
						end
					else
						gl.Color(0, 0, 0, 0.75)
					end
					gl.Rect(bx1, by0, bx2, by1)
					gl.Color(1, 0.15, 0.15, 1)
					gl.LineWidth(3 * S)
					local g = (bx2 - bx1) * 0.22
					if allow then
						gl.Color(1, 1, 1, rs.isBanned(e.name) and 1 or 0.3) -- a check mark: allowed (bright) or not yet (faint)
						gl.BeginEnd(GL.LINE_STRIP, function()
							gl.Vertex(bx1 + g, by0 + (by1 - by0) * 0.5)
							gl.Vertex(bx1 + (bx2 - bx1) * 0.42, by0 + g)
							gl.Vertex(bx2 - g, by1 - g)
						end)
					else
						gl.BeginEnd(GL.LINES, function()
							gl.Vertex(bx1 + g, by0 + g)
							gl.Vertex(bx2 - g, by1 - g)
							gl.Vertex(bx1 + g, by1 - g)
							gl.Vertex(bx2 - g, by0 + g)
						end)
					end
					gl.LineWidth(1)
				end
			end
		end
		gl.Scissor(false)
		M.scrollbarDraw(self, rect)
		gl.Color(1, 1, 1, 1)
		local cx = (rect.x1 + rect.x2) / 2
		if #list == 0 then
			local loaded = false -- are there any units of this faction at all? Scavengers and Raptors exist only with the game option forceallunits
			for _, g in ipairs(M.GROUPS) do
				for tl = 1, 3 do
					if #self.cache[self.faction][g[1]][tl] > 0 then
						loaded = true
					end
				end
			end
			if loaded then
				gl.Text("No units in this selection", cx, rect.top - 30 * S, 12 * S, "co")
			else
				gl.Text("These units are not loaded.", cx, rect.top - 30 * S, 12 * S, "co")
				gl.Text("Start menu key 7: Scavenger and Raptor units ON, then start again.", cx, rect.top - 30 * S - 16 * S, 11 * S, "co")
			end
		end
		-- Under the 3D preview: name (code), description, cost with Eco time, for a unit that shoots shots per second x damage = DPS, explosion
		local e = (not self.noPreview) and hoverIdx and list[hoverIdx]
		if e then
			local size = M.PREVIEW_SIZE * S
			local ud = UnitDefs[e.id]
			local human = ud.translatedHumanName or ud.humanName or e.name
			local shot, sps, isAA, shotEnergy, shotMetal = M.shotInfo(e.id)
			local title = string.format("%s (%s)", human, e.name)
			if self.restrict and self.restrict.isBanned(e.name) then
				title = title .. ((self.restrict.style == "allow") and "  - allowed" or "  - restricted")
			end
			local items = {
				{ text = title, fs = 26 },
				{ text = tostring(ud.translatedTooltip or ud.tooltip or ""), fs = 20, color = { 0.85, 0.85, 0.85 } },
			}
			for _, it in ipairs(M.costItems(ud.metalCost, ud.energyCost, "", ud.health, ud.buildTime)) do
				items[#items + 1] = it
			end
			if shot > 0 then
				items[#items + 1] = { text = string.format("DPS %s = %s shots/s x %d dmg%s", fmtRate(shot * sps), fmtRate(sps), shot, isAA and "   (air)" or ""), fs = 22 }
				if shotMetal > 0 then
					items[#items + 1] = { text = string.format("Metal per shot %s", fmtRate(shotMetal)), fs = 22 }
				end
				if shotEnergy > 0 then
					items[#items + 1] = { text = string.format("Energy per shot %s", fmtRate(shotEnergy)), fs = 22 }
				end
			end
			for _, it in ipairs(M.reachItems({ e.id })) do
				items[#items + 1] = it
			end
			-- Damage to the units around when it is destroyed and when it blows itself up (power plants can hit neighbors hard)
			local bd, br, sd, sr = M.explosionInfo(e.id)
			if bd > 0 then
				items[#items + 1] = { text = string.format("Destroyed: %d dmg, radius %d", bd, br), fs = 22 }
			end
			if sd > 0 then
				items[#items + 1] = { text = string.format("Self-destruct: %d dmg, radius %d", sd, sr), fs = 22 }
			end
			local lines, h = M.infoLayout(items, size + 2 * M.infoGap())
			local _, uy = self:geom(rect, hoverIdx)
			local px, py = M.previewPos(rect, uy, self:icon(), size, h + 4 * S)
			pcall(M.drawUnitPreview, e.id, px, py, size)
			M.infoDraw(lines, px - M.infoGap(), py - 2 * S, size + 2 * M.infoGap(), h)
			gl.Color(1, 1, 1, 1)
		end
		if hint then
			gl.Text(hint, cx, rect.y0 - 40 * S, 25 * S, "co")
		end
	end

	return u
end

---------------------------------------------------------------- Features (trees, rocks, wrecks)
M.FEATURE_KINDS = { { "tree", "Trees" }, { "rock", "Rocks" }, { "crystal", "Crystals" }, { "wreck", "Wrecks" }, { "other", "Rest" } }

local function featureKind(name, fd)
	local n = name:lower()
	if n:find("^pilha_crystal") then
		return "crystal" -- the reclaim nodes of Reclaim the Fame (pilha_crystal1/2/3 = small, medium, large)
	end
	if n:find("_dead$") or n:find("_heap$") or n:find("wreck") or n:find("rockteeth") then
		return "wreck"
	end
	if n:find("tree") or n:find("pine") or n:find("palm") or n:find("bush") or n:find("cane") or n:find("aspen")
		or n:find("birch") or n:find("cactus") or n:find("plant") then
		return "tree"
	end
	if n:find("rock") or n:find("stone") or n:find("boulder") or n:find("crystal") or n:find("cliff") then
		return "rock"
	end
	if fd and fd.burnable then
		return "tree"
	end
	return "other"
end

-- [kind] = { { name, id } ... }, built once from FeatureDefs
function M.buildFeatureCache()
	local cache = { tree = {}, rock = {}, crystal = {}, wreck = {}, other = {} }
	for id, fd in pairs(FeatureDefs) do
		local name = fd.name
		if name and name ~= "" then
			local list = cache[featureKind(name, fd)]
			list[#list + 1] = { name = name, id = id }
		end
	end
	for _, list in pairs(cache) do
		table.sort(list, function(a, b) return a.name < b.name end)
	end
	return cache
end

-- ---------------------------------------------------------------- 3D preview (units, features, blueprints)
-- Draws a model into a square with the engine calls gl.UnitShape / gl.FeatureShape (lower left x1, y1, edge
-- size). drawFn() draws around the origin at map scale; radius and height determine the scale. Own projection
-- with a large depth, because the screen projection only covers -1 to 1. thumb = true: output into a texture
-- (coordinates from 0, 0, no background, fixed rotation).
local function modelBox(x1, y1, size, radius, height, drawFn, thumb)
	if not gl.UnitShape or not GL then
		return
	end
	local vsx, vsy = Spring.GetViewGeometry()
	local W, H = thumb and size or vsx, thumb and size or vsy
	if not thumb then
		gl.Color(0, 0, 0, 0.8)
		gl.Rect(x1, y1, x1 + size, y1 + size)
		gl.Scissor(x1, y1, size, size)
	end
	radius = math.max(radius or 0, (height or 0) * 0.6, 8)
	local s = size * 0.45 / radius
	gl.Clear(GL.DEPTH_BUFFER_BIT, 1)
	gl.DepthTest(true)
	gl.DepthMask(true)
	gl.MatrixMode(GL.PROJECTION)
	gl.PushMatrix()
	gl.LoadIdentity()
	-- Texture output is upside down in this engine (texture coordinates of TexRect do not help): render the height reversed
	gl.Ortho(0, W, thumb and H or 0, thumb and 0 or H, -4000, 4000)
	gl.MatrixMode(GL.MODELVIEW)
	gl.PushMatrix()
	gl.LoadIdentity()
	gl.Translate(x1 + size / 2, y1 + size / 2, 0)
	gl.Scale(s, s, s)
	gl.Rotate(25, 1, 0, 0)
	gl.Rotate(thumb and 35 or (os.clock() * 40) % 360, 0, 1, 0)
	gl.Translate(0, -(height or 0) * 0.5, 0)
	gl.Color(1, 1, 1, 1)
	-- Alpha of the model texture is a mask: without blending and without writing alpha the model becomes opaque
	gl.Blending(false)
	gl.AlphaTest(false)
	gl.ColorMask(true, true, true, false)
	pcall(drawFn)
	gl.Texture(0, false)
	gl.ColorMask(true, true, true, true)
	gl.Blending(true)
	gl.MatrixMode(GL.PROJECTION)
	gl.PopMatrix()
	gl.MatrixMode(GL.MODELVIEW)
	gl.PopMatrix()
	gl.DepthTest(false)
	gl.DepthMask(false)
	if not thumb then
		gl.Scissor(false)
	end
	gl.Color(1, 1, 1, 1)
end

-- Units need their own lighting and team color (alpha of the texture is the team color mask); without a shader they are dark.
-- Same idea as in BAR's terraform capture: rawState = true, textures by hand, simple shader with fixed light.
local MODEL_VERT = [[
	#version 150 compatibility
	varying vec3 vNormal;
	void main() {
		gl_TexCoord[0] = gl_MultiTexCoord0;
		vNormal = gl_NormalMatrix * gl_Normal;
		gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;
	}
]]
local MODEL_FRAG = [[
	#version 150 compatibility
	uniform sampler2D tex0;
	uniform vec3 teamCol;
	varying vec3 vNormal;
	void main() {
		vec4 t = texture2D(tex0, gl_TexCoord[0].st);
		vec3 albedo = mix(t.rgb, teamCol, t.a);
		float ndl = clamp(dot(normalize(vNormal), normalize(vec3(0.35, 0.8, 0.6))), 0.0, 1.0);
		gl_FragColor = vec4(albedo * (0.5 + 0.55 * ndl), 1.0);
	}
]]
local modelShader, uTeamCol
local function getModelShader()
	if modelShader == nil then
		modelShader = false
		if gl.CreateShader then
			local sh = gl.CreateShader({ vertex = MODEL_VERT, fragment = MODEL_FRAG, uniformInt = { tex0 = 0 }, uniformFloat = { teamCol = { 1, 1, 1 } } })
			if sh and sh ~= 0 then
				modelShader = sh
				uTeamCol = gl.GetUniformLocation(sh, "teamCol")
			end
		end
	end
	return modelShader
end

local function drawUnitModel(defID, team)
	local sh = getModelShader()
	if sh then
		local r, g, b = M.teamColor(team or 0)
		gl.Culling(GL.BACK)
		gl.UnitShapeTextures(defID, true)
		gl.UseShader(sh)
		gl.Uniform(uTeamCol, r, g, b)
		gl.UnitShape(defID, team or 0, true, false, true)
		gl.UseShader(0)
		gl.UnitShapeTextures(defID, false)
		gl.Culling(false)
	else
		gl.Texture(0, "%" .. defID .. ":0")
		gl.Texture(1, "%" .. defID .. ":1")
		gl.UnitShape(defID, team or 0)
		gl.Texture(1, false)
		gl.Texture(0, false)
	end
end

local function drawFeatureModel(defID)
	gl.Texture(0, "%-" .. defID .. ":0")
	gl.FeatureShape(defID, Spring.GetGaiaTeamID())
	gl.Texture(0, false)
end

function M.drawFeaturePreview(defID, x1, y1, size, thumb)
	local fd = FeatureDefs[defID]
	if fd then
		modelBox(x1, y1, size, fd.radius, fd.height, function() drawFeatureModel(defID) end, thumb)
	end
end

function M.drawUnitPreview(defID, x1, y1, size, team)
	local ud = UnitDefs[defID]
	if ud then
		modelBox(x1, y1, size, ud.radius, ud.height, function() drawUnitModel(defID, team) end)
	end
end

-- Blueprint: all units in place, rotated as when placing (h = facing as engine heading, 65536 = full turn)
function M.drawBlueprintPreview(bp, x1, y1, size)
	local items, radius, height = {}, 8, 0
	for _, u in ipairs(bp.units or {}) do
		local ud = UnitDefNames[u.name]
		if ud then
			local def = UnitDefs[ud.id]
			items[#items + 1] = { id = ud.id, dx = u.dx or 0, dz = u.dz or 0, h = tonumber(u.h) or 0, team = u.team }
			radius = math.max(radius, math.sqrt((u.dx or 0) ^ 2 + (u.dz or 0) ^ 2) + (def.radius or 0))
			height = math.max(height, def.height or 0)
		end
	end
	if #items == 0 then
		return
	end
	modelBox(x1, y1, size, radius, height, function()
		for _, it in ipairs(items) do
			gl.PushMatrix()
			gl.Translate(it.dx, 0, it.dz)
			gl.Rotate(it.h * 360 / 65536, 0, 1, 0)
			drawUnitModel(it.id, it.team)
			gl.PopMatrix()
		end
	end)
end

-- Place of the preview next to the panel: left (next to the team strip), otherwise right; at the height of tileY.
-- infoH: height of the text block under the preview (the picture moves up so that the text stays on the screen)
function M.previewPos(rect, tileY, tileH, size, infoH)
	local S = M.S
	local vsx, vsy = Spring.GetViewGeometry()
	local px = rect.x1 - M.m.HB - 14 * S - size
	if px < 10 * S then
		px = math.min(vsx - size - 10 * S, rect.x2 + 14 * S)
	end
	local py = math.max(10 * S + (infoH or 0), math.min(vsy - size - 10 * S, tileY + tileH / 2 - size / 2))
	return px, py
end
M.PREVIEW_SIZE = 400

-- Time until the current income has produced the given metal and energy ("Eco time"): worst case, the stock is not counted. The larger of
-- the two times counts; no income of a needed resource gives "-". Under a minute in seconds, then m:ss, from an hour h:mm:ss.
-- What the own units produce right now: the sum of metalMake / energyMake of all own units (metal extractors, converters, generators, the commander ...).
-- It does not contain what only comes in once (reclaim, gifts), so the numbers do not jump. Recomputed once a second.
local stable = { at = -10, metal = 0, energy = 0 }
function M.stableIncome()
	local now = os.clock()
	if now - stable.at > 1 then
		stable.at = now
		local m, e = 0, 0
		for _, id in ipairs(Spring.GetTeamUnits(Spring.GetMyTeamID()) or {}) do
			local mm, _, em = Spring.GetUnitResources(id)
			m, e = m + (mm or 0), e + (em or 0)
		end
		stable.metal, stable.energy = m, e
	end
	return stable.metal, stable.energy
end

function M.ecoTime(metal, energy)
	local mi, ei = M.stableIncome()
	local secs = 0
	for _, r in ipairs({ { metal or 0, mi }, { energy or 0, ei } }) do
		if r[1] > 0 then
			if r[2] <= 0 then
				return "-"
			end
			secs = math.max(secs, r[1] / r[2])
		end
	end
	secs = math.ceil(secs)
	if secs < 60 then
		return secs .. " s"
	elseif secs < 3600 then
		return string.format("%d:%02d", math.floor(secs / 60), secs % 60)
	end
	return string.format("%d:%02d:%02d", math.floor(secs / 3600), math.floor(secs / 60) % 60, secs % 60)
end

-- "Metal 100   Energy 1500   (Eco time 1:25)" as parts that wrap only between the parts
-- Metal, Energy, Eco time and Health as four lines (items of M.infoLayout)
function M.costItems(metal, energy, suffix, health, buildTime)
	suffix = suffix or ""
	return {
		{ text = string.format("Metal %d%s", metal or 0, suffix), fs = 22 },
		{ text = string.format("Energy %d%s", energy or 0, suffix), fs = 22 },
		{ text = string.format("Build time %d%s", math.floor((buildTime or 0) + 0.5), suffix), fs = 22 },
		{ text = "Eco time " .. M.ecoTime(metal, energy), fs = 22 },
		{ text = string.format("Health %d%s", math.floor((health or 0) + 0.5), suffix), fs = 22 },
	}
end

function M.costParts(metal, energy)
	return { string.format("Metal %d", metal or 0), string.format("Energy %d", energy or 0), "(Eco time " .. M.ecoTime(metal, energy) .. ")" }
end

-- The block is wider than the picture by the gap between the picture and the menu on both sides
function M.infoGap()
	return M.m.HB + 14 * M.S
end

-- Text block under the 3D preview. items = { { text = "...", fs = 24, color = { r, g, b }, parts = { "a", "b" } } ... }: a long text wraps at
-- the words (parts: only between the parts), the following lines are indented. Returns the lines and the height.
function M.infoLayout(items, width)
	local S = M.S
	local lines, h = {}, 8 * S
	local indent = 18 * S
	for _, it in ipairs(items) do
		local fs = it.fs * S * 1.25 -- the block under the picture has room: larger than the other text
		local words = it.parts
		local sep = "   "
		if not words then
			words = {}
			for w in tostring(it.text):gmatch("%S+") do
				words[#words + 1] = w
			end
			sep = " "
		end
		local cur, first = "", true
		local function flush()
			if cur ~= "" then
				lines[#lines + 1] = { text = cur, fs = fs, color = it.color, indent = first and 0 or indent }
				h = h + fs * 1.3
				first = false
			end
		end
		for _, w in ipairs(words) do
			local try = (cur == "") and w or (cur .. sep .. w)
			local avail = width - 16 * S - (first and 0 or indent)
			if cur ~= "" and (tonumber(gl.GetTextWidth(try)) or 0) * fs > avail then
				flush()
				cur = w
			else
				cur = try
			end
		end
		flush()
	end
	return lines, h + 4 * S
end

-- Draws the block with its upper left corner at (x, topY) on a dark ground
function M.infoDraw(lines, x, topY, width, h)
	local S = M.S
	gl.Color(0, 0, 0, 0.72)
	gl.Rect(x, topY - h, x + width, topY)
	local y = topY - 6 * S
	for _, l in ipairs(lines) do
		y = y - l.fs
		local c = l.color or { 1, 1, 1 }
		gl.Color(c[1], c[2], c[3], 1)
		gl.Text(l.text, x + 8 * S + l.indent, y + 3 * S, l.fs, "o")
		y = y - l.fs * 0.3
	end
	gl.Color(1, 1, 1, 1)
end

-- Small pictures of the features for the list: rendered once per feature into a texture, a few per frame
local THUMB = 96
local thumbs = {}
local thumbBudget = 0
function M.featureThumbFrame()
	thumbBudget = 3
end

function M.featureThumb(defID)
	local t = thumbs[defID]
	if t ~= nil then
		return t or nil
	end
	if thumbBudget <= 0 or not gl.CreateTexture or not gl.RenderToTexture or not GL then
		return nil
	end
	thumbBudget = thumbBudget - 1
	local ok, tex = pcall(gl.CreateTexture, THUMB, THUMB, {
		border = false, min_filter = GL.LINEAR, mag_filter = GL.LINEAR,
		wrap_s = GL.CLAMP_TO_EDGE, wrap_t = GL.CLAMP_TO_EDGE, fbo = true,
	})
	if not ok or not tex then
		thumbs[defID] = false
		return nil
	end
	local rendered = pcall(gl.RenderToTexture, tex, function()
		gl.Clear(GL.COLOR_BUFFER_BIT, 0.12, 0.12, 0.12, 1)
		M.drawFeaturePreview(defID, 0, 0, THUMB, true)
	end)
	if not rendered then
		pcall(gl.DeleteTexture, tex)
		thumbs[defID] = false
		return nil
	end
	thumbs[defID] = tex
	return tex
end

function M.freeThumbs()
	if modelShader and gl.DeleteShader then
		gl.DeleteShader(modelShader)
	end
	modelShader = nil
	for _, tex in pairs(thumbs) do
		if tex and gl.DeleteTexture then
			pcall(gl.DeleteTexture, tex)
		end
	end
	thumbs = {}
end

-- Selection grid for features (text only). o: { cfg, ownText = fn(on) }
function M.newFeatures(o)
	local f = { cfg = o.cfg, kind = "tree", scroll = 0, query = "", focus = false, ownText = o.ownText, cache = nil }

	function f:list()
		if self.override then
			return self.override -- the Recent tab: only the recently placed features
		end
		if not self.cache then
			self.cache = M.buildFeatureCache()
		end
		if self.query ~= "" then
			if self.searchFor ~= self.query then
				local q, out = self.query, {}
				for _, k in ipairs(M.FEATURE_KINDS) do
					for _, e in ipairs(self.cache[k[1]]) do
						if M.matches(q, M.featureSearchText(e.name, e.id)) then
							out[#out + 1] = e
						end
					end
				end
				self.searchFor, self.searchResult = self.query, out
			end
			return self.searchResult
		end
		return self.cache[self.kind]
	end

	function f:filterRowCount()
		return 2
	end

	function f:filterRects(x1, x2, top, hb)
		local pad = M.m.PAD
		local rects = {}
		local label = self.query
		if self.focus then
			label = label .. "|"
		elseif label == "" then
			label = "Search ..."
		end
		rects[1] = { x1 = x1 + pad, x2 = x2 - pad - hb - 3, y0 = top - hb, y1 = top, kind = "search", value = "search", label = label, active = self.focus,
			tip = "Search: type words of the description or the code, the list filters at once.\nEnter = done, Esc = clear the search." }
		rects[#rects + 1] = { x1 = x2 - pad - hb, x2 = x2 - pad, y0 = top - hb, y1 = top, kind = "searchclear", value = "searchclear", label = "X",
			tip = "Clear search" }
		local n = #M.FEATURE_KINDS
		local bw = (x2 - x1 - 2 * pad - (n - 1) * 3) / n
		local t = top - (hb + 3)
		local tips = {
			tree = "Trees and plants", rock = "Rocks", crystal = "Crystals (reclaim nodes of Reclaim the Fame): pilha_crystal1 = small, 2 = medium, 3 = large, in many colors", wreck = "Wrecks and scrap heaps of destroyed units",
			other = "Everything else (geysers, eggs ...)",
		}
		for i, k in ipairs(M.FEATURE_KINDS) do
			local bx = x1 + pad + (i - 1) * (bw + 3)
			rects[#rects + 1] = { x1 = bx, x2 = bx + bw, y0 = t - hb, y1 = t, kind = "fkind", value = k[1], label = k[2], active = (k[1] == self.kind and self.query == ""),
				tip = tips[k[1]] }
		end
		return rects
	end

	function f:setFocus(on)
		on = on and true or false
		if self.focus ~= on then
			self.focus = on
			if self.ownText then
				self.ownText(on)
			end
		end
	end

	function f:applyFilter(r)
		if r.kind == "search" then
			self:setFocus(true)
			self.scroll = 0
			return true
		end
		if r.kind == "searchclear" then
			self.query = ""
			self.scroll = 0
			return true
		end
		if r.kind == "fkind" then
			self:setFocus(false)
			self.query = ""
			self.kind = r.value
			self.scroll = 0
			return true
		end
		return false
	end

	function f:textInput(ch)
		if self.focus and ch and #ch == 1 and ch:match("[%w_%- ]") and #self.query < 30 then
			self.query = self.query .. ch
			self.scroll = 0
			return true
		end
	end

	function f:key(key)
		if not self.focus then
			return false
		end
		if key == 13 or key == 271 then
			self:setFocus(false)
		elseif key == 27 then
			self.query = ""
			self.scroll = 0
			self:setFocus(false)
		elseif key == 8 then
			self.query = self.query:sub(1, -2)
			self.scroll = 0
		end
		return true
	end

	-- The list shows only pictures: square tiles, one picture per feature
	local function cellH()
		return math.floor(M.m.UCELL * 0.4)
	end

	local function cellStep()
		return cellH() + 3
	end

	function f:colsFor(rect)
		return math.max(1, math.floor((rect.x2 - rect.x1 - 2 * M.m.UPAD) / cellStep()))
	end

	function f:size()
		return math.min(3, self.cfg.v.uCols) * M.m.UCELL + 2 * M.m.UPAD + 4, self.cfg.v.uRows * M.m.UCELL + 2 * M.m.UPAD
	end

	function f:maxScroll(rect)
		local rows = math.ceil(#self:list() / self:colsFor(rect))
		return math.max(0, rows * (cellH() + 3) + M.m.UPAD * 2 - (rect.top - rect.y0))
	end

	function f:geom(rect, i)
		local cols = self:colsFor(rect)
		local col, row = (i - 1) % cols, math.floor((i - 1) / cols)
		local m = M.m
		return rect.x1 + m.UPAD + col * cellStep(), rect.top - m.UPAD - (row + 1) * (cellH() + 3) + self.scroll
	end

	function f:at(rect, mx, my)
		local m = M.m
		local cols = self:colsFor(rect)
		local col = math.floor((mx - rect.x1 - m.UPAD) / cellStep())
		local row = math.floor((rect.top - m.UPAD - my + self.scroll) / (cellH() + 3))
		if col < 0 or col >= cols or row < 0 then
			return nil
		end
		local i = row * cols + col + 1
		if self:list()[i] then
			return i
		end
	end

	function f:wheel(rect, up)
		self.scroll = math.max(0, math.min(self:maxScroll(rect), self.scroll - (up and 1 or -1) * 234 * M.S))
	end

	function f:draw(rect, mx, my, selectedName, hot)
		local m, S = M.m, M.S
		local list = self:list()
		-- Pictures first (outside the clip): only a few new ones per frame, the list fills while scrolling
		M.featureThumbFrame()
		for i, e in ipairs(list) do
			local _, iy = self:geom(rect, i)
			if iy + cellH() > rect.y0 and iy < rect.top then
				M.featureThumb(e.id)
			end
		end
		gl.Scissor(rect.x1, rect.y0, rect.x2 - rect.x1, rect.top - rect.y0)
		local hoverIdx = hot and self:at(rect, mx, my) or nil
		for i, e in ipairs(list) do
			local ix, iy = self:geom(rect, i)
			if iy + cellH() > rect.y0 and iy < rect.top then
				if selectedName and selectedName == e.name then
					gl.Color(0.25, 0.5, 1, 0.85)
				elseif i == hoverIdx then
					gl.Color(0.35, 0.35, 0.35, 0.95)
				else
					gl.Color(0.2, 0.2, 0.2, 0.9)
				end
				gl.Rect(ix, iy, ix + cellH(), iy + cellH())
				gl.Color(1, 1, 1, 1)
				local tex = M.featureThumb(e.id)
				if tex then
					local pad = 3 * S
					gl.Texture(tex)
					gl.TexRect(ix + pad, iy + pad, ix + cellH() - pad, iy + cellH() - pad)
					gl.Texture(false)
				end
			end
		end
		gl.Scissor(false)
		M.scrollbarDraw(self, rect)
		gl.Color(1, 1, 1, 1)
		if #list == 0 then
			gl.Text("No features in this selection", (rect.x1 + rect.x2) / 2, rect.top - 30 * S, 12 * S, "co")
		end
		local e = hoverIdx and list[hoverIdx]
		if e then
			local fd = FeatureDefs[e.id]
			-- Picture left of the team strip, at the height of the tile; the text under it
			local size = M.PREVIEW_SIZE * S
			local desc = fd and ((fd.translatedDescription and fd.translatedDescription ~= "" and fd.translatedDescription) or (fd.description and fd.description ~= "" and fd.description) or nil)
			local items = { { text = tostring(e.name), fs = 26 } }
			if fd then
				items[#items + 1] = { parts = M.costParts(fd.metal, fd.energy), fs = 22 }
			end
			if desc then
				items[#items + 1] = { text = desc, fs = 20, color = { 0.8, 0.8, 0.8 } }
			end
			local lines, h = M.infoLayout(items, size + 2 * M.infoGap())
			local _, ty = self:geom(rect, hoverIdx)
			local px, py = M.previewPos(rect, ty, cellH(), size, h + 4 * S)
			pcall(M.drawFeaturePreview, e.id, px, py, size)
			M.infoDraw(lines, px - M.infoGap(), py - 2 * S, size + 2 * M.infoGap(), h)
			gl.Color(1, 1, 1, 1)
		end
	end

	return f
end

---------------------------------------------------------------- Recently used (favorites)
-- Remembers per kind (bp, unit, feature) the names used last and saves them in a file in the write folder
function M.newRecent(file, maxN)
	local r = { file = file, maxN = maxN or 24, data = { bp = {}, unit = {}, feature = {} } }

	function r:list(kind)
		return self.data[kind] or {}
	end

	function r:save()
		local parts = {}
		for _, kind in ipairs({ "bp", "unit", "feature" }) do
			local names = {}
			for _, n in ipairs(self.data[kind]) do
				names[#names + 1] = string.format("%q", n)
			end
			parts[#parts + 1] = kind .. " = { " .. table.concat(names, ", ") .. " }"
		end
		M.writeFile(self.file, "-- recently used blueprints, units and features (newest first)\nreturn { " .. table.concat(parts, ", ") .. " }\n")
	end

	function r:load()
		local text = M.fileText(self.file)
		local data = text and M.loadData(text)
		if type(data) == "table" then
			for _, kind in ipairs({ "bp", "unit", "feature" }) do
				self.data[kind] = {}
				for _, n in ipairs(type(data[kind]) == "table" and data[kind] or {}) do
					if type(n) == "string" and #self.data[kind] < self.maxN then
						self.data[kind][#self.data[kind] + 1] = n
					end
				end
			end
		end
	end

	-- Bring a name to the front; saves only if the order changes
	function r:add(kind, name)
		local list = self.data[kind]
		if not list or not name or list[1] == name then
			return
		end
		for i = #list, 1, -1 do
			if list[i] == name then
				table.remove(list, i)
			end
		end
		table.insert(list, 1, name)
		while #list > self.maxN do
			table.remove(list)
		end
		self:save()
	end

	return r
end

-- Favorites view: on top the recently chosen blueprints (text lines), below the recently placed units (symbols), at the bottom the recently placed features.
-- o: { cfg, recent, lib, canUse }
function M.newFav(o)
	local v = { recent = o.recent, lib = o.lib, scroll = 0, query = "" }
	v.units = M.newUnits({ cfg = o.cfg, canUse = o.canUse, search = false })
	v.feats = M.newFeatures({ cfg = o.cfg })

	local BP_ROWS = 6

	function v:rowH()
		return M.m.HB * 0.7
	end

	function v:bpNames()
		local out = {}
		for _, n in ipairs(self.recent:list("bp")) do
			local bp = self.lib:find(n)
			if bp and (self.query == "" or M.matches(self.query, M.blueprintSearchText(bp))) then
				out[#out + 1] = n
			end
			if #out >= BP_ROWS then
				break
			end
		end
		return out
	end

	function v:unitList()
		local out = {}
		for _, n in ipairs(self.recent:list("unit")) do
			local ud = UnitDefNames[n]
			if ud and (self.query == "" or M.matches(self.query, M.unitSearchText(n))) then
				out[#out + 1] = { name = n, id = ud.id }
			end
		end
		return out
	end

	function v:featureList()
		local out = {}
		for _, n in ipairs(self.recent:list("feature")) do
			local fd = FeatureDefNames[n]
			if fd and (self.query == "" or M.matches(self.query, M.featureSearchText(n, fd.id))) then
				out[#out + 1] = { name = n, id = fd.id }
			end
		end
		return out
	end

	-- Split: blueprints header, rows, units header, units area, features header, features area (two rows of tiles)
	function v:layout(rect)
		local S = M.S
		local head = 34 * S
		local names = self:bpNames()
		local rows = {}
		local y = rect.top - head
		for i, n in ipairs(names) do
			rows[i] = { x1 = rect.x1 + M.m.PAD, x2 = rect.x2 - M.m.PAD, y0 = y - self:rowH(), y1 = y, name = n }
			y = y - self:rowH() - 3
		end
		if #names == 0 then
			y = y - self:rowH()
		end
		local uhead = y - 6 * S
		local fh = head + 2 * (math.floor(M.m.UCELL * 0.4) + 3) + 2 * M.m.UPAD
		local ftop = rect.y0 + fh
		local frect = { x1 = rect.x1, x2 = rect.x2, y0 = rect.y0, top = ftop - head }
		local urect = { x1 = rect.x1, x2 = rect.x2, y0 = ftop + 6 * S, top = uhead - head }
		return rows, uhead, urect, frect, ftop
	end

	function v:draw(rect, mx, my, hot)
		local S = M.S
		local rows, uhead, urect, frect, ftop = self:layout(rect)
		gl.Color(0.5, 0.8, 1, 1)
		gl.Text("Recently chosen blueprints", rect.x1 + M.m.PAD, rect.top - 26 * S, 24 * S, "o")
		gl.Color(1, 1, 1, 1)
		if #rows == 0 then
			gl.Color(0.7, 0.7, 0.7, 1)
			gl.Text("none yet", rect.x1 + M.m.PAD, rect.top - 34 * S - self:rowH() + 8 * S, 22 * S, "o")
		end
		for _, r in ipairs(rows) do
			local hover = hot and mx >= r.x1 and mx <= r.x2 and my >= r.y0 and my <= r.y1
			gl.Color(0.2, 0.2, 0.2, hover and 1 or 0.9)
			gl.Rect(r.x1, r.y0, r.x2, r.y1)
			gl.Color(1, 1, 1, 1)
			local bp = self.lib:find(r.name)
			if hover and bp then
				local size = M.PREVIEW_SIZE * S
				local px, py = M.previewPos(rect, r.y0, self:rowH(), size)
				pcall(M.drawBlueprintPreview, bp, px, py, size)
				gl.Color(1, 1, 1, 1)
			end
			gl.Text(r.name .. (bp and bp.count and ("  (" .. bp.count .. ")") or ""), r.x1 + 8 * S, r.y0 + (self:rowH() - 24 * S) / 2 + 3 * S, 24 * S, "o")
		end
		gl.Color(0.5, 0.8, 1, 1)
		gl.Text("Recently placed units", rect.x1 + M.m.PAD, uhead - 26 * S, 24 * S, "o")
		gl.Color(1, 1, 1, 1)
		self.units.override = self:unitList()
		self.units:draw(urect, mx, my, nil, nil, hot)
		gl.Color(0.5, 0.8, 1, 1)
		gl.Text("Recently placed features", rect.x1 + M.m.PAD, ftop - 26 * S, 24 * S, "o")
		gl.Color(1, 1, 1, 1)
		self.feats.override = self:featureList()
		self.feats:draw(frect, mx, my, nil, hot)
	end

	-- returns "bp", name, "unit", name or "feature", name
	function v:press(rect, mx, my)
		local rows, _, urect, frect = self:layout(rect)
		for _, r in ipairs(rows) do
			if mx >= r.x1 and mx <= r.x2 and my >= r.y0 and my <= r.y1 then
				return "bp", r.name
			end
		end
		self.feats.override = self:featureList()
		if my <= frect.top and my >= frect.y0 then
			local i = self.feats:at(frect, mx, my)
			if i then
				return "feature", self.feats.override[i].name
			end
		end
		self.units.override = self:unitList()
		if my <= urect.top and my >= urect.y0 then
			local i = self.units:at(urect, mx, my)
			if i then
				return "unit", self.units.override[i].name
			end
		end
	end

	function v:wheel(rect, up)
		local _, _, urect, frect = self:layout(rect)
		local _, my = Spring.GetMouseState()
		if my <= frect.top then
			self.feats.override = self:featureList()
			self.feats:wheel(frect, up)
			return
		end
		self.units.override = self:unitList()
		self.units:wheel(urect, up)
	end

	function v:matchCount() -- entries shown (the search applies to both parts)
		return #self:bpNames() + #self:unitList() + #self:featureList()
	end

	function v:size()
		return self.units:size()
	end

	return v
end

---------------------------------------------------------------- Buttons (same look in both widgets)
-- rects: { x1, x2, y0, y1, label, active }; fontSize in pixels (already scaled), hb = button height
function M.drawButtons(rects, fontSize, hb)
	local S = M.S
	for _, r in ipairs(rects) do
		if r.tint then
			gl.Color(r.tint[1], r.tint[2], r.tint[3], 0.9) -- e.g. reddish: a search text is active
		elseif r.active then
			gl.Color(0.5, 0.75, 1, 0.9) -- light enough that the blue Armada symbol stays visible
		else
			gl.Color(0.2, 0.2, 0.2, 0.9)
		end
		gl.Rect(r.x1, r.y0, r.x2, r.y1)
		if r.tick then
			local w, h = r.x2 - r.x1, r.y1 - r.y0
			gl.Color(1, 1, 1, r.tint and r.tint[2] > 0.5 and 1 or 0.35) -- bright when set (green), faint when not
			gl.LineWidth(3 * S)
			gl.BeginEnd(GL.LINE_STRIP, function()
				gl.Vertex(r.x1 + w * 0.2, r.y0 + h * 0.5)
				gl.Vertex(r.x1 + w * 0.42, r.y0 + h * 0.25)
				gl.Vertex(r.x1 + w * 0.8, r.y0 + h * 0.75)
			end)
			gl.LineWidth(1)
		end
		if r.cross then
			-- crosshair: a ring with four short lines through it
			local cx, cy, rad = (r.x1 + r.x2) / 2, (r.y0 + r.y1) / 2, math.min(r.x2 - r.x1, r.y1 - r.y0) * 0.27
			gl.Color(1, 1, 1, 0.9)
			gl.LineWidth(2 * S)
			gl.BeginEnd(GL.LINE_LOOP, function()
				for a = 0, 15 do
					gl.Vertex(cx + rad * math.cos(a * math.pi / 8), cy + rad * math.sin(a * math.pi / 8))
				end
			end)
			gl.BeginEnd(GL.LINES, function()
				gl.Vertex(cx - rad * 1.7, cy); gl.Vertex(cx - rad * 0.5, cy)
				gl.Vertex(cx + rad * 0.5, cy); gl.Vertex(cx + rad * 1.7, cy)
				gl.Vertex(cx, cy - rad * 1.7); gl.Vertex(cx, cy - rad * 0.5)
				gl.Vertex(cx, cy + rad * 0.5); gl.Vertex(cx, cy + rad * 1.7)
			end)
			gl.LineWidth(1)
		end
		local tx1 = r.x1
		if r.icon then
			-- Symbol left in the button, the text stays centered in the remaining area
			local is = hb * 0.72
			local ix = r.x1 + 6 * S
			gl.Color(1, 1, 1, r.active and 1 or 0.85)
			gl.Texture(r.icon)
			gl.TexRect(ix, r.y0 + (hb - is) / 2, ix + is, r.y0 + (hb - is) / 2 + is)
			gl.Texture(false)
			tx1 = ix + is
		end
		gl.Color(1, 1, 1, r.active and 1 or 0.8)
		local fs = r.fs or fontSize
		-- text too long: shrink the font until it fits into the button
		local tw = (tonumber(gl.GetTextWidth(r.label)) or 0) * fs
		local tx2 = r.x2 - (r.reserve or 0) -- r.reserve: room at the right end for something else (the X of a filter button)
		local avail = (tx2 - tx1) - 8 * S
		if tw > avail and tw > 0 then
			fs = fs * avail / tw
		end
		gl.Text(r.label, (tx1 + tx2) / 2, r.y0 + (math.min(hb, r.y1 - r.y0) - fs) / 2 + 3 * S, fs, "co") -- centered in the button itself (the small X boxes are lower than hb)
	end
	gl.Color(1, 1, 1, 1)
end

-- Tooltip box: lines = text with \n, (x, y) = mouse pointer; lies below left, stays on the screen
function M.tooltipBox(text, x, y)
	local S = M.S
	local vsx, vsy = Spring.GetViewGeometry()
	local lines = {}
	local fs = 20 * S
	local maxW = math.min(vsx * 0.3, 700 * S) -- long lines wrap at this width
	for l in tostring(text):gmatch("[^\n]+") do
		local cur = ""
		for word in l:gmatch("%S+") do
			local try = cur == "" and word or (cur .. " " .. word)
			if cur ~= "" and gl.GetTextWidth(try) * fs > maxW then
				lines[#lines + 1] = cur
				cur = word
			else
				cur = try
			end
		end
		lines[#lines + 1] = cur
	end
	local w = 0
	for _, l in ipairs(lines) do
		w = math.max(w, gl.GetTextWidth(l) * fs)
	end
	w = w + 16 * S
	local h = #lines * (fs + 4 * S) + 10 * S
	local x2 = math.min(vsx, math.max(w, x - 12 * S))
	local x1 = x2 - w
	local y1 = math.min(vsy, math.max(h, y - 12 * S))
	gl.Color(0, 0, 0, 0.88)
	gl.Rect(x1, y1 - h, x2, y1)
	gl.Color(1, 1, 1, 1)
	for i, l in ipairs(lines) do
		gl.Text(l, x1 + 8 * S, y1 - 5 * S - i * (fs + 4 * S) + 4 * S, fs, "o")
	end
end

-- Help board over the screen: sections = { { "title", { { "key", "explanation" }, ... } }, ... }.
-- Two columns, the sections are distributed by line count; long explanations are wrapped.
function M.drawHelp(title, sections, footer)
	local S = M.S
	local vsx, vsy = Spring.GetViewGeometry()
	local width = vsx * 0.94
	-- Compute the layout for one font size: column widths, wrapped lines, distribution of the sections over two columns, height
	local function layout(fs)
		local lh = fs + 5 * S
		local pad = 18 * S
		local colW = (width - 3 * pad) / 2
		local function wrap(text, maxW)
			local lines, cur = {}, ""
			for word in tostring(text):gmatch("%S+") do
				local try = (cur == "") and word or (cur .. " " .. word)
				if cur ~= "" and gl.GetTextWidth(try) * fs > maxW then
					lines[#lines + 1] = cur
					cur = word
				else
					cur = try
				end
			end
			if cur ~= "" then
				lines[#lines + 1] = cur
			end
			return lines
		end
		-- Width of the key column: the widest text, but at most 45 percent
		local keyW = 0
		for _, sec in ipairs(sections) do
			for _, row in ipairs(sec[2]) do
				keyW = math.max(keyW, gl.GetTextWidth(row[1]) * fs)
			end
		end
		keyW = math.min(keyW + 16 * S, colW * 0.45)
		local textW = colW - keyW - 8 * S
		local heights, total = {}, 0
		for i, sec in ipairs(sections) do
			local h = lh * 1.4
			for _, row in ipairs(sec[2]) do
				h = h + math.max(1, #wrap(row[2], textW)) * lh
			end
			heights[i] = h + lh * 0.5
			total = total + heights[i]
		end
		local cols, acc, ci = { {}, {} }, 0, 1
		for i = 1, #sections do
			if ci == 1 and acc + heights[i] / 2 > total / 2 and #cols[1] > 0 then
				ci = 2
			end
			cols[ci][#cols[ci] + 1] = i
			acc = acc + heights[i]
		end
		local colH = { 0, 0 }
		for c = 1, 2 do
			for _, i in ipairs(cols[c]) do
				colH[c] = colH[c] + heights[i]
			end
		end
		return { fs = fs, lh = lh, pad = pad, colW = colW, keyW = keyW, textW = textW, cols = cols, wrap = wrap,
			boxH = math.max(colH[1], colH[2]) + 2 * pad + lh * 3.2 }
	end
	-- Font as large as possible (larger on big screens), but the board must fit on the screen
	-- The minimap frame (top left) is drawn by BAR above the widgets: the board stays below it if it would overlap
	local ceiling = vsy
	if Spring.GetMiniMapGeometry then
		local px, py, sx, sy = Spring.GetMiniMapGeometry()
		if px and py and sx and sy and py + sy > vsy * 0.5 and px < (vsx + width) / 2 then
			ceiling = math.min(vsy, py - 8 * S)
		end
	end
	local maxH = math.min(vsy * 0.96, ceiling - vsy * 0.02)
	local fs = math.max(19 * S, vsy * 0.0155)
	local L = layout(fs)
	while L.boxH > maxH and fs > 9 * S do
		fs = fs * 0.93
		L = layout(fs)
	end
	local lh, pad, colW, keyW, textW, cols, wrap, boxH = L.lh, L.pad, L.colW, L.keyW, L.textW, L.cols, L.wrap, L.boxH
	local x0 = (vsx - width) / 2
	local top = math.min((vsy + boxH) / 2, ceiling - vsy * 0.01)
	gl.Color(0, 0, 0, 0.88)
	gl.Rect(x0, top - boxH, x0 + width, top)
	gl.Color(0.5, 0.8, 1, 1)
	gl.Text(title, vsx / 2, top - pad - lh * 1.2, fs * 1.5, "co")
	for c = 1, 2 do
		local x = x0 + pad + (c - 1) * (colW + pad)
		local y = top - pad - lh * 2.6
		for _, i in ipairs(cols[c]) do
			local sec = sections[i]
			gl.Color(1, 0.8, 0.4, 1)
			gl.Text(sec[1], x, y, fs * 1.15, "o")
			y = y - lh * 1.4
			for _, row in ipairs(sec[2]) do
				gl.Color(0.55, 0.85, 1, 1)
				gl.Text(row[1], x, y, fs, "o")
				gl.Color(1, 1, 1, 1)
				local lines = wrap(row[2], textW)
				if #lines == 0 then
					lines[1] = ""
				end
				for _, l in ipairs(lines) do
					gl.Text(l, x + keyW + 8 * S, y, fs, "o")
					y = y - lh
				end
			end
			y = y - lh * 0.5
		end
	end
	gl.Color(0.7, 0.7, 0.7, 1)
	gl.Text(footer or "A click anywhere closes the help", vsx / 2, top - boxH + pad * 0.6, fs, "co")
	gl.Color(1, 1, 1, 1)
end

-- Notes the tooltip (field tip) of the button under the mouse; it is not drawn here but by M.flushTip() at the end of the frame, so it
-- always lies on top of every panel and window (the last one noted wins: it was drawn last). A tooltip with its own look is noted
-- as M.pendingTip = { fn = function() ... end }
function M.drawTip(rects, mx, my)
	for i = #rects, 1, -1 do -- the last one lies on top (e.g. the small X in a button)
		local r = rects[i]
		if r.tip and mx >= r.x1 and mx <= r.x2 and my >= r.y0 and my <= r.y1 then
			M.pendingTip = { text = r.tip, x = mx, y = my }
			return true
		end
	end
	return false
end

-- Draws the noted tooltip (once per frame, after everything else); skip = true only forgets it
function M.flushTip(skip)
	local t = M.pendingTip
	M.pendingTip = nil
	if t and not skip then
		gl.Scissor(false)
		if t.fn then
			t.fn() -- a tooltip with its own look (the strip of team buttons)
		else
			M.tooltipBox(t.text, t.x, t.y)
		end
		gl.Color(1, 1, 1, 1)
	end
end

---------------------------------------------------------------- Settings (gear): columns and rows
-- blocks = { { title = "Blueprints", keys = { { "bpCols", "Columns" }, { "bpRows", "Rows" } } }, ... }
-- actions (optional) = { { label = "Export", tip = "...", fn = function() return "message" end }, ... }: wide buttons under the blocks; the message that fn returns
-- (lines separated by "\n") is shown under them
function M.newOptions(cfg, blocks, actions)
	local op = { cfg = cfg, blocks = blocks, actions = actions or {}, message = nil }

	function op:height()
		local m, S = M.m, M.S
		local h = #self.blocks * (40 * S) + #self.blocks * 2 * (m.HB + 10 * S) + 2 * m.PAD
		if #self.actions > 0 then
			h = h + 10 * S + #self.actions * (m.HB + 10 * S) + 60 * S
		end
		return h
	end

	function op:width()
		return math.floor(460 * M.S)
	end

	function op:layout(rect)
		local m, S = M.m, M.S
		local rects, labels = {}, {}
		local y = rect.top - m.PAD
		local rowH = m.HB + 10 * S
		for _, block in ipairs(self.blocks) do
			labels[#labels + 1] = { text = block.title, x = rect.x1 + m.PAD, y = y - 32 * S, size = 27 * S, head = true }
			y = y - 40 * S
			for _, k in ipairs(block.keys) do
				local top = y
				local px2 = rect.x2 - m.PAD
				local plus = { x1 = px2 - m.HB, x2 = px2, y0 = top - m.HB, y1 = top, key = k[1], delta = 1, label = "+" }
				local valW = 90 * S
				local minus = { x1 = plus.x1 - valW - m.HB, x2 = plus.x1 - valW, y0 = top - m.HB, y1 = top, key = k[1], delta = -1, label = "-" }
				rects[#rects + 1] = plus
				rects[#rects + 1] = minus
				local ty = top - m.HB + (m.HB - 27 * S) / 2 + 3 * S
				labels[#labels + 1] = { text = k[2], x = rect.x1 + m.PAD * 3, y = ty, size = 27 * S }
				labels[#labels + 1] = { text = tostring(self.cfg.v[k[1]]), x = (minus.x2 + plus.x1) / 2, y = ty, size = 27 * S, center = true }
				y = y - rowH
			end
		end
		if #self.actions > 0 then
			y = y - 10 * S
			for _, a in ipairs(self.actions) do
				rects[#rects + 1] = { x1 = rect.x1 + m.PAD, x2 = rect.x2 - m.PAD, y0 = y - m.HB, y1 = y, label = a.label, action = a, tip = a.tip }
				y = y - rowH
			end
			local ly = y - 6 * S
			for line in (self.message or ""):gmatch("[^\n]+") do
				labels[#labels + 1] = { text = line, x = rect.x1 + m.PAD, y = ly - 18 * S, size = 20 * S }
				ly = ly - 26 * S
			end
		end
		return rects, labels
	end

	function op:draw(rect, mx, my)
		local m, S = M.m, M.S
		local rects, labels = self:layout(rect)
		for _, r in ipairs(rects) do
			local hot = mx >= r.x1 and mx <= r.x2 and my >= r.y0 and my <= r.y1
			gl.Color(0.2, 0.2, 0.2, hot and 1 or 0.9)
			gl.Rect(r.x1, r.y0, r.x2, r.y1)
			gl.Color(1, 1, 1, 1)
			gl.Text(r.label, (r.x1 + r.x2) / 2, r.y0 + (m.HB - 27 * S) / 2 + 3 * S, 27 * S, "co")
		end
		M.drawTip(rects, mx, my)
		for _, l in ipairs(labels) do
			if l.head then
				gl.Color(0.5, 0.8, 1, 1)
			else
				gl.Color(1, 1, 1, 1)
			end
			gl.Text(l.text, l.x, l.y, l.size, l.center and "co" or "o")
		end
		gl.Color(1, 1, 1, 1)
	end

	-- Click: returns true if a value was changed
	function op:press(rect, mx, my)
		for _, r in ipairs((self:layout(rect))) do
			if mx >= r.x1 and mx <= r.x2 and my >= r.y0 and my <= r.y1 then
				if r.action then
					self.message = r.action.fn()
					return false
				end
				self.cfg:change(r.key, r.delta)
				return true
			end
		end
		return false
	end

	return op
end

-- Maze (key M in the Level Editor). Grid of tiles; cells are path x path tiles big, with one tile of wall
-- between them. cols x rows cells, corridors by depth-first search (random). Entrance top left (west wall), exit bottom right (east wall).
-- Returns: list { i, j } of the wall tiles (0-based), width and height in tiles.
function M.mazeWalls(cols, rows, path, rnd)
	rnd = rnd or math.random
	path = math.max(1, path or 4)
	local pitch = path + 1
	local w, h = cols * pitch + 1, rows * pitch + 1
	local open = {} -- open[j * w + i] = true: no wall
	local function carve(i0, j0, i1, j1)
		for j = j0, j1 do
			for i = i0, i1 do
				open[j * w + i] = true
			end
		end
	end
	for cy = 0, rows - 1 do
		for cx = 0, cols - 1 do
			carve(cx * pitch + 1, cy * pitch + 1, cx * pitch + path, cy * pitch + path)
		end
	end
	local seen = {}
	local stack = { { 0, 0 } }
	seen[0] = true
	while #stack > 0 do
		local c = stack[#stack]
		local nbs = {}
		for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
			local nx, ny = c[1] + d[1], c[2] + d[2]
			if nx >= 0 and nx < cols and ny >= 0 and ny < rows and not seen[ny * cols + nx] then
				nbs[#nbs + 1] = { nx, ny, d[1], d[2] }
			end
		end
		if #nbs == 0 then
			stack[#stack] = nil
		else
			local n = nbs[math.floor(rnd() * #nbs) % #nbs + 1]
			seen[n[2] * cols + n[1]] = true
			-- open the wall piece between c and n
			if n[3] ~= 0 then
				local wi = (n[3] > 0 and (c[1] + 1) or c[1]) * pitch
				carve(wi, c[2] * pitch + 1, wi, c[2] * pitch + path)
			else
				local wj = (n[4] > 0 and (c[2] + 1) or c[2]) * pitch
				carve(c[1] * pitch + 1, wj, c[1] * pitch + path, wj)
			end
			stack[#stack + 1] = { n[1], n[2] }
		end
	end
	carve(0, 1, 0, path) -- entrance
	carve(w - 1, (rows - 1) * pitch + 1, w - 1, (rows - 1) * pitch + path) -- exit
	local out = {}
	for j = 0, h - 1 do
		for i = 0, w - 1 do
			if not open[j * w + i] then
				out[#out + 1] = { i, j }
			end
		end
	end
	return out, w, h
end

---------------------------------------------------------------- Area attack (all armed units), split and focus attack
-- Selected armed units attack a line, a rectangle or a circle that is dragged on the map. Used by the
-- Level Editor and the BluePrinter. o: { say = fn(text), mouseGround = fn() -> x, z, inPanel = fn(mx, my) -> bool
-- (no drawing over the menu), onArm = fn() (called when the mode is switched on, to end other stamp modes) }.
-- Methods: toggle(mode "line"|"rect"|"circle"|"split"|"focus"|nil; split = XS spreads the firepower evenly over the enemies in a circle, focus = XF kills them one after the other), armed(), mode(), press(button) (map click while armed; true if used),
-- release() (mouse released: starts the attack), draw() (in DrawWorld), step(frame) (call every frame), disarm().
function M.newAreaAttack(o)
	local say = o.say
	local mouseGround = o.mouseGround
	local inPanel = o.inPanel or function() return false end
	local areaArmed = false -- an area attack is armed: drag the shape on the map
	local areaMode = "line" -- "line" | "rect" | "circle": shape that is dragged
	local areaDrag = nil -- { x, z }: start point of the line, rectangle corner or circle center
	local toggleArea

	local function commandCount(id)
		if Spring.GetUnitCommandCount then
			return Spring.GetUnitCommandCount(id) or 0
		end
		local c = Spring.GetUnitCommands(id, 0)
		if type(c) == "table" then
			return #c
		end
		return c or 0
	end

	local function dist2(x1, z1, x2, z2)
		local dx, dz = x1 - x2, z1 - z2
		return dx * dx + dz * dz
	end

	-- Selected armed units spread evenly over a line A -> B. Each gets a piece of the line. Bombers (aircraft with a bomb
	-- weapon) approach it from behind, i.e. along the line: move to a point BEFORE the piece, then attack its center; this
	-- way the bombs fall spread over the whole length. All other units that can shoot at the ground (tanks, bots, ships,
	-- gunships, artillery, rocket launchers, nukes, ...) only get the attack order on the center of their piece (ground
	-- target); mobile units walk into range for it.
	local STAGING_DISTANCE = 2000 -- Elmo from the target, where the bombers form up before the run (line: beside the line, on the side of the group)

	local function isBomber(ud)
		if not ud or not ud.canFly then
			return false
		end
		for _, w in ipairs(ud.weapons or {}) do
			local wd = WeaponDefs[w.weaponDef]
			if wd and wd.type == "AircraftBomb" then
				return true
			end
		end
		return false
	end

	-- Every other armed unit that can shoot at the ground (no bomber): a weapon with canAttackGround that is not an anti-air
	-- weapon (damage against the armor class vtol above the default damage). Units that only shoot at aircraft do not count.
	local function isGroundShooter(ud)
		if not ud or isBomber(ud) then
			return false
		end
		local types = Game.armorTypes or {}
		local defIdx, vtolIdx = types.default or 0, types.vtol or 14
		for _, w in ipairs(ud.weapons or {}) do
			local wd = WeaponDefs[w.weaponDef]
			if wd and wd.damages and wd.canAttackGround ~= false and not wd.paralyzer
				and (tonumber(wd.damages[vtolIdx]) or 0) <= (tonumber(wd.damages[defIdx]) or 0) then
				return true
			end
		end
		return false
	end

	local function selectedBy(test)
		local out = {}
		for _, id in ipairs(Spring.GetSelectedUnits()) do
			if test(UnitDefs[Spring.GetUnitDefID(id)]) then
				out[#out + 1] = id
			end
		end
		return out
	end

	local function selectedBombers()
		return selectedBy(isBomber)
	end

	local function selectedShooters()
		return selectedBy(isGroundShooter)
	end

	local function clampToMap(x, z)
		local m = 64
		return math.max(m, math.min((Game.mapSizeX or 8192) - m, x)), math.max(m, math.min((Game.mapSizeZ or 8192) - m, z))
	end

	-- Plan: per unit { id, x, z (center of the piece), fx, fz (approach point) }; ids is the list of units (or nil: n placeholders);
	-- approach = 0: no approach (everything but bombers), otherwise distance of the approach point before the piece
	local function linePlan(ax, az, bx, bz, ids, n, approach)
		approach = approach or STAGING_DISTANCE
		local dx, dz = bx - ax, bz - az
		local len = math.sqrt(dx * dx + dz * dz)
		local ux, uz = 0, 0
		if len >= 8 then
			ux, uz = dx / len, dz / len
		end
		n = ids and #ids or n
		local order = {}
		for i = 1, n do
			order[i] = ids and ids[i] or false
		end
		if ids and len >= 8 then
			-- Units are sorted along the line: the one at the A end takes the first piece, so the paths do not cross
			local function proj(id)
				local x, _, z = Spring.GetUnitPosition(id)
				return x and ((x - ax) * ux + (z - az) * uz) or 0
			end
			table.sort(order, function(a, b) return proj(a) < proj(b) end)
		end
		-- Bombers form up in a row beside the line (perpendicular to it, on the side where the group stands), so the run
		-- goes straight at the line as a front and nobody flies over the target area before the attack
		local side = 1
		if ids and len >= 8 and approach > 0 then
			local sx, sz, c = 0, 0, 0
			for _, id in ipairs(ids) do
				local x, _, z = Spring.GetUnitPosition(id)
				if x then
					sx, sz, c = sx + x, sz + z, c + 1
				end
			end
			if c > 0 and (sx / c - (ax + dx / 2)) * -uz + (sz / c - (az + dz / 2)) * ux < 0 then
				side = -1
			end
		end
		local vx, vz = -uz * side, ux * side
		local plan = {}
		for i = 1, n do
			local t = (n == 1) and 0.5 or (i - 0.5) / n
			local cx, cz = ax + dx * t, az + dz * t
			local fx, fz = cx + vx * approach, cz + vz * approach
			if len < 8 or approach == 0 then
				fx, fz = cx, cz
			end
			fx, fz = clampToMap(fx, fz)
			plan[i] = { id = order[i], x = cx, z = cz, fx = fx, fz = fz }
		end
		return plan, len
	end

	-- Rectangle or circle: one target point per unit spread evenly inside the area (grid or sunflower spiral).
	-- Bombers approach from the side where the group stands; units and points are paired by their position across
	-- that direction so the paths cross less. Returns the plan (same format as linePlan) and the size of the area.
	local function areaPlan(shape, ax, az, bx, bz, ids, n, approach)
		n = ids and #ids or n
		local pts, cx, cz, size = {}, 0, 0, 0
		if shape == "circle" then
			local r = math.max(math.sqrt((bx - ax) ^ 2 + (bz - az) ^ 2), 16)
			cx, cz, size = ax, az, r
			for i = 1, n do
				local rad, th = r * math.sqrt((i - 0.5) / n), i * 2.399963
				pts[i] = { x = cx + rad * math.cos(th), z = cz + rad * math.sin(th) }
			end
		else
			local x1, x2, z1, z2 = math.min(ax, bx), math.max(ax, bx), math.min(az, bz), math.max(az, bz)
			local w, h = math.max(x2 - x1, 16), math.max(z2 - z1, 16)
			cx, cz, size = (x1 + x2) / 2, (z1 + z2) / 2, math.max(w, h)
			local cols = math.max(1, math.min(n, math.ceil(math.sqrt(n * w / h))))
			local rows = math.ceil(n / cols)
			for i = 1, n do
				local k = math.floor((i - 0.5) * cols * rows / n)
				pts[i] = { x = x1 + (k % cols + 0.5) * w / cols, z = z1 + (math.floor(k / cols) + 0.5) * h / rows }
			end
		end
		-- direction of the approach: from the group to the middle of the area
		local ux, uz = 0, 1
		if ids and #ids > 0 then
			local sx, sz, c = 0, 0, 0
			for _, id in ipairs(ids) do
				local x, _, z = Spring.GetUnitPosition(id)
				if x then
					sx, sz, c = sx + x, sz + z, c + 1
				end
			end
			if c > 0 then
				local dx, dz = cx - sx / c, cz - sz / c
				local len = math.sqrt(dx * dx + dz * dz)
				if len >= 8 then
					ux, uz = dx / len, dz / len
				end
			end
		end
		local function across(x, z)
			return (x - cx) * -uz + (z - cz) * ux
		end
		table.sort(pts, function(a, b) return across(a.x, a.z) < across(b.x, b.z) end)
		local order = {}
		for i = 1, n do
			order[i] = ids and ids[i] or false
		end
		if ids then
			table.sort(order, function(a, b)
				local xa, _, za = Spring.GetUnitPosition(a)
				local xb, _, zb = Spring.GetUnitPosition(b)
				return across(xa or cx, za or cz) < across(xb or cx, zb or cz)
			end)
		end
		-- All bombers stage on ONE line `approach` before the front edge of the area (the edge nearest to the group); a
		-- target further back gets a staging point further back by its depth. The flight to the target is then longer
		-- for the targets at the back: the front targets are bombed first, nobody has to cross the area to hit the front.
		local frontD = math.huge
		for _, p in ipairs(pts) do
			frontD = math.min(frontD, (p.x - cx) * ux + (p.z - cz) * uz)
		end
		local plan = {}
		for i = 1, n do
			local p = pts[i]
			local fx, fz = p.x, p.z
			if approach > 0 then
				local back = approach + ((p.x - cx) * ux + (p.z - cz) * uz) - frontD
				fx, fz = clampToMap(p.x - ux * back, p.z - uz * back)
			end
			plan[i] = { id = order[i], x = p.x, z = p.z, fx = fx, fz = fz }
		end
		return plan, size
	end

	local function planFor(ax, az, bx, bz, ids, n, approach)
		if areaMode == "line" then
			return linePlan(ax, az, bx, bz, ids, n, approach)
		end
		return areaPlan(areaMode, ax, az, bx, bz, ids, n, approach)
	end

	-- Split attack (XS) and focus attack (XF): the selected units attack the visible enemy units inside a circle. XS spreads
	-- the damage per second of the units evenly over the targets (health is not looked at). XF kills the targets as fast as
	-- possible one after the other (nearest first), every target with as many units as it needs to die (health +
	-- SPLIT_BUFFER), the rest goes on to the next. Firepower = damage per second against the armor class of the target,
	-- from the weapon definitions (beam
	-- lasers count like the others; paralyzer weapons, stockpile weapons (nukes) and the D-Gun do not; area damage is not
	-- counted). Mobile enemies come first, buildings after them.
	local SPLIT_MODES = { split = true, focus = true } -- the modes of this attack (areaMode)
	local SPLIT_NAMES = { split = "Split attack", focus = "Focus attack" }
	local SPLIT_BUFFER = 1.15 -- XF: a target is planned with 15 % more damage than its health
	local SPLIT_KILL_TIME = 3 -- seconds in which the units given to a target should kill it
	local SPLIT_QUEUE = 8 -- planned targets per unit (and one more at the end)
	local SPLIT_MAX_TARGETS, SPLIT_MAX_UNITS = 150, 300
	local SPLIT_EVERY = 30 -- frames between two checks of the plan
	local SPLIT_TIMEOUT = 30 * 600 -- the plan ends after 10 minutes at the latest
	local split = nil -- running split attack: { units = { [unitID] = { target ids } }, targets = { [unitID] = true }, frame }
	local weaponCache = {}

	local function isArmed(ud)
		return ud ~= nil and #(ud.weapons or {}) > 0
	end

	-- Weapons of the unit def aDef that can hurt the unit def tDef: list of { dps, volley (damage of one salvo), range }
	local function weaponsAgainst(aDef, tDef)
		local key = aDef * 100000 + tDef
		local c = weaponCache[key]
		if c then
			return c
		end
		c = {}
		local aud, tud = UnitDefs[aDef], UnitDefs[tDef]
		if aud and tud and WeaponDefs then
			local types = Game.armorTypes or {}
			local defIdx, vtolIdx = types.default or 0, types.vtol or 14
			local armor = tonumber(tud.armorType) or defIdx
			local airTarget = tud.canFly and true or false
			for _, w in ipairs(aud.weapons or {}) do
				local wd = WeaponDefs[w.weaponDef]
				if wd and wd.damages and not wd.paralyzer and wd.type ~= "DGun" and not wd.stockpile then
					local aa = (tonumber(wd.damages[vtolIdx]) or 0) > (tonumber(wd.damages[defIdx]) or 0)
					local fits = (airTarget and aa) or (not airTarget and not aa and wd.canAttackGround ~= false)
					local dmg = tonumber(wd.damages[armor]) or tonumber(wd.damages[defIdx]) or 0
					local reload = tonumber(wd.reload) or 0
					if fits and dmg > 1 and reload > 0 then
						local volley = dmg * (tonumber(wd.projectiles) or 1) * (tonumber(wd.salvoSize) or 1)
						c[#c + 1] = { dps = volley / reload, volley = volley, range = tonumber(wd.range) or 0 }
					end
				end
			end
		end
		weaponCache[key] = c
		return c
	end

	-- Damage per second and damage per volley of a unit against a target at distance dist; a unit that cannot move
	-- (static) only counts the weapons that reach
	local function splitDps(aDef, tDef, static, dist)
		local dps, volley = 0, 0
		for _, w in ipairs(weaponsAgainst(aDef, tDef)) do
			if not static or dist <= w.range then
				dps, volley = dps + w.dps, volley + w.volley
			end
		end
		return dps, volley
	end

	local function targetInfo(id)
		local def = Spring.GetUnitDefID(id)
		local hp = Spring.GetUnitHealth(id)
		if not def or not hp or hp <= 0 or Spring.GetUnitIsDead(id) then
			return nil
		end
		local x, _, z = Spring.GetUnitPosition(id)
		if not x then
			return nil
		end
		return { id = id, def = def, x = x, z = z, hp = hp, team = Spring.GetUnitTeam(id), mobile = (tonumber(UnitDefs[def].speed) or 0) > 0 }
	end

	local function attackerInfo(id)
		local def = Spring.GetUnitDefID(id)
		local ud = def and UnitDefs[def]
		local x, _, z = Spring.GetUnitPosition(id)
		if not (ud and x and isArmed(ud)) then
			return nil
		end
		return { id = id, def = def, x = x, z = z, static = (tonumber(ud.speed) or 0) <= 0 }
	end

	-- The teams of a list of unit ids (every team once)
	local function teamsOf(ids)
		local out, seen = {}, {}
		for _, id in ipairs(ids) do
			local team = Spring.GetUnitTeam(id)
			if team and not seen[team] then
				seen[team] = true
				out[#out + 1] = team
			end
		end
		if #out == 0 then
			out[1] = Spring.GetMyTeamID()
		end
		return out
	end

	-- Is a team on the side of the attacking units: the same team or allied to one of their teams (in the Level Editor the
	-- teams of one group are allied with Spring.SetAlly, which Spring.ENEMY_UNITS does not know)
	local function ownSide(team, teams)
		for _, mine in ipairs(teams) do
			if team == mine or Spring.AreTeamsAllied(mine, team) then
				return true
			end
		end
		return false
	end

	-- The visible enemies in a circle: everything the player sees (also what only other units of the player see), no unit of
	-- the teams of the attackers or of their allies, no Gaia
	local function enemiesIn(cx, cz, r, teams)
		local out = {}
		local gaia = Spring.GetGaiaTeamID and Spring.GetGaiaTeamID() or -1
		for _, id in ipairs(Spring.GetUnitsInCylinder(cx, cz, r)) do
			local team = Spring.GetUnitTeam(id)
			if team and team ~= gaia and not ownSide(team, teams) then
				local t = targetInfo(id)
				if t then
					out[#out + 1] = t
				end
			end
		end
		return out
	end

	-- Split plan (XS): the damage per second of all units is spread evenly over the targets; health and armor of the targets
	-- are not looked at. Every target gets the same share of the total DPS. Target by target (mobile first, nearest to the
	-- group first) the nearest free units are taken until the share is reached; units that are left over go to the target
	-- that has the least damage so far. Every unit gets its target first and, behind it, the nearest other target it can hit.
	local function splitPlan(attackers, targets)
		local gx, gz = 0, 0
		for _, u in ipairs(attackers) do
			gx, gz = gx + u.x, gz + u.z
		end
		gx, gz = gx / math.max(1, #attackers), gz / math.max(1, #attackers)
		table.sort(targets, function(a, b)
			if a.mobile ~= b.mobile then
				return a.mobile
			end
			return dist2(a.x, a.z, gx, gz) < dist2(b.x, b.z, gx, gz)
		end)
		local total = 0 -- DPS of all units (mean over the targets a unit can hit)
		for _, u in ipairs(attackers) do
			local sum, count = 0, 0
			for _, t in ipairs(targets) do
				local d = splitDps(u.def, t.def, u.static, math.sqrt(dist2(u.x, u.z, t.x, t.z)))
				if d > 0 then
					sum, count = sum + d, count + 1
				end
			end
			total = total + (count > 0 and sum / count or 0)
		end
		local share = total / math.max(1, #targets)
		local free, queues, got = {}, {}, {}
		for _, u in ipairs(attackers) do
			free[#free + 1] = u
			queues[u.id] = {}
		end
		for _, t in ipairs(targets) do
			got[t.id] = 0
			local cand = {}
			for _, u in ipairs(free) do
				local d = math.sqrt(dist2(u.x, u.z, t.x, t.z))
				local dps = splitDps(u.def, t.def, u.static, d)
				if dps > 0 then
					cand[#cand + 1] = { u = u, d = d, dps = dps }
				end
			end
			table.sort(cand, function(a, b) return a.d < b.d end)
			local taken = {}
			for _, c in ipairs(cand) do
				if got[t.id] > 0 and got[t.id] + c.dps / 2 > share then
					break
				end
				got[t.id] = got[t.id] + c.dps
				taken[c.u.id] = true
				queues[c.u.id][1] = t.id
			end
			local left = {}
			for _, u in ipairs(free) do
				if not taken[u.id] then
					left[#left + 1] = u
				end
			end
			free = left
		end
		for _, u in ipairs(free) do -- units that were not needed for a share: the target with the least damage so far
			local best, bestGot, bestD
			for _, t in ipairs(targets) do
				local d = math.sqrt(dist2(u.x, u.z, t.x, t.z))
				if splitDps(u.def, t.def, u.static, d) > 0 and (not best or got[t.id] < bestGot or (got[t.id] == bestGot and d < bestD)) then
					best, bestGot, bestD = t, got[t.id], d
				end
			end
			if best then
				queues[u.id][1] = best.id
				got[best.id] = got[best.id] + splitDps(u.def, best.def, u.static, bestD)
			end
		end
		for _, u in ipairs(attackers) do -- behind its target the nearest other one, so nothing stands idle while an enemy lives
			local q, best, bestD = queues[u.id], nil, nil
			for _, t in ipairs(targets) do
				if t.id ~= q[1] then
					local d = math.sqrt(dist2(u.x, u.z, t.x, t.z))
					if (not bestD or d < bestD) and splitDps(u.def, t.def, u.static, d) > 0 then
						best, bestD = t, d
					end
				end
			end
			if best then
				q[#q + 1] = best.id
			end
		end
		return queues
	end

	-- Focus plan (XF): every unit gets a queue of target ids. The targets in order of danger: damage per second of the enemy
	-- (against the types of my units) divided by the time I need to get rid of it (the time until my group is in range, at the
	-- mean speed of its mobile units, plus health + SPLIT_BUFFER divided by the DPS of all my units against it); a target that
	-- does no damage comes last, nearest first. One after the other a target takes the nearest free units until the damage of
	-- these units within SPLIT_KILL_TIME seconds (at least one volley each) covers the need of the target: a weak target takes
	-- one unit, a strong one many. These units start on it. A target for which no free unit is left is uncovered: every unit
	-- goes on to the uncovered targets after its own, in the same order, so the whole group concentrates on one target after
	-- the other. Free units that are left when every target is covered start on the nearest target they can hit. At the end
	-- every unit gets one more target (the nearest one it can hit), so nothing stands idle while an enemy lives.
	local function focusPlan(attackers, targets)
		local gx, gz = 0, 0
		for _, u in ipairs(attackers) do
			gx, gz = gx + u.x, gz + u.z
		end
		gx, gz = gx / math.max(1, #attackers), gz / math.max(1, #attackers)
		local byDef, speedSum, mobiles = {}, 0, 0 -- my units by type; mean speed of the mobile ones
		for _, u in ipairs(attackers) do
			byDef[u.def] = (byDef[u.def] or 0) + 1
			if not u.static then
				speedSum, mobiles = speedSum + (tonumber(UnitDefs[u.def].speed) or 0), mobiles + 1
			end
		end
		local meanSpeed = mobiles > 0 and speedSum / mobiles or 0
		for _, t in ipairs(targets) do
			t.need = t.hp * SPLIT_BUFFER + 1
			local threat = 0 -- damage per second of the enemy against my units (mean over my units)
			for def, n in pairs(byDef) do
				for _, w in ipairs(weaponsAgainst(t.def, def)) do
					threat = threat + w.dps * n / #attackers
				end
			end
			local dps, rangeSum, rangeN = 0, 0, 0 -- damage per second of all my units against it, mean range
			for _, u in ipairs(attackers) do
				local d = splitDps(u.def, t.def, u.static, math.sqrt(dist2(u.x, u.z, t.x, t.z)))
				if d > 0 then
					dps = dps + d
					local reach = 0
					for _, w in ipairs(weaponsAgainst(u.def, t.def)) do
						reach = math.max(reach, w.range)
					end
					rangeSum, rangeN = rangeSum + reach, rangeN + 1
				end
			end
			t.gd = math.sqrt(dist2(gx, gz, t.x, t.z))
			local travel = (meanSpeed > 0 and rangeN > 0) and math.max(0, t.gd - rangeSum / rangeN) / meanSpeed or 0
			t.prio = (dps > 0 and threat > 0) and threat / (travel + t.need / dps) or 0
		end
		table.sort(targets, function(a, b)
			if a.prio ~= b.prio then
				return a.prio > b.prio
			end
			return a.gd < b.gd
		end)
		local free, queues, uncovered = {}, {}, {}
		for _, u in ipairs(attackers) do
			free[#free + 1] = u
			queues[u.id] = {}
		end
		for _, t in ipairs(targets) do
			local cand = {}
			for _, u in ipairs(free) do
				local d = math.sqrt(dist2(u.x, u.z, t.x, t.z))
				local dps, volley = splitDps(u.def, t.def, u.static, d)
				if dps > 0 then
					cand[#cand + 1] = { u = u, d = d, dps = dps, volley = volley }
				end
			end
			table.sort(cand, function(a, b) return a.d < b.d end)
			local rest, taken, count = t.need, {}, 0
			for _, c in ipairs(cand) do
				if rest <= 0 then
					break
				end
				local volleys = math.max(1, math.floor(SPLIT_KILL_TIME * c.dps / c.volley + 0.5))
				rest = rest - volleys * c.volley
				taken[c.u.id] = true
				count = count + 1
				queues[c.u.id][1] = t.id
			end
			if count == 0 then
				uncovered[#uncovered + 1] = t
			else
				local left = {}
				for _, u in ipairs(free) do
					if not taken[u.id] then
						left[#left + 1] = u
					end
				end
				free = left
			end
		end
		for _, u in ipairs(attackers) do
			local q, inQueue = queues[u.id], {}
			for _, id in ipairs(q) do
				inQueue[id] = true
			end
			local function nearest(list)
				local best, bestD
				for _, t in ipairs(list) do
					if not inQueue[t.id] then
						local d = math.sqrt(dist2(u.x, u.z, t.x, t.z))
						if (not bestD or d < bestD) and splitDps(u.def, t.def, u.static, d) > 0 then
							best, bestD = t, d
						end
					end
				end
				return best
			end
			if #q == 0 then -- a free unit that nobody needed: the nearest target
				local t = nearest(targets)
				if t then
					q[1], inQueue[t.id] = t.id, true
				end
			end
			for _, t in ipairs(uncovered) do
				if #q >= SPLIT_QUEUE then
					break
				end
				if not inQueue[t.id] and splitDps(u.def, t.def, u.static, math.sqrt(dist2(u.x, u.z, t.x, t.z))) > 0 then
					q[#q + 1], inQueue[t.id] = t.id, true
				end
			end
			local t = nearest(targets)
			if t then
				q[#q + 1] = t.id
			end
		end
		return queues
	end

	-- Gives the orders of a plan; units without a target are dropped from the attack
	local function splitApply(attackers, targets)
		local queues = (split.mode == "focus" and focusPlan or splitPlan)(attackers, targets)
		local given = 0
		split.units = {}
		for _, u in ipairs(attackers) do
			local q = queues[u.id]
			if q and #q > 0 then
				for i, tid in ipairs(q) do
					Spring.GiveOrderToUnit(u.id, CMD.ATTACK, { tid }, i == 1 and {} or { "shift" })
				end
				split.units[u.id] = q
				given = given + 1
			end
		end
		return given
	end

	local function splitGo(ax, az, bx, bz)
		local attackers = {}
		for _, id in ipairs(Spring.GetSelectedUnits()) do
			local u = attackerInfo(id)
			if u and #attackers < SPLIT_MAX_UNITS then
				attackers[#attackers + 1] = u
			end
		end
		if #attackers == 0 then
			say("No armed units selected")
			return
		end
		local r = math.max(math.sqrt(dist2(ax, az, bx, bz)), 16)
		local teams = teamsOf(Spring.GetSelectedUnits())
		local targets = enemiesIn(ax, az, r, teams)
		if #targets == 0 then
			say("No visible enemy in the circle")
			return
		end
		table.sort(targets, function(a, b) return dist2(a.x, a.z, ax, az) < dist2(b.x, b.z, ax, az) end)
		while #targets > SPLIT_MAX_TARGETS do
			targets[#targets] = nil
		end
		split = { units = {}, targets = {}, frame = Spring.GetGameFrame(), mode = areaMode, teams = teams }
		local mobile = 0
		for _, t in ipairs(targets) do
			split.targets[t.id] = true
			if t.mobile then
				mobile = mobile + 1
			end
		end
		local given = splitApply(attackers, targets)
		if given == 0 then
			split = nil
			say(SPLIT_NAMES[areaMode] .. ": no selected unit can hit these enemies")
			return
		end
		say(string.format("%s: %d units on %d enemies (%d mobile, %d buildings)", SPLIT_NAMES[areaMode], given, #targets, mobile, #targets - mobile))
	end

	local function firstCommand(id)
		if Spring.GetUnitCurrentCommand then
			return (Spring.GetUnitCurrentCommand(id, 1))
		end
		local c = Spring.GetUnitCommands(id, 1)
		return type(c) == "table" and c[1] and c[1].id or nil
	end

	-- Every second: forget dead targets and units that got another order; when a target has died, or a unit has finished its
	-- queue while enemies live, a new plan is made for all units that are left (current health, current positions)
	local function splitStep(frame)
		if not split or frame % SPLIT_EVERY ~= 0 then
			return
		end
		local name = SPLIT_NAMES[split.mode]
		if frame - split.frame > SPLIT_TIMEOUT then
			split = nil
			say(name .. " ended (time limit)")
			return
		end
		local living, count, before = {}, 0, 0
		for id in pairs(split.targets) do
			before = before + 1
			local t = targetInfo(id)
			if t and not ownSide(t.team, split.teams) then
				living[id] = t
				count = count + 1
			end
		end
		if count == 0 then
			split = nil
			say(name .. " finished")
			return
		end
		split.targets = {}
		for id in pairs(living) do
			split.targets[id] = true
		end
		local attackers, replan = {}, split.mode == "focus" and count < before
		for id, q in pairs(split.units) do
			local u = attackerInfo(id)
			local cmd = u and firstCommand(id)
			if not u then
				split.units[id] = nil
			elseif cmd == nil then
				local open = false
				for _, tid in ipairs(q) do
					open = open or living[tid] ~= nil
				end
				if open then
					split.units[id] = nil -- idle with a living target: stopped by the player
				else
					replan = true
					attackers[#attackers + 1] = u
				end
			elseif cmd ~= CMD.ATTACK then
				split.units[id] = nil -- the player gave another order
			else
				attackers[#attackers + 1] = u
			end
		end
		if next(split.units) == nil and #attackers == 0 then
			split = nil
			say(name .. " ended: no units left")
			return
		end
		if replan then
			local targets = {}
			for _, t in pairs(living) do
				targets[#targets + 1] = t
			end
			if splitApply(attackers, targets) == 0 then
				split = nil
				say(name .. " ended: nothing left to hit")
			end
		end
	end

	-- Bombers form up first (MOVE to their staging point), then all get the ATTACK order at the same moment: they
	-- fly the run together as a front. { members = { [unitID] = plan entry }, frame = start frame }
	local wave = nil
	local WAVE_RADIUS = 250 -- a bomber counts as in position within this distance of its staging point
	local WAVE_TIMEOUT = 1800 -- frames (60 s): go on even if someone is late

	local function waveStep(frame)
		if not wave then
			return
		end
		local total, ready = 0, 0
		for id, p in pairs(wave.members) do
			if not Spring.ValidUnitID(id) or Spring.GetUnitIsDead(id) then
				wave.members[id] = nil
			else
				total = total + 1
				local x, _, z = Spring.GetUnitPosition(id)
				if (x and dist2(x, z, p.fx, p.fz) <= WAVE_RADIUS * WAVE_RADIUS) or commandCount(id) == 0 then
					ready = ready + 1
				end
			end
		end
		if total == 0 then
			wave = nil
			return
		end
		if ready == total or frame - wave.frame > WAVE_TIMEOUT then
			for id, p in pairs(wave.members) do
				Spring.GiveOrderToUnit(id, CMD.ATTACK, { p.x, Spring.GetGroundHeight(p.x, p.z), p.z }, {})
			end
			say(string.format("Bombers attack: %d of %d in position", ready, total))
			wave = nil
		end
	end

	local function areaGo(ax, az, bx, bz)
		if SPLIT_MODES[areaMode] then
			return splitGo(ax, az, bx, bz)
		end
		local bombers, guns = selectedBombers(), selectedShooters()
		if #bombers == 0 and #guns == 0 then
			say("No armed units selected")
			return
		end
		local len = 0
		if #bombers > 0 then
			local plan
			plan, len = planFor(ax, az, bx, bz, bombers, nil, STAGING_DISTANCE)
			wave = nil
			for _, p in ipairs(plan) do
				if len >= 8 then
					Spring.GiveOrderToUnit(p.id, CMD.MOVE, { p.fx, Spring.GetGroundHeight(p.fx, p.fz), p.fz }, {})
					wave = wave or { members = {}, frame = Spring.GetGameFrame() }
					wave.members[p.id] = p
				else
					Spring.GiveOrderToUnit(p.id, CMD.ATTACK, { p.x, Spring.GetGroundHeight(p.x, p.z), p.z }, {})
				end
			end
		end
		if #guns > 0 then
			local plan
			plan, len = planFor(ax, az, bx, bz, guns, nil, 0)
			for _, p in ipairs(plan) do
				Spring.GiveOrderToUnit(p.id, CMD.ATTACK, { p.x, Spring.GetGroundHeight(p.x, p.z), p.z }, {})
			end
		end
		say(string.format("%s attack: %d bombers, %d other units (%s %d Elmo)", areaMode == "line" and "Carpet" or (areaMode == "rect" and "Rectangle" or "Circle"), #bombers, #guns, areaMode == "circle" and "radius" or "size", math.floor(len)))
	end

	local AREA_HINT = { line = "drag a line", rect = "drag a rectangle", circle = "drag a circle from the center outwards",
		split = "drag a circle from the center outwards: the firepower is spread evenly over the visible enemies in it",
		focus = "drag a circle from the center outwards: the units kill the visible enemies in it one after the other" }
	toggleArea = function(mode)
		if areaArmed and (mode == nil or mode == areaMode) then
			areaArmed = false
			areaDrag = nil
			say("Area attack ended")
			return true
		end
		areaMode = mode or "line"
		areaArmed = true
		areaDrag = nil
		if o.onArm then
			o.onArm()
		end
		local n = SPLIT_MODES[areaMode] and #selectedBy(isArmed) or (#selectedBombers() + #selectedShooters())
		say(n > 0 and string.format("Experimental: %d units selected. On the map %s, right click cancels.", n, AREA_HINT[areaMode])
			or "Experimental: select armed units first, then on the map " .. AREA_HINT[areaMode] .. ".")
		return true
	end

	local function drawArea()
		if not areaArmed then
			return
		end
		local mx, my = Spring.GetMouseState()
		if inPanel(mx, my) then
			return
		end
		local gx, gz = mouseGround()
		if not gx then
			return
		end
		gl.DepthTest(false)
		if not areaDrag then
			gl.Color(1, 0.7, 0.2, 0.9)
			gl.LineWidth(2)
			local y = Spring.GetGroundHeight(gx, gz) + 8
			gl.BeginEnd(GL.LINE_LOOP, function()
				gl.Vertex(gx - 24, y, gz - 24)
				gl.Vertex(gx + 24, y, gz - 24)
				gl.Vertex(gx + 24, y, gz + 24)
				gl.Vertex(gx - 24, y, gz + 24)
			end)
			gl.LineWidth(1)
			gl.Color(1, 1, 1, 1)
			return
		end
		local bombers, guns = selectedBombers(), selectedShooters()
		local plans = {}
		if not SPLIT_MODES[areaMode] and (#bombers > 0 or #guns == 0) then
			plans[#plans + 1] = (planFor(areaDrag.x, areaDrag.z, gx, gz, #bombers > 0 and bombers or nil, math.max(1, #bombers), STAGING_DISTANCE))
		end
		if not SPLIT_MODES[areaMode] and #guns > 0 then
			plans[#plans + 1] = (planFor(areaDrag.x, areaDrag.z, gx, gz, guns, nil, 0))
		end
		gl.LineWidth(2)
		gl.Color(1, 0.7, 0.2, 0.9)
		local ax, az = areaDrag.x, areaDrag.z
		if areaMode == "line" then
			gl.BeginEnd(GL.LINES, function()
				gl.Vertex(ax, Spring.GetGroundHeight(ax, az) + 8, az)
				gl.Vertex(gx, Spring.GetGroundHeight(gx, gz) + 8, gz)
			end)
		elseif areaMode == "rect" then
			gl.BeginEnd(GL.LINE_LOOP, function()
				for _, c in ipairs({ { ax, az }, { gx, az }, { gx, gz }, { ax, gz } }) do
					gl.Vertex(c[1], Spring.GetGroundHeight(c[1], c[2]) + 8, c[2])
				end
			end)
		else
			local r = math.sqrt((gx - ax) ^ 2 + (gz - az) ^ 2)
			gl.BeginEnd(GL.LINE_LOOP, function()
				for k = 0, 47 do
					local x, z = ax + r * math.cos(k * math.pi / 24), az + r * math.sin(k * math.pi / 24)
					gl.Vertex(x, Spring.GetGroundHeight(x, z) + 8, z)
				end
			end)
		end
		for _, plan in ipairs(plans) do
			for _, p in ipairs(plan) do
				local y = Spring.GetGroundHeight(p.x, p.z) + 8
				gl.Color(1, 0.3, 0.2, 0.95)
				gl.BeginEnd(GL.LINE_LOOP, function()
					gl.Vertex(p.x - 14, y, p.z - 14)
					gl.Vertex(p.x + 14, y, p.z - 14)
					gl.Vertex(p.x + 14, y, p.z + 14)
					gl.Vertex(p.x - 14, y, p.z + 14)
				end)
				gl.Color(1, 1, 1, 0.35)
				gl.BeginEnd(GL.LINES, function() -- approach
					gl.Vertex(p.fx, Spring.GetGroundHeight(p.fx, p.fz) + 8, p.fz)
					gl.Vertex(p.x, y, p.z)
				end)
			end
		end
		if SPLIT_MODES[areaMode] then
			local list = enemiesIn(ax, az, math.max(math.sqrt(dist2(ax, az, gx, gz)), 16), teamsOf(Spring.GetSelectedUnits()))
			gl.Color(1, 0.3, 0.2, 0.95)
			for i, e in ipairs(list) do
				if i > SPLIT_MAX_TARGETS then
					break
				end
				local y = Spring.GetGroundHeight(e.x, e.z) + 8
				gl.BeginEnd(GL.LINE_LOOP, function()
					gl.Vertex(e.x - 22, y, e.z - 22)
					gl.Vertex(e.x + 22, y, e.z - 22)
					gl.Vertex(e.x + 22, y, e.z + 22)
					gl.Vertex(e.x - 22, y, e.z + 22)
				end)
			end
		end
		gl.LineWidth(1)
		gl.Color(1, 1, 1, 1)
	end

	local A = {}
	function A:toggle(mode)
		return toggleArea(mode)
	end
	-- The three buttons in the command menu of the game (next to Hold pos, Repeat Off ...): Area Attack (circle), Split Attack (XS), Focus Attack (XF); their
	-- descriptions are in bar_rules.lua. A button is a custom command of type ICON; pressing it arms the mode like the key does (drag the circle on
	-- the map). The BluePrinter adds them with A:addCommands(widgetHandler) in widget:CommandsChanged; in the Level Editor the gadget gives them to the
	-- units. Both pass widget:CommandNotify to A:notify(cmdID).
	function A:commands()
		return Rules.attackButtonDescs()
	end
	-- the texts of the buttons for the order menu (call once, e.g. in widget:Initialize)
	function A:registerTexts()
		local i18n = (BAR and BAR.I18N) or Spring.I18N
		if i18n and i18n.load then
			pcall(i18n.load, Rules.attackButtonTexts())
		end
	end
	-- widget:CommandsChanged of a user widget: widgetHandler.customCommands (the handler of the game checks and copies them)
	function A:addCommands(handler)
		local list = handler.customCommands
		if not list then
			return
		end
		for _, cmd in ipairs(A:commands()) do
			list[#list + 1] = cmd
		end
	end
	-- widget:CommandNotify: true if the command is one of the three buttons (it is used up here, the units get no order)
	function A:notify(cmdID)
		local b = Rules.ATTACK_BUTTONS[(tonumber(cmdID) or 0) - Rules.ATTACK_BUTTONS.base]
		if not b then
			return false
		end
		toggleArea(b.mode)
		return true
	end
	function A:armed()
		return areaArmed
	end
	function A:mode()
		return areaMode
	end
	function A:disarm()
		areaArmed = false
		areaDrag = nil
	end
	-- Map click while armed: right click cancels, left click starts the drag
	function A:press(button)
		if not areaArmed then
			return false
		end
		if button == 3 then
			toggleArea()
			return true
		elseif button == 1 then
			local gx, gz = mouseGround()
			if gx then
				areaDrag = { x = gx, z = gz }
			end
			return true
		end
		return false
	end
	function A:release()
		if areaDrag then
			local d = areaDrag
			areaDrag = nil
			local gx, gz = mouseGround()
			if gx then
				areaGo(d.x, d.z, gx, gz)
				areaArmed = false
			end
		end
	end
	function A:draw()
		drawArea()
	end
	function A:step(frame)
		splitStep(frame)
		if wave and frame % 15 == 0 then
			waveStep(frame)
		end
	end
	return A
end

return M
