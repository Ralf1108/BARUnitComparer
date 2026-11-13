// The website: unit catalog and comparison (docs/website.md). Plain JavaScript without a build step; the data comes from assets/ (exporter/reduce_units.py).
'use strict';

const DATA = 'assets/';
const PICTURE_TYPES = ['avif', 'webp', 'png', 'jpg'];
const FACTIONS = [{ id: 'arm', name: 'Armada' }, { id: 'cor', name: 'Cortex' }, { id: 'leg', name: 'Legion' }, { id: 'scv', name: 'Scavengers' }, { id: 'rap', name: 'Raptors' }];
const shape = d => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const CATEGORIES = [
  { id: 'bots', name: 'Bots', long: 'Bots', icon: shape('M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z') },
  { id: 'vehicles', name: 'Vehicles', long: 'Vehicles', icon: shape('M8 1l7 7-7 7-7-7z') },
  { id: 'air', name: 'Air', long: 'Aircraft', icon: shape('M8 2l7 12H1z') },
  { id: 'sea', name: 'Sea', long: 'Ships', icon: shape('M2 12a6 6 0 0 1 12 0z') },
  { id: 'hover', name: 'Hover', long: 'Hovercraft', icon: shape('M1 13l3-8h8l3 8z') },
  { id: 'factories', name: 'Factories', long: 'Factories', icon: shape('M1 3l2-2h10l2 2v10l-2 2H3l-2-2z') },
  { id: 'defense', name: 'Defense', long: 'Defenses', icon: shape('M8 1l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V3z') },
  { id: 'buildings', name: 'Buildings', long: 'Buildings', icon: shape('M2 2h12v12H2z') },
];
const clock = s => `${String(Math.floor(Math.round(s) / 60)).padStart(2, '0')}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const whole = v => String(Math.round(v));
const STATS = [
  { key: 'metal', label: 'Metal', fill: 'metal', show: whole, lower: true },
  { key: 'energy', label: 'Energy', fill: 'energy', show: whole, lower: true },
  { key: 'buildTime', label: 'Buildtime', fill: 'time', show: clock, lower: true },
  { key: 'buildPower', label: 'Buildpower', fill: 'power', show: whole },
  { key: 'energyMake', label: 'Energy Make', fill: 'make', show: whole },
  { key: 'hitpoints', label: 'Hitpoints', fill: 'hp', show: whole },
  { key: 'radar', label: 'Radar Range', fill: 'radar', show: whole },
  { key: 'speed', label: 'Speed', fill: 'speed', show: v => String(Math.floor(v)) },
  { key: 'weapons', label: 'Weapons' },
  { key: 'dps', label: 'DPS', fill: 'dps', show: whole },
  { key: 'range', label: 'Weapon Range', fill: 'range', show: whole },
];

const app = document.getElementById('app');
const state = {
  units: {}, counterpart: {}, versions: [], version: '', versionDir: '', baseDir: '', diffs: {}, merged: {}, versionsMode: false,
  changes: { faction: 'all', key: '', search: '' }, page: 'catalog', faction: 'arm', category: 'bots', search: '', tiers: new Set(),
  view: load('view', 'grid'), showNames: load('showNames', 'yes') === 'yes',
  columns: [], scav: false, table: load('table', 'no') === 'yes', pick: { faction: 'arm', category: 'bots', search: '' }, pickOpen: load('pickOpen', 'yes') === 'yes',
};
let nextColumn = 1;

// favorites: saved selections of units, kept in the browser: { units: [names], scav: + Scav on, ref: the unit of the reference column or '' }
// (a favorite saved before + Scav and Ref were kept is a plain list of names)
function loadFavorites() {
  try { return JSON.parse(load('favorites', '[]')).map(f => Array.isArray(f) ? { units: f, scav: false, ref: '' } : f).filter(f => f && Array.isArray(f.units)); } catch { return []; }
}
state.favorites = loadFavorites();
state.favOpen = false;
const refUnit = () => { const c = state.columns.length && displayColumns().find(o => o.ref); return c ? tokenOf(c) : ''; };
const currentSetting = () => ({ units: state.columns.map(tokenOf), scav: state.scav, ref: refUnit() });
const favKey = f => `${f.units.join(',')}|${f.scav ? 1 : 0}|${f.ref || ''}`;
const currentFavorite = () => state.favorites.findIndex(f => favKey(f) === favKey(currentSetting()));

function load(key, fallback) { try { return localStorage.getItem('barunit.' + key) || fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem('barunit.' + key, value); } catch { /* no storage: the setting lasts until the page is reloaded */ } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const factionName = id => (FACTIONS.find(f => f.id === id) || { name: id }).name;
const byTech = (a, b) => a.tech - b.tech || a.metal - b.metal || a.name.localeCompare(b.name);   // two units: by tech level, then metal cost, then name
// where the picture ('pic') and the icon ('iconAt') of a unit are: the folder of the version in which they last changed (loadVersions)
const folderOf = (u, key) => `${DATA}${(u && u[key]) || state.baseDir}/`;
const pictureTag = (unit, cls = 'pic', u = state.units[unit]) => `<img class="${cls}" loading="lazy" alt="" data-unit="${esc(unit)}" data-dir="${folderOf(u, 'pic')}" src="${folderOf(u, 'pic')}images/${esc(unit)}.${PICTURE_TYPES[0]}">`;
// a card or row of the catalog is a toggle button: reachable with Tab, Enter or Space presses it (the keydown handler below)
const pressable = on => `tabindex="0" role="button" aria-pressed="${on}"`;
// the grip of a column: dragged with the mouse, or focused and moved with the arrow keys left / right
const GRIP = '<span class="grip" draggable="true" tabindex="0" role="button" aria-label="Move this column (arrow keys left and right)" title="Drag to move this column left or right (or focus it and use the arrow keys)">&#8942;&#8942;</span>';
const iconTag = u => u.icon ? `<img class="role" loading="lazy" alt="" src="${folderOf(u, 'iconAt')}images/icons/${esc(u.icon)}">` : '';

// a missing picture: the next format; after the last one all formats once more a moment later (a failed request is not always a missing file); a missing icon: nothing.
// Error events do not bubble, so they are caught on the way down.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.dataset.unit) { img.style.visibility = 'hidden'; return; }
  const tried = (Number(img.dataset.tried) || 0) + 1;
  if (tried < PICTURE_TYPES.length) { img.dataset.tried = tried; img.src = `${img.dataset.dir}images/${img.dataset.unit}.${PICTURE_TYPES[tried]}`; return; }
  if (img.dataset.again) { img.style.visibility = 'hidden'; return; }
  img.dataset.again = '1';
  img.dataset.tried = 0;
  setTimeout(() => { img.src = `${img.dataset.dir}images/${img.dataset.unit}.${PICTURE_TYPES[0]}`; }, 800);
}, true);

// ------------------------------------------------------------------ data
async function fetchAsset(name) {
  const r = await fetch(DATA + name, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r;
}
const loadJson = async name => (await fetchAsset(name)).json();

// The file is gzip: the page unpacks it itself, so that it works on every host. A server that sends it with Content-Encoding: gzip has it unpacked by the browser already.
async function loadCompressedJson(name) {
  const bytes = await (await fetchAsset(name)).arrayBuffer();
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { /* not unpacked yet */ }
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}

// The game versions (versions.json, oldest first): the BASE version (the first one) has all units (assets/<base>/data/*.reduced.json.gz, all pictures in
// assets/<base>/images/); every later version only what changed against the version BEFORE it (assets/<version>/data/*.diff.json.gz: the changed and the new units,
// the names of the units that are gone, and only the pictures and icons that changed). A version in which nothing changed is not listed. All files are loaded at the
// start (a diff file is a few KB); the units of a version are the base with the changes of every version up to it.
const versionOf = dir => state.versions.find(v => v.dir === dir);
const indexOf = dir => state.versions.findIndex(v => v.dir === dir);
const versionBefore = dir => (state.versions[indexOf(dir) - 1] || {}).dir;
// a unit whose change in a version is only visual: its picture changed, all its values are the same as in the version before
const NOT_A_VALUE = new Set(['icon', 'ownPicture', 'ownIcon', 'pic', 'iconAt', 'visualOnly']);
const valuesOf = u => JSON.stringify(Object.keys(u).filter(k => !NOT_A_VALUE.has(k)).sort().map(k => [k, u[k]]));
async function loadVersions() {
  const listing = await loadJson('versions.json'), listed = listing.versions;
  const first = Math.max(0, listed.findIndex(v => v.base));
  state.versions = listed.slice(first);   // nothing older than the base
  state.baseDir = state.versions[0].dir;
  // the base file and, in ONE file (history.json.gz), the diff files of all later versions; without it (an older versions.json) one file per version
  const history = listing.history ? (await loadCompressedJson(listing.history)).diffs : null;
  const files = await Promise.all(state.versions.map((v, i) => history && i ? history[v.dir] : loadCompressedJson(`${v.dir}/data/${v.file}`)));
  let before = null, icons = {};   // the units of the version before; {icon file: folder} in that version
  state.versions.forEach((v, i) => {
    const data = files[i];
    if (!before) {
      for (const u of Object.values(data.units)) { u.pic = u.iconAt = v.dir; if (u.icon) icons[u.icon] = v.dir; }
      before = state.merged[v.dir] = data.units;
      return;
    }
    const all = { ...before }, next = { ...icons };
    for (const [n, u] of Object.entries(data.units)) {
      u.visualOnly = !!(u.ownPicture && before[n] && valuesOf(u) === valuesOf(before[n]));   // golden picture: only the look changed
      u.pic = u.ownPicture || !before[n] ? v.dir : before[n].pic;   // its picture changed (or it is new): in this version's folder, else where it was
      u.iconAt = u.ownIcon ? v.dir : icons[u.icon] || state.baseDir;
      if (u.ownIcon) next[u.icon] = v.dir;
      all[n] = u;
    }
    for (const n of data.removed || []) delete all[n];
    state.diffs[v.dir] = { units: data.units, removed: new Set(data.removed || []) };
    before = state.merged[v.dir] = all;
    icons = next;
  });
  state.lastUnit = {};   // every unit that ever was there, as in the newest version that has it (the selection of the version comparison also offers units that are gone)
  for (const v of state.versions) Object.assign(state.lastUnit, state.merged[v.dir]);
  // unit -> its versions (folder names, oldest first): the first one that has it (the base, or the version it is new in) and every one in which it changed
  state.unitVersions = {};
  state.versions.forEach((v, i) => { for (const n of Object.keys(i ? state.diffs[v.dir].units : state.merged[v.dir])) (state.unitVersions[n] = state.unitVersions[n] || []).push(v.dir); });
}
// all units of a version
const unitsOf = (dir = state.versionDir) => state.merged[dir];
// did only the look of the unit change in this version (against the version before)?
const visualIn = (dir, unit) => !!(state.diffs[dir] && state.diffs[dir].units[unit] && state.diffs[dir].units[unit].visualOnly);
const VISUAL_TIP = 'Only the look changed in this version: the picture is new, all values are the same as before.';
// did the unit change in this version (against the version before)
const changedIn = (dir, unit) => !!(state.diffs[dir] && state.diffs[dir].units[unit]);
const versionsOf = unit => state.unitVersions[unit] || [];   // the versions of a unit (folders, oldest first)
const hasVersions = unit => versionsOf(unit).length > 1;   // there is another version of it
// the version in which the values a column shows were set: the newest version of the unit that is not newer than the version of the column (the page shows the newest
// game version, in which most units have not changed for a long time)
const stateVersion = c => versionsOf(c.unit).filter(d => indexOf(d) <= verOf(c)).pop();
const olderVersions = c => { const at = indexOf(stateVersion(c)); return versionsOf(c.unit).filter(d => indexOf(d) < at).reverse(); };   // newest first
const missingVersions = c => olderVersions(c).filter(d => !state.columns.some(o => o.unit === c.unit && (o.version || state.versionDir) === d));   // ... and not shown yet
function selectVersion(dir) {
  state.versionDir = dir;
  state.units = unitsOf(dir);
  state.version = versionOf(dir).version;
}
// "test-31836-b250a16" -> "test-31836" and the date
// the options of the version list: oldest first, grouped by month ("2026-03 (5 versions)") as soon as there are many versions
function versionOptions(note, selected = state.versionDir) {
  const option = v => `<option value="${esc(v.dir)}" ${v.dir === selected ? 'selected' : ''}>${esc(versionLabel(v) + note(v))}</option>`;
  if (state.versions.length < 12) return state.versions.map(option).join('');
  const months = new Map();
  for (const v of state.versions) { const m = (v.date || '').slice(0, 7) || 'no date'; if (!months.has(m)) months.set(m, []); months.get(m).push(v); }
  return [...months].map(([m, list]) => `<optgroup label="${esc(m)} (${list.length} version${list.length > 1 ? 's' : ''})">${list.map(option).join('')}</optgroup>`).join('');
}
const versionLabel = v => `${v.version.replace(/-[0-9a-f]{7,}$/, '')}${v.date ? ` · ${v.date}` : ''}`;

async function start() {
  try {
    await loadVersions();
    selectVersion(state.versions[state.versions.length - 1].dir);   // the newest
  } catch (e) {
    app.innerHTML = `<p class="message">No data found (${esc(e.message)}).<br>Run <code>export and render all units.bat</code> first, and open this page through <code>website/serve.bat</code>.</p>`;
    return;
  }
  try {
    const eq = (await loadJson('counterparts.json')).units;   // id -> units; without the file there are simply no counterparts
    for (const [unit, id] of Object.entries(eq)) (state.counterpart[id] = state.counterpart[id] || []).push(unit);
    state.counterpartOf = eq;
  } catch { state.counterpartOf = {}; }
  try { state.counters = (await loadJson('counters.json')).counters; } catch { state.counters = {}; }   // unit -> the units that counter it (exporter/export_counters.py)
  window.addEventListener('hashchange', route);
  route();
}

// ------------------------------------------------------------------ the address: #/catalog/<faction>/<category>, #/compare/<unit>,<unit>?view=table|graphic&scav=1&ref=<unit>
function route() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [page, a, b] = path.split('/'), params = new URLSearchParams(query);
  if (page === 'changes' && state.versions.length > 1) {
    state.page = 'changes';
    const last = state.versions[state.versions.length - 1].dir;
    state.changesTo = versionOf(a) ? a : last;
    state.changesFrom = versionOf(params.get('from')) ? params.get('from') : versionBefore(state.changesTo);
    if (indexOf(state.changesFrom) >= indexOf(state.changesTo)) state.changesFrom = versionBefore(state.changesTo);
  } else if (page === 'compare') {
    state.page = 'compare';
    const wanted = [...new Set((a || '').split(',').filter(t => columnFromToken(t)))];
    if (wanted.length && wanted.join() !== chosenUnits().join()) state.columns = wanted.map(columnFromToken);
    // the view of the link (an old link without these keeps the view of the browser, has no Ref and no + Scav)
    if (params.has('view')) state.table = params.get('view') === 'table';
    state.scav = params.get('scav') === '1';
    state.versionsMode = params.get('versions') === '1' && state.versions.length > 1;
    const ref = params.get('ref');
    for (const c of displayColumns()) c.ref = tokenOf(c) === ref;
  } else {
    state.page = 'catalog';
    if (FACTIONS.some(f => f.id === a)) state.faction = a;
    if (CATEGORIES.some(c => c.id === b)) state.category = b;
  }
  render();
}

// a column shows a unit in the chosen game version of the page (version null), or in a version of its own (version = the folder of that version)
function newColumn(unit, version = null) {
  return { id: nextColumn++, unit, version, faction: unitsOf(version || state.versionDir)[unit].faction };
}
const unitOf = c => unitsOf(c.version || state.versionDir)[c.unit];
// a column in the link and in a favorite: "armpw", or "armpw@test-31450-6562fb1" with a version of its own
const tokenOf = c => c.version ? `${c.unit}@${c.version}` : c.unit;
function columnFromToken(t) {
  const [unit, version = null] = t.split('@');
  if (version && !versionOf(version)) return null;
  return unitsOf(version || state.versionDir)[unit] ? newColumn(unit, version) : null;
}
const tokenUnit = t => t.split('@')[0];

const chosenUnits = () => state.columns.map(tokenOf);
// the link of the comparison carries the units and how they are shown, so that a shared link looks the same for the other one
function compareLink() {
  const params = new URLSearchParams({ view: state.table ? 'table' : 'graphic' });
  if (state.scav) params.set('scav', '1');
  if (refUnit()) params.set('ref', refUnit());
  if (state.versionsMode) params.set('versions', '1');
  return '#/compare/' + chosenUnits().join(',') + '?' + params;
}
function keepAddress() { if (state.page === 'compare') history.replaceState(null, '', compareLink()); }

// ------------------------------------------------------------------ frame
function render() {
  renderNav();
  if (state.page === 'compare') renderCompare(); else if (state.page === 'changes') renderChanges(); else renderCatalog();
  renderTray();
}

function favPanelHtml() {
  if (!state.favOpen) return '';
  const items = state.favorites.map((f, i) => {
    const named = t => { const c = columnFromToken(t); return c && `${esc(unitOf(c).name)}${c.version ? ` <small>${esc(versionLabel(versionOf(c.version)).split(' · ')[0])}</small>` : ''}`; };
    const names = f.units.map(t => [t, named(t)]).filter(([, n]) => n).map(([t, n]) => `<span class="f-${columnFromToken(t).faction}">${n}</span>`);
    const ref = f.ref && named(f.ref);
    const extras = [f.scav ? '+ Scav' : '', ref ? `Ref ${ref}${tokenUnit(f.ref).endsWith('_scav') ? ' (Scav)' : ''}` : ''].filter(Boolean);
    return names.length ? `<div class="fav-item"><button class="fav-load" data-a="fav-load" data-v="${i}" title="Load these units into the comparison (Undo brings the old selection back)">${names.join(', ')}${extras.length ? ` <em class="fav-extra">${extras.join(' · ')}</em>` : ''}</button><button class="fav-del" data-a="fav-del" data-v="${i}" title="Remove this favorite" aria-label="Remove this favorite">&#10005;</button></div>` : '';
  }).join('');
  return `<div class="fav-panel">${items || '<p class="empty">No favorites yet: press the star on the Compare page.</p>'}</div>`;
}

function renderNav() {
  document.getElementById('nav-links').innerHTML = `<a href="#/catalog/${state.faction}/${state.category}" class="${state.page === 'catalog' ? 'active' : ''}">Catalog</a>
    <a href="${compareLink()}" class="${state.page === 'compare' ? 'active' : ''}">Compare${chosenUnits().length ? ` (${chosenUnits().length})` : ''}</a>
    ${state.versions.length > 1 ? `<a href="#/changes" class="${state.page === 'changes' ? 'active' : ''}" title="What changed in the game: the units that changed between two game versions">Changes</a>` : ''}
    <span class="fav-wrap"><button class="fav-open ${state.favOpen ? 'active' : ''}" data-a="fav-menu" title="The saved selections of units">&#9733; Favorites${state.favorites.length ? ` (${state.favorites.length})` : ''}</button>${favPanelHtml()}</span>`;
  const note = v => v.base ? ' (base)' : v.changed !== undefined ? ` (${v.changed} changed)` : '';
  document.getElementById('version').innerHTML = state.versions.length > 1
    ? `<span class="v-label">Game version</span> <select data-change="version" title="The game version of the catalog and of the columns that have no version of their own; base: the first version, every later one lists only what changed against the one before (n changed: units)">${versionOptions(note)}</select>`
    : `<span class="v-label">Game version</span> ${esc(versionLabel(versionOf(state.versionDir)))}`;
}

// ------------------------------------------------------------------ catalog
function catalogUnits() {
  const search = state.search.trim().toLowerCase();
  return Object.keys(state.units).filter(n => {
    const u = state.units[n];
    if (u.faction !== state.faction || (state.tiers.size && !state.tiers.has(u.tech))) return false;
    if (state.versionsMode && !hasVersions(n)) return false;   // the button Versions: only units with at least 2 versions
    return search ? matchUnit(n, u, search) : u.category === state.category;
  }).sort((a, b) => byTech(state.units[a], state.units[b]));
}

function renderCatalog() {
  const f = state.faction, cat = CATEGORIES.find(c => c.id === state.category);
  document.title = `${factionName(f)} ${cat.name} - BAR Unit Comparer`;
  app.innerHTML = `<div class="f-${f}">
    <div class="title"><b>${factionName(f)}</b><h1>${cat.name}</h1>
      <span class="switch">Switch To ${FACTIONS.filter(o => o.id !== f).map(o => `<a class="f-${o.id}" href="#/catalog/${o.id}/${state.category}">${o.name}</a>`).join('')}</span></div>
    <div class="tabs">${CATEGORIES.map(c => `<a class="${c.id === state.category ? 'active' : ''}" href="#/catalog/${f}/${c.id}">${c.icon}${c.name}</a>`).join('')}</div>
    <div class="controls">
      <span class="seg"><button data-a="view" data-v="list" class="${state.view === 'list' ? 'active' : ''}"><svg viewBox="0 0 26 20"><path d="M0 1h5v4H0zM8 1h18v4H8zM0 8h5v4H0zM8 8h18v4H8zM0 15h5v4H0zM8 15h18v4H8z"/></svg>List</button><button data-a="view" data-v="grid" class="${state.view === 'grid' ? 'active' : ''}"><svg viewBox="0 0 26 20"><path d="M0 1h5v4H0zM7 1h5v4H7zM14 1h5v4h-5zM21 1h5v4h-5zM0 8h5v4H0zM7 8h5v4H7zM14 8h5v4h-5zM21 8h5v4h-5zM0 15h5v4H0zM7 15h5v4H7zM14 15h5v4h-5zM21 15h5v4h-5z"/></svg>Grid</button></span>
      <label class="toggle"><input type="checkbox" data-change="names" ${state.showNames ? 'checked' : ''}><i></i>Show names</label>
      <span class="seg small">${[1, 2, 3].map(t => `<button data-a="tier" data-v="${t}" class="${state.tiers.has(t) ? 'active' : ''}">T${t}</button>`).join('')}</span>
      ${versionsFilterButton()}
      <input class="search ${isCodeSearch(state.search) ? 'code' : ''}" data-input="catalog-search" placeholder="Search unit, or &lt;codename&gt;" value="${esc(state.search)}">
    </div>
    <div id="units"></div></div>`;
  renderCatalogUnits();
}

function renderCatalogUnits() {
  const list = catalogUnits(), chosen = new Set(chosenUnits());
  const box = document.getElementById('units');
  if (!list.length) { box.innerHTML = '<p class="empty">No units here.</p>'; return; }
  if (state.view === 'list') {
    box.innerHTML = `<div class="list"><div class="row head"><span>Tech</span><span></span><span></span><span>Name</span><span class="opt">Description</span><span class="num opt">Metal</span><span class="num opt">Energy</span><span class="num opt">Hitpoints</span><span class="num">DPS</span></div>${list.map(n => {
      const u = state.units[n];
      return `<div class="row ${chosen.has(n) ? 'selected' : ''}${visualIn(state.versionDir, n) ? ' visual' : ''}" data-a="toggle" data-v="${esc(n)}" ${pressable(chosen.has(n))} title="${chosen.has(n) ? 'In the comparison: press to take it out' : 'Add to the comparison'}"><span class="tier t${u.tech}">T${u.tech}</span>${iconTag(u) || '<span></span>'}${pictureTag(n)}
        <span>${esc(u.name)} ${changedTag(n)}</span><span class="desc">${esc(u.description)}</span><span class="num opt">${whole(u.metal)}</span><span class="num opt">${whole(u.energy)}</span><span class="num opt">${whole(u.hitpoints)}</span><span class="num">${u.dps ? whole(u.dps) : ''}</span></div>`;
    }).join('')}</div>`;
    return;
  }
  box.innerHTML = `<div class="grid ${state.showNames ? '' : 'hide-names'}">${list.map(n => {
    const u = state.units[n], on = chosen.has(n);
    return `<div class="card ${on ? 'selected' : ''}${visualIn(state.versionDir, n) ? ' visual' : ''}" data-a="toggle" data-v="${esc(n)}" ${pressable(on)} title="${esc(u.name)}: ${on ? 'in the comparison, press to take it out' : 'add to the comparison'}"><span class="tier t${u.tech}">T${u.tech}</span>${iconTag(u)}${on ? '<span class="check">&#10003;</span>' : ''}${pictureTag(n)}
      ${changedTag(n)}<div class="name">${esc(u.name)}</div><div class="desc">${esc(u.description)}</div></div>`;
  }).join('')}</div>`;
}
// a unit that changed in the version shown (against the version before)
const changedTag = n => visualIn(state.versionDir, n) ? `<span class="chg visual" title="${VISUAL_TIP}">visual</span>`
  : changedIn(state.versionDir, n) ? `<span class="chg" title="Changed against the version before, ${esc(shortVersion(versionBefore(state.versionDir)))} (values or picture)">changed</span>` : '';

function renderTray() {
  const units = chosenUnits(), tray = document.getElementById('tray');
  if (state.page !== 'catalog' || !units.length) { tray.innerHTML = ''; return; }
  tray.innerHTML = `<div class="tray"><div class="thumbs">${state.columns.slice(-12).map(c => pictureTag(c.unit, '', unitOf(c))).join('')}</div>
    <span>${units.length} unit${units.length > 1 ? 's' : ''}</span><button class="btn" data-a="clear">Clear</button><a class="btn go" href="${compareLink()}">Compare</a></div>`;
}

// ------------------------------------------------------------------ changes: what changed between two game versions (the version compare)
// the values that are compared (the numbers as they are, the weapons as text) and what else can change
const CHANGE_KEYS = [...STATS, { key: 'tech', label: 'Tech' }, { key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }];
const rawOf = (u, key) => key === 'weapons' ? (u.weapons || []).join(', ') : u[key];
const shownOf = (u, key) => { const s = STATS.find(o => o.key === key), v = rawOf(u, key); return v === undefined || v === '' ? '–' : s && s.show ? s.show(v) : String(v); };
// every unit that differs between two versions of the chain: new, gone, or changed (values listed, picture); a unit that changed twice shows the total
function rangeChanges(from, to) {
  const A = unitsOf(from), B = unitsOf(to), out = [];
  for (const n of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const a = A[n], b = B[n];
    if (!a) out.push({ unit: n, kind: 'new', u: b, fields: [] });
    else if (!b) out.push({ unit: n, kind: 'gone', u: a, fields: [] });
    else {
      const fields = CHANGE_KEYS.filter(s => rawOf(a, s.key) !== rawOf(b, s.key));
      if (fields.length || a.pic !== b.pic) out.push({ unit: n, kind: 'changed', u: b, a, fields, picture: a.pic !== b.pic });
    }
  }
  const order = { changed: 0, new: 1, gone: 2 };
  return out.sort((x, y) => order[x.kind] - order[y.kind] || byTech(x.u, y.u));
}
const changesLink = (to, from) => `#/changes/${to}?from=${from}`;
function changeRow(c, from, to) {
  const tokens = c.kind === 'new' ? [`${c.unit}@${to}`] : c.kind === 'gone' ? [`${c.unit}@${from}`] : [`${c.unit}@${from}`, `${c.unit}@${to}`];
  const pills = c.fields.map(s => `<span class="pill" title="${esc(s.label)}: ${esc(shownOf(c.a, s.key))} → ${esc(shownOf(c.u, s.key))}">${esc(s.label)} <s>${esc(shownOf(c.a, s.key))}</s> → <b>${esc(shownOf(c.u, s.key))}</b></span>`);
  if (c.picture) pills.push(c.fields.length ? '<span class="pill" title="The picture changed">Picture</span>' : `<span class="pill visual" title="${VISUAL_TIP}">Only the picture</span>`);
  const visual = c.kind === 'changed' && !c.fields.length && c.picture;   // only the look changed in the range
  return `<a class="chg-row f-${esc(c.u.faction)}${visual ? ' visual' : ''}" href="#/compare/${tokens.map(esc).join(',')}?view=graphic" title="Open in the unit compare: ${c.kind === 'changed' ? 'the version before and the changed version side by side' : 'the unit in this version'}">
    ${pictureTag(c.unit, 'pic', c.u)}<span class="chg-name"><b>${esc(c.u.name)}</b><small>${esc(c.unit)}</small></span><span class="chg-kind k-${c.kind}">${c.kind}</span><span class="pills">${pills.join('') || '<span class="pill muted">no value shown</span>'}</span></a>`;
}
function changesListHtml() {
  const { faction, key, search } = state.changes, q = search.trim().toLowerCase();
  const list = rangeChanges(state.changesFrom, state.changesTo).filter(c => (faction === 'all' || c.u.faction === faction)
    && (!key || c.fields.some(s => s.key === key)) && (!q || matchUnit(c.unit, c.u, q)));
  const count = kind => list.filter(c => c.kind === kind).length;
  const range = state.versions.slice(indexOf(state.changesFrom) + 1, indexOf(state.changesTo) + 1);
  const engine = range.flatMap(v => Object.keys(v.engineOnly || {}).map(n => `${n} (${shortVersion(v.dir)}: ${v.engine || 'other engine'})`));
  return `<p class="chg-sum"><b>${count('changed')}</b> changed · <b>${count('new')}</b> new · <b>${count('gone')}</b> gone, in ${range.length} version${range.length === 1 ? '' : 's'} with changes</p>
    ${engine.length ? `<p class="chg-note" title="Values that differ only because the engine of the game was changed: not a change of the game, not listed above">Engine only, not a change of the game: ${esc(engine.join(', '))}</p>` : ''}
    <div class="chg-list">${list.map(c => changeRow(c, state.changesFrom, state.changesTo)).join('') || '<p class="empty">Nothing changed here.</p>'}</div>`;
}
function renderChanges() {
  document.title = 'Changes - BAR Unit Comparer';
  const c = state.changes;
  const select = (kind, label, options) => `<label>${label} <select data-change="${kind}">${options}</select></label>`;
  app.innerHTML = `<div class="changes"><div class="title"><h1>Changes</h1></div>
    <p class="chg-intro">What changed in the game between two versions: a version against the version before it, or any two versions (a unit that changed twice shows the total). A click opens the unit in the unit compare.</p>
    <div class="controls">${select('chg-from', 'From', versionOptions(v => v.base ? ' (base)' : '', state.changesFrom))}${select('chg-to', 'To', versionOptions(v => v.base ? ' (base)' : ` (${v.changed} changed)`, state.changesTo))}
      <label>Units <select data-change="chg-faction"><option value="all">All</option>${FACTIONS.map(f => `<option value="${f.id}" ${c.faction === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
      <label>Value <select data-change="chg-key"><option value="">Any</option>${CHANGE_KEYS.map(s => `<option value="${s.key}" ${c.key === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
      <input class="search" data-input="chg-search" placeholder="Search unit, or &lt;codename&gt;" value="${esc(c.search)}"></div>
    <div id="chg-body">${changesListHtml()}</div></div>`;
}

// ------------------------------------------------------------------ compare
// the search: a text finds the words of the name and the description (at the start of a word); <armpw> finds a part of the code name
const isCodeSearch = q => q.trim().startsWith('<');
function matchUnit(n, u, q) {
  if (q.startsWith('<')) {
    const code = q.slice(1).replace(/>$/, '').trim();
    return code !== '' && n.includes(code);
  }
  const words = (u.name + ' ' + u.description).toLowerCase();
  return words.startsWith(q) || words.includes(' ' + q) || words.includes('(' + q) || words.includes('-' + q) || words.includes('/' + q);
}

// the units of the selection: in the version comparison only the units that changed in some version (also the ones that are gone in the version shown)
function pickUnits() {
  const p = state.pick, search = p.search.trim().toLowerCase();
  const pool = state.versionsMode ? Object.keys(state.unitVersions).filter(hasVersions) : Object.keys(state.units);   // the button Versions: only units with at least 2 versions
  return pool.filter(n => {
    const u = pickUnit(n);
    if (search) return matchUnit(n, u, search);   // a search looks in all factions and categories
    return u.faction === p.faction && u.category === p.category;
  }).sort((a, b) => byTech(pickUnit(a), pickUnit(b)));
}
// a unit of the selection: as in the version shown; a unit that this version does not have, as in the newest version that has it
const pickUnit = n => state.units[n] || state.lastUnit[n];

function renderCompare() {
  document.title = 'Compare - BAR Unit Comparer';
  const columns = displayColumns(), two = columns.length === 2;
  shown = columns;
  const max = {};
  const reference = columns.find(c => c.ref);   // with a reference column the bars of the others are coloured
  for (const s of STATS) if (s.fill) max[s.key] = Math.max(0, ...columns.map(c => unitOf(c)[s.key]));
  const stats = STATS.filter(s => columns.some(c => s.key === 'weapons' ? unitOf(c).weapons.length : unitOf(c)[s.key]));   // only what a unit has
  // the version comparison: the values that differ between the columns of one unit are marked
  for (const s of stats) s.differs = differs(columns, s);
  const scroll = app.querySelector('.cmp-scroll'), left = scroll ? scroll.scrollLeft : 0;   // the columns are made anew: the sideways position stays
  const list = app.querySelector('.picker'), listTop = list ? list.scrollTop : 0;
  app.innerHTML = `<h2 class="cmp-kicker">Compare</h2>
    <div class="cmp-clear"><button class="btn" data-a="undo" title="Undo the last change of the columns (Ctrl+Z)" ${undoStack.length ? '' : 'disabled'}>&#8630; Undo</button> <button class="btn" data-a="redo" title="Redo (Ctrl+Y)" ${redoStack.length ? '' : 'disabled'}>Redo &#8631;</button> <button class="btn" data-a="view-table" title="${state.table ? 'Back to the graphic view with pictures and bars' : 'Compact table: one row per value, one column per unit'}">${state.table ? 'Graphic view' : 'Table view'}</button> <button class="btn fav-star ${currentFavorite() >= 0 ? 'on' : ''}" data-a="fav-save" title="${currentFavorite() >= 0 ? 'This selection is a favorite: press to remove it' : 'Save this selection of units as a favorite (list: Favorites at the top)'}" ${state.columns.length ? '' : 'disabled'}>${currentFavorite() >= 0 ? '&#9733;' : '&#9734;'}</button> <button class="btn ${state.scav ? 'go' : ''}" data-a="scav" title="Scavengers: show the Scavenger copy of every unit right next to it (stronger: about 10 % more cost, 25 % more hitpoints). Press again to take them out.">+ Scav</button>${versionsFilterButton(true)} <button class="btn" data-a="clear-all" title="Remove all units from the comparison and start again" ${state.columns.length ? '' : 'disabled'}>Clear all units</button></div>
    <div class="cmp-body"><div class="cmp-wrap"><div class="cmp-scroll">${columns.length
      ? (state.table ? tableHtml(columns, stats, max, reference) : `<div class="cmp-grid ${two ? 'two' : ''}" style="--n:${columns.length}">${columns.map((c, i) => columnHtml(c, i, two ? (i ? 'right' : 'left') : '', max, reference, stats)).join('')}</div>`)
      : '<p class="cmp-empty">Choose units on the right: every click adds a column.</p>'}</div>
      <button class="more more-left" data-a="scroll-columns" data-v="-1" title="More columns to the left">&#8249;</button><button class="more more-right" data-a="scroll-columns" data-v="1" title="More columns to the right: scroll sideways">&#8250;</button></div>
      ${chooserHtml()}</div>`;
  app.querySelector('.cmp-scroll').scrollLeft = left;
  app.querySelector('.cmp-scroll').addEventListener('scroll', updateMore);
  app.querySelector('.picker').scrollTop = listTop;
  fitLayout();
}

// the unit pictures shrink (down to 60 px) when the stats and the footer would otherwise need a scrollbar
function fitPictures() {
  const root = document.documentElement.style;
  root.setProperty('--pic', '300px');
  document.body.style.minHeight = '0';
  for (let i = 0; i < 2; i++) {
    const over = document.body.offsetHeight - window.innerHeight;
    const now = parseFloat(root.getPropertyValue('--pic'));
    root.setProperty('--pic', Math.max(60, Math.min(300, now - over)) + 'px');
  }
  document.body.style.minHeight = '';
}

// columns and unit selection fill the height of the window; the footer stays at the bottom, the page needs no scrollbar
function fitLayout() {
  const body = app.querySelector('.cmp-body');
  if (!body) return;
  body.style.minHeight = '0';
  fitPictures();
  const top = body.getBoundingClientRect().top + window.scrollY;
  body.style.minHeight = Math.max(320, window.innerHeight - top - document.querySelector('.legal').offsetHeight) + 'px';
  updateMore();
}

function refreshChooser() {
  app.querySelector('.chooser').outerHTML = chooserHtml();
  const input = app.querySelector('.chooser .search');
  if (state.pick.search) input.focus();
}

// an arrow at the edge shows that more columns are hidden to the left or to the right
function updateMore() {
  const sc = app.querySelector('.cmp-scroll');
  if (!sc) return;
  app.querySelector('.more-left').hidden = sc.scrollLeft < 4;
  app.querySelector('.more-right').hidden = sc.scrollLeft + sc.clientWidth > sc.scrollWidth - 4;
}

function scavengerHead(c, at, sticky) {
  return `<div class="c-head f-scv${sticky}" data-col="${c.id}" ${at(1)}><div class="c-title"><b>Scavengers</b>${versionSelect(c)}</div>
    <div class="c-tools">${refButton(c)}</div></div>`;
}

// the game version of a column: a list of the versions that have the unit (a Scavenger column shows the version of its unit); only with more than one version
const shortVersion = dir => versionLabel(versionOf(dir)).split(' · ')[0];
function versionSelect(c) {
  if (state.versions.length < 2) return '';
  const own = c.version || state.versionDir;
  if (c.scavOf) return `<span class="c-ver">${esc(shortVersion(own))}</span>`;
  const mark = v => v.dir === state.baseDir ? ' · base' : changedIn(v.dir, c.unit) ? ' · changed' : '';
  // not every version (there can be about 150): the base, the versions in which this unit changed, and the one the column shows now
  return `<select class="c-ver" data-change="col-version" title="The game version of this column: the base (the first version), the versions in which the unit changed against the one before, and the one shown now">${
    state.versions.filter(v => unitsOf(v.dir)[c.unit] && (v.dir === state.baseDir || v.dir === own || changedIn(v.dir, c.unit))).map(v => `<option value="${esc(v.dir)}" ${v.dir === own ? 'selected' : ''}>${esc(versionLabel(v) + mark(v))}</option>`).join('')}</select>`;
}

// the version comparison: a value is marked if it differs from the same unit in the nearest older version that is shown (the anchor of the column)
let shown = [];   // the columns of the last renderCompare
const valueOf = (c, key) => key === 'weapons' ? unitOf(c).weapons.join(', ') : unitOf(c)[key];
const verOf = c => indexOf(c.version || state.versionDir);
const anchorOf = c => {
  if (c.ref) return null;
  const ref = shown.find(o => o.ref && o.unit === c.unit);   // a Ref column of the same unit: the other versions are compared with it
  if (ref) return ref;
  return shown.filter(o => o.unit === c.unit && verOf(o) < verOf(c)).sort((a, b) => verOf(b) - verOf(a))[0] || null;
};
const cellChanged = (c, s) => { const a = anchorOf(c); return !!a && valueOf(c, s.key) !== valueOf(a, s.key); };
const differs = (columns, s) => columns.some(c => cellChanged(c, s));
// what the bars and values of a column are coloured against: the Ref column; in the version comparison the same unit in the nearest older version shown (each unit against itself)
function referenceFor(c, reference) {
  const a = anchorOf(c);
  if (a) return { ...unitOf(a), anchor: true };   // another version of the same unit is shown left of it: against that (equal values stay uncoloured)
  return reference && !c.ref ? unitOf(reference) : null;
}

const refButton = c => `<button class="ref ${c.ref ? 'active' : ''}" data-a="col-ref" title="Reference: the bars of all other columns are coloured green (as good or better) or red (worse) in comparison with this unit. Press again to switch it off.">Ref</button>`;

// the compact view: one row per value, one column per unit, the same red / green against the reference
function tableHtml(columns, stats, max, reference) {
  const head = c => {
    const u = unitOf(c), tools = c.scavOf ? refButton(c) : `${versionsButton(c)}${countersButton(c)}${refButton(c)}<button class="x" data-a="remove-column" title="Remove this column" aria-label="Remove this column">&#10005;</button>`;
    return `<th class="f-${c.faction}${c.ref ? ' is-ref' : ''}" data-col="${c.id}"><div class="t-pic${visualIn(c.version || state.versionDir, c.unit) ? ' visual' : ''}">${pictureTag(c.unit, '', u)}</div><div class="t-fac">${c.scavOf ? 'Scavengers' : factionName(c.faction)}</div><div class="t-name">${esc(u.name)} <span class="tier t${u.tech}">T${u.tech}</span></div><div class="t-desc">${esc(u.description)}</div>${versionSelect(c)}<div class="c-tools">${c.scavOf ? '' : GRIP}${tools}</div></th>`;
  };
  const cell = (s, c) => {
    const u = unitOf(c), changed = cellChanged(c, s) ? ' changed' : '';
    if (s.key === 'weapons') return `<td data-col="${c.id}" class="${changed}">${esc(u.weapons.join(', '))}</td>`;
    const v = u[s.key];
    if (!v) return `<td data-col="${c.id}" class="${changed}"></td>`;
    const ref = referenceFor(c, reference);
    return `<td data-col="${c.id}" class="num${verdictOf(s, v, ref)}${v === max[s.key] ? ' top' : ''}${changed}">${s.show(v)}</td>`;
  };
  return `<table class="cmp-table"><thead><tr><th class="t-corner"></th>${columns.map(head).join('')}</tr></thead>
    <tbody>${stats.map(s => `<tr><th class="${s.differs ? 'changed' : ''}">${s.label}</th>${columns.map(c => cell(s, c)).join('')}</tr>`).join('')}</tbody></table>`;
}

function columnHtml(c, col, side, max, reference, stats) {
  const u = unitOf(c), ref = referenceFor(c, reference);
  const at = r => `style="grid-column:${col + 1};grid-row:${r}"`;
  const sticky = c.ref ? ' is-ref' : '';
  const head = c.scavOf ? scavengerHead(c, at, sticky) : `<div class="c-head f-${c.faction} ${side}${sticky}" data-col="${c.id}" ${at(1)}>
      <div class="c-title"><b>${factionName(c.faction)}</b>${versionSelect(c)}</div>
      <div class="c-tools">${GRIP}${versionsButton(c)}${countersButton(c)}${refButton(c)}<button class="x" data-a="remove-column" title="Remove this column" aria-label="Remove this column">&#10005;</button></div>
    </div>`;
  return head + `<div class="c-unit f-${c.faction} ${side}${sticky}" data-col="${c.id}" ${at(2)}>${unitHtml(c, u)}</div>
    <div class="stats f-${c.faction} ${side}${sticky}" ${at(3)}>${stats.map(s => statHtml(s, u, max, ref, cellChanged(c, s))).join('')}</div>`;
}

// the unit selection at the right edge: a click on a unit adds a column
function chooserHtml() {
  const p = state.pick;
  if (!state.pickOpen) return `<div class="chooser collapsed"><button class="toggle-pick" data-a="pick-toggle" title="Show the unit selection">&#9664;</button></div>`;
  return `<div class="chooser f-${p.faction}">
    <div class="c-searchrow"><div class="c-search"><input class="search ${isCodeSearch(p.search) ? 'code' : ''}" data-input="pick-search" placeholder="Search Unit (all factions), or &lt;codename&gt;" value="${esc(p.search)}"><button class="clear" data-a="pick-clear" title="Clear the search">&#10005;</button></div><button class="toggle-pick" data-a="pick-toggle" title="Hide the unit selection (to the right)">&#9654;</button></div>
    <div class="c-factions">${FACTIONS.map(f => `<button data-a="pick-faction" data-v="${f.id}" class="f-${f.id} ${f.id === p.faction && !p.search ? 'active' : ''}">${f.name}</button>`).join('')}</div>
    <div class="c-cats">${CATEGORIES.map(k => `<button data-a="pick-category" data-v="${k.id}" class="${k.id === p.category && !p.search ? 'active' : ''}">${k.icon}${k.long}</button>`).join('')}</div>
    <div class="picker">${pickerHtml()}</div></div>`;
}

function pickerHtml() {
  const list = pickUnits();
  if (!list.length) return `<p class="empty">${state.versionsMode ? 'No unit with more than one version here.' : 'No units here.'}</p>`;
  return list.map(n => {
    const u = pickUnit(n), on = isShown(n);
    const versions = state.versionsMode ? versionsOf(n) : [];
    const what = (on ? 'is already in the comparison' : 'add a column') + (versions.length ? ` - ${versions.length} versions: ${versions.map(shortVersion).join(', ')}` : '');
    return `<button class="pick ${on ? 'chosen' : ''}" data-a="pick-add" data-v="${esc(n)}" title="${esc(u.name)}: ${esc(u.description)} - ${esc(what)}"><span class="tier t${u.tech}">T${u.tech}</span>${versions.length ? `<span class="pick-ver">${versions.length}</span>` : ''}${pictureTag(n, '', u)}${esc(u.name)}</button>`;
  }).join('');
}

// the button Versions at the top: only the units with at least 2 versions are listed (the catalog and the unit selection of the compare)
function versionsFilterButton(lead = false) {
  if (state.versions.length < 2) return '';
  return `${lead ? ' ' : ''}<button class="btn ${state.versionsMode ? 'go' : ''}" data-a="versions" title="Only show units that have at least 2 versions (they changed in some game version). Press again to show all units. A unit's own Versions button adds its newer versions as columns.">Versions</button>`;
}
// the button Versions of a column: the older versions of its unit as columns right of it, and the unit is the Ref; grey if the unit has no other version, or this is its newest
function versionsButton(c) {
  const more = missingVersions(c).length, any = hasVersions(c.unit), older = olderVersions(c).length;
  const tip = more ? 'Versions: add the older versions of this unit as columns right of it (newest first) and make this unit the reference: the older ones are coloured against it, the changed values are marked.'
    : older ? 'All older versions of this unit are shown already.' : any ? 'This is the oldest version of the unit: no older version to add.' : 'This unit has only one version (it did not change in any game version).';
  return `<button class="versions" data-a="col-versions" title="${tip}" ${more ? '' : 'disabled'}>Versions</button>`;
}
function countersButton(c) {
  const has = countersOf(c.unit).length > 0;
  const tip = has ? 'Counters: replace all other columns with the units that counter this unit (after the unit counter charts of beyondallreason.info).' : 'No counters are known for this unit (the counter charts list only some units).';
  return `<button class="counters" data-a="col-counters" title="${tip}" ${has ? '' : 'disabled'}>Counters</button>`;
}

// the units that counter this one (a scavenger unit like its normal unit)
const countersOf = unit => (state.counters[unit.replace(/_scav$/, '')] || []).filter(n => state.units[n]);

function counterpartsOf(unit) {
  const id = state.counterpartOf[unit];
  if (id === undefined) return [];
  const own = state.units[unit];
  if (!own) return [];   // a column of a unit that the version shown does not have
  return (state.counterpart[id] || []).filter(n => n !== unit && state.units[n] && (own.faction === 'scv' ? true : state.units[n].faction !== 'scv'));
}

function unitHtml(c, u) {
  const eq = c.scavOf ? [] : counterpartsOf(c.unit);
  const visual = visualIn(c.version || state.versionDir, c.unit);
  return `<div class="c-pic${visual ? ' visual' : ''}" ${visual ? `title="${VISUAL_TIP}"` : ''}>${pictureTag(c.unit, '', u)}</div>
    <div class="c-name">${esc(u.name)}</div>
    <div class="c-desc">${esc(u.description)}<span class="tier t${u.tech}">T${u.tech}</span></div>
    ${eq.length ? `<div class="c-eq"><button class="c-eq-all" data-a="add-counterparts" title="Add all counterparts of this unit as columns (the ones that are not in the comparison yet)">Counterparts:</button> ${eq.map(n => `<button class="f-${state.units[n].faction}" data-a="add-unit" data-v="${esc(n)}" title="Add a column with this unit (${factionName(state.units[n].faction)})">${esc(state.units[n].name)}</button>`).join('')}</div>` : ''}`;
}

// against the reference: worse is red, better green; as good is green too, in the version comparison it stays uncoloured (only what changed stands out)
function verdictOf(s, v, ref) {
  if (!ref) return '';
  if (ref.anchor && v === ref[s.key]) return '';
  return (s.lower ? v > ref[s.key] : v < ref[s.key]) ? ' diff-bad' : ' diff-good';
}

function statHtml(s, u, max, ref, changed) {
  const cls = `stat${changed ? ' changed' : ''}`, label = `<label${changed ? ' title="Changed against the older version"' : ''}>${s.label}</label>`;
  if (s.key === 'weapons') return `<div class="${cls}">${label}<div class="weapons">${esc(u.weapons.join(', '))}</div></div>`;
  const v = u[s.key];
  if (!v) return `<div class="${cls}">${label}<div></div></div>`;
  const share = max[s.key] ? 100 * v / max[s.key] : 0;
  return `<div class="${cls}">${label}<div class="bar"><div class="fill fill-${s.fill}${verdictOf(s, v, ref)}" style="width:${share.toFixed(1)}%"></div><span class="val">${s.show(v)}</span></div></div>`;
}

function toggleUnit(unit) {
  const at = state.columns.find(c => c.unit === unit && !c.version);
  if (at) state.columns = state.columns.filter(c => c !== at);
  else addUnit(unit);
}

// a unit is in the comparison once (also a Scavenger copy that "+ Scav" shows); a column with a version of its own does not count
const isShown = unit => state.columns.some(c => !c.version && (c.unit === unit || (state.scav && c.unit + '_scav' === unit)));
// undo / redo of the columns: every change of the set or the order of the columns first puts the old list on the stack
const undoStack = [], redoStack = [];
// the stack holds COPIES of the columns: a column can change (its game version), and the old state must stay as it was
const snapshot = () => state.columns.map(c => ({ ...c }));
function remember() { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
function step(from, to) {
  if (!from.length) return;
  const ref = refUnit();   // Ref is no step: it stays as it is
  to.push(snapshot());
  state.columns = from.pop().filter(c => unitOf(c));   // a unit that the game version chosen since then does not have
  for (const c of displayColumns()) c.ref = tokenOf(c) === ref;
  keepAddress(); render();
}

function addUnit(unit) { if (!isShown(unit)) state.columns.push(newColumn(unit)); }

// the button Versions of a column: every older version of its unit as a column right of it (the ones that are shown already are left out), and the column is the Ref
function addOlderVersions(c) {
  const more = missingVersions(c).map(d => newColumn(c.unit, d));
  if (!more.length) return false;
  remember();
  let after = state.columns.indexOf(c);   // behind the columns of this unit that follow it already
  while (state.columns[after + 1] && state.columns[after + 1].unit === c.unit) after++;
  state.columns.splice(after + 1, 0, ...more);
  for (const o of displayColumns()) o.ref = false;
  c.ref = true;   // the clicked unit is the reference: the older versions are coloured against it
  return true;
}

// ------------------------------------------------------------------ what the user does
// with "+ Scav" every column with a unit gets its Scavenger copy as a column right of it (made here, not kept in state.columns)
function displayColumns() {
  const list = state.columns.flatMap(c => {
    const units = unitsOf(c.version || state.versionDir);
    if (!state.scav || !units[c.unit + '_scav'] || state.columns.some(o => o.unit === c.unit + '_scav' && o.version === c.version)) return [c];
    const s = c.scavColumn = c.scavColumn || { id: nextColumn++, faction: 'scv', scavOf: c.id };
    s.unit = c.unit + '_scav';
    s.version = c.version;   // the Scavenger copy in the same game version
    return [c, s];
  });
  const at = list.findIndex(c => c.ref);   // the reference column is the first one and stays at the left edge when the columns are scrolled
  if (at > 0) list.unshift(...list.splice(at, 1));
  return list;
}
const columnOf = el => displayColumns().find(c => c.id === Number(el.closest('[data-col]').dataset.col));

const showLastColumn = () => { const s = app.querySelector('.cmp-scroll'); s.scrollLeft = s.scrollWidth; };   // the new column is at the right end

const actions = {
  view(v) { state.view = v; save('view', v); renderCatalog(); },
  tier(v) { const t = Number(v); if (state.tiers.has(t)) state.tiers.delete(t); else state.tiers.add(t); renderCatalog(); },
  toggle(v) {   // only the units: the search keeps its focus, the page its position; the card keeps the focus (keyboard)
    remember(); toggleUnit(v); renderCatalogUnits(); renderNav(); renderTray();
    const again = document.querySelector(`#units [data-v="${CSS.escape(v)}"]`);
    if (again) again.focus({ preventScroll: true });
  },
  'scroll-columns'(v) {   // by one column: its width and the gap between the columns
    const sc = app.querySelector('.cmp-scroll'), col = sc.querySelector('.c-head:not(.is-ref), thead th[data-col]:not(.is-ref)');
    const grid = sc.querySelector('.cmp-grid'), gap = grid ? parseFloat(getComputedStyle(grid).columnGap) || 0 : 0;
    sc.scrollBy({ left: Number(v) * (col ? col.getBoundingClientRect().width + gap : 420), behavior: 'smooth' });
  },
  'pick-toggle'() { state.pickOpen = !state.pickOpen; save('pickOpen', state.pickOpen ? 'yes' : 'no'); renderCompare(); },
  'clear-all'() { remember(); state.columns = []; keepAddress(); render(); },
  clear() { remember(); state.columns = []; render(); },
  'pick-faction'(v) { state.pick.faction = v; state.pick.search = ''; refreshChooser(); },
  'pick-category'(v) { state.pick.category = v; state.pick.search = ''; refreshChooser(); },
  'pick-clear'() { state.pick.search = ''; refreshChooser(); },
  'pick-add'(v) {   // the new column is at the right end: show it
    if (isShown(v)) return;
    remember(); addUnit(v);
    keepAddress(); renderCompare(); showLastColumn(); renderNav();
  },
  versions() { state.versionsMode = !state.versionsMode; keepAddress(); render(); },
  'col-versions'(v, el) { if (addOlderVersions(columnOf(el))) { keepAddress(); renderCompare(); renderNav(); } },
  'view-table'() { state.table = !state.table; save('table', state.table ? 'yes' : 'no'); keepAddress(); renderCompare(); },
  'fav-menu'() { state.favOpen = !state.favOpen; renderNav(); },
  'fav-save'() {
    const at = currentFavorite();
    if (at >= 0) state.favorites.splice(at, 1); else state.favorites.push(currentSetting());
    save('favorites', JSON.stringify(state.favorites)); renderNav(); renderCompare();
  },
  'fav-del'(v) { state.favorites.splice(Number(v), 1); save('favorites', JSON.stringify(state.favorites)); renderNav(); if (state.page === 'compare') renderCompare(); },
  'fav-load'(v) {
    remember();
    const f = state.favorites[Number(v)];
    state.columns = f.units.map(columnFromToken).filter(Boolean);
    state.scav = !!f.scav;
    for (const c of displayColumns()) c.ref = tokenOf(c) === f.ref;
    state.favOpen = false;
    if (location.hash === compareLink()) render(); else location.hash = compareLink();   // the address change shows the page
  },
  undo() { step(undoStack, redoStack); },
  redo() { step(redoStack, undoStack); },
  scav() { state.scav = !state.scav; keepAddress(); renderCompare(); },
  'col-counters'(v, el) { remember(); const c = columnOf(el); state.columns = [c, ...countersOf(c.unit).map(n => newColumn(n))]; keepAddress(); render(); },
  'col-ref'(v, el) { const c = columnOf(el), was = c.ref; for (const o of displayColumns()) o.ref = false; c.ref = !was; keepAddress(); renderCompare(); },
  'add-counterparts'(v, el) {
    remember();
    for (const n of counterpartsOf(columnOf(el).unit)) addUnit(n);
    keepAddress(); renderCompare(); renderNav(); showLastColumn();
  },
  'add-unit'(v) { remember(); addUnit(v); keepAddress(); render(); },
  'remove-column'(v, el) { remember(); const c = columnOf(el); state.columns = state.columns.filter(o => o !== c); keepAddress(); render(); },
};

// moving a column: drag the grip of its header, drop on another column (left half: before it, right half: after it)
let dragged = null;
const dropTarget = e => {
  const el = e.target.closest && e.target.closest('[data-col]');
  const c = el && displayColumns().find(o => o.id === Number(el.dataset.col));
  const real = c && (c.scavOf ? state.columns.find(o => o.id === c.scavOf) : c);
  if (!real || real === dragged) return null;
  const r = el.getBoundingClientRect();
  return { real, after: e.clientX > r.left + r.width / 2 };
};
const clearDrop = () => app.querySelectorAll('.drop-before, .drop-after').forEach(o => o.classList.remove('drop-before', 'drop-after'));
document.addEventListener('dragstart', e => {
  const grip = e.target.closest && e.target.closest('.grip');
  if (!grip) return;
  dragged = columnOf(grip);
  const head = grip.closest('[data-col]');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragged.unit);
  e.dataTransfer.setDragImage(head, 20, 20);
});
document.addEventListener('dragover', e => {
  if (!dragged) return;
  const t = dropTarget(e);
  clearDrop();
  if (!t) return;
  e.preventDefault();
  app.querySelectorAll(`[data-col="${t.real.id}"], [data-col="${t.real.scavColumn ? t.real.scavColumn.id : -1}"]`).forEach(o => o.classList.add(t.after ? 'drop-after' : 'drop-before'));
});
document.addEventListener('drop', e => {
  if (!dragged) return;
  const t = dropTarget(e);
  if (t) {
    e.preventDefault();
    const moved = state.columns.filter(o => o !== dragged);
    moved.splice(moved.indexOf(t.real) + (t.after ? 1 : 0), 0, dragged);
    if (moved.some((o, i) => o !== state.columns[i])) { remember(); state.columns = moved; keepAddress(); }   // dropped where it was: no step for Undo
    renderCompare();
  }
});
document.addEventListener('dragend', () => { dragged = null; clearDrop(); });

document.addEventListener('keydown', e => {
  if (state.page !== 'compare' || !(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); actions.undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); actions.redo(); }
});

// the keyboard: Enter / Space press a card or row of the catalog (they are no <button>), the arrow keys move a column whose grip has the focus, Escape closes the favorites
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.favOpen) { state.favOpen = false; renderNav(); document.querySelector('.fav-open').focus(); return; }
  const grip = e.target.closest && e.target.closest('.grip');
  if (grip && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    const c = columnOf(grip), at = state.columns.indexOf(c), to = at + (e.key === 'ArrowLeft' ? -1 : 1);
    if (at < 0 || to < 0 || to >= state.columns.length) return;
    remember();
    state.columns.splice(at, 1); state.columns.splice(to, 0, c);
    keepAddress(); renderCompare();
    const again = app.querySelector(`[data-col="${c.id}"] .grip`);
    if (again) again.focus();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-a]')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('click', e => {
  if (state.favOpen && !e.target.closest('.fav-wrap')) { state.favOpen = false; renderNav(); }
  const el = e.target.closest('[data-a]');
  if (el) actions[el.dataset.a](el.dataset.v, el);
});

document.addEventListener('input', e => {
  const kind = e.target.dataset.input;
  if (kind === 'catalog-search' || kind === 'pick-search') e.target.classList.toggle('code', isCodeSearch(e.target.value));
  if (kind === 'catalog-search') { state.search = e.target.value; renderCatalogUnits(); }
  if (kind === 'chg-search') { state.changes.search = e.target.value; e.target.classList.toggle('code', isCodeSearch(e.target.value)); document.getElementById('chg-body').innerHTML = changesListHtml(); }
  if (kind === 'pick-search') {   // only the list is made anew: the input keeps the focus
    state.pick.search = e.target.value;
    app.querySelector('.picker').innerHTML = pickerHtml();
    app.querySelector('.picker').scrollTop = 0;
    for (const b of app.querySelectorAll('.chooser .c-factions [data-v]')) b.classList.toggle('active', !state.pick.search && b.dataset.v === state.pick.faction);
    for (const b of app.querySelectorAll('.chooser .c-cats button')) b.classList.toggle('active', !state.pick.search && b.dataset.v === state.pick.category);
  }
});

document.addEventListener('change', async e => {
  const kind = e.target.dataset.change;
  if (kind === 'chg-from' || kind === 'chg-to') {   // another range: the address carries it
    const from = kind === 'chg-from' ? e.target.value : state.changesFrom, to = kind === 'chg-to' ? e.target.value : state.changesTo;
    location.hash = changesLink(to, indexOf(from) < indexOf(to) ? from : versionBefore(to));
  }
  if (kind === 'chg-faction' || kind === 'chg-key') { state.changes[kind === 'chg-faction' ? 'faction' : 'key'] = e.target.value; document.getElementById('chg-body').innerHTML = changesListHtml(); }
  if (kind === 'names') { state.showNames = e.target.checked; save('showNames', state.showNames ? 'yes' : 'no'); renderCatalogUnits(); }
  if (kind === 'version') {
    remember();
    selectVersion(e.target.value);
    state.columns = state.columns.filter(c => unitOf(c));   // a unit that this version does not have
    keepAddress(); render();
  }
  if (kind === 'col-version') {   // a column shows its unit in another game version
    const c = columnOf(e.target);
    remember();
    c.version = e.target.value;
    keepAddress(); renderCompare();
  }
});

window.addEventListener('resize', () => { if (state.page === 'compare') fitLayout(); });
start();
