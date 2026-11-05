// The website: unit catalog and comparison (SPECIFICATION_WEBSITE.md). Plain JavaScript without a build step; the data comes from assets/ (exporter/reduce_units.py).
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
  units: {}, equivalent: {}, versions: [], version: '',
  page: 'catalog', faction: 'arm', category: 'bots', search: '', tiers: new Set(),
  view: load('view', 'grid'), showNames: load('showNames', 'yes') === 'yes',
  columns: [],
};
let nextColumn = 1;

function load(key, fallback) { try { return localStorage.getItem('barunit.' + key) || fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem('barunit.' + key, value); } catch { /* no storage: the setting lasts until the page is reloaded */ } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const factionName = id => (FACTIONS.find(f => f.id === id) || { name: id }).name;
const byTechAndCost = (a, b) => state.units[a].tech - state.units[b].tech || state.units[a].metal - state.units[b].metal || state.units[a].name.localeCompare(state.units[b].name);
const pictureTag = (unit, cls = 'pic') => `<img class="${cls}" loading="lazy" alt="" data-unit="${esc(unit)}" src="${state.dir}images/${esc(unit)}.${PICTURE_TYPES[0]}">`;
const iconTag = u => u.icon ? `<img class="role" loading="lazy" alt="" src="${state.dir}images/icons/${esc(u.icon)}">` : '';

// a missing picture: the next format; after the last one all formats once more a moment later (a failed request is not always a missing file); a missing icon: nothing.
// Error events do not bubble, so they are caught on the way down.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.dataset.unit) { img.style.visibility = 'hidden'; return; }
  const tried = (Number(img.dataset.tried) || 0) + 1;
  if (tried < PICTURE_TYPES.length) { img.dataset.tried = tried; img.src = `${state.dir}images/${img.dataset.unit}.${PICTURE_TYPES[tried]}`; return; }
  if (img.dataset.again) { img.style.visibility = 'hidden'; return; }
  img.dataset.again = '1';
  img.dataset.tried = 0;
  setTimeout(() => { img.src = `${state.dir}images/${img.dataset.unit}.${PICTURE_TYPES[0]}`; }, 800);
}, true);

// ------------------------------------------------------------------ data
async function loadJson(name) {
  const r = await fetch(DATA + name, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
}

// The file is gzip: the page unpacks it itself, so that it works on every host. A server that sends it with Content-Encoding: gzip has it unpacked by the browser already.
async function loadCompressedJson(name) {
  const r = await fetch(DATA + name, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  const bytes = await r.arrayBuffer();
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { /* not unpacked yet */ }
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}

// the unit data of one game version, loaded when it is chosen: assets/<version>/data/, its pictures and icons in assets/<version>/images/
async function loadVersion(v) {
  const data = await loadCompressedJson(`${v.dir}/data/${v.file}`);
  state.units = data.units;
  state.dir = `${DATA}${v.dir}/`;
  state.version = data.gameVersion;
}

async function start() {
  try {
    state.versions = (await loadJson('versions.json')).versions;
    await loadVersion(state.versions[state.versions.length - 1]);   // the newest
  } catch (e) {
    app.innerHTML = `<p class="message">No data found (${esc(e.message)}).<br>Run <code>export and render all units.bat</code> first, and open this page through <code>website/serve.bat</code>.</p>`;
    return;
  }
  try {
    const eq = (await loadJson('equivalences.json')).units;   // id -> units; without the file there are simply no equivalents
    for (const [unit, id] of Object.entries(eq)) (state.equivalent[id] = state.equivalent[id] || []).push(unit);
    state.equivalenceOf = eq;
  } catch { state.equivalenceOf = {}; }
  try { state.counters = (await loadJson('counters.json')).counters; } catch { state.counters = {}; }   // unit -> the units that counter it (exporter/export_counters.py)
  window.addEventListener('hashchange', route);
  route();
}

// ------------------------------------------------------------------ the address: #/catalog/<faction>/<category>, #/compare/<unit>,<unit>
function route() {
  const [page, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (page === 'compare') {
    state.page = 'compare';
    const wanted = (a || '').split(',').filter(u => state.units[u]);
    const current = state.columns.filter(c => c.unit).map(c => c.unit);
    if (wanted.length && wanted.join() !== current.join()) state.columns = wanted.map(u => newColumn(u));
    if (!state.columns.length) state.columns = [newColumn(null, 'arm'), newColumn(null, 'cor')];
  } else {
    state.page = 'catalog';
    if (FACTIONS.some(f => f.id === a)) state.faction = a;
    if (CATEGORIES.some(c => c.id === b)) state.category = b;
  }
  render();
}

function newColumn(unit, faction) {
  const u = unit && state.units[unit];
  return { id: nextColumn++, unit: unit || null, faction: u ? u.faction : faction, category: u ? u.category : 'bots', search: '', picking: !unit };
}

const chosenUnits = () => state.columns.filter(c => c.unit).map(c => c.unit);
const compareLink = () => '#/compare/' + chosenUnits().join(',');
function keepAddress() { if (state.page === 'compare') history.replaceState(null, '', compareLink()); }

// ------------------------------------------------------------------ frame
function render() {
  renderNav();
  if (state.page === 'compare') renderCompare(); else renderCatalog();
  renderTray();
}

function renderNav() {
  document.getElementById('nav-links').innerHTML = `<a href="#/catalog/${state.faction}/${state.category}" class="${state.page === 'catalog' ? 'active' : ''}">Catalog</a>
    <a href="${compareLink()}" class="${state.page === 'compare' ? 'active' : ''}">Compare${chosenUnits().length ? ` (${chosenUnits().length})` : ''}</a>`;
  document.getElementById('version').innerHTML = state.versions.length > 1
    ? `Game version <select data-change="version">${state.versions.map(v => `<option value="${esc(v.dir)}" ${v.version === state.version ? 'selected' : ''}>${esc(v.version)}</option>`).join('')}</select>`
    : `Game version ${esc(state.version)}`;
}

// ------------------------------------------------------------------ catalog
function catalogUnits() {
  const search = state.search.trim().toLowerCase();
  return Object.keys(state.units).filter(n => {
    const u = state.units[n];
    if (u.faction !== state.faction || (state.tiers.size && !state.tiers.has(u.tech))) return false;
    return search ? (u.name + ' ' + u.description + ' ' + n).toLowerCase().includes(search) : u.category === state.category;
  }).sort(byTechAndCost);
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
      <input class="search" data-input="catalog-search" placeholder="Search unit" value="${esc(state.search)}">
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
      return `<div class="row ${chosen.has(n) ? 'selected' : ''}" data-a="toggle" data-v="${esc(n)}" title="Add to the comparison"><span class="tier t${u.tech}">T${u.tech}</span>${iconTag(u) || '<span></span>'}${pictureTag(n)}
        <span>${esc(u.name)}</span><span class="desc">${esc(u.description)}</span><span class="num opt">${whole(u.metal)}</span><span class="num opt">${whole(u.energy)}</span><span class="num opt">${whole(u.hitpoints)}</span><span class="num">${u.dps ? whole(u.dps) : ''}</span></div>`;
    }).join('')}</div>`;
    return;
  }
  box.innerHTML = `<div class="grid ${state.showNames ? '' : 'hide-names'}">${list.map(n => {
    const u = state.units[n], on = chosen.has(n);
    return `<div class="card ${on ? 'selected' : ''}" data-a="toggle" data-v="${esc(n)}" title="${esc(u.name)}: add to the comparison"><span class="tier t${u.tech}">T${u.tech}</span>${iconTag(u)}${on ? '<span class="check">&#10003;</span>' : ''}${pictureTag(n)}
      <div class="name">${esc(u.name)}</div><div class="desc">${esc(u.description)}</div></div>`;
  }).join('')}</div>`;
}

function renderTray() {
  const units = chosenUnits(), tray = document.getElementById('tray');
  if (state.page !== 'catalog' || !units.length) { tray.innerHTML = ''; return; }
  tray.innerHTML = `<div class="tray"><div class="thumbs">${units.slice(-12).map(u => pictureTag(u, '')).join('')}</div>
    <span>${units.length} unit${units.length > 1 ? 's' : ''}</span><button class="btn" data-a="clear">Clear</button><a class="btn go" href="${compareLink()}">Compare</a></div>`;
}

// ------------------------------------------------------------------ compare
function columnUnits(c) {
  const search = c.search.trim().toLowerCase();
  return Object.keys(state.units).filter(n => {
    const u = state.units[n];
    if (u.faction !== c.faction) return false;
    return search ? (u.name + ' ' + u.description + ' ' + n).toLowerCase().includes(search) : u.category === c.category;   // a search looks in all categories
  }).sort(byTechAndCost);
}

function renderCompare() {
  const present = [...new Set(state.columns.map(c => c.faction))];
  document.title = 'Compare - BAR Unit Comparer';
  const columns = state.columns, two = columns.length === 2;
  const max = {};
  const reference = columns.find(c => c.ref && c.unit && !c.picking);   // with a reference column the bars of the others are coloured
  for (const s of STATS) if (s.fill) max[s.key] = Math.max(0, ...columns.filter(c => c.unit && !c.picking).map(c => state.units[c.unit][s.key]));
  app.innerHTML = `<h2 class="cmp-kicker">Compare</h2>
    <h1 class="cmp-title">${present.map(f => factionName(f)).join(' <span>vs.</span> ')}</h1>
    <div class="cmp-scroll"><div class="cmp-grid ${two ? 'two' : ''}" style="--n:${Math.max(columns.length, 1)}">${columns.map((c, i) => columnHtml(c, i, two ? (i ? 'right' : 'left') : '', max, reference)).join('')}</div>
      <button class="add-column" data-a="add-column" title="Add a column">+ Add column</button></div>`;
  fitPickers();
}

// the unit selection takes the height that is left in the window: the page needs no scrollbar and the footer stays at the bottom
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

function fitPickers() {
  const pickers = [...document.querySelectorAll('.picker')];
  fitPictures();
  if (!pickers.length) return;
  for (const p of pickers) p.style.height = '0px';
  const cell = Math.max(...pickers.map(p => p.parentElement.offsetHeight));   // the rows that the other columns need beside it
  document.body.style.minHeight = '0';
  const free = window.innerHeight - document.body.offsetHeight;   // what is left in the window
  document.body.style.minHeight = '';
  for (const p of pickers) p.style.height = Math.max(80, free + cell) + 'px';
}

function columnHtml(c, col, side, max, reference) {
  const u = !c.picking && c.unit && state.units[c.unit], list = columnUnits(c);
  const at = r => `style="grid-column:${col + 1};grid-row:${r}"`;
  return `<div class="c-head f-${c.faction} ${side}" data-col="${c.id}" ${at(1)}>
      <div class="c-title"><b>${factionName(c.faction)}</b><small>Showing <em data-count>${list.length}</em> units</small><span class="c-tools">${countersButton(c)}${`<button class="ref ${c.ref ? 'active' : ''}" data-a="col-ref" title="Use this unit as the reference for the colours of the other columns">Ref</button>`}${state.columns.length > 1 ? `<button class="x" data-a="remove-column" title="Remove this column">&#10005;</button>` : ''}</span></div>
      <div class="c-factions">${FACTIONS.map(f => `<button data-a="col-faction" data-v="${f.id}" class="f-${f.id} ${f.id === c.faction ? 'active' : ''}">${f.name}</button>`).join('')}</div>
      <div class="c-search"><input class="search" data-input="col-search" placeholder="Search Unit" value="${esc(c.search)}">${c.search ? '<button class="clear" data-a="col-clear-search" title="Clear the search">&#10005;</button>' : ''}</div>
      <div class="c-cats">${CATEGORIES.map(k => `<button data-a="col-category" data-v="${k.id}" class="${k.id === c.category && !c.search ? 'active' : ''}">${k.icon}${k.long}</button>`).join('')}</div>
    </div>
    ${c.picking ? `<div class="c-unit f-${c.faction} ${side}" data-col="${c.id}" style="grid-column:${col + 1};grid-row:2 / span 2"><div class="picker" data-picker>${pickerHtml(c, list)}</div></div>` : `<div class="c-unit f-${c.faction} ${side}" data-col="${c.id}" ${at(2)}>${u ? unitHtml(c, u) : ''}</div>
    <div class="stats f-${c.faction} ${side}" ${at(3)}>${u ? STATS.map(s => statHtml(s, u, max, reference && !c.ref ? state.units[reference.unit] : null)).join('') : ''}</div>`}`;
}

function countersButton(c) {
  const has = !c.picking && c.unit && countersOf(c.unit).length > 0;
  const tip = has ? 'Replace all other columns with the units that counter this unit (after the unit counter charts of beyondallreason.info).' : 'No counters are known for this unit (the counter charts list only some units), or no unit is chosen.';
  return `<button class="counters" data-a="col-counters" title="${tip}" ${has ? '' : 'disabled'}>Counters</button>`;
}

function pickerHtml(c, list) {
  if (!list.length) return '<p class="empty">No units here.</p>';
  return list.map(n => {
    const u = state.units[n];
    return `<button class="pick ${n === c.unit ? 'current' : ''}" data-a="col-pick" data-v="${esc(n)}" title="${esc(u.name)}: ${esc(u.description)}"><span class="tier t${u.tech}">T${u.tech}</span>${pictureTag(n, '')}${esc(u.name)}</button>`;
  }).join('');
}

// the units that counter this one (a scavenger unit like its normal unit)
const countersOf = unit => (state.counters[unit.replace(/_scav$/, '')] || []).filter(n => state.units[n]);

function equivalentsOf(unit) {
  const id = state.equivalenceOf[unit];
  if (id === undefined) return [];
  const own = state.units[unit];
  return (state.equivalent[id] || []).filter(n => n !== unit && state.units[n] && (own.faction === 'scv' ? true : state.units[n].faction !== 'scv'));
}

function unitHtml(c, u) {
  const eq = equivalentsOf(c.unit);
  return `<div class="c-pic">${pictureTag(c.unit, '')}<button class="x square" data-a="col-unit-clear" title="Choose another unit">&#10005;</button></div>
    <div class="c-name">${esc(u.name)}</div>
    <div class="c-desc">${esc(u.description)}<span class="tier t${u.tech}">T${u.tech}</span></div>
    ${eq.length ? `<div class="c-eq">Equivalent: ${eq.map(n => `<button class="f-${state.units[n].faction}" data-a="add-unit" data-v="${esc(n)}" title="Add a column with this unit (${factionName(state.units[n].faction)})">${esc(state.units[n].name)}</button>`).join('')}</div>` : ''}`;
}

function statHtml(s, u, max, ref) {
  if (s.key === 'weapons') return `<div class="stat"><label>${s.label}</label><div class="weapons">${esc(u.weapons.join(', '))}</div></div>`;
  const v = u[s.key];
  if (!v) return `<div class="stat"><label>${s.label}</label><div></div></div>`;
  const share = max[s.key] ? 100 * v / max[s.key] : 0;
  const worse = ref && (s.lower ? v > ref[s.key] : v < ref[s.key]);
  const verdict = ref ? (worse ? ' diff-bad' : ' diff-good') : '';
  return `<div class="stat"><label>${s.label}</label><div class="bar"><div class="fill fill-${s.fill}${verdict}" style="width:${share.toFixed(1)}%"></div><span class="val">${s.show(v)}</span></div></div>`;
}

function toggleUnit(unit) {
  const at = state.columns.find(c => c.unit === unit);
  if (at) state.columns = state.columns.filter(c => c !== at);
  else addUnit(unit);
}

function addUnit(unit) {
  const empty = state.columns.find(c => !c.unit), u = state.units[unit];
  if (empty) Object.assign(empty, { unit, faction: u.faction, category: u.category, search: '', picking: false });
  else state.columns.push(newColumn(unit));
}

// ------------------------------------------------------------------ what the user does
const columnOf = el => state.columns.find(c => c.id === Number(el.closest('[data-col]').dataset.col));

const actions = {
  view(v) { state.view = v; save('view', v); renderCatalog(); },
  tier(v) { const t = Number(v); if (state.tiers.has(t)) state.tiers.delete(t); else state.tiers.add(t); renderCatalog(); },
  toggle(v) { toggleUnit(v); renderCatalogUnits(); renderNav(); renderTray(); },   // only the units: the search keeps its focus, the page its position
  clear() { state.columns = []; render(); },
  'col-counters'(v, el) { const c = columnOf(el); state.columns = [c, ...countersOf(c.unit).map(n => newColumn(n))]; keepAddress(); render(); },
  'col-ref'(v, el) { const c = columnOf(el), was = c.ref; for (const o of state.columns) o.ref = false; c.ref = !was; renderCompare(); },
  'add-column'() { const used = state.columns.map(c => c.faction); state.columns.push(newColumn(null, (FACTIONS.find(f => !used.includes(f.id)) || FACTIONS[0]).id)); render(); },
  'add-unit'(v) { state.columns.push(newColumn(v)); keepAddress(); render(); },
  'remove-column'(v, el) { const c = columnOf(el); state.columns = state.columns.filter(o => o !== c); keepAddress(); render(); },
  'col-faction'(v, el) { const c = columnOf(el); c.faction = v; c.picking = true; renderCompare(); },
  'col-category'(v, el) { const c = columnOf(el); c.category = v; c.search = ''; c.picking = true; renderCompare(); },
  'col-clear-search'(v, el) { const c = columnOf(el); c.search = ''; renderCompare(); },
  'col-pick'(v, el) { const c = columnOf(el); Object.assign(c, { unit: v, picking: false, search: '' }); keepAddress(); render(); },
  'col-unit-clear'(v, el) { const c = columnOf(el); c.unit = null; c.picking = true; keepAddress(); render(); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el) actions[el.dataset.a](el.dataset.v, el);
});

document.addEventListener('input', e => {
  const kind = e.target.dataset.input;
  if (kind === 'catalog-search') { state.search = e.target.value; renderCatalogUnits(); }
  if (kind === 'col-search') {
    const c = columnOf(e.target), caret = e.target.selectionStart;
    c.search = e.target.value;
    c.picking = true;
    renderCompare();   // the input is made anew: it keeps the focus and the caret
    const input = app.querySelector(`[data-col="${c.id}"] [data-input="col-search"]`);
    input.focus();
    input.setSelectionRange(caret, caret);
  }
});

document.addEventListener('change', async e => {
  const kind = e.target.dataset.change;
  if (kind === 'names') { state.showNames = e.target.checked; save('showNames', state.showNames ? 'yes' : 'no'); renderCatalogUnits(); }
  if (kind === 'version') {
    await loadVersion(state.versions.find(v => v.dir === e.target.value));
    state.columns = state.columns.filter(c => !c.unit || state.units[c.unit]);   // a unit that this version does not have
    render();
  }
});

window.addEventListener('resize', () => { if (state.page === 'compare') fitPickers(); });
start();
