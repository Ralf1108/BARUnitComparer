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
  units: {}, counterpart: {}, versions: [], version: '',
  page: 'catalog', faction: 'arm', category: 'bots', search: '', tiers: new Set(),
  view: load('view', 'grid'), showNames: load('showNames', 'yes') === 'yes',
  columns: [], scav: false, table: load('table', 'no') === 'yes', pick: { faction: 'arm', category: 'bots', search: '' }, pickOpen: load('pickOpen', 'yes') === 'yes',
};
let nextColumn = 1;

// favorites: saved selections of units (a list of unit names each), kept in the browser
function loadFavorites() { try { return JSON.parse(load('favorites', '[]')).filter(Array.isArray); } catch { return []; } }
state.favorites = loadFavorites();
state.favOpen = false;
const favKey = units => units.join(',');
const currentFavorite = () => state.favorites.findIndex(f => favKey(f) === favKey(state.columns.map(c => c.unit)));

function load(key, fallback) { try { return localStorage.getItem('barunit.' + key) || fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem('barunit.' + key, value); } catch { /* no storage: the setting lasts until the page is reloaded */ } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const factionName = id => (FACTIONS.find(f => f.id === id) || { name: id }).name;
const byTechAndCost = (a, b) => state.units[a].tech - state.units[b].tech || state.units[a].metal - state.units[b].metal || state.units[a].name.localeCompare(state.units[b].name);
const pictureTag = (unit, cls = 'pic') => `<img class="${cls}" loading="lazy" alt="" data-unit="${esc(unit)}" src="${state.dir}images/${esc(unit)}.${PICTURE_TYPES[0]}">`;
// a card or row of the catalog is a toggle button: reachable with Tab, Enter or Space presses it (the keydown handler below)
const pressable = on => `tabindex="0" role="button" aria-pressed="${on}"`;
// the grip of a column: dragged with the mouse, or focused and moved with the arrow keys left / right
const GRIP = '<span class="grip" draggable="true" tabindex="0" role="button" aria-label="Move this column (arrow keys left and right)" title="Drag to move this column left or right (or focus it and use the arrow keys)">&#8942;&#8942;</span>';
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
  if (page === 'compare') {
    state.page = 'compare';
    const wanted = [...new Set((a || '').split(',').filter(u => state.units[u]))];
    const current = state.columns.map(c => c.unit);
    if (wanted.length && wanted.join() !== current.join()) state.columns = wanted.map(u => newColumn(u));
    // the view of the link (an old link without these keeps the view of the browser, has no Ref and no + Scav)
    if (params.has('view')) state.table = params.get('view') === 'table';
    state.scav = params.get('scav') === '1';
    const ref = params.get('ref');
    for (const c of displayColumns()) c.ref = c.unit === ref;
  } else {
    state.page = 'catalog';
    if (FACTIONS.some(f => f.id === a)) state.faction = a;
    if (CATEGORIES.some(c => c.id === b)) state.category = b;
  }
  render();
}

function newColumn(unit) {
  return { id: nextColumn++, unit, faction: state.units[unit].faction };
}

const chosenUnits = () => state.columns.map(c => c.unit);
// the link of the comparison carries the units and how they are shown, so that a shared link looks the same for the other one
function compareLink() {
  const params = new URLSearchParams({ view: state.table ? 'table' : 'graphic' });
  if (state.scav) params.set('scav', '1');
  const ref = state.columns.length && displayColumns().find(c => c.ref);
  if (ref) params.set('ref', ref.unit);
  return '#/compare/' + chosenUnits().join(',') + '?' + params;
}
function keepAddress() { if (state.page === 'compare') history.replaceState(null, '', compareLink()); }

// ------------------------------------------------------------------ frame
function render() {
  renderNav();
  if (state.page === 'compare') renderCompare(); else renderCatalog();
  renderTray();
}

function favPanelHtml() {
  if (!state.favOpen) return '';
  const items = state.favorites.map((f, i) => {
    const names = f.filter(n => state.units[n]).map(n => `<span class="f-${state.units[n].faction}">${esc(state.units[n].name)}</span>`);
    return names.length ? `<div class="fav-item"><button class="fav-load" data-a="fav-load" data-v="${i}" title="Load these units into the comparison (Undo brings the old selection back)">${names.join(', ')}</button><button class="fav-del" data-a="fav-del" data-v="${i}" title="Remove this favorite" aria-label="Remove this favorite">&#10005;</button></div>` : '';
  }).join('');
  return `<div class="fav-panel">${items || '<p class="empty">No favorites yet: press the star on the Compare page.</p>'}</div>`;
}

function renderNav() {
  document.getElementById('nav-links').innerHTML = `<a href="#/catalog/${state.faction}/${state.category}" class="${state.page === 'catalog' ? 'active' : ''}">Catalog</a>
    <a href="${compareLink()}" class="${state.page === 'compare' ? 'active' : ''}">Compare${chosenUnits().length ? ` (${chosenUnits().length})` : ''}</a>
    <span class="fav-wrap"><button class="fav-open ${state.favOpen ? 'active' : ''}" data-a="fav-menu" title="The saved selections of units">&#9733; Favorites${state.favorites.length ? ` (${state.favorites.length})` : ''}</button>${favPanelHtml()}</span>`;
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
    return search ? matchUnit(n, u, search) : u.category === state.category;
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
      return `<div class="row ${chosen.has(n) ? 'selected' : ''}" data-a="toggle" data-v="${esc(n)}" ${pressable(chosen.has(n))} title="${chosen.has(n) ? 'In the comparison: press to take it out' : 'Add to the comparison'}"><span class="tier t${u.tech}">T${u.tech}</span>${iconTag(u) || '<span></span>'}${pictureTag(n)}
        <span>${esc(u.name)}</span><span class="desc">${esc(u.description)}</span><span class="num opt">${whole(u.metal)}</span><span class="num opt">${whole(u.energy)}</span><span class="num opt">${whole(u.hitpoints)}</span><span class="num">${u.dps ? whole(u.dps) : ''}</span></div>`;
    }).join('')}</div>`;
    return;
  }
  box.innerHTML = `<div class="grid ${state.showNames ? '' : 'hide-names'}">${list.map(n => {
    const u = state.units[n], on = chosen.has(n);
    return `<div class="card ${on ? 'selected' : ''}" data-a="toggle" data-v="${esc(n)}" ${pressable(on)} title="${esc(u.name)}: ${on ? 'in the comparison, press to take it out' : 'add to the comparison'}"><span class="tier t${u.tech}">T${u.tech}</span>${iconTag(u)}${on ? '<span class="check">&#10003;</span>' : ''}${pictureTag(n)}
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

function pickUnits() {
  const p = state.pick, search = p.search.trim().toLowerCase();
  return Object.keys(state.units).filter(n => {
    const u = state.units[n];
    if (search) return matchUnit(n, u, search);   // a search looks in all factions and categories
    return u.faction === p.faction && u.category === p.category;
  }).sort(byTechAndCost);
}

function renderCompare() {
  document.title = 'Compare - BAR Unit Comparer';
  const columns = displayColumns(), two = columns.length === 2;
  const max = {};
  const reference = columns.find(c => c.ref);   // with a reference column the bars of the others are coloured
  for (const s of STATS) if (s.fill) max[s.key] = Math.max(0, ...columns.map(c => state.units[c.unit][s.key]));
  const stats = STATS.filter(s => columns.some(c => s.key === 'weapons' ? state.units[c.unit].weapons.length : state.units[c.unit][s.key]));   // only what a unit has
  const scroll = app.querySelector('.cmp-scroll'), left = scroll ? scroll.scrollLeft : 0;   // the columns are made anew: the sideways position stays
  const list = app.querySelector('.picker'), listTop = list ? list.scrollTop : 0;
  app.innerHTML = `<h2 class="cmp-kicker">Compare</h2>
    <div class="cmp-clear"><button class="btn" data-a="undo" title="Undo the last change of the columns (Ctrl+Z)" ${undoStack.length ? '' : 'disabled'}>&#8630; Undo</button> <button class="btn" data-a="redo" title="Redo (Ctrl+Y)" ${redoStack.length ? '' : 'disabled'}>Redo &#8631;</button> <button class="btn" data-a="view-table" title="${state.table ? 'Back to the graphic view with pictures and bars' : 'Compact table: one row per value, one column per unit'}">${state.table ? 'Graphic view' : 'Table view'}</button> <button class="btn fav-star ${currentFavorite() >= 0 ? 'on' : ''}" data-a="fav-save" title="${currentFavorite() >= 0 ? 'This selection is a favorite: press to remove it' : 'Save this selection of units as a favorite (list: Favorites at the top)'}" ${state.columns.length ? '' : 'disabled'}>${currentFavorite() >= 0 ? '&#9733;' : '&#9734;'}</button> <button class="btn ${state.scav ? 'go' : ''}" data-a="scav" title="Scavengers: show the Scavenger copy of every unit right next to it (stronger: about 10 % more cost, 25 % more hitpoints). Press again to take them out.">+ Scav</button> <button class="btn" data-a="clear-all" title="Remove all units from the comparison and start again" ${state.columns.length ? '' : 'disabled'}>Clear all units</button></div>
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
  return `<div class="c-head f-scv${sticky}" data-col="${c.id}" ${at(1)}><div class="c-title"><b>Scavengers</b></div>
    <div class="c-tools">${refButton(c)}</div></div>`;
}

const refButton = c => `<button class="ref ${c.ref ? 'active' : ''}" data-a="col-ref" title="Reference: the bars of all other columns are coloured green (as good or better) or red (worse) in comparison with this unit. Press again to switch it off.">Ref</button>`;

// the compact view: one row per value, one column per unit, the same red / green against the reference
function tableHtml(columns, stats, max, reference) {
  const head = c => {
    const u = state.units[c.unit], tools = c.scavOf ? refButton(c) : `${countersButton(c)}${refButton(c)}<button class="x" data-a="remove-column" title="Remove this column" aria-label="Remove this column">&#10005;</button>`;
    return `<th class="f-${c.faction}${c.ref ? ' is-ref' : ''}" data-col="${c.id}"><div class="t-pic">${pictureTag(c.unit, '')}</div><div class="t-fac">${c.scavOf ? 'Scavengers' : factionName(c.faction)}</div><div class="t-name">${esc(u.name)} <span class="tier t${u.tech}">T${u.tech}</span></div><div class="t-desc">${esc(u.description)}</div><div class="c-tools">${c.scavOf ? '' : '${GRIP}'}${tools}</div></th>`;
  };
  const cell = (s, c) => {
    const u = state.units[c.unit];
    if (s.key === 'weapons') return `<td data-col="${c.id}">${esc(u.weapons.join(', '))}</td>`;
    const v = u[s.key];
    if (!v) return `<td data-col="${c.id}"></td>`;
    const ref = reference && !c.ref ? state.units[reference.unit] : null;
    const verdict = ref ? ((s.lower ? v > ref[s.key] : v < ref[s.key]) ? ' diff-bad' : ' diff-good') : '';
    return `<td data-col="${c.id}" class="num${verdict}${v === max[s.key] ? ' top' : ''}">${s.show(v)}</td>`;
  };
  return `<table class="cmp-table"><thead><tr><th class="t-corner"></th>${columns.map(head).join('')}</tr></thead>
    <tbody>${stats.map(s => `<tr><th>${s.label}</th>${columns.map(c => cell(s, c)).join('')}</tr>`).join('')}</tbody></table>`;
}

function columnHtml(c, col, side, max, reference, stats) {
  const u = state.units[c.unit], ref = reference && !c.ref ? state.units[reference.unit] : null;
  const at = r => `style="grid-column:${col + 1};grid-row:${r}"`;
  const sticky = c.ref ? ' is-ref' : '';
  const head = c.scavOf ? scavengerHead(c, at, sticky) : `<div class="c-head f-${c.faction} ${side}${sticky}" data-col="${c.id}" ${at(1)}>
      <div class="c-title"><b>${factionName(c.faction)}</b></div>
      <div class="c-tools">${GRIP}${countersButton(c)}${refButton(c)}<button class="x" data-a="remove-column" title="Remove this column" aria-label="Remove this column">&#10005;</button></div>
    </div>`;
  return head + `<div class="c-unit f-${c.faction} ${side}${sticky}" data-col="${c.id}" ${at(2)}>${unitHtml(c, u)}</div>
    <div class="stats f-${c.faction} ${side}${sticky}" ${at(3)}>${stats.map(s => statHtml(s, u, max, ref)).join('')}</div>`;
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
  if (!list.length) return '<p class="empty">No units here.</p>';
  return list.map(n => {
    const u = state.units[n];
    return `<button class="pick ${isShown(n) ? 'chosen' : ''}" data-a="pick-add" data-v="${esc(n)}" title="${esc(u.name)}: ${esc(u.description)} - ${isShown(n) ? 'is already in the comparison' : 'add a column'}"><span class="tier t${u.tech}">T${u.tech}</span>${pictureTag(n, '')}${esc(u.name)}</button>`;
  }).join('');
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
  return (state.counterpart[id] || []).filter(n => n !== unit && state.units[n] && (own.faction === 'scv' ? true : state.units[n].faction !== 'scv'));
}

function unitHtml(c, u) {
  const eq = c.scavOf ? [] : counterpartsOf(c.unit);
  return `<div class="c-pic">${pictureTag(c.unit, '')}</div>
    <div class="c-name">${esc(u.name)}</div>
    <div class="c-desc">${esc(u.description)}<span class="tier t${u.tech}">T${u.tech}</span></div>
    ${eq.length ? `<div class="c-eq"><button class="c-eq-all" data-a="add-counterparts" title="Add all counterparts of this unit as columns (the ones that are not in the comparison yet)">Counterparts:</button> ${eq.map(n => `<button class="f-${state.units[n].faction}" data-a="add-unit" data-v="${esc(n)}" title="Add a column with this unit (${factionName(state.units[n].faction)})">${esc(state.units[n].name)}</button>`).join('')}</div>` : ''}`;
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

// a unit is in the comparison once (also a Scavenger copy that "+ Scav" shows)
const isShown = unit => state.columns.some(c => c.unit === unit || (state.scav && c.unit + '_scav' === unit));
// undo / redo of the columns: every change of the set or the order of the columns first puts the old list on the stack
const undoStack = [], redoStack = [];
function remember() { undoStack.push(state.columns.slice()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
function step(from, to) {
  if (!from.length) return;
  to.push(state.columns.slice());
  state.columns = from.pop().filter(c => state.units[c.unit]);   // a unit that the game version chosen since then does not have
  keepAddress(); render();
}

function addUnit(unit) { if (!isShown(unit)) state.columns.push(newColumn(unit)); }

// ------------------------------------------------------------------ what the user does
// with "+ Scav" every column with a unit gets its Scavenger copy as a column right of it (made here, not kept in state.columns)
function displayColumns() {
  const list = state.columns.flatMap(c => {
    if (!state.scav || !state.units[c.unit + '_scav'] || state.columns.some(o => o.unit === c.unit + '_scav')) return [c];
    const s = c.scavColumn = c.scavColumn || { id: nextColumn++, faction: 'scv', scavOf: c.id };
    s.unit = c.unit + '_scav';
    return [c, s];
  });
  const at = list.findIndex(c => c.ref);   // the reference column is the first one and stays at the left edge when the columns are scrolled
  if (at > 0) list.unshift(...list.splice(at, 1));
  return list;
}
const columnOf = el => displayColumns().find(c => c.id === Number(el.closest('[data-col]').dataset.col));

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
  'pick-add'(v) { if (isShown(v)) return; remember(); addUnit(v); keepAddress(); renderCompare(); const s = app.querySelector('.cmp-scroll'); s.scrollLeft = s.scrollWidth; renderNav(); },   // the new column is at the right end: show it
  'view-table'() { state.table = !state.table; save('table', state.table ? 'yes' : 'no'); keepAddress(); renderCompare(); },
  'fav-menu'() { state.favOpen = !state.favOpen; renderNav(); },
  'fav-save'() {
    const at = currentFavorite();
    if (at >= 0) state.favorites.splice(at, 1); else state.favorites.push(state.columns.map(c => c.unit));
    save('favorites', JSON.stringify(state.favorites)); renderNav(); renderCompare();
  },
  'fav-del'(v) { state.favorites.splice(Number(v), 1); save('favorites', JSON.stringify(state.favorites)); renderNav(); if (state.page === 'compare') renderCompare(); },
  'fav-load'(v) {
    remember();
    state.columns = state.favorites[Number(v)].filter(n => state.units[n]).map(n => newColumn(n));
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
    keepAddress(); renderCompare(); renderNav();
    const s = app.querySelector('.cmp-scroll'); s.scrollLeft = s.scrollWidth;
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
  if (kind === 'names') { state.showNames = e.target.checked; save('showNames', state.showNames ? 'yes' : 'no'); renderCatalogUnits(); }
  if (kind === 'version') {
    await loadVersion(state.versions.find(v => v.dir === e.target.value));
    state.columns = state.columns.filter(c => state.units[c.unit]);   // a unit that this version does not have
    keepAddress(); render();
  }
});

window.addEventListener('resize', () => { if (state.page === 'compare') fitLayout(); });
start();
