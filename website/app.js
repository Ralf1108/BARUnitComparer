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
const ratio = v => v >= 100 ? whole(v) : v.toFixed(v >= 10 ? 1 : 2);   // a value per metal: small numbers with decimals
const STATS = [
  { key: 'metal', label: 'Metal', fill: 'metal', show: whole, lower: true, tip: 'Metal cost: what the unit costs to build. Lower is better.' },
  { key: 'energy', label: 'Energy', fill: 'energy', show: whole, lower: true, tip: 'Energy cost: what the unit costs to build. Lower is better.' },
  { key: 'buildTime', label: 'Build time', fill: 'time', show: clock, lower: true, tip: 'Build time in minutes:seconds with a build power of 100 (more or stronger builders are faster). Lower is better.' },
  { key: 'buildPower', label: 'Build power', fill: 'power', show: whole, tip: 'Build power: how fast the unit builds, repairs and reclaims.' },
  { key: 'energyMake', label: 'Energy income', fill: 'make', show: whole, tip: 'Energy the unit makes per second (its own upkeep taken off; wind and tidal generators as the game lists them).' },
  { key: 'hitpoints', label: 'Hitpoints', fill: 'hp', show: whole, tip: 'Hitpoints: how much damage the unit takes before it is destroyed.' },
  { key: 'radar', label: 'Radar range', fill: 'radar', show: whole, tip: 'Radar range, in the length unit of the game (elmos).' },
  { key: 'speed', label: 'Speed', fill: 'speed', show: v => String(Math.floor(v)), tip: 'Top speed of the unit.' },
  { key: 'weapons', label: 'Weapons', tip: 'The kinds of weapons the unit has.' },
  { key: 'shotDamage', label: 'Damage per shot', fill: 'dps', show: whole, tip: 'Damage of one shot of its weapons together, or of the weapon chosen above the unit (all projectiles of a salvo). Damage per shot times shots per second is the DPS.' },
  { key: 'shotsPerSecond', label: 'Shots per second', fill: 'dps', show: v => v >= 10 ? whole(v) : v.toFixed(2), tip: 'How often the unit fires per second (1 / the time to the next shot; with several weapons: the rate that gives their DPS together).' },
  { key: 'dps', label: 'DPS', fill: 'dps', show: whole, tip: 'Damage per second of its weapons together (or of the weapon chosen): damage per shot times shots per second. Left out of the total: D-gun, nukes, anti-nukes and EMP weapons, and the high trajectory of a cannon that switches between two (choose them above the unit).' },
  { key: 'airDps', label: 'DPS vs air', fill: 'dps', show: whole, tip: 'Damage per second against aircraft: only the weapons that can aim at them (no bombs, no torpedoes), with their damage to aircraft.' },
  { key: 'range', label: 'Weapon range', fill: 'range', show: whole, tip: 'Longest range of its weapons (or the range of the weapon chosen), in the length unit of the game (elmos).' },
  { key: 'aoe', label: 'Area of effect', fill: 'range', show: whole, tip: 'Radius of the explosion of a shot, in elmos: the largest of its weapons (or that of the weapon chosen). Small: the shot hits one target.' },
  // what a unit gives for its cost (worked out here, derive): not part of the page Changes
  { key: 'hpPerMetal', label: 'HP per metal', fill: 'hp', show: ratio, derived: true, tip: 'Hitpoints per metal: how much staying power the unit gives for its cost. Higher is better.' },
  { key: 'dpsPerMetal', label: 'DPS per metal', fill: 'dps', show: ratio, derived: true, tip: 'Damage per second per metal: how much firepower the unit gives for its cost. Higher is better.' },
];

const app = document.getElementById('app');
const state = {
  units: {}, counterpart: {}, versions: [], version: '', versionDir: '', baseDir: '', diffs: {}, merged: {}, versionsMode: false,
  changes: { faction: 'all', category: '', tiers: new Set(), key: '', search: '', scav: false }, page: 'catalog', faction: 'arm', category: 'bots', search: '', tiers: new Set(),
  view: load('view', 'grid'), showNames: load('showNames', 'yes') === 'yes',
  columns: [], scav: false, refPct: load('refMode', 'abs') === 'pct', table: load('table', 'no') === 'yes', pick: { faction: 'arm', category: 'bots', search: '', tiers: new Set(), weapon: '' }, pickOpen: load('pickOpen', 'yes') === 'yes',
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
const currentSetting = () => ({ units: state.columns.map(tokenOf), scav: state.scav, ref: refUnit(), pct: !!refUnit() && state.refPct });
const favKey = f => `${f.units.join(',')}|${f.scav ? 1 : 0}|${f.ref || ''}|${f.ref && f.pct ? 1 : 0}`;
const currentFavorite = () => state.favorites.findIndex(f => favKey(f) === favKey(currentSetting()));
// the link of a favorite (its units, + Scav and Ref, the view of now): a favorite is a real link, so the middle mouse button or Ctrl+click opens it in a new tab
function favLink(f) {
  const params = new URLSearchParams({ view: state.table ? 'table' : 'graphic' });
  if (f.scav) params.set('scav', '1');
  if (f.ref) params.set('ref', f.ref);
  if (f.ref && f.pct) params.set('diff', 'pct');
  return '#/compare/' + f.units.join(',') + '?' + params;
}

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
// the tools of a column are small icon buttons with a tooltip (drawn with lines: stroke, no fill)
const svgIcon = d => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const ICONS = {
  versions: svgIcon('M2.6 8a5.4 5.4 0 1 0 1.6-3.8M2.2 2.2v3h3M8 5v3.2l2.2 1.5'),           // a clock turning back: the other versions
  counters: svgIcon('M3 3l10 10M13 3L3 13M2 10.5l3.5 3.5M10.5 14l3.5-3.5'),               // crossed swords: the units that beat this one
  counterparts: svgIcon('M2 5.5h11.5l-3-3M14 10.5H2.5l3 3'),                              // arrows both ways: the same job in the other factions
  ref: svgIcon('M8 2v12M4.5 14h7M2.5 4.5h11M2.5 4.5L1 9h3zM13.5 4.5L12 9h3z'),           // a balance: the unit the others are weighed against
};
// the balance with the sign of the mode beside it, ± (the difference as it is) or % (in percent): the help page and the menu of a phone, as in the block of a column
const refBadge = pct => `<span class="ref-ico">${ICONS.ref}<i>${pct ? '%' : '±'}</i></span>`;
ICONS.menu = svgIcon('M3 8h.01M8 8h.01M13 8h.01');                                         // three dots: the menu of a column (phone)
ICONS.info = svgIcon('M8 7.2v4.3M8 4.6h.01M2 8a6 6 0 1 0 12 0A6 6 0 0 0 2 8z');           // i in a circle: all values of a unit
ICONS.undo = svgIcon('M5.5 3L2.5 6l3 3M2.5 6h7a4 4 0 0 1 0 8H7');                          // the toolbar of the compare: undo, redo,
ICONS.redo = svgIcon('M10.5 3l3 3-3 3M13.5 6h-7a4 4 0 0 0 0 8H9');
ICONS.graphic = svgIcon('M2 14h12M4 12V8M8 12V3M12 12V6');                                  // bars: the graphic view
ICONS.table = svgIcon('M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10');                            // a grid: the table view
ICONS.scav = svgIcon('M5.5 5.5h8v8h-8zM2.5 10.5v-8h8');                                    // two boxes: the Scavenger copy next to each unit
ICONS.filter = svgIcon('M2 3h12L9.5 8.3V13l-3-1.4V8.3z');                                   // a funnel: only the changed units
ICONS.star = svgIcon('M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z');  // a star: favorite
ICONS.trash = svgIcon('M2.5 4.5h11M6.3 4.5V2.8h3.4v1.7M4 4.5l.7 9h6.6l.7-9');             // a bin: remove all units
ICONS.share = svgIcon('M8 10V2M5 4.5l3-3 3 3M3.5 8v5.5h9V8');                            // an arrow out of a box: share the link
ICONS.export = svgIcon('M8 2v8M5 7l3 3 3-3M2.5 11v2.5h11V11');                           // an arrow down into a tray: export the values as a file
const toolButton = (kind, action, tip, on, enabled) => `<button class="tool ${kind}${on ? ' active' : ''}" data-a="${action}" title="${tip}" aria-label="${tip}" aria-pressed="${!!on}" ${enabled ? '' : 'disabled'}>${ICONS[kind]}</button>`;
const isNarrow = () => window.innerWidth <= 900;
const isPhone = () => window.innerWidth <= 600;   // a phone: the tools of a column are in a menu, the toolbar is one line
const gripHtml = () => isNarrow()
  ? '<button class="mv" data-a="move" data-v="-1" title="Move this column to the left" aria-label="Move this column to the left">&#8249;</button><button class="mv" data-a="move" data-v="1" title="Move this column to the right" aria-label="Move this column to the right">&#8250;</button>'
  : GRIP;
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
function derive(u) {
  u.hpPerMetal = u.metal && u.hitpoints ? u.hitpoints / u.metal : 0;
  u.dpsPerMetal = u.metal && u.dps ? u.dps / u.metal : 0;
}
async function loadVersions() {
  const listing = await loadJson('versions.json'), listed = listing.versions;
  const first = Math.max(0, listed.findIndex(v => v.base));
  state.versions = listed.slice(first);   // nothing older than the base
  state.baseDir = state.versions[0].dir;
  // the base file and, in ONE file (history.json.gz), the diff files of all later versions; without it (an older versions.json) one file per version
  const history = listing.history ? (await loadCompressedJson(listing.history)).diffs : null;
  const files = await Promise.all(state.versions.map((v, i) => history && i ? history[v.dir] : loadCompressedJson(`${v.dir}/data/${v.file}`)));
  for (const f of files) for (const u of Object.values(f.units)) derive(u);
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
// did the unit change in this version (against the version before)
const changedIn = (dir, unit) => !!(state.diffs[dir] && state.diffs[dir].units[unit]);
const versionsOf = unit => state.unitVersions[unit] || [];   // the versions of a unit (folders, oldest first)
const hasVersions = unit => versionsOf(unit).length > 1;   // there is another version of it
// the version in which the values a column shows were set: the newest version of the unit that is not newer than the version of the column (the page shows the newest
// game version, in which most units have not changed for a long time)
const stateVersion = c => versionsOf(c.unit).filter(d => indexOf(d) <= verOf(c)).pop();
// every other version of the unit than the one the column shows (older and newer), newest first
const otherVersions = c => { const own = stateVersion(c); return versionsOf(c.unit).filter(d => d !== own).reverse(); };
const missingVersions = c => otherVersions(c).filter(d => !state.columns.some(o => o.unit === c.unit && stateVersion(o) === d));   // ... and not shown yet
function selectVersion(dir) {
  state.versionDir = dir;
  state.units = unitsOf(dir);
  state.version = versionOf(dir).version;
}
// the options of the version list: oldest first, grouped by month ("March 2026 (5 versions)") as soon as there are many versions
function versionOptions(note, selected = state.versionDir, versions = state.versions) {
  const option = v => `<option value="${esc(v.dir)}" ${v.dir === selected ? 'selected' : ''}>${esc(versionLabel(v) + note(v))}</option>`;
  if (state.versions.length < 12) return versions.map(option).join('');
  const months = new Map();
  for (const v of versions) { const m = (v.date || '').slice(0, 7) || 'no date'; if (!months.has(m)) months.set(m, []); months.get(m).push(v); }
  const monthName = m => /^\d{4}-\d\d$/.test(m) ? `${MONTHS[m.slice(5) - 1]} ${m.slice(0, 4)}` : m;
  return [...months].map(([m, list]) => `<optgroup label="${esc(monthName(m))} (${list.length} version${list.length > 1 ? 's' : ''})">${list.map(option).join('')}</optgroup>`).join('');
}
// "test-31836-b250a16" of 2026-11-08 -> "8 Nov 2026 · test-31836" (the date is what a player knows; without a date only the name)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const niceDate = d => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d || ''); return m ? `${Number(m[3])} ${MONTHS[m[2] - 1].slice(0, 3)} ${m[1]}` : ''; };
const versionName = v => v.version.replace(/-[0-9a-f]{7,}$/, '');
const versionLabel = v => v.date ? `${niceDate(v.date)} · ${versionName(v)}` : versionName(v);

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
  state.menu = state.detail = null;
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [page, a, b] = path.split('/'), params = new URLSearchParams(query);
  if (page === 'help') state.page = 'help';
  else if (page === 'changes' && state.versions.length > 1) {
    state.page = 'changes';
    const last = state.versions[state.versions.length - 1].dir;
    state.changesTo = indexOf(a) > 0 ? a : last;   // not the base: there is no version before it
    state.changesFrom = versionOf(params.get('from')) ? params.get('from') : versionBefore(state.changesTo);
    if (indexOf(state.changesFrom) >= indexOf(state.changesTo)) state.changesFrom = versionBefore(state.changesTo);
  } else if (page === 'compare') {
    state.page = 'compare';
    // the game version at the top is not part of the link: a page loaded or a link opened starts with the newest version (an older one chosen stays while one
    // moves around in the page); a column can have a version of its own (<unit>@<version>). An old link with v= is read as without it
    const wanted = [...new Set((a || '').split(',').filter(t => columnFromToken(t)))];
    if (wanted.length && wanted.join() !== chosenUnits().join()) state.columns = wanted.map(columnFromToken);
    // the view of the link (an old link without these keeps the view of the browser, has no Ref and no + Scav)
    if (params.has('view')) state.table = params.get('view') === 'table';
    state.scav = params.get('scav') === '1';
    state.versionsMode = params.get('versions') === '1' && state.versions.length > 1;
    const ref = params.get('ref');
    for (const c of displayColumns()) c.ref = tokenOf(c) === ref;
    if (ref) state.refPct = params.get('diff') === 'pct';   // a link without a Ref keeps the mode chosen last
  } else {
    state.page = 'catalog';
    if (FACTIONS.some(f => f.id === a)) state.faction = a;
    if (CATEGORIES.some(c => c.id === b)) state.category = b;
  }
  render();
  countVisit(state.page);
}

// the visits, counted by GoatCounter (index.html; no cookies, nothing personal): once when the page is opened and once for each change to another page
// (catalog, compare, changes, help), not for each unit added or removed. GoatCounter itself counts nothing on localhost. Its script loads async: until it is
// there the page waits for its load event
let countedPage = null;
function countVisit(page) {
  if (page === countedPage) return;
  countedPage = page;
  const send = () => window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path: `${location.pathname}#/${page}`, title: page });
  if (window.goatcounter && window.goatcounter.count) send();
  else { const s = document.getElementById('goatcounter'); if (s) s.addEventListener('load', () => { if (countedPage === page) send(); }, { once: true }); }
}

// a column shows a unit in the chosen game version of the page (version null), or in a version of its own (version = the folder of that version);
// weapon: the id of one of its weapons (its values instead of those of all weapons together), null: all weapons
function newColumn(unit, version = null, weapon = null) {
  return { id: nextColumn++, unit, version, weapon, faction: unitsOf(version || state.versionDir)[unit].faction };
}
const unitOf = c => withWeapon(unitsOf(c.version || state.versionDir)[c.unit], c.weapon);
// the unit with the values of one weapon (weaponList of the data) in place of the totals; a weapon that this version of the unit does not have: the totals
const weaponCache = new WeakMap();
function withWeapon(u, id) {
  const w = id && u && (u.weaponList || []).find(x => x.id === id);
  if (!w) return u;
  let m = weaponCache.get(u);
  if (!m) weaponCache.set(u, m = {});
  return m[id] ||= { ...u, shotDamage: w.shotDamage, shotsPerSecond: w.shotsPerSecond, dps: w.dps, airDps: w.airDps, range: w.range, aoe: w.aoe, weapons: [w.type], dpsPerMetal: u.metal ? w.dps / u.metal : 0, weapon: w };
}
// the name of a weapon in the list: the game's name, its kind if the name is one word ("J7Laser (BeamLaser)"), how many are mounted, what the total leaves out;
// two weapons of the unit with the same name (a cannon with a high and a low trajectory: plasma, plasma_high) get their id in brackets
const KIND_NAMES = { dgun: 'D-gun', nuke: 'nuke', antinuke: 'anti-nuke', emp: 'EMP', high: 'high trajectory' };
const weaponLabel = (w, list = []) => `${w.n > 1 ? `${w.n}× ` : ''}${w.name}${/\s/.test(w.name) || !w.type ? '' : ` (${w.type})`}${list.some(o => o !== w && o.name === w.name) ? ` [${w.id}]` : ''}${w.kind ? ` · ${KIND_NAMES[w.kind]}` : ''}`;
// what the weapon shown aims at, as two icons right of the list (lit: yes, dim: no): units on the ground or the water, aircraft. All weapons: what the weapons
// of the totals reach together (targets of the data: air, ground, both)
const TARGET_ICONS = {
  ground: svgIcon('M1 13.5h14M3 13.5v-3h10v3M5 10.5V8h5.5l1 2.5M7.5 8V6.5h5'),   // a tank on the ground
  air: svgIcon('M8 1.5v13M2 9l6-3 6 3M5.5 14.5h5M8 1.5c.8.8 1 2 1 3.5'),       // an aircraft from above
};
function targetIcons(list, w) {
  const shown = w ? [w] : list.filter(x => !x.kind);
  const reach = k => shown.some(x => x.targets === k || x.targets === 'both');
  const one = (k, on, what) => `<span class="tg-i${on ? ' on' : ''}" title="${!list.length ? `No weapons: does not hit ${what}` : on ? `Hits ${what}` : `Does not hit ${what}`}${w || !list.length ? '' : ' (with its weapons together)'}" aria-label="${on ? 'hits' : 'does not hit'} ${what}">${TARGET_ICONS[k]}</span>`;
  // always both signs, also for a unit without weapons (then both dim)
  return `<span class="c-tg">${one('ground', reach('ground'), 'units on the ground and the water')}${one('air', reach('air'), 'aircraft')}</span>`;
}
// a column in the link and in a favorite: "armpw", "armpw@test-31450-6562fb1" with a version of its own, "corcom~corcomlaser" with one weapon
const tokenOf = c => `${c.unit}${c.version ? `@${c.version}` : ''}${c.weapon ? `~${c.weapon}` : ''}`;
function columnFromToken(t) {
  const [main, weapon = null] = t.split('~'), [unit, version = null] = main.split('@');
  if (version && !versionOf(version)) return null;
  return unitsOf(version || state.versionDir)[unit] ? newColumn(unit, version, weapon) : null;
}
const tokenUnit = t => t.split(/[@~]/)[0];

const chosenUnits = () => state.columns.map(tokenOf);
const newestDir = () => state.versions[state.versions.length - 1].dir;
// the link of the comparison carries the units and how they are shown, so that a shared link looks the same for the other one
function compareLink() {
  const params = new URLSearchParams({ view: state.table ? 'table' : 'graphic' });
  if (state.scav) params.set('scav', '1');
  if (refUnit()) params.set('ref', refUnit());
  if (refUnit() && state.refPct) params.set('diff', 'pct');   // the differences to the Ref in percent
  if (state.versionsMode) params.set('versions', '1');
  return '#/compare/' + chosenUnits().join(',') + '?' + params;
}
function keepAddress() { if (state.page === 'compare') history.replaceState(null, '', compareLink()); }

// ------------------------------------------------------------------ frame
function render() {
  document.querySelectorAll('.note-pop').forEach(o => o.remove());
  renderNav();
  if (state.page === 'compare') renderCompare(); else if (state.page === 'changes') renderChanges(); else if (state.page === 'help') renderHelp(); else renderCatalog();
  renderTray();
  renderOverlay();
}

function favPanelHtml() {
  if (!state.favOpen) return '';
  const items = state.favorites.map((f, i) => {
    const named = t => { const c = columnFromToken(t); return c && `${esc(unitOf(c).name)}${c.version ? ` <small>${esc(versionLabel(versionOf(c.version)).split(' · ')[0])}</small>` : ''}`; };
    const names = f.units.map(t => [t, named(t)]).filter(([, n]) => n).map(([t, n]) => `<span class="f-${columnFromToken(t).faction}">${n}</span>`);
    const ref = f.ref && named(f.ref);
    const extras = [f.scav ? '+ Scav' : '', ref ? `Ref${f.pct ? ' %' : ''} ${ref}${tokenUnit(f.ref).endsWith('_scav') ? ' (Scav)' : ''}` : ''].filter(Boolean);
    return names.length ? `<div class="fav-item"><a class="fav-load" href="${esc(favLink(f))}" data-a="fav-load" data-v="${i}" title="Load these units into the comparison (Undo brings the old selection back; middle mouse button or Ctrl+click: in a new tab)">${names.join(', ')}${extras.length ? ` <em class="fav-extra">${extras.join(' · ')}</em>` : ''}</a><button class="fav-del" data-a="fav-del" data-v="${i}" title="Remove this favorite" aria-label="Remove this favorite">&#10005;</button></div>` : '';
  }).join('');
  return `<div class="fav-panel">${items || '<p class="empty">No favorites yet: press the star on the Compare page.</p>'}</div>`;
}

// the pages in the header, each with an icon
const NAV_ICONS = {
  catalog: svgIcon('M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z'),                       // a grid of units
  compare: svgIcon('M2 14h12M4 12V6M8 12V3M12 12V8'),                                      // bars side by side
  changes: svgIcon('M2 5h10l-3-3M14 11H4l3 3'),                                            // old -> new
  help: svgIcon('M6 6a2 2 0 1 1 2.8 1.8C8.3 8 8 8.5 8 9v.8M8 12.2h.01M2 8a6 6 0 1 0 12 0A6 6 0 0 0 2 8z'),   // a question mark in a circle
};
function renderNav() {
  const link = (page, href, label, tip = '') => `<a href="${href}" class="${state.page === page ? 'active' : ''}"${tip ? ` title="${tip}"` : ''}>${NAV_ICONS[page]}<span>${label}</span></a>`;
  document.getElementById('nav-links').innerHTML = `${link('catalog', `#/catalog/${state.faction}/${state.category}`, 'Catalog', 'All units by faction and kind')}
    ${link('compare', compareLink(), 'Compare', 'Units side by side')}
    ${state.versions.length > 1 ? link('changes', '#/changes', 'Changes', 'What changed in the game: the units that changed between two game versions') : ''}
    <span class="fav-wrap"><button class="fav-open ${state.favOpen ? 'active' : ''}" data-a="fav-menu" title="The saved selections of units">&#9733;<span class="fav-word"> Favorites</span></button>${favPanelHtml()}</span>`;
  document.getElementById('nav-help').innerHTML = link('help', '#/help', 'Help', 'How this page works, in a few lines');   // at the right end of the header, right of GitHub
  const note = v => v.base ? ' (base)' : v.changed !== undefined ? ` (${v.changed} changed)` : '';
  // the version list belongs to the catalog and the compare; the page Changes has its own two lists
  document.getElementById('version').innerHTML = state.page === 'changes' || state.page === 'help' ? '' : state.versions.length > 1
    ? `<span class="v-label">Game version</span> <select data-change="version" class="${state.versionDir === newestDir() ? '' : 'old'}" title="${state.versionDir === newestDir() ? '' : 'An OLDER game version is shown (gold): the values are those of that time. Loading the page again shows the newest one. '}"The game version of the catalog and of the columns that have no version of their own; base: the first version, every later one lists only what changed against the one before (n changed: units)">${versionOptions(note)}</select>`
    : `<span class="v-label">Game version</span> ${esc(versionLabel(versionOf(state.versionDir)))}`;
}

// ------------------------------------------------------------------ catalog
// the choice of units looks the same on every page (the catalog, the unit selection of the compare, Changes): the factions and the tech levels in one line,
// the kinds of units (with their icons) in the next. o: faction, category, tiers (a Set), factions and cats (with n: a number shown behind the name),
// allFactions / allCats (the name of an entry for all), act (the buttons are <act>-faction, <act>-category), tier (the action of a tech level),
// href(kind, value) (the catalog: links instead of buttons), small (the unit selection of the compare)
const ALL_KINDS = shape('M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z');
function filterHtml(o) {
  const num = n => n === undefined ? '' : ` <small>${n}</small>`;
  const el = (kind, v, cls, on, inner) => {
    const href = o.href && o.href(kind, v), c = `${cls}${on ? ' active' : ''}`;
    return href ? `<a class="${c}" href="${href}">${inner}</a>` : `<button class="${c}" data-a="${o.act}-${kind}" data-v="${v}">${inner}</button>`;
  };
  return `<div class="filt${o.small ? ' small' : ''}">
    <div class="filt-row"><div class="filt-fac">${o.allFactions ? el('faction', 'all', 'f-none', o.faction === 'all', o.allFactions) : ''}${o.factions.map(f => el('faction', f.id, `f-${f.id}${f.n === 0 ? ' zero' : ''}`, f.id === o.faction, f.name + num(f.n))).join('')}</div>
      <span class="seg small" title="Tech levels: only the units of the levels that are pressed (none pressed: all)">${[1, 2, 3].map(n => `<button data-a="${o.tier}" data-v="${n}" class="${o.tiers.has(n) ? 'active' : ''}">T${n}</button>`).join('')}</span></div>
    <div class="tabs">${o.allCats ? el('category', '', '', !o.category, `${ALL_KINDS}<span>${o.allCats}</span>`) : ''}${o.cats.map(k => el('category', k.id, '', k.id === o.category, `${k.icon}<span>${k.long}${num(k.n)}</span>`)).join('')}</div></div>`;
}

function catalogUnits() {
  const search = state.search.trim().toLowerCase();
  return Object.keys(state.units).filter(n => {
    const u = state.units[n];
    if (u.faction !== state.faction || (state.tiers.size && !state.tiers.has(u.tech))) return false;
    if (state.versionsMode && !hasVersions(n)) return false;   // the button Versions: only units with at least 2 versions
    return search ? matchUnit(n, u, search) : u.category === state.category;
  }).sort((a, b) => isInternal(a) - isInternal(b) || byTech(state.units[a], state.units[b]));
}
// does the faction have a unit of this category in the version shown (a category without units is not offered)
const hasUnits = (faction, category) => Object.values(state.units).some(u => u.faction === faction && u.category === category);
// a unit the game has no name for (its name is its code name): test and helper units, listed last
const isInternal = n => state.units[n].name === n;

function renderCatalog() {
  const f = state.faction, cat = CATEGORIES.find(c => c.id === state.category);
  document.title = `${factionName(f)} ${cat.name} - BAR Unit Comparer`;
  app.innerHTML = `<div class="f-${f}">
    <div class="title"><b>${factionName(f)}</b><h1>${cat.name}</h1></div>
    ${filterHtml({ faction: f, category: state.category, tiers: state.tiers, factions: FACTIONS, cats: CATEGORIES.filter(c => c.id === state.category || hasUnits(f, c.id)), tier: 'tier',
      href: (kind, v) => kind === 'faction' ? `#/catalog/${v}/${state.category}` : `#/catalog/${f}/${v}` })}
    ${load('intro', 'yes') === 'yes' ? `<p class="intro"><span><b>New here?</b> Click the units you want to compare, then press <b>Compare</b> at the bottom of the page. Hold a unit (or right-click it) to see its values.${state.versions.length > 1 ? '<br>What a patch changed: <a href="#/changes">Changes</a>' : ''}<br><a href="#/help">How it works</a></span><button data-a="intro-close" title="Hide this line" aria-label="Hide this line">&#10005;</button></p>` : ''}
    <div class="controls">
      <span class="seg"><button data-a="view" data-v="list" class="${state.view === 'list' ? 'active' : ''}"><svg viewBox="0 0 26 20"><path d="M0 1h5v4H0zM8 1h18v4H8zM0 8h5v4H0zM8 8h18v4H8zM0 15h5v4H0zM8 15h18v4H8z"/></svg>List</button><button data-a="view" data-v="grid" class="${state.view === 'grid' ? 'active' : ''}"><svg viewBox="0 0 26 20"><path d="M0 1h5v4H0zM7 1h5v4H7zM14 1h5v4h-5zM21 1h5v4h-5zM0 8h5v4H0zM7 8h5v4H7zM14 8h5v4h-5zM21 8h5v4h-5zM0 15h5v4H0zM7 15h5v4H7zM14 15h5v4h-5zM21 15h5v4h-5z"/></svg>Grid</button></span>
      <label class="toggle"><input type="checkbox" data-change="names" ${state.showNames ? 'checked' : ''}><i></i>Show names</label>
      ${versionsFilterButton()}
      <input class="search ${isCodeSearch(state.search) ? 'code' : ''}" data-input="catalog-search" placeholder="Search unit, or &lt;codename&gt;" value="${esc(state.search)}">
    </div>
    <div id="units"></div></div>`;
  renderCatalogUnits();
}

function renderCatalogUnits() {
  const list = catalogUnits(), chosen = new Set(chosenUnits());
  const box = document.getElementById('units');
  const names = {};
  for (const n of list) names[state.units[n].name] = (names[state.units[n].name] || 0) + 1;
  // under the name: the description; a unit without a name says so; two units with the same name also show their code names
  const descOf = n => isInternal(n) ? 'Internal unit (the game has no name for it)' : state.units[n].description;
  const codeOf = n => names[state.units[n].name] > 1 && !isInternal(n) ? `<small class="code">${esc(n)}</small>` : '';
  if (!list.length) { box.innerHTML = '<p class="empty">No units here.</p>'; return; }
  if (state.view === 'list') {
    box.innerHTML = `<div class="list"><div class="row head"><span>Tech</span><span></span><span></span><span>Name</span><span class="opt">Description</span><span class="num opt">Metal</span><span class="num opt">Energy</span><span class="num opt">Hitpoints</span><span class="num">DPS</span></div>${list.map(n => {
      const u = state.units[n];
      return `<div class="row ${chosen.has(n) ? 'selected' : ''}" data-a="toggle" data-v="${esc(n)}" ${pressable(chosen.has(n))} title="${chosen.has(n) ? 'In the comparison: press to take it out' : 'Add to the comparison'}"><span class="tier t${u.tech}">T${u.tech}</span>${iconTag(u) || '<span></span>'}${pictureTag(n)}
        <span>${esc(u.name)} ${codeOf(n)} ${changedTag(n)}</span><span class="desc">${esc(descOf(n))}</span><span class="num opt">${whole(u.metal)}</span><span class="num opt">${whole(u.energy)}</span><span class="num opt">${whole(u.hitpoints)}</span><span class="num">${u.dps ? whole(u.dps) : ''}</span></div>`;
    }).join('')}</div>`;
    return;
  }
  box.innerHTML = `<div class="grid ${state.showNames ? '' : 'hide-names'}">${list.map(n => {
    const u = state.units[n], on = chosen.has(n);
    return `<div class="card ${on ? 'selected' : ''}" data-a="toggle" data-v="${esc(n)}" ${pressable(on)} title="${esc(u.name)}: ${on ? 'in the comparison, press to take it out' : 'add to the comparison'}"><span class="tier t${u.tech}">T${u.tech}</span>${iconTag(u)}${on ? '<span class="check">&#10003;</span>' : ''}${pictureTag(n)}
      ${changedTag(n)}<div class="name">${esc(u.name)}</div><div class="desc">${esc(descOf(n))}${codeOf(n)}</div></div>`;
  }).join('')}</div>`;
}
// a unit that changed in the version shown (against the version before)
const changedTag = n => changedIn(state.versionDir, n) ? `<span class="chg" title="A value of this unit changed in this game version (against the version before, ${esc(shortVersion(versionBefore(state.versionDir)))})">changed</span>` : '';

function renderTray() {
  const units = chosenUnits(), tray = document.getElementById('tray');
  if (state.page !== 'catalog' || !units.length) { tray.innerHTML = ''; return; }
  tray.innerHTML = `<div class="tray"><div class="thumbs">${state.columns.slice(-12).map(c => pictureTag(c.unit, '', unitOf(c))).join('')}</div>
    <span>${units.length} unit${units.length > 1 ? 's' : ''}</span><button class="btn" data-a="clear">Clear</button><a class="btn go" href="${compareLink()}">Compare</a></div>`;
}

// ------------------------------------------------------------------ changes: what changed between two game versions (the version compare)
// the values that are compared (the numbers as they are, the weapons as text) and what else can change
const CHANGE_KEYS = [...STATS.filter(s => !s.derived), { key: 'tech', label: 'Tech' }, { key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }];
const rawOf = (u, key) => key === 'weapons' ? (u.weapons || []).join(', ') : u[key];
// a field of the list: a value of the unit, or (val) one of a weapon
const fieldOf = (u, s) => s.val ? s.val(u) : rawOf(u, s.key);
const shownOf = (u, s) => { const v = fieldOf(u, s), f = STATS.find(o => o.key === s.key); return v === undefined || v === '' ? '–' : s.key === 'weapons' ? String(v) : f && f.show ? f.show(v) : String(v); };
// the values of each weapon that changed (a unit with more than one weapon; with one weapon its values are the totals already), and the weapons that came or went
const WEAPON_KEYS = ['shotDamage', 'shotsPerSecond', 'dps', 'airDps', 'range', 'aoe'];
function weaponFields(a, b) {
  const A = a.weaponList || [], B = b.weaponList || [];
  if (A.length < 2 && B.length < 2) return [];
  const out = [], find = (u, id) => (u.weaponList || []).find(w => w.id === id);
  for (const id of new Set([...A, ...B].map(w => w.id))) {
    const wa = find(a, id), wb = find(b, id), name = weaponLabel(wb || wa, wb ? B : A);
    if (!wa || !wb) { out.push({ key: 'weapons', label: `Weapon ${wa ? 'removed' : 'added'}`, val: u => find(u, id) ? name : undefined }); continue; }
    for (const k of WEAPON_KEYS) if (wa[k] !== wb[k]) { const s = STATS.find(o => o.key === k); out.push({ ...s, label: `${name}: ${s.label}`, val: u => (find(u, id) || {})[k] }); }
  }
  return out;
}
// every unit that differs between two versions of the chain: new, gone, or changed (values listed, picture); a unit that changed twice shows the total
function rangeChanges(from, to) {
  const A = unitsOf(from), B = unitsOf(to), out = [];
  for (const n of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const a = A[n], b = B[n];
    if (!a) out.push({ unit: n, kind: 'new', u: b, fields: [] });
    else if (!b) out.push({ unit: n, kind: 'gone', u: a, fields: [] });
    else {
      const fields = [...CHANGE_KEYS.filter(s => rawOf(a, s.key) !== rawOf(b, s.key)), ...weaponFields(a, b)];
      if (fields.length || a.pic !== b.pic) out.push({ unit: n, kind: 'changed', u: b, a, fields, picture: a.pic !== b.pic });
    }
  }
  const order = { changed: 0, new: 1, gone: 2 };
  return out.sort((x, y) => order[x.kind] - order[y.kind] || byTech(x.u, y.u));
}
const changesLink = (to, from) => `#/changes/${to}?from=${from}`;
function changeRow(c, from, to) {
  const tokens = c.kind === 'new' ? [`${c.unit}@${to}`] : c.kind === 'gone' ? [`${c.unit}@${from}`] : [`${c.unit}@${from}`, `${c.unit}@${to}`];
  // a number that got better for the unit is green, one that got worse red (cost and build time: lower is better)
  const verdict = s => { const a = fieldOf(c.a, s), b = fieldOf(c.u, s); return !s.fill || typeof a !== 'number' || typeof b !== 'number' || a === b ? '' : (s.lower ? b < a : b > a) ? 'good' : 'bad'; };
  const pills = c.fields.map(s => `<span class="pill${s.val ? ' w' : ''}" title="${esc(s.label)}: ${esc(shownOf(c.a, s))} → ${esc(shownOf(c.u, s))}${verdict(s) ? ` (${verdict(s) === 'good' ? 'better' : 'worse'} for the unit)` : ''}">${esc(s.label)} <s>${esc(shownOf(c.a, s))}</s> → <b class="${verdict(s)}">${esc(shownOf(c.u, s))}</b></span>`);
  if (c.picture) pills.push('<span class="pill" title="The picture changed">Picture</span>');
  return `<a class="chg-row f-${esc(c.u.faction)}" href="#/compare/${tokens.map(esc).join(',')}?view=graphic" title="Open in the unit compare: ${c.kind === 'changed' ? 'the version before and the changed version side by side' : 'the unit in this version'}">
    ${pictureTag(c.unit, 'pic', c.u)}<span class="chg-main"><span class="chg-name"><b>${esc(c.u.name)}</b><small>${esc(c.unit)}</small>${c.kind === 'changed' ? '' : `<span class="chg-kind k-${c.kind}">${c.kind === 'new' ? 'new unit' : 'removed'}</span>`}</span><span class="pills">${pills.join('') || (c.kind === 'changed' ? '<span class="pill muted">a value that is not listed here</span>' : '')}</span></span></a>`;
}
// the units of one row: a unit and its counterparts in the other factions (a Scavenger copy belongs to the row of its unit)
const changeGroup = c => { const n = c.unit.replace(/_scav$/, ''), id = state.counterpartOf[n]; return id === undefined ? n : `#${id}`; };
function changesListHtml() {
  const ch = state.changes, { faction, key, search } = ch, q = search.trim().toLowerCase();
  const all = rangeChanges(state.changesFrom, state.changesTo), kinds = Object.fromEntries(all.map(c => [c.unit, c.kind]));
  // a Scavenger copy changes with its unit: it is left out while its unit is in the list (the switch "Scavenger copies" or the faction Scavengers shows them)
  const isCopy = c => !ch.scav && faction !== 'scv' && c.unit.endsWith('_scav') && kinds[c.unit.slice(0, -5)] === c.kind;
  const other = c => (!key || c.fields.some(s => s.key === key)) && (!q || matchUnit(c.unit, c.u, q));   // the filters that are not buttons
  const inFaction = c => faction === 'all' || c.u.faction === faction, inTier = c => !ch.tiers.size || ch.tiers.has(c.u.tech), inCategory = c => !ch.category || c.u.category === ch.category;
  const match = c => other(c) && inFaction(c) && inTier(c) && inCategory(c);
  const byName = (x, y) => x.u.name.localeCompare(y.u.name) || x.unit.localeCompare(y.unit);
  const list = all.filter(c => match(c) && !isCopy(c)).sort(byName), copies = all.filter(c => match(c) && isCopy(c)).length;
  const count = kind => list.filter(c => c.kind === kind).length;
  const range = state.versions.slice(indexOf(state.changesFrom) + 1, indexOf(state.changesTo) + 1);
  const engine = range.flatMap(v => Object.keys(v.engineOnly || {}).map(n => `${n} (${shortVersion(v.dir)}: ${v.engine || 'other engine'})`));
  // the buttons: a faction, a kind of unit, the tech levels; each with the number of units it would show (with the other filters as they are)
  const pool = all.filter(c => other(c) && !isCopy(c));
  const num = n => `<small>${n}</small>`;
  const inFilters = c => other(c) && inTier(c) && inCategory(c);   // Scavengers: chosen as the faction, the copies are listed
  const filters = `<div class="f-${faction === 'all' ? 'none' : faction}">${filterHtml({ faction, category: ch.category, tiers: ch.tiers, act: 'chg', tier: 'chg-tier', allFactions: 'All factions', allCats: 'All kinds',
    factions: FACTIONS.map(f => ({ ...f, n: (f.id === 'scv' ? all.filter(inFilters) : pool.filter(c => inTier(c) && inCategory(c))).filter(c => c.u.faction === f.id).length })),
    cats: CATEGORIES.filter(k => k.id === ch.category || pool.some(c => c.u.category === k.id && inFaction(c) && inTier(c))).map(k => ({ ...k, n: pool.filter(c => c.u.category === k.id && inFaction(c) && inTier(c)).length })) })}</div>`;
  // one column per faction; a unit and its counterparts stand in one row, so that a change made to the same unit of several factions is seen at once.
  // The rows by name, from the left: first the rows with a unit in the first column (Armada), by its name; then the ones that start in the second column, and so on
  const cols = FACTIONS.filter(f => list.some(c => c.u.faction === f.id));
  let body;
  if (cols.length < 2) body = `<div class="chg-list">${list.map(c => changeRow(c, state.changesFrom, state.changesTo)).join('') || '<p class="empty">Nothing changed here.</p>'}</div>`;
  else {
    const rows = new Map();
    for (const c of list) { const g = changeGroup(c); if (!rows.has(g)) rows.set(g, {}); (rows.get(g)[c.u.faction] ||= []).push(c); }
    const lead = r => { const i = cols.findIndex(f => r[f.id]); return [i, r[cols[i].id][0]]; };
    const sorted = [...rows.values()].sort((x, y) => { const [i, a] = lead(x), [j, b] = lead(y); return i - j || byName(a, b); });
    body = `<div class="chg-grid" style="--n:${cols.length}">${cols.map(f => `<div class="chg-head f-${f.id}">${f.name} ${num(list.filter(c => c.u.faction === f.id).length)}</div>`).join('')}
      ${sorted.map(r => cols.map(f => `<div class="chg-cell">${(r[f.id] || []).map(c => changeRow(c, state.changesFrom, state.changesTo)).join('')}</div>`).join('')).join('')}</div>`;
  }
  return `${filters}<p class="chg-sum"><b>${count('changed')}</b> changed · <b>${count('new')}</b> new · <b>${count('gone')}</b> gone, in ${range.length} version${range.length === 1 ? '' : 's'} with changes${copies ? ` · <span title="A Scavenger copy changes with its unit. Switch on Scavenger copies to list them.">${copies} Scavenger cop${copies === 1 ? 'y' : 'ies'} not listed</span>` : ''}</p>
    ${engine.length ? `<p class="chg-note" title="Values that differ only because the engine of the game was changed: not a change of the game, not listed above">Engine only, not a change of the game: ${esc(engine.join(', '))}</p>` : ''}
    ${body}`;
}
function renderChanges() {
  document.title = 'Changes - BAR Unit Comparer';
  const c = state.changes;
  const select = (kind, label, options) => `<label>${label} <select data-change="${kind}">${options}</select></label>`;
  app.innerHTML = `<div class="changes"><div class="title"><h1>Changes</h1></div>
    <p class="chg-intro">What changed in the game between two versions. Choose <b>From</b> and <b>To</b>: the list shows every unit whose values differ, one column per faction, a unit and its counterparts in the other factions in one row, as <s>old</s> → <b>new</b> (<b class="good">green</b>: better for the unit, <b class="bad">red</b>: worse). A click on a unit opens both versions side by side.</p>
    <div class="controls">${(() => {   // one step older or newer: From and To both move by one version (quick to click through the patches)
      const i = indexOf(state.changesFrom), j = indexOf(state.changesTo), last = state.versions.length - 1;
      return `<span class="tb-group chg-step"><button class="btn" data-a="chg-step" data-v="-1" title="One version older: From and To one step back" aria-label="One version older" ${i > 0 ? '' : 'disabled'}>&#9664;<span class="lb">Older</span></button><button class="btn" data-a="chg-step" data-v="1" title="One version newer: From and To one step on" aria-label="One version newer" ${j < last ? '' : 'disabled'}><span class="lb">Newer</span>&#9654;</button></span>`;
    })()}${select('chg-from', 'From', versionOptions(v => v.base ? ' (base)' : '', state.changesFrom, state.versions.slice(0, -1)))}${select('chg-to', 'To', versionOptions(v => ` (${v.changed} changed)`, state.changesTo, state.versions.slice(1)))}
      <label>Value <select data-change="chg-key"><option value="">Any</option>${CHANGE_KEYS.map(s => `<option value="${s.key}" ${c.key === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
      <label class="toggle small" title="Every unit has a Scavenger copy that changes with it: off, the copies are left out of the list"><input type="checkbox" data-change="chg-scav" ${c.scav ? 'checked' : ''}><i></i>Scavenger copies</label>
      <input class="search" data-input="chg-search" placeholder="Search unit, or &lt;codename&gt;" value="${esc(c.search)}"></div>
    <div id="chg-body">${changesListHtml()}</div></div>`;
}

// ------------------------------------------------------------------ help: the page in a few lines
function renderHelp() {
  document.title = 'Help - BAR Unit Comparer';
  const item = (name, text) => `<li><b>${name}</b><span>${text}</span></li>`;
  app.innerHTML = `<div class="help"><div class="title"><h1>Help</h1></div>
    <p class="lead">This page shows the units of <a href="https://www.beyondallreason.info/">Beyond All Reason</a> with their values and lets you put any of them side by side. It is a fan project; the data comes from the game itself.</p>
    <h2>The three pages</h2>
    <ol class="steps"><li><b>Catalog:</b> all units of a faction with their pictures. Click the units you want; they are collected at the bottom of the page.</li>
      <li><b>Compare:</b> press <b>Compare</b>. Every unit is a column; each bar is drawn against the largest value in its row. The address of the page holds your comparison: copy it (<b>Share</b>) or press the star to keep it under Favorites.</li>
      <li><b>Changes:</b> what a patch of the game changed: every unit whose values differ between two game versions, old value → new value.</li></ol>
    <p><a class="btn go" href="#/catalog">Open the catalog</a> <a class="btn" href="#/compare">Open the compare</a>${state.versions.length > 1 ? ' <a class="btn" href="#/changes">Open Changes</a>' : ''}</p>
    <h2>Choosing units (the same on every page)</h2>
    <ul>${item('Armada, Cortex, ...', 'the faction. Scavengers and Raptors are the computer enemies.')}
      ${item('T1 T2 T3', 'the tech levels: press one or more to see only these units, press again to switch it off. None pressed: all levels.')}
      ${item('Bots, Vehicles, ...', 'the kind of unit (the line with the icons): bots, vehicles, aircraft, ships, factories, defenses, buildings.')}
      ${item('Search', 'looks in all factions and kinds; see Search at the end of this page.')}</ul>
    <h2>The catalog</h2>
    <ul>${item('Click a unit', 'marks it for the comparison (again: takes it out). The marked units are shown in a bar at the bottom, with the button <b>Compare</b>.')}
      ${item(`${ICONS.info} Hold or right-click`, 'a unit: shows all its values, its counterparts and its counters without adding it to the comparison (also in the unit selection of the compare).')}
      ${item('List / Grid', 'pictures in a grid, or a list with the most important values in columns.')}
      ${item('Show names', 'the names under the pictures of the grid; off, the grid shows the pictures only (the name is in the tooltip).')}
      ${item('Changed units only', '(in the catalog and in the unit selection of the compare) lists only the units that changed in some game version.')}
      ${item('changed', '(a tag on a unit) a value of this unit changed in the game version shown.')}
      ${item('Ctrl+Z', 'takes back the last click (Ctrl+Y: repeats it).')}</ul>
    <h2>The compare</h2>
    <ul>${[
      [`${ICONS.ref} Ref`, 'the block of a column: the balance, <b>±</b> and <b>%</b>. <b>±</b> makes a unit the reference: the values of all other units turn green (better) or red (worse); equal values are greyed out, so you see at once where they differ. The other units show the difference to the reference instead of the value: <b>+</b> more, <b>&minus;</b> less, ±0 equal (green or red says whether that is better or worse: 86 metal more is +86 in red); the value itself stands small at the other end of the bar. The values of the reference itself are yellow. The column stays where it is; scrolled to the left edge, it stays in view as a narrow strip of its values.'],
      [`${ICONS.ref} Ref %`, 'the same, but the differences are in percent of the value of the reference: 86 metal more than 54 is +159%. Press the other half to switch between ± and %; the lit one pressed again switches the reference off. The balance itself takes the mode chosen last (at first ±), or switches the reference off.'],
      [`${ICONS.counterparts} Counterparts`, 'adds the units of the other factions that do the same job (also under the picture: a click adds one).'],
      [`${ICONS.counters} Counters`, 'replaces the other columns with the units that are good against this unit (from the counter charts of beyondallreason.info).'],
      ['+ Scav', 'shows the Scavenger copy of every unit next to it. Scavengers are the computer enemies; their units are a bit stronger.'],
      [`${ICONS.versions} Versions`, '(on a unit) adds all other versions of this unit as columns, so you see what the balance changes did; the gold number on the icon says how many versions the unit has (&gt; for more than 9), a unit with only one is grey. The values that changed are marked in gold.'],
      ['The list of versions', '(above the icons; on a phone in the menu of the column) the versions of this unit: the first one and each one in which its values changed. White: the unit has several versions to choose from; grey: only one. The clock right of it adds all other versions as columns.'],
      ['The list of weapons', '(below the version) a unit with one weapon shows its name, grey: there is nothing to choose. With more than one weapon the list is white: <b>All weapons</b> shows the values of its weapons together, as before; two icons right of the list say what it hits: units on the ground and the water (a tank) and aircraft (a plane), green and blue for yes, dim for no; choose one weapon to see its own damage per shot, shots per second, DPS, DPS vs air, range and area of effect, for example the laser of a commander against the laser of another one. D-gun, nukes, anti-nukes and EMP weapons are not part of All weapons, nor the high trajectory of a cannon that can switch between a high and a low one (only one of them fires): choose them to see their values. A chosen weapon is gold; it is part of the link.'],
      ['Press again', 'a lit icon (Versions, Counters, Counterparts) takes out the columns it added and brings back the ones it put aside.'],
      ['Select units', '(at the right; on a phone: <b>+ Add units</b>) a click on a unit adds it as a column. <b>Hide</b> folds the selection away to a strip at the right edge, for more room; a click on the strip brings it back. The list <b>Any weapon</b> next to Changed units only holds every weapon of the game, alphabetical, with the number of units that have it: choose one to see only the units with this weapon, of all factions and kinds.'],
      ['Table view', 'the same values as a compact table.'],
      ['&#9734;', 'saves the selection as a favorite (in your browser), with + Scav and the Ref. Under Favorites a click loads it; the middle mouse button or Ctrl+click opens it in a new tab.'],
      ['Undo / Redo', 'take back or repeat a change of the columns or of the game version (Ctrl+Z, Ctrl+Y; also in the catalog). The number on them: how many steps there are.'],
      ['Clear', '(right of Undo and Redo) starts again: removes all units and the Undo and Redo steps. It asks first.'],
      [`${ICONS.share} Share`, 'copies the link of the comparison, to send it to someone (on a phone: opens the share menu).'],
      [`${ICONS.export} Export`, 'saves the units shown with their values as a file, CSV or Excel (.xlsx): one row per value, one column per unit, numbers as numbers (with a Ref also the differences to it), to work with them in a spreadsheet.'],
      ['The name of a value', 'click it (Metal, Hitpoints, ...) to sort the columns by this value, the best first; again: the worst first.'],
      ['&#8942;&#8942;', 'drag it to move a column (on a phone: Move left / Move right in the menu of the column).'],
      ['&#8249; &#8250;', '(at the edges) more columns are hidden there: a click scrolls to the next one.'],
    ].map(([n, text]) => item(n, text)).join('')}</ul>
    <h2>On a phone</h2>
    <ul>${item('+ Add units', '(bottom right of the compare) opens the unit selection from the bottom; <b>Done</b> closes it.')}
      ${item('Swipe', 'sideways to see more columns: two units fit on the screen.')}
      ${item(`${ICONS.menu} Menu`, '(the three dots above a unit) everything that can be done with this unit, each entry with a line that says what happens: all values, versions, counterparts, counters, move, the game version, remove. The balance next to it is Ref.')}
      ${item('Hold a unit', 'in the catalog or the unit selection: shows all its values.')}
      ${item('Scrolled down', 'a line at the top of the screen keeps the names of the units above their values.')}</ul>
    <h2>The values</h2>
    <ul>${STATS.map(s => item(s.label, esc(s.tip))).join('')}${item('T1, T2, T3', 'the tech level: T1 units come from the first factories, T2 and T3 from the advanced ones.')}</ul>
    <h2>Changes</h2>
    <ul>${item('&#9664; Older / Newer &#9654;', 'move From and To by one version: click through the patches one by one.')}
      ${item('From / To', 'the two game versions that are compared. At first: the newest version against the one before. A wider range shows the total of all changes in between.')}
      ${item('The columns', 'one column per faction, Armada at the left. A unit and its counterparts in the other factions stand in one row: you see at once when the same unit was changed for several factions. The rows are sorted by name.')}
      ${item('<s>old</s> → new', 'the values that changed. <b class="good">Green</b>: better for the unit, <b class="bad">red</b>: worse (cost and build time: lower is better). New and removed units are marked.')}
      ${item('A weapon', 'a unit with several weapons also lists what changed in each of them, with the name of the weapon in front (framed with a dashed line), for example <i>J7Laser (BeamLaser): DPS</i>, and the weapons it got or lost.')}
      ${item('Value', 'only the units in which this value changed (for example Hitpoints; DPS also finds a change of the DPS of one weapon).')}
      ${item('Scavenger copies', 'every unit has a Scavenger copy that changes with it. Off, the copies are left out; the faction Scavengers lists them.')}
      ${item('Click a unit', 'opens the compare with the unit before and after the change, side by side.')}</ul>
    <h2>Game versions</h2>
    <ul>${item('Game version', '(at the top) the catalog and the compare show the newest version of the game. Choose an older one to see the units as they were then. Only versions in which a unit value changed are listed.')}
      ${item('The list of a unit', '(above a unit in the compare) its versions: the first one and each one in which its values changed.')}</ul>
    <h2>Search</h2>
    <ul>${item('Words', 'find the start of a word in the name or the description: <i>tank</i>, <i>anti-air</i>.')}
      ${item('&lt;codename', 'finds units by their name in the game files: <i>&lt;armpw</i>.')}</ul></div>`;
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
    if (p.tiers.size && !p.tiers.has(u.tech)) return false;
    if (p.weapon) return !n.endsWith('_scav') && (u.weaponList || []).some(w => weaponKey(w) === p.weapon) && (!search || matchUnit(n, u, search));   // a weapon: all factions and kinds (no Scavenger copies: + Scav)
    if (search) return matchUnit(n, u, search);   // a search looks in all factions and categories
    return u.faction === p.faction && u.category === p.category;
  }).sort((a, b) => (pickUnit(a).name === a) - (pickUnit(b).name === b) || byTech(pickUnit(a), pickUnit(b)));   // units without a name last
}
// the weapon filter of the unit selection: every weapon of the units of the version shown, by its name ("J7Laser (BeamLaser)"), with the number of units that
// have it (Scavenger copies not counted), alphabetical
const weaponKey = w => `${w.name}${/\s/.test(w.name) || !w.type ? '' : ` (${w.type})`}`;
const weaponIndex = new WeakMap();
function allWeapons() {
  let list = weaponIndex.get(state.units);
  if (!list) {
    const count = new Map();
    for (const [n, u] of Object.entries(state.units)) if (!n.endsWith('_scav')) for (const k of new Set((u.weaponList || []).map(weaponKey))) count.set(k, (count.get(k) || 0) + 1);
    list = [...count].sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }));
    weaponIndex.set(state.units, list);
  }
  return list;
}
function weaponFilterHtml() {
  const p = state.pick, list = allWeapons();
  if (!list.length) return '';
  const on = list.some(([k]) => k === p.weapon);
  return `<select class="c-wfilter${on ? ' on' : ''}" data-change="pick-weapon" title="Only the units that have this weapon (alone or among their weapons), of all factions and kinds; the number: how many units have it" aria-label="Units with this weapon">
    <option value="">Any weapon</option>${list.map(([k, n]) => `<option value="${esc(k)}" ${k === p.weapon ? 'selected' : ''}>${esc(k)} (${n})</option>`).join('')}</select>`;
}

// a unit of the selection: as in the version shown; a unit that this version does not have, as in the newest version that has it
const pickUnit = n => state.units[n] || state.lastUnit[n];

function renderCompare() {
  document.title = 'Compare - BAR Unit Comparer';
  const columns = displayColumns();   // two units look like more: every column the same way (no mirrored pair)
  shown = columns;
  const max = {};
  const reference = columns.find(c => c.ref);   // with a reference column the bars of the others are coloured
  for (const s of STATS) if (s.fill) max[s.key] = Math.max(0, ...columns.map(c => unitOf(c)[s.key]));
  const stats = STATS.filter(s => columns.some(c => s.key === 'weapons' ? unitOf(c).weapons.length : unitOf(c)[s.key]));   // only what a unit has
  // the version comparison: the values that differ between the columns of one unit are marked
  for (const s of stats) s.differs = differs(columns, s);
  const scroll = app.querySelector('.cmp-scroll'), left = scroll && state.lastTable === state.table ? scroll.scrollLeft : 0;   // the columns are made anew: the sideways position stays (not from one view to the other)
  state.lastTable = state.table;
  const list = app.querySelector('.picker'), listTop = list ? list.scrollTop : 0;
  app.innerHTML = `<h2 class="cmp-kicker">Compare</h2>
    ${toolbarHtml()}
    <div class="cmp-body"><div class="cmp-wrap"><div class="cmp-scroll">${columns.length
      ? (state.table ? tableHtml(columns, stats, max, reference) : `<div class="cmp-grid" style="--n:${columns.length}">${columns.map((c, i) => columnHtml(c, i, '', max, reference, stats)).join('')}</div>`)
      : emptyCompareHtml()}</div>
      <button class="more more-left" data-a="scroll-columns" data-v="-1" title="More columns to the left">&#8249;</button><button class="more more-right" data-a="scroll-columns" data-v="1" title="More columns to the right: scroll sideways">&#8250;</button></div>
      ${chooserHtml()}</div>
    <div class="pin" hidden>${columns.map(c => `<div class="pin-u f-${c.faction}${c.ref ? ' is-ref' : ''}">${pictureTag(c.unit, '', unitOf(c))}<span>${esc(unitOf(c).name)}</span></div>`).join('')}</div>
    ${isNarrow() && !state.sheet ? '<button class="fab" data-a="pick-toggle" title="Open the unit selection">+ Add units</button>' : ''}`;
  app.querySelector('.cmp-scroll').scrollLeft = left;
  const sc = app.querySelector('.cmp-scroll');
  sc.addEventListener('scroll', updateMore);
  // a phone, the table: a swipe ends with a column right beside the names (or the strip of the reference column), not under it
  if ('onscrollend' in window) sc.addEventListener('scrollend', snapTable);
  else sc.addEventListener('scroll', () => { clearTimeout(snapTimer); snapTimer = setTimeout(snapTable, 200); });
  const picker = app.querySelector('.picker');   // none while the unit selection is folded away
  if (picker) picker.scrollTop = listTop;
  fitLayout();
  renderOverlay();
}

// the buttons above the columns, in groups: history (Undo, Clear, Redo), the view (graphic or table), + Scav, keep (Favorite, Share, Export).
// Every button has an icon; on a phone only the icons are shown (one line). Changed units only is in the unit selection: it changes only that list
function toolbarHtml() {
  const fav = currentFavorite() >= 0, any = state.columns.length ? '' : 'disabled';
  const btn = (a, icon, label, tip, { on = false, off = false, cls = '' } = {}) =>
    `<button class="btn${on ? ' on' : ''}${cls ? ' ' + cls : ''}" ${a ? `data-a="${a}"` : ''} title="${tip}" aria-label="${label}"${on !== undefined && cls.includes('tg') ? ` aria-pressed="${on}"` : ''} ${off ? 'disabled' : ''}>${icon}<span class="lb">${label}</span></button>`;
  const group = (...b) => `<span class="tb-group">${b.join('')}</span>`;
  // the view: two buttons side by side, the one shown is lit; only the other one does something
  const view = (table, icon, label, tip) => state.table === table
    ? `<button class="btn on" title="${label} view (shown)" aria-pressed="true">${icon}<span class="lb">${label}</span></button>`
    : `<button class="btn" data-a="view-table" title="${tip}" aria-pressed="false">${icon}<span class="lb">${label}</span></button>`;
  return `<div class="cmp-clear">
    ${(([undo, redo]) => group(undo, redo, btn('clear-all', ICONS.trash, 'Clear', 'Start again: remove all units and the Undo and Redo steps (asks first)', { off: !!any, cls: 'danger' })))([['undo', undoStack, ICONS.undo, 'Undo', 'Undo the last change of the columns (Ctrl+Z)'], ['redo', redoStack, ICONS.redo, 'Redo', 'Redo (Ctrl+Y)']].map(([a, stack, icon, label, tip]) =>
      // a badge with the number of steps that can be taken back (or repeated); none: no badge
      btn(a, icon, label, `${tip}${stack.length ? ` - ${stack.length} step${stack.length === 1 ? '' : 's'}` : ''}`, { off: !stack.length }).replace('<button class="btn', `<button ${stack.length ? `data-n="${stack.length}" ` : ''}class="btn${stack.length ? ' n-steps' : ''}`)))}
    ${group(view(false, ICONS.graphic, 'Graphic', 'Graphic view: pictures and bars'), view(true, ICONS.table, 'Table', 'Compact table: one row per value, one column per unit'))}
    ${group(btn('scav', ICONS.scav, '+ Scav', 'Scavengers: show the Scavenger copy of every unit right next to it (stronger: about 10 % more cost, 25 % more hitpoints). Press again to take them out.', { on: state.scav, cls: 'tg' }))}
    ${group(btn('fav-save', ICONS.star, fav ? 'Favorite' : 'Save', fav ? 'This selection is a favorite: press to remove it' : 'Save this selection of units as a favorite (list: Favorites at the top)', { on: fav, off: !!any, cls: 'fav-star tg' }),
      btn('share', ICONS.share, 'Share', 'Share this comparison: copies its link (on a phone: the share menu)', { off: !!any, cls: 'share' }),
      btn('export', ICONS.export, 'Export', 'Export the units shown with their values: a CSV or Excel file', { off: !!any }))}
    </div>`;
}

// scrolled down, the names of the units are out of view: a narrow line at the top of the window says which column is which (it follows the columns sideways)
function updatePin() {
  const pin = app.querySelector('.pin');
  if (!pin) return;
  const heads = [...app.querySelectorAll('.cmp-grid .c-unit[data-col], .cmp-table thead th[data-col]')], body = app.querySelector('.cmp-grid .stats, .cmp-table tbody');
  const show = heads.length > 0 && heads[0].getBoundingClientRect().bottom < 0 && body.getBoundingClientRect().bottom > 70;
  pin.hidden = !show;
  if (!show) return;
  const box = app.querySelector('.cmp-scroll').getBoundingClientRect();
  pin.style.left = box.left + 'px'; pin.style.width = box.width + 'px';
  heads.forEach((h, i) => { const r = h.getBoundingClientRect(), o = pin.children[i]; if (o) { o.style.left = (r.left - box.left) + 'px'; o.style.width = r.width + 'px'; } });
}

// the table on a narrow window: after a swipe the nearest column comes right beside the names of the rows, or beside the strip of the stuck reference column
let snapTimer = 0;
function snapTable() {
  const sc = app.querySelector('.cmp-scroll'), table = sc && sc.querySelector('.cmp-table');
  if (!table || !isNarrow() || !document.documentElement.classList.contains('touch')) return;   // only after a swipe: dragging the bar with the mouse ends where it is let go
  const max = sc.scrollWidth - sc.clientWidth, at = sc.scrollLeft, stuckAt = refStuckAt(sc), stuck = sc.classList.contains('scrolled');
  if (at < 4 || at > max - 4 || (!stuck && at > stuckAt)) return;   // at an end; or the reference column is about to shrink (the columns move then)
  const base = sc.getBoundingClientRect().left - at, lw = sc.querySelector('.t-corner').getBoundingClientRect().width;
  const ref = sc.querySelector('th.is-ref'), strip = ref && stuck ? ref.getBoundingClientRect().width : 0;
  const starts = [...sc.querySelectorAll('thead th[data-col]:not(.is-ref)')].map(h => {
    const plain = Math.round(h.getBoundingClientRect().left - base - lw);
    return stuck && plain > stuckAt ? Math.max(Math.round(stuckAt), plain - Math.round(strip)) : plain;
  }).filter(s => s >= 0).map(s => Math.min(s, max));
  if (!starts.length) return;
  const near = starts.reduce((a, b) => Math.abs(b - at) < Math.abs(a - at) ? b : a);
  if (Math.abs(near - at) > 2) sc.scrollTo({ left: near, behavior: 'smooth' });
}

// nothing chosen yet: what to do, and a few comparisons to start with (a unit and its counterparts in the other factions)
function emptyCompareHtml() {
  // [the units (a single one: it and its counterparts), the label]; a unit that the version shown does not have is left out, an example with less than 2 units too
  const examples = [[['armpw'], 'Light infantry bots'], [['armstump'], 'Light tanks'], [['armllt'], 'Light laser towers'], [['armcom', 'corcom', 'legcom'], 'Commanders'],
    [['armroy', 'corroy', 'legnavydestro'], 'Destroyers (ships)'], [['armsh', 'corsh', 'legsh'], 'Light hovercraft'], [['armfus', 'corfus', 'legfus', 'armckfus'], 'Fusion reactors']]
    .map(([list, label]) => [(list.length > 1 ? list : [list[0], ...counterpartsOf(list[0])]).filter(n => state.units[n]), label]).filter(([units]) => units.length > 1);
  return `<div class="cmp-empty"><h3>Nothing to compare yet</h3>
    <ol class="steps"><li><b>Pick units</b> ${isNarrow() ? 'with <b>+ Add units</b> at the bottom' : `in the list ${state.pickOpen ? 'on the right' : '(open it with the arrow on the right)'}`}: every click adds a column. The search finds units of all factions.</li>
      <li><b>Read the bars:</b> each value is drawn against the largest one in its row.</li>
      <li><b>Press Ref</b> (the balance icon) on one unit: the others show the difference to it (+ more, &minus; less), green if that is better, red if it is worse; equal values are greyed out. The <b>%</b> beside it shows the differences in percent.</li></ol>
    ${examples.length ? `<p>Or start with an example:</p><div class="examples">${examples.map(([units, label]) => `<a class="example" href="#/compare/${units.map(esc).join(',')}?view=graphic">${units.slice(0, 4).map(n => pictureTag(n, '', state.units[n])).join('')}<span>${label}</span></a>`).join('')}</div>` : ''}
    <p class="hint">More: <a href="#/help">how the page works</a></p></div>`;
}

// the unit pictures shrink (down to 60 px) when the stats and the footer would otherwise need a scrollbar
function fitPictures() {
  const root = document.documentElement.style;
  // narrow: the page scrolls anyway. A phone and a low window (a phone held sideways): small pictures, so that the values start on the first screen
  if (isNarrow()) { root.setProperty('--pic', window.innerHeight <= 500 ? '72px' : isPhone() ? '104px' : '200px'); return; }
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
// a wide window: when the columns are only a little too wide for the room, they get narrower (down to 280 px) instead of scrolling a few pixels
// (which showed the arrow and the shadow at the left edge over the first column without much to scroll)
function fitColumns() {
  const grid = app.querySelector('.cmp-grid'), sc = app.querySelector('.cmp-scroll');
  if (!grid) return;
  grid.style.removeProperty('--colmin');
  if (isNarrow()) return;
  const cs = getComputedStyle(grid), n = Number(grid.style.getPropertyValue('--n')) || 1, gap = parseFloat(cs.columnGap) || 0, wanted = parseFloat(cs.getPropertyValue('--colmin')) || 360;
  const fit = Math.floor((sc.clientWidth - (n - 1) * gap) / n);
  if (fit < wanted) grid.style.setProperty('--colmin', Math.max(280, fit) + 'px');
}
function fitLayout() {
  const body = app.querySelector('.cmp-body');
  if (!body) return;
  body.style.minHeight = '0';
  fitColumns();
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

// the scroll position from which the reference column sticks to the left edge (Infinity: no reference column): its place in the grid (--i) or in the table row
function refStuckAt(sc) {
  const head = sc.querySelector('.cmp-grid .c-head.is-ref');
  if (head) return parseFloat(getComputedStyle(head).marginLeft) || 0;
  const th = sc.querySelector('th.is-ref');
  if (!th) return Infinity;
  let x = 0;
  for (let o = th.previousElementSibling; o && !o.classList.contains('t-corner'); o = o.previousElementSibling) x += o.offsetWidth;
  return x;
}
// an arrow at the edge shows that more columns are hidden to the left or to the right
function updateMore() {
  const sc = app.querySelector('.cmp-scroll');
  if (!sc) return;
  app.querySelector('.more-left').hidden = sc.scrollLeft < 4;
  // the reference column stays at its place; scrolled up to the left edge it sticks there and shrinks to a strip with its values (the names of the table rows get smaller),
  // so that more of the other columns can be seen; with a little hysteresis. stuckAt: the scroll position from which it sticks
  const stuckAt = refStuckAt(sc), sl = sc.scrollLeft, was = sc.classList.contains('scrolled');
  const refCol = sc.querySelector('.cmp-grid .c-head.is-ref'), refTh = sc.querySelector('th.is-ref'), corner = sc.querySelector('.t-corner'), pad = sc.querySelector('.t-pad');
  if (refCol && !was) sc.dataset.refw = refCol.getBoundingClientRect().width;   // its whole width, measured while it is whole
  // the table: as a strip the reference column and the names of the rows are narrower. The empty cell behind the last column (.t-pad) takes this width, so that the
  // scrolled area stays as wide as it was: a width that changes while the bar is dragged makes the columns jump to and fro (and with little to scroll the table
  // fitted again, jumped back to the start and grew again). Measured once: the widths with and without the strip
  if (pad && !was && !sc.dataset.lost) {
    const whole = corner.offsetWidth + refTh.offsetWidth;
    pad.style.minWidth = '4000px';   // so that the position is not cut off while the strip is tried
    sc.classList.add('scrolled');
    sc.dataset.lost = Math.max(0, whole - corner.offsetWidth - refTh.offsetWidth); sc.dataset.kept = corner.offsetWidth + refTh.offsetWidth;
    sc.classList.remove('scrolled');
  }
  const now = sl > stuckAt + (was ? 4 : 24);
  if (pad) {
    // a narrow window: at least the room that brings the last column right beside the strip
    const lost = Number(sc.dataset.lost), room = isNarrow() ? Math.max(0, sc.clientWidth - Number(sc.dataset.kept) - pad.previousElementSibling.offsetWidth) : 0;
    pad.style.minWidth = (Math.max(room, lost) - (now ? 0 : lost)) + 'px';
  }
  if (now !== was) { sc.classList.toggle('scrolled', now); if (sc.scrollLeft !== sl) sc.scrollLeft = sl; }
  const lw = corner ? corner.getBoundingClientRect().width : 0;
  if (corner) sc.querySelector('.cmp-table').style.setProperty('--lw', lw + 'px');
  // the graphic view: stuck, the reference column gets narrower with every pixel that is scrolled, so that the column next to it stays right beside it (down to a strip)
  const strip = parseFloat(getComputedStyle(sc).getPropertyValue('--strip')) || 88;
  sc.style.setProperty('--refw', Math.max(strip, (Number(sc.dataset.refw) || strip) - (sl - stuckAt)) + 'px');
  const stick = sl > stuckAt ? sc.querySelector('.c-head.is-ref, th.is-ref') : null;   // stuck at the left edge: the arrow (and on a phone a swipe) starts behind it
  const behind = lw + (stick ? stick.getBoundingClientRect().width : 0);
  app.querySelector('.more-left').style.left = behind + 'px';
  // the table in two lines: scrolled, the names of the values stand right of the strip and the arrow at the left, not under them
  const two = sc.querySelector('.cmp-table.two-line');
  if (two) two.style.setProperty('--lab', (sc.scrollLeft < 4 ? 8 : behind + 44) + 'px');
  sc.style.scrollPaddingLeft = (stick ? behind + 10 : lw) + 'px';
  app.querySelector('.more-right').hidden = sc.scrollLeft + sc.clientWidth > sc.scrollWidth - 4;
  updatePin();
}

function scavengerHead(c, at, sticky) {
  return `<div class="c-head f-scv${sticky}" data-col="${c.id}" ${at(1)}><div class="c-title"><b>Scavengers</b>${columnVersion(c)}</div>${weaponSelect(c)}
    <div class="c-tools">${columnTools(c)}</div></div>`;
}
// the tools of a column. A phone: only Ref and a menu with the rest, each entry with its name (small icons in a row are hard to hit, and a phone shows no tooltip)
const columnTools = c => c.scavOf ? refButton(c)
  : isPhone() ? `${refButton(c)}${toolButton('menu', 'col-menu', 'More: all values, versions, counterparts, counters, move, remove', false, true)}`
  : `${gripHtml()}${countersButton(c)}${counterpartsButton(c)}${refButton(c)}<button class="x" data-a="remove-column" title="Remove this column" aria-label="Remove this column">&#10005;</button>`;
// the version list of a column; a phone has it in the menu and shows only a version that the column has of its own
// wide: the list of the versions of the unit and the button Versions right of it (it adds the other versions as columns)
const columnVersion = c => !isPhone() ? ((s => s && !c.scavOf ? `<span class="c-verrow">${s}${versionsButton(c)}</span>` : s)(versionSelect(c))) : c.version && !c.scavOf ? `<span class="c-ver">${esc(shortVersion(stateVersion(c) || c.version))}</span>` : '';

// the weapons of a column, always shown: more than one weapon: a white list, All weapons (the totals) or one of them; one weapon: its name, grey (nothing to
// choose); none: "No weapons", grey. A Scavenger column shows the weapon of its unit
function weaponSelect(c) {
  const list = (unitsOf(c.version || state.versionDir)[c.unit] || {}).weaponList || [];
  if (list.length < 2) {
    const text = list.length ? weaponLabel(list[0]) : 'No weapons';
    return `<div class="c-wrow"><select class="c-wpn" disabled title="${list.length ? 'This unit has only this weapon: its values are those of the unit' : 'This unit has no weapons'}" aria-label="Weapon"><option>${esc(text)}</option></select>${targetIcons(list, list[0])}</div>`;
  }
  const on = list.find(w => w.id === c.weapon);
  if (c.scavOf) return `<div class="c-wrow"><select class="c-wpn${on ? ' on' : ''}" disabled title="The Scavenger copy shows the weapon chosen for its unit" aria-label="Weapon"><option>${esc(on ? weaponLabel(on, list) : 'All weapons')}</option></select>${targetIcons(list, on)}</div>`;
  return `<div class="c-wrow"><select class="c-wpn${on ? ' on' : ''}" data-change="col-weapon" title="The weapons of this unit: All weapons shows them together (D-gun, nukes and EMP left out), one weapon shows its own values" aria-label="Weapon">
    <option value="">All weapons (${list.length})</option>${list.map(w => `<option value="${esc(w.id)}" ${w === on ? 'selected' : ''}>${esc(weaponLabel(w, list))}</option>`).join('')}</select>${targetIcons(list, on)}</div>`;
}

// the game version of a column: a list of the versions that have the unit (a Scavenger column shows the version of its unit); only with more than one version
const shortVersion = dir => versionLabel(versionOf(dir)).split(' · ')[0];
function versionSelect(c) {
  if (state.versions.length < 2) return '';
  const own = c.version || state.versionDir;
  if (c.scavOf) return `<span class="c-ver">${esc(shortVersion(own))}</span>`;
  // only the versions of the unit: the first one that has it and every one in which it changed. The column shows the newest of them that is not newer than its
  // game version (stateVersion): "29 May 2026" means the unit is the same from that version on (a later version without a change is not listed)
  const list = versionsOf(c.unit), at = stateVersion(c);
  if (!list.length || !at) return '';
  const tip = list.length > 1 ? `The versions of this unit: the first one and each one in which its values changed (${list.length} in all). Choose one to see the unit as it was then.`
    : 'This unit has only one version: its values never changed.';
  return `<select class="c-ver${list.length > 1 ? ' many' : ''}" data-change="col-version" title="${tip}" ${list.length > 1 ? '' : 'disabled'}>${
    list.slice().reverse().map(d => `<option value="${esc(d)}" ${d === at ? 'selected' : ''}>${esc(versionLabel(versionOf(d)))}</option>`).join('')}</select>`;
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
  if (c.ref) return null;
  if (reference) return unitOf(reference);   // a Ref: everything against it (also the other versions of the Ref's unit)
  const a = anchorOf(c);
  return a ? { ...unitOf(a), anchor: true } : null;   // no Ref: another version of the same unit left of it (equal values stay uncoloured)
}

// two balances: Ref with the differences as they are (±), Ref % with the differences in percent of the value of the reference. The lit one pressed again: no reference
const refTip = (c, pct) => c.ref && state.refPct === pct ? `Reference (on${pct ? ', in percent' : ''}): the other columns are coloured against this unit. Press again to switch it off.`
  : `Ref${pct ? ' %' : ''}: make this unit the reference. The values of all other columns turn green (better) or red (worse) against it; equal values are greyed out. They show the difference to it ${pct ? 'in percent of its value (+25%, −10%)' : 'as it is (+86, −0.5)'}.`;
// one block that looks like one button: the balance, then its left half ± (the difference as it is) and its right half % (in percent)
const balanceTip = c => c.ref ? 'Reference (on): press to switch it off' : `Make this unit the reference, ${state.refPct ? 'in percent (%)' : 'with the difference as it is (±)'}: the mode chosen last`;
const refButton = c => `<span class="ref-grp${c.ref ? ' on' : ''}" role="group" aria-label="Reference"><button class="tool ref-w" data-a="col-ref-last" title="${balanceTip(c)}" aria-label="${balanceTip(c)}" aria-pressed="${!!c.ref}">${ICONS.ref}</button>`
  + `<button class="tool ref${c.ref && !state.refPct ? ' active' : ''}" data-a="col-ref" title="${refTip(c, false)}" aria-label="${refTip(c, false)}" aria-pressed="${c.ref && !state.refPct}">±</button>`
  + `<button class="tool ref pct${c.ref && state.refPct ? ' active' : ''}" data-a="col-ref-pct" title="${refTip(c, true)}" aria-label="${refTip(c, true)}" aria-pressed="${c.ref && state.refPct}">%</button></span>`;

// the compact view: one row per value, one column per unit, the same red / green against the reference
function tableHtml(columns, stats, max, reference) {
  const head = c => {
    const u = unitOf(c);
    return `<th class="f-${c.faction}${c.ref ? ' is-ref ref-col' : ''}" data-col="${c.id}"><div class="t-pic">${pictureTag(c.unit, '', u)}</div><div class="t-fac">${c.scavOf ? 'Scavengers' : factionName(c.faction)}</div><div class="t-name">${esc(u.name)} <span class="tier t${u.tech}">T${u.tech}</span></div><div class="t-desc">${esc(u.description)}</div>${columnVersion(c)}${weaponSelect(c)}<div class="c-tools">${columnTools(c)}</div></th>`;
  };
  const cell = (s, c) => {
    const u = unitOf(c), changed = cellChanged(c, s) ? ' changed' : '';
    const rc = c.ref ? ' ref-col' : '';
    if (s.key === 'weapons') return `<td data-col="${c.id}" class="wpn${rc}${changed}${sameWeapons(u, referenceFor(c, reference)) ? ' diff-same' : ''}"><span class="weapons-row">${targetIcons(u.weaponList || [], u.weapon)}<span>${esc(u.weapons.join(', '))}</span></span></td>`;
    const v = u[s.key];
    if (!v) return `<td data-col="${c.id}" class="none${rc}${changed}">–</td>`;
    const ref = referenceFor(c, reference);
    return `<td data-col="${c.id}" class="num${rc}${verdictOf(s, v, ref)}${v === max[s.key] ? ' top' : ''}${changed}">${valueText(s, v, ref)}${absText(s, v, ref)}</td>`;
  };
  // a wide window: the names of the values in a column at the left, one line per value (compact). A phone: two lines per value, its name over the whole width
  // (it stays at the left edge while the columns are scrolled), the values below it; the column of the names (.t-corner and the empty .t-nil of each row) has
  // no width, so the units get the room
  const two = isPhone(), span = columns.length + 1 + (reference ? 1 : 0);
  const row = s => two
    ? `<tr class="t-lab"><th colspan="${span}" class="${s.differs ? 'changed' : ''}" title="${esc(s.tip)}"${sortAttr(s)}><span>${s.label}${sortMark(s)}</span></th></tr>`
      + `<tr class="t-vals"><th class="t-nil"></th>${columns.map(c => cell(s, c)).join('')}</tr>`
    : `<tr><th class="${s.differs ? 'changed' : ''}" title="${esc(s.tip)}"${sortAttr(s)}>${s.label}${sortMark(s)}</th>${columns.map(c => cell(s, c)).join('')}</tr>`;
  return `<table class="cmp-table${two ? ' two-line' : ''}"><thead><tr><th class="t-corner"></th>${columns.map(head).join('')}${reference ? '<th class="t-pad"></th>' : ''}</tr></thead>
    <tbody>${stats.map(row).join('')}</tbody></table>`;
}

function columnHtml(c, col, side, max, reference, stats) {
  const u = unitOf(c), ref = referenceFor(c, reference);
  const at = r => `style="grid-column:${col + 1};grid-row:${r}${c.ref ? `;--i:${col}` : ''}"`;
  const sticky = c.ref ? ' is-ref' : '';
  const head = c.scavOf ? scavengerHead(c, at, sticky) : `<div class="c-head f-${c.faction} ${side}${sticky}" data-col="${c.id}" ${at(1)}>
      <div class="c-title"><b>${factionName(c.faction)}</b>${columnVersion(c)}</div>${weaponSelect(c)}
      <div class="c-tools">${columnTools(c)}</div>
    </div>`;
  return head + `<div class="c-unit f-${c.faction} ${side}${sticky}" data-col="${c.id}" ${at(2)}>${unitHtml(c, u)}</div>
    <div class="stats f-${c.faction} ${side}${sticky}" ${at(3)}>${stats.map(s => statHtml(s, u, max, ref, cellChanged(c, s))).join('')}</div>`;
}

// the unit selection at the right edge: a click on a unit adds a column
function chooserHtml() {
  const p = state.pick, narrow = isNarrow();
  // folded away (a wide window): a narrow strip at the right edge that brings it back
  if (!state.pickOpen && !narrow) return `<div class="chooser collapsed"><button class="toggle-pick" data-a="pick-toggle" title="Show the unit selection"><span class="tp-arrow">&#9664;</span><span class="tp-word">Select units</span></button></div>`;
  return `<div class="chooser f-${p.faction}${narrow ? ` sheet${state.sheet ? ' open' : ''}` : ''}">
    <div class="c-pick-head"><h2 class="c-pick-title">Select units</h2>${narrow ? '' : `<button class="toggle-pick" data-a="pick-toggle" title="Hide the unit selection: more room for the columns (a strip at the right edge brings it back)">Hide &#9654;</button>`}</div>
    <div class="c-searchrow"><div class="c-search"><input class="search ${isCodeSearch(p.search) ? 'code' : ''}" data-input="pick-search" placeholder="Search all units, or &lt;codename&gt;" value="${esc(p.search)}"><button class="clear" data-a="pick-clear" title="Clear the search">&#10005;</button></div>${narrow ? '<button class="toggle-pick" data-a="pick-toggle" title="Close the unit selection">Done</button>' : ''}</div>
    <div class="c-filter">${versionsFilterButton()}${weaponFilterHtml()}</div>
    ${filterHtml({ small: true, faction: p.search || p.weapon ? '' : p.faction, category: p.search || p.weapon ? '' : p.category, tiers: p.tiers, factions: FACTIONS, cats: CATEGORIES.filter(k => k.id === p.category || hasUnits(p.faction, k.id)), act: 'pick', tier: 'pick-tier' })}
    <div class="picker">${pickerHtml()}</div></div>`;
}

function pickerHtml() {
  const list = pickUnits();
  if (!list.length) return `<p class="empty">${state.pick.weapon ? 'No unit with this weapon here.' : state.versionsMode ? 'No unit with more than one version here.' : 'No units here.'}</p>`;
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
  return `${lead ? ' ' : ''}<button class="btn tg${state.versionsMode ? ' on' : ''}" data-a="versions" aria-pressed="${state.versionsMode}" title="Only show the units that changed in some game version (they have at least 2 versions). Press again to show all units. The icon Versions of a unit adds its other versions as columns.">${ICONS.filter}<span class="lb">Changed units only</span></button>`;
}
// the button Versions of a column: every other version of its unit as columns right of it, the unit is the Ref; grey with only one version; all shown already: a note says so
// pressed once a tool adds columns; pressed again (while it is lit) it takes them out again (activeOf, toggleTool)
const AGAIN = ' Press again to take them out.';
const activeOf = (c, kind) => !!(c.active && c.active.kind === kind);
function versionsButton(c) {
  const on = activeOf(c, 'versions'), n = versionsOf(c.unit).length, more = missingVersions(c).length;
  const tip = on ? 'Versions: the other versions of this unit are shown.' + AGAIN
    : more ? `Versions: this unit has ${n} versions. Add the other ${more === 1 ? 'one' : more} as columns right of it (newest first) and make this unit the reference: the values that changed are marked.`
    : n > 1 ? `All ${n} versions of this unit are shown already.` : 'Versions: this unit has only one version (it did not change in any game version).';
  return toolButton('versions', 'col-versions', tip, on, on || n > 1).replace('class="tool versions', `${n > 1 ? `data-n="${n > 9 ? '&gt;' : n}" ` : ''}class="tool versions${n > 1 ? ' has' : ''}`);   // only one version: grey (the tooltip says why); more: the number on the icon (above 9: >)
}
// a short note next to a button that has nothing to do (instead of a grey button: a press tells why)
function note(el, text) {
  document.querySelectorAll('.note-pop').forEach(o => o.remove());
  const r = el.getBoundingClientRect(), pop = document.createElement('div');
  pop.className = 'note-pop';
  pop.textContent = text;
  pop.style.left = Math.max(8, Math.min(window.innerWidth - 268, r.left - 8)) + 'px';   // fixed to the window: it never makes the page wider
  pop.style.top = (r.bottom + 6) + 'px';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 2600);
}
function countersButton(c) {
  const on = activeOf(c, 'counters'), has = countersOf(c.unit).length > 0;
  const tip = on ? 'Counters: the units that counter this unit are shown (the other columns were put aside).' + ' Press again to bring the columns back.'
    : has ? 'Counters: replace all other columns with the units that counter this unit (after the unit counter charts of beyondallreason.info).' : 'No counters are known for this unit (the counter charts list only some units).';
  return toolButton('counters', 'col-counters', tip, on, on || has);
}
function counterpartsButton(c) {
  const on = activeOf(c, 'counterparts'), all = counterpartsOf(c.unit), missing = all.filter(n => !isShown(n)).length;
  const tip = on ? 'Counterparts: the units of the other factions that do the same job are shown.' + AGAIN
    : missing ? 'Counterparts: add the units of the other factions that do the same job as columns.' : all.length ? 'All counterparts of this unit are shown already.' : 'No counterparts are known for this unit.';
  return toolButton('counterparts', 'add-counterparts', tip, on, on || missing);
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
  return `<div class="c-pic">${pictureTag(c.unit, '', u)}</div>
    <div class="c-name">${esc(u.name)}</div>
    <div class="c-desc">${esc(u.description)}<span class="tier t${u.tech}">T${u.tech}</span></div>
    ${eq.length ? `<div class="c-eq"><button class="c-eq-all" data-a="add-counterparts" title="Add all counterparts of this unit as columns (the ones that are not in the comparison yet)">Counterparts:</button> ${eq.map(n => `<button class="f-${state.units[n].faction}" data-a="add-unit" data-v="${esc(n)}" title="Add a column with this unit (${factionName(state.units[n].faction)})">${esc(state.units[n].name)}</button>`).join('')}</div>` : ''}`;
}

// against the reference: better is green, worse red, an equal value is greyed out (only what differs stands out); in the version comparison an equal value stays
// as it is; nothing to compare with (the reference has no such value): uncoloured
const sameWeapons = (u, ref) => !!ref && !ref.anchor && u.weapons.length > 0 && u.weapons.join() === (ref.weapons || []).join();   // the same weapons as the reference: greyed out
function verdictOf(s, v, ref) {
  if (!ref) return '';
  const r = ref[s.key];
  if (!r) return '';
  if (v === r) return ref.anchor ? '' : ' diff-same';
  return (s.lower ? v > r : v < r) ? ' diff-bad' : ' diff-good';
}

// with a Ref the other columns show the difference to it instead of the value: + more, − less, ±0 equal (the colour of the bar says better or worse:
// for the costs and the build time less is better);
// the value itself is in the tooltip. Without a Ref, in the version comparison, or if the Ref has no such value: the value
function valueText(s, v, ref) {
  const r = ref && !ref.anchor ? ref[s.key] : 0;
  if (!r) return s.show(v);
  const title = ` title="${esc(s.show(v))} (Ref: ${esc(s.show(r))})"`;
  if (v === r) return `<span${title}>±0${state.refPct ? '%' : ''}</span>`;
  if (state.refPct) {   // in percent of the value of the Ref: from 10 % on whole numbers, below one place after the point, a tiny one with its first digit
    const p = Math.abs(v - r) / Math.abs(r) * 100;
    const t = p >= 10 ? Math.round(p).toLocaleString('en-US') : p >= 0.1 ? String(Number(p.toFixed(1))) : String(Number(p.toPrecision(1)));
    return `<span${title}>${v > r ? '+' : '−'}${t}%</span>`;
  }
  const d = Math.abs(v - r);
  let t = s.show(d);
  if (/^[0:.]*$/.test(t)) t = d < 1 ? String(Number(d.toPrecision(1))) : t;   // a small difference that the format would show as 0
  return `<span${title}>${v > r ? '+' : '−'}${t}</span>`;   // the sign: more or less than the Ref; the colour says better or worse
}

// with a Ref: the value itself, small, next to the difference
const absText = (s, v, ref) => ref && !ref.anchor && ref[s.key] ? `<span class="abs">${esc(s.show(v))}</span>` : '';
// a click on the name of a value sorts the columns by it (the action sort)
const sortAttr = s => s.key === 'weapons' ? '' : ` data-a="sort" data-v="${s.key}"`;
const sortMark = s => state.sort && state.sort.key === s.key ? `<i class="sorted">${state.sort.dir > 0 ? '&#9662;' : '&#9652;'}</i>` : '';
function statHtml(s, u, max, ref, changed) {
  const cls = `stat${changed ? ' changed' : ''}`, label = `<label title="${esc(s.tip)}${changed ? ' Changed against the other version of this unit.' : ''}${s.key === 'weapons' ? '' : ' Click: sort the columns by this value.'}"${sortAttr(s)}>${s.label}${sortMark(s)}</label>`;
  // the signs of what they hit, then the kinds of weapons (the signs where the values start, always at the same place) (the weapon chosen, or all together: as right of the list of weapons)
  if (s.key === 'weapons') return `<div class="${cls}">${label}<div class="weapons-row">${targetIcons(u.weaponList || [], u.weapon)}<div class="weapons${sameWeapons(u, ref) ? ' same' : ''}">${esc(u.weapons.join(', '))}</div></div></div>`;
  const v = u[s.key];
  if (!v) return `<div class="${cls}">${label}<div class="none" title="This unit has no such value">–</div></div>`;
  const share = max[s.key] ? 100 * v / max[s.key] : 0;
  return `<div class="${cls}">${label}<div class="bar"><div class="fill fill-${s.fill}${verdictOf(s, v, ref)}" style="width:${share.toFixed(1)}%"></div><span class="val">${valueText(s, v, ref)}</span>${absText(s, v, ref)}</div></div>`;
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
const snapshot = () => Object.assign(state.columns.map(c => ({ ...c })), { versionDir: state.versionDir });   // ... and the game version chosen at the top
function remember() { state.sort = null; undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
function step(from, to) {
  if (!from.length) return;
  const ref = refUnit();   // Ref is no step: it stays as it is
  state.sort = null;
  to.push(snapshot());
  const old = from.pop();
  if (old.versionDir && versionOf(old.versionDir)) selectVersion(old.versionDir);
  state.columns = old.filter(c => unitOf(c));   // a unit that the game version chosen since then does not have
  for (const c of displayColumns()) c.ref = tokenOf(c) === ref;
  keepAddress(); render();
}

// a balance pressed: this column the reference with the differences as they are or in percent; the lit one pressed again: no reference
function setRef(c, pct) {
  const off = c.ref && state.refPct === pct;
  for (const o of displayColumns()) o.ref = false;
  c.ref = !off;
  state.refPct = pct;
  save('refMode', pct ? 'pct' : 'abs');   // the mode chosen last, for the balance (also after a reload)
  keepAddress(); renderCompare();
}

function addUnit(unit) { if (!isShown(unit)) state.columns.push(newColumn(unit)); }

// the button Versions of a column: every other version of its unit as a column right of it (the ones that are shown already are left out), and the column is the Ref
function addOtherVersions(c) {
  const more = missingVersions(c).map(d => newColumn(c.unit, d, c.weapon));   // with the weapon of the column: the versions of that weapon
  if (!more.length) return false;
  let after = state.columns.indexOf(c);   // behind the columns of this unit that follow it already
  while (state.columns[after + 1] && state.columns[after + 1].unit === c.unit) after++;
  state.columns.splice(after + 1, 0, ...more);
  // the clicked unit is the reference (where it is), its versions right of it
  for (const o of displayColumns()) o.ref = false;
  c.ref = true;
  return true;
}

// a tool of a column (Versions, Counters, Counterparts): the first press adds columns (act changes state.columns; false: nothing to do), the second takes out what
// it added and brings back what it put aside, and the Ref as it was; columns added or removed by hand in between stay as they are. One step of Undo each.
function toggleTool(c, kind, act) {
  if (activeOf(c, kind)) {
    remember();
    const { added, removed, refBefore } = c.active;
    const cols = state.columns.filter(o => !added.includes(o.id));
    for (const [i, o] of removed) if (!cols.some(x => x.id === o.id)) cols.splice(Math.min(i, cols.length), 0, o);
    state.columns = cols;
    c.active = null;
    for (const o of displayColumns()) o.ref = tokenOf(o) === refBefore;
    return true;
  }
  const before = state.columns.slice(), refBefore = refUnit();
  remember();
  if (act() === false) { undoStack.pop(); return false; }
  const ids = new Set(before.map(o => o.id));
  const added = state.columns.filter(o => !ids.has(o.id)).map(o => o.id);
  const removed = before.map((o, i) => [i, o]).filter(([, o]) => !state.columns.includes(o));
  for (const o of state.columns) if (o !== c && o.active) o.active = null;   // only the newest tool can be taken back this way (older ones: Undo)
  c.active = added.length || removed.length ? { kind, added, removed, refBefore } : null;
  return true;
}

// ------------------------------------------------------------------ over the page: the menu of a column (phone), all values of one unit
const overlay = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'overlay' }));
function renderOverlay() {
  const c = state.menu && state.page === 'compare' ? displayColumns().find(o => o.id === state.menu) : null;
  if (!c) state.menu = null;
  if (state.detail && !pickUnit(state.detail)) state.detail = null;
  if (state.ask && state.page !== 'compare') state.ask = null;
  overlay.innerHTML = state.ask === 'export' ? exportHtml() : state.ask ? askHtml() : state.detail ? detailHtml(state.detail) : c ? menuHtml(c) : '';
  if (state.ask) overlay.querySelector('[data-a="clear-yes"], [data-a="export-xlsx"]').focus();
  document.body.classList.toggle('modal', overlay.innerHTML !== '');
}
// Export: the units shown with their values as a file, CSV or Excel (.xlsx), laid out as the table: one row per value, one column per unit, the heads of the
// columns in the first rows. Numbers as numbers (the build time in seconds), not as the text on the page; with a Ref the differences follow in a block below
function exportRows() {
  const columns = shown.length ? shown : displayColumns(), reference = columns.find(c => c.ref);
  const stats = STATS.filter(s => columns.some(c => s.key === 'weapons' ? unitOf(c).weapons.length : unitOf(c)[s.key]));
  const num = v => Math.round(v * 100) / 100;
  const label = s => s.key === 'buildTime' ? 'Build time (s)' : s.label;
  const weaponOf = c => { const list = (unitsOf(c.version || state.versionDir)[c.unit] || {}).weaponList || [], on = list.find(w => w.id === c.weapon);
    return on ? weaponLabel(on, list) : list.length > 1 ? `All weapons (${list.length})` : list.length ? weaponLabel(list[0]) : 'No weapons'; };
  const rows = [['Unit', ...columns.map(c => unitOf(c).name)], ['Name', ...columns.map(c => c.unit)], ['Faction', ...columns.map(c => c.scavOf ? 'Scavengers' : factionName(c.faction))],
    ['Tier', ...columns.map(c => `T${unitOf(c).tech}`)], ['Description', ...columns.map(c => unitOf(c).description)]];
  if (state.versions.length > 1) rows.push(['Game version', ...columns.map(c => { const v = versionOf(stateVersion(c) || c.version || state.versionDir); return v ? versionLabel(v) : ''; })]);
  rows.push(['Weapon', ...columns.map(weaponOf)]);
  if (reference) rows.push(['Reference', ...columns.map(c => c.ref ? 'Ref' : '')]);
  const head = rows.length;
  for (const s of stats) rows.push([label(s), ...columns.map(c => { const u = unitOf(c); return s.key === 'weapons' ? u.weapons.join(', ') : u[s.key] ? num(u[s.key]) : ''; })]);
  if (reference) {   // the differences to the Ref, as the page shows them: as they are (±) or in percent (%)
    const r = unitOf(reference);
    rows.push([], [`Difference to ${r.name}${state.refPct ? ' (%)' : ''}`, ...columns.map(c => unitOf(c).name)]);
    for (const s of stats) if (s.key !== 'weapons' && r[s.key]) rows.push([label(s), ...columns.map(c => { const v = unitOf(c)[s.key];
      return c.ref || !v ? '' : state.refPct ? Math.round((v - r[s.key]) / Math.abs(r[s.key]) * 1000) / 10 : num(v - r[s.key]); })]);
  }
  return { rows, head, columns };
}
const exportName = (columns, ext) => `bar-compare-${columns.slice(0, 6).map(c => c.unit).join('-')}${columns.length > 6 ? '-more' : ''}.${ext}`;
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// CSV in the language of the browser, as a spreadsheet there reads it: with a decimal comma (German and others) the numbers have a comma and the cells are
// separated by semicolons, else a point and commas; no thousands separators; text in quotes where needed, UTF-8 with a BOM so that Excel reads the names right
const decimalComma = (locale = navigator.language) => { try { return (1.5).toLocaleString(locale).includes(','); } catch { return false; } };
function csvOf(rows, locale = navigator.language) {
  const comma = decimalComma(locale), sep = comma ? ';' : ',', quote = new RegExp(`["${sep}\r\n]`);
  const cell = v => typeof v === 'number' ? (comma ? String(v).replace('.', ',') : String(v)) : quote.test(v ?? '') ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
  return '﻿' + rows.map(r => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}
// Excel: a small .xlsx written here (a zip without compression): one sheet, the first column and the heads of the columns stay in view, the names bold
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const putAll = (view, list) => list.forEach(([o, v, s]) => s === 4 ? view.setUint32(o, v, true) : view.setUint16(o, v, true));
function zipOf(files) {   // [[name, text]]: a zip, stored
  const enc = new TextEncoder(), parts = [], dir = [];
  let at = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    putAll(h, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, d.length, 4], [22, d.length, 4], [26, n.length, 2], [28, 0, 2]]);
    const c = new DataView(new ArrayBuffer(46));
    putAll(c, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, d.length, 4], [24, d.length, 4], [28, n.length, 2],
      [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, at, 4]]);
    parts.push(h, n, d); dir.push(c, n);
    at += 30 + n.length + d.length;
  }
  const size = dir.reduce((a, x) => a + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  putAll(e, [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, at, 4]]);
  return new Blob([...parts, ...dir, e], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function xlsxOf({ rows, head }) {
  const x = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const width = Math.max(...rows.map(r => r.length));
  const sheetRows = rows.map((r, y) => `<row r="${y + 1}">${r.map((v, i) => {
    const ref = `${col(i)}${y + 1}`, bold = i === 0 || y < 1 ? ' s="1"' : '';
    if (v === '' || v == null) return '';
    return typeof v === 'number' ? `<c r="${ref}"${bold}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${bold}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', ct = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  return zipOf([
    ['[Content_Types].xml', `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="${ct}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${ct}.worksheet+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="${ct}.styles+xml"/></Types>`],
    ['_rels/.rels', `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${xml}<workbook ${ns}><sheets><sheet name="Compare" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${xml}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', `${xml}<worksheet ${ns}><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="${head}" topLeftCell="B${head + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
      + `<cols><col min="1" max="1" width="24" customWidth="1"/>${width > 1 ? `<col min="2" max="${width}" width="22" customWidth="1"/>` : ''}</cols><sheetData>${sheetRows}</sheetData></worksheet>`],
  ]);
}
// the dialog of Export: what is in the file, then CSV or Excel
function exportHtml() {
  const { columns } = exportRows();
  const ref = columns.find(c => c.ref);
  return `<div class="sheet-back" data-a="overlay-close"></div><div class="detail ask" role="dialog" aria-label="Export">
    <h3>Export</h3>
    <p>The ${columns.length} unit${columns.length === 1 ? '' : 's'} shown, with their values as in the table: one row per value, one column per unit${ref ? `, and below the differences to ${esc(unitOf(ref).name)}${state.refPct ? ' in percent' : ''}` : ''}. Numbers as numbers (build time in seconds), to work with them in a spreadsheet. The CSV follows the language of your browser (${esc(navigator.language)}: ${decimalComma() ? 'decimal comma, separated by semicolons' : 'decimal point, separated by commas'}).</p>
    <div class="d-actions"><button class="btn" data-a="overlay-close">Cancel</button><button class="btn" data-a="export-csv">${ICONS.export} CSV</button><button class="btn go" data-a="export-xlsx" title="An Excel file (.xlsx)">${ICONS.export} Excel</button></div></div>`;
}
// Clear asks first: all units and the Undo and Redo steps go, it cannot be taken back
function askHtml() {
  const n = state.columns.length;
  return `<div class="sheet-back" data-a="overlay-close"></div><div class="detail ask" role="alertdialog" aria-label="Clear the comparison">
    <h3>Clear the comparison?</h3>
    <p>All ${n} unit${n === 1 ? '' : 's'} and the Undo and Redo steps are removed. This cannot be taken back.</p>
    <div class="d-actions"><button class="btn" data-a="overlay-close">Cancel</button><button class="btn danger" data-a="clear-yes">${ICONS.trash} Clear all</button></div></div>`;
}
// the menu of a column: what the icon buttons of a wide window do, each with its name and a line that says what happens
function menuHtml(c) {
  const u = unitOf(c), n = versionsOf(c.unit).length, at = state.columns.indexOf(c);
  const item = (icon, action, label, text, o = {}) => `<button class="m-item${o.on ? ' on' : ''}${o.danger ? ' danger' : ''}" data-a="${action}"${o.v ? ` data-v="${esc(o.v)}"` : ''} ${o.off ? 'disabled' : ''}><span class="m-icon">${icon}</span><span class="m-text"><b>${label}</b><small>${text}</small></span></button>`;
  const vOn = activeOf(c, 'versions'), more = missingVersions(c).length;
  const pOn = activeOf(c, 'counterparts'), parts = counterpartsOf(c.unit), missing = parts.filter(x => !isShown(x));
  const cOn = activeOf(c, 'counters'), hasCounters = countersOf(c.unit).length > 0;
  return `<div class="sheet-back" data-a="overlay-close"></div><div class="col-menu f-${c.faction}" data-col="${c.id}" role="dialog" aria-label="${esc(u.name)}">
    <div class="m-head">${pictureTag(c.unit, '', u)}<div class="m-text"><b>${esc(u.name)}</b><small>${esc(u.description)}</small></div><button class="btn go" data-a="overlay-close">Done</button></div>
    ${item(refBadge(false), 'col-ref', c.ref && !state.refPct ? 'Reference: on' : 'Make it the reference', c.ref && !state.refPct ? 'Tap to switch it off.' : 'The other units show + (better) and &minus; (worse) against it.', { on: c.ref && !state.refPct })}
    ${item(refBadge(true), 'col-ref-pct', c.ref && state.refPct ? 'Reference in percent: on' : 'Make it the reference, in percent', c.ref && state.refPct ? 'Tap to switch it off.' : 'The same, the differences in percent of its value (+25%, &minus;10%).', { on: c.ref && state.refPct })}
    ${item(ICONS.info, 'detail', 'All values', 'This unit alone, with every value.', { v: c.unit })}
    ${item(ICONS.versions, 'col-versions', `Versions${n > 1 ? ` (${n})` : ''}`, vOn ? 'Shown. Tap to take them out again.' : more ? 'Add its other game versions as columns: what the balance changes did.' : n > 1 ? 'All its versions are shown already.' : 'It has only one version: it never changed.', { on: vOn, off: !vOn && !more })}
    ${item(ICONS.counterparts, 'add-counterparts', 'Counterparts', pOn ? 'Shown. Tap to take them out again.' : missing.length ? `Add ${missing.map(x => esc(state.units[x].name)).join(', ')}: the same job in the other factions.` : parts.length ? 'All of them are shown already.' : 'None known for this unit.', { on: pOn, off: !pOn && !missing.length })}
    ${item(ICONS.counters, 'col-counters', 'Counters', cOn ? 'Shown. Tap to bring your columns back.' : hasCounters ? 'Show the units that are good against it (your other columns are put aside).' : 'None known for this unit.', { on: cOn, off: !cOn && !hasCounters })}
    <div class="m-row"><button class="m-item" data-a="move" data-v="-1" ${at <= 0 ? 'disabled' : ''}>&#8249; Move left</button><button class="m-item" data-a="move" data-v="1" ${at < 0 || at >= state.columns.length - 1 ? 'disabled' : ''}>Move right &#8250;</button></div>
    ${state.versions.length > 1 && versionsOf(c.unit).length ? `<label class="m-ver"><span>Game version of this unit</span>${versionSelect(c)}</label>` : ''}
    ${item('&#10005;', 'remove-column', 'Remove', 'Take this unit out of the comparison.', { danger: true })}</div>`;
}
// all values of one unit, without adding it to the comparison (hold a unit or right-click it; the menu of a column)
function detailHtml(n) {
  const u = pickUnit(n), on = state.columns.some(c => c.unit === n && !c.version);
  const rows = STATS.map(s => {
    const v = s.key === 'weapons' ? (u.weapons || []).join(', ') : u[s.key];
    return v ? `<div class="d-row" title="${esc(s.tip)}"><span>${s.label}</span><b>${esc(s.key === 'weapons' ? v : s.show(v))}</b></div>` : '';
  }).join('');
  const chips = list => list.map(m => `<button class="f-${state.units[m].faction}" data-a="detail" data-v="${esc(m)}">${esc(state.units[m].name)}</button>`).join('');
  const parts = counterpartsOf(n), counters = countersOf(n);
  return `<div class="sheet-back" data-a="overlay-close"></div><div class="detail f-${u.faction}" role="dialog" aria-label="${esc(u.name)}">
    <button class="d-close" data-a="overlay-close" title="Close" aria-label="Close">&#10005;</button>
    <div class="d-head">${pictureTag(n, 'd-pic', u)}<div><div class="d-fac">${factionName(u.faction)} <span class="tier t${u.tech}">T${u.tech}</span></div><h3>${esc(u.name)}</h3><p>${esc(u.description)}</p></div></div>
    <div class="d-rows">${rows}</div>
    ${parts.length ? `<div class="d-more"><span>Counterparts</span>${chips(parts)}</div>` : ''}${counters.length ? `<div class="d-more"><span>Countered by</span>${chips(counters)}</div>` : ''}
    <div class="d-actions"><button class="btn go" data-a="detail-toggle" ${state.units[n] ? '' : 'disabled'}>${on ? 'Take out of the comparison' : 'Add to the comparison'}</button><button class="btn" data-a="overlay-close">Close</button></div></div>`;
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
    s.weapon = c.weapon;   // ... with the same weapon (the copy has the same weapons)
    return [c, s];
  });
  return list;   // the reference column stays where it is (it sticks to the left edge only when it is scrolled there)
}
const columnOf = el => displayColumns().find(c => c.id === Number(el.closest('[data-col]').dataset.col));

const showLastColumn = () => { const s = app.querySelector('.cmp-scroll'); s.scrollLeft = s.scrollWidth; };   // the new column is at the right end

const actions = {
  'col-menu'(v, el) { state.menu = columnOf(el).id; renderOverlay(); },
  'overlay-close'() { state.menu = state.detail = state.ask = null; renderOverlay(); },
  detail(v) { state.detail = v; state.menu = null; renderOverlay(); },
  'detail-toggle'() {
    const n = state.detail;
    state.detail = null;
    remember(); toggleUnit(n); keepAddress(); render();
  },
  // a click on the name of a value: the columns in the order of this value, the best first (the costs: the lowest); again: the other way round. Units without it last
  sort(v) {
    if (state.columns.length < 2) return;
    const s = STATS.find(o => o.key === v), val = c => unitOf(c)[v] || 0, dir = state.sort && state.sort.key === v ? -state.sort.dir : 1;
    const sorted = state.columns.slice().sort((a, b) => (!val(a) - !val(b)) || dir * (s.lower ? val(a) - val(b) : val(b) - val(a)));
    if (sorted.some((c, i) => c !== state.columns[i])) { remember(); state.columns = sorted; }
    state.sort = { key: v, dir };
    keepAddress(); renderCompare(); renderNav();
    const at = app.querySelector(`[data-a="sort"][data-v="${v}"]`);
    if (at) note(at, `Sorted by ${s.label}: the ${dir > 0 ? 'best' : 'worst'} first. Again: the other way round.`);
  },
  async share(v, el) {   // a phone: the share menu of the system; else the link goes to the clipboard
    const url = location.href;
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: 'BAR Unit Comparer', url }); } catch { /* closed without sharing */ } return; }
    try { await navigator.clipboard.writeText(url); note(el, 'Link copied: paste it to show this comparison to someone.'); }
    catch { note(el, 'Copy the address of this page to share the comparison.'); }
  },
  view(v) { state.view = v; save('view', v); renderCatalog(); },
  'intro-close'() { save('intro', 'no'); renderCatalog(); },
  // the page Changes: the buttons above the list (a faction, a kind of unit, the tech levels)
  'chg-step'(v) {   // From and To one version older or newer (the filters stay)
    const by = Number(v), i = indexOf(state.changesFrom) + by, j = indexOf(state.changesTo) + by;
    if (i < 0 || j >= state.versions.length) return;
    location.hash = changesLink(state.versions[j].dir, state.versions[i].dir);
  },
  'chg-faction'(v) { state.changes.faction = v; document.getElementById('chg-body').innerHTML = changesListHtml(); },
  'chg-category'(v) { state.changes.category = v; document.getElementById('chg-body').innerHTML = changesListHtml(); },
  'chg-tier'(v) { const t = Number(v), s = state.changes.tiers; if (s.has(t)) s.delete(t); else s.add(t); document.getElementById('chg-body').innerHTML = changesListHtml(); },
  tier(v) { const t = Number(v); if (state.tiers.has(t)) state.tiers.delete(t); else state.tiers.add(t); renderCatalog(); },
  toggle(v) {   // only the units: the search keeps its focus, the page its position; the card keeps the focus (keyboard)
    remember(); toggleUnit(v); renderCatalogUnits(); renderNav(); renderTray();
    const again = document.querySelector(`#units [data-v="${CSS.escape(v)}"]`);
    if (again) again.focus({ preventScroll: true });
  },
  'scroll-columns'(v) {   // to the start of the next column to the left or right, so that a column is never cut at the left edge (behind the sticky reference column and the names of the table rows)
    const sc = app.querySelector('.cmp-scroll'), box = sc.getBoundingClientRect(), base = box.left - sc.scrollLeft;
    const grid = sc.querySelector('.cmp-grid'), gap = grid ? parseFloat(getComputedStyle(grid).columnGap) || 0 : 0;
    const corner = sc.querySelector('.t-corner'), lw = corner ? corner.getBoundingClientRect().width : 0, stuckAt = refStuckAt(sc);
    const strip = grid ? parseFloat(getComputedStyle(sc).getPropertyValue('--strip')) || 88 : (sc.querySelector('th.is-ref') ? 64 : 0);
    // a column left of the reference column comes to the left edge (behind the names of the table rows); one right of it comes beside the strip of the stuck reference column
    const starts = [...sc.querySelectorAll('.c-head:not(.is-ref), thead th[data-col]:not(.is-ref)')].map(h => {
      const nx = h.getBoundingClientRect().left - base, plain = Math.round(nx - lw);
      return plain > stuckAt ? Math.max(Math.round(stuckAt), Math.round(nx - lw - strip - gap)) : plain;
    });
    const max = sc.scrollWidth - sc.clientWidth, at = sc.scrollLeft;
    const target = Number(v) > 0 ? Math.min(max, ...starts.filter(s => s > at + 2)) : Math.max(0, ...starts.filter(s => s < at - 2 && s >= 0));
    sc.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: 'smooth' });
  },
  'pick-toggle'() {   // narrow: the sheet from the bottom edge (not remembered); wide: the selection at the right edge
    if (isNarrow()) state.sheet = !state.sheet; else { state.pickOpen = !state.pickOpen; save('pickOpen', state.pickOpen ? 'yes' : 'no'); }
    renderCompare();
  },
  move(v, el) { moveColumn(columnOf(el), Number(v)); },
  'clear-all'() { state.ask = 'clear'; renderOverlay(); },
  export() { state.ask = 'export'; renderOverlay(); },
  'export-csv'() { const e = exportRows(); download(exportName(e.columns, 'csv'), new Blob([csvOf(e.rows)], { type: 'text/csv;charset=utf-8' })); state.ask = null; renderOverlay(); },
  'export-xlsx'() { const e = exportRows(); download(exportName(e.columns, 'xlsx'), xlsxOf(e)); state.ask = null; renderOverlay(); },   // asks first (askHtml): it cannot be taken back
  'clear-yes'() {   // start again: no units, no Undo and Redo steps
    state.ask = null; state.sort = null; state.columns = []; undoStack.length = 0; redoStack.length = 0;
    keepAddress(); render(); renderOverlay();
  },
  clear() { remember(); state.columns = []; render(); },
  'pick-faction'(v) { state.pick.faction = v; state.pick.search = state.pick.weapon = ''; refreshChooser(); },
  'pick-category'(v) { state.pick.category = v; state.pick.search = state.pick.weapon = ''; refreshChooser(); },
  'pick-tier'(v) { const n = Number(v), s = state.pick.tiers; if (s.has(n)) s.delete(n); else s.add(n); refreshChooser(); },
  'pick-clear'() { state.pick.search = ''; refreshChooser(); },
  'pick-add'(v) {   // the new column is at the right end: show it
    if (isShown(v)) return;
    remember(); addUnit(v);
    keepAddress(); renderCompare(); showLastColumn(); renderNav();
  },
  versions() { state.versionsMode = !state.versionsMode; keepAddress(); render(); },
  'col-versions'(v, el) {
    const c = columnOf(el);
    if (!activeOf(c, 'versions') && !missingVersions(c).length) { note(el, 'All versions of this unit are shown already.'); return; }
    if (toggleTool(c, 'versions', () => addOtherVersions(c))) { keepAddress(); renderCompare(); renderNav(); }
  },
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
    state.refPct = !!f.pct;
    state.favOpen = false;
    if (location.hash === compareLink()) render(); else location.hash = compareLink();   // the address change shows the page
  },
  undo() { step(undoStack, redoStack); },
  redo() { step(redoStack, undoStack); },
  scav() { state.scav = !state.scav; keepAddress(); renderCompare(); },
  'col-counters'(v, el) {
    const c = columnOf(el);
    if (toggleTool(c, 'counters', () => { const list = countersOf(c.unit); if (!list.length) return false; state.columns = [c, ...list.map(n => newColumn(n))]; })) { keepAddress(); render(); }
  },
  'col-ref'(v, el) { setRef(columnOf(el), false); },   // the reference column stays where it is: moved only by hand (drag and drop, the arrows)
  'col-ref-pct'(v, el) { setRef(columnOf(el), true); },
  'col-ref-last'(v, el) { setRef(columnOf(el), state.refPct); },   // the balance: the mode chosen last (at first ±); on: off
  'add-counterparts'(v, el) {
    const c = columnOf(el), was = activeOf(c, 'counterparts');
    const done = toggleTool(c, 'counterparts', () => { const missing = counterpartsOf(c.unit).filter(n => !isShown(n)); if (!missing.length) return false; missing.forEach(addUnit); });
    if (done) { keepAddress(); renderCompare(); renderNav(); if (!was) showLastColumn(); }
  },
  'add-unit'(v) { remember(); addUnit(v); keepAddress(); render(); },
  'remove-column'(v, el) { remember(); const c = columnOf(el); state.columns = state.columns.filter(o => o !== c); keepAddress(); render(); },
};

// a column one place to the left (-1) or right (1); false at the edge
function moveColumn(c, by) {
  const at = state.columns.indexOf(c), to = at + by;
  if (at < 0 || to < 0 || to >= state.columns.length) return false;
  remember();
  state.columns.splice(at, 1); state.columns.splice(to, 0, c);
  keepAddress(); renderCompare();
  return true;
}

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
  if ((state.page !== 'compare' && state.page !== 'catalog') || !(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); actions.undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); actions.redo(); }
});

// the keyboard: Enter / Space press a card or row of the catalog (they are no <button>), the arrow keys move a column whose grip has the focus, Escape closes the favorites
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && (state.menu || state.detail || state.ask)) { actions['overlay-close'](); return; }
  if (e.key === 'Escape' && state.favOpen) { state.favOpen = false; renderNav(); document.querySelector('.fav-open').focus(); return; }
  const grip = e.target.closest && e.target.closest('.grip');
  if (grip && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    const c = columnOf(grip);
    if (!moveColumn(c, e.key === 'ArrowLeft' ? -1 : 1)) return;
    const again = app.querySelector(`[data-col="${c.id}"] .grip`);
    if (again) again.focus();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-a]')) { e.preventDefault(); e.target.click(); }
});

// all values of a unit: hold it (a phone) or right-click it, in the catalog and in the unit selection. Android sends "contextmenu" for a long press, iOS does not: a timer
const detailUnit = t => { const el = t.closest && t.closest('.card[data-v], .row[data-v], .pick[data-v]'); return el ? el.dataset.v : ''; };
let holdTimer = 0, held = false, quietUntil = 0;
document.addEventListener('contextmenu', e => { const n = detailUnit(e.target); if (n) { e.preventDefault(); actions.detail(n); } });
document.addEventListener('touchstart', e => {
  const n = detailUnit(e.target);
  clearTimeout(holdTimer); held = false;
  if (n) holdTimer = setTimeout(() => { held = true; actions.detail(n); }, 550);
}, { passive: true });
document.addEventListener('touchmove', () => clearTimeout(holdTimer), { passive: true });
for (const kind of ['touchend', 'touchcancel']) document.addEventListener(kind, () => { clearTimeout(holdTimer); if (held) { held = false; quietUntil = Date.now() + 500; } }, { passive: true });

document.addEventListener('click', e => {
  if (Date.now() < quietUntil) { e.preventDefault(); return; }   // the click that ends a long press: it neither marks the unit nor closes what was just opened
  if (state.favOpen && !e.target.closest('.fav-wrap')) { state.favOpen = false; renderNav(); }
  const diff = e.target.closest('.val [title], td [title]');   // a difference to the Ref: a click shows the value itself (a phone has no tooltip)
  if (diff) { note(diff, diff.title); return; }
  const el = e.target.closest('[data-a]');
  if (!el) return;
  if (el.tagName === 'A' && el.dataset.a === 'fav-load') {   // a favorite is a link: Ctrl, Shift or Cmd with the click leave it to the browser (a new tab or window)
    if (e.ctrlKey || e.metaKey || e.shiftKey) { state.favOpen = false; renderNav(); return; }
    e.preventDefault();   // a plain click: loaded here, with an Undo step
  }
  const menu = el.closest('.col-menu');   // an entry of the menu of a column: the menu closes (moving a column: it stays, to move on)
  if (menu && !['move', 'detail', 'overlay-close'].includes(el.dataset.a)) state.menu = null;
  actions[el.dataset.a](el.dataset.v, el);
  if (menu) renderOverlay();
});
window.addEventListener('scroll', updatePin, { passive: true });
// a device that is used with a finger: the columns snap into place after a swipe (style.css, snapTable)
const markTouch = () => document.documentElement.classList.add('touch');
if (window.matchMedia && matchMedia('(pointer: coarse)').matches) markTouch();
window.addEventListener('touchstart', markTouch, { passive: true, once: true });

document.addEventListener('input', e => {
  const kind = e.target.dataset.input;
  if (kind === 'catalog-search' || kind === 'pick-search') e.target.classList.toggle('code', isCodeSearch(e.target.value));
  if (kind === 'catalog-search') { state.search = e.target.value; renderCatalogUnits(); }
  if (kind === 'chg-search') { state.changes.search = e.target.value; e.target.classList.toggle('code', isCodeSearch(e.target.value)); document.getElementById('chg-body').innerHTML = changesListHtml(); }
  if (kind === 'pick-search') {   // only the list is made anew: the input keeps the focus
    state.pick.search = e.target.value;
    app.querySelector('.picker').innerHTML = pickerHtml();
    app.querySelector('.picker').scrollTop = 0;
    for (const b of app.querySelectorAll('.chooser .filt-fac [data-v]')) b.classList.toggle('active', !state.pick.search && !state.pick.weapon && b.dataset.v === state.pick.faction);
    for (const b of app.querySelectorAll('.chooser .tabs [data-v]')) b.classList.toggle('active', !state.pick.search && !state.pick.weapon && b.dataset.v === state.pick.category);
  }
});

document.addEventListener('change', async e => {
  const kind = e.target.dataset.change;
  if (kind === 'chg-from' || kind === 'chg-to') {   // another range: the address carries it
    const from = kind === 'chg-from' ? e.target.value : state.changesFrom, to = kind === 'chg-to' ? e.target.value : state.changesTo;
    location.hash = changesLink(to, indexOf(from) < indexOf(to) ? from : versionBefore(to));
  }
  if (kind === 'chg-scav') { state.changes.scav = e.target.checked; document.getElementById('chg-body').innerHTML = changesListHtml(); }
  if (kind === 'chg-key') { state.changes.key = e.target.value; document.getElementById('chg-body').innerHTML = changesListHtml(); }
  if (kind === 'names') { state.showNames = e.target.checked; save('showNames', state.showNames ? 'yes' : 'no'); renderCatalogUnits(); }
  if (kind === 'version') {
    remember();
    selectVersion(e.target.value);
    state.columns = state.columns.filter(c => unitOf(c));   // a unit that this version does not have
    keepAddress(); render();
  }
  if (kind === 'pick-weapon') { state.pick.weapon = e.target.value; refreshChooser(); app.querySelector('.picker').scrollTop = 0; }   // the units with this weapon
  if (kind === 'col-weapon') {   // a column shows one weapon of its unit, or all together
    const c = columnOf(e.target);
    remember();
    c.weapon = e.target.value || null;
    keepAddress(); renderCompare(); renderNav();
  }
  if (kind === 'col-version') {   // a column shows its unit in another game version
    const c = columnOf(e.target);
    remember();
    // back to the version it shows without a version of its own: free again (not "armck@<version>": the unit counts as shown, no second column of it)
    c.version = e.target.value === stateVersion({ unit: c.unit, version: null }) ? null : e.target.value;
    keepAddress(); renderCompare(); renderNav();
  }
});

let wasNarrow = isNarrow(), wasPhone = isPhone();
window.addEventListener('resize', () => {
  if (isNarrow() !== wasNarrow || isPhone() !== wasPhone) { wasNarrow = isNarrow(); wasPhone = isPhone(); state.sheet = false; state.menu = null; render(); return; }   // the layout for phones is another one
  if (state.page === 'compare') fitLayout();
});
start();
