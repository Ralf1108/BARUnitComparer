// Smoke test of the website (docs/website.md): starts website/serve.py, opens the page in a headless Edge or Chrome and goes through catalog, compare,
// undo, table view, + Scav, Ref, the link and the keyboard. Exit code 1 if a check fails or the page throws an error.
//   node tests/website_smoke.mjs            (needs: npm install in render_unit/ for playwright-core; Python; Edge or Chrome, or the environment variable BROWSER)
// Run by the workflow .github/workflows/pages.yml before the site is published. Uses its own port: the favorites of the normal page (localhost:8000) are not touched.
// The environment variable BARUNIT_SITE: another website folder (with its own assets/, e.g. to try a chain of game versions).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { chromium } = createRequire(path.join(root, 'render_unit', 'package.json'))('playwright-core');
const browserExe = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
if (!browserExe) { console.error('ERROR: no Edge or Chrome found (set BROWSER)'); process.exit(1); }

const port = 20000 + Math.floor(Math.random() * 20000);
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const site = process.env.BARUNIT_SITE || path.join(root, 'website');
const server = spawn(python, [path.join(site, 'serve.py'), '--port', String(port), '--no-browser'], { stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/`;

let failed = 0;
const check = (ok, what, got = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : `  (got: ${got})`}`); if (!ok) failed++; };

let browser;
try {
  for (let i = 0; ; i++) {   // until the server answers
    try { if ((await fetch(base)).ok) break; } catch { /* not yet */ }
    if (i > 50) throw new Error('the server does not answer');
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await chromium.launch({ executablePath: browserExe, headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const missing = [];   // a file the page asks for and does not get (a font, a picture, a data file)
  page.on('response', r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url().replace(base, '')}`); });
  const hash = () => page.evaluate(() => location.hash);

  // catalog: the units of a category, marking with the mouse and the keyboard, the tray
  await page.goto(base + '#/catalog/arm/bots');
  await page.waitForSelector('.card', { timeout: 30000 });
  check(await page.locator('.card').count() > 10, 'catalog shows the Armada bots', await page.locator('.card').count());
  await page.click('.card >> nth=0');
  await page.focus('.card >> nth=1'); await page.keyboard.press('Enter');
  check(await page.locator('.card.selected').count() === 2, 'two units marked (mouse and Enter)', await page.locator('.card.selected').count());
  check((await page.textContent('.tray span')).startsWith('2 units'), 'the tray counts them', await page.textContent('.tray span'));
  await page.fill('[data-input="catalog-search"]', '<armpw');
  const found = await page.$$eval('.card', cards => cards.map(c => c.dataset.v));
  check(found.includes('armpw') && found.every(n => n.includes('armpw')), 'code name search <armpw finds the units with armpw in the code name', found.join(', '));

  // compare: columns, undo, adding from the selection, the edge arrow
  await page.click('.tray .go');
  await page.waitForSelector('.c-head');
  check(await page.locator('.c-head').count() === 2, 'compare shows the two units', await page.locator('.c-head').count());
  check(/^#\/compare\/[^?]+,[^?]+\?view=/.test(await hash()), 'the link has the units and the view', await hash());
  await page.keyboard.press('Control+z');
  check(await page.locator('.c-head').count() === 1, 'Ctrl+Z takes the last marked unit back', await page.locator('.c-head').count());
  for (let i = 0; i < 4; i++) await page.click('[data-a="pick-add"]:not(.chosen) >> nth=0');
  check(await page.locator('.c-head').count() === 5, 'the selection adds columns', await page.locator('.c-head').count());
  await page.evaluate(() => { document.querySelector('.cmp-scroll').scrollLeft = 0; });
  await page.click('.more-right'); await page.waitForTimeout(800);
  const scrolled = await page.evaluate(() => document.querySelector('.cmp-scroll').scrollLeft);
  const step = await page.evaluate(() => document.querySelector('.c-head').getBoundingClientRect().width + parseFloat(getComputedStyle(document.querySelector('.cmp-grid')).columnGap));
  check(Math.abs(scrolled - step) < 2, 'the edge arrow scrolls by one column', `${scrolled} / ${step}`);

  // views and the link: table, + Scav, Ref; a link opens the same view
  await page.click('[data-a="view-table"]');
  check(await page.locator('.cmp-table tbody tr').count() > 5, 'table view has the value rows', await page.locator('.cmp-table tbody tr').count());
  await page.click('[data-a="view-table"]');
  await page.click('[data-a="scav"]');
  check(await page.locator('.c-head').count() > 5, '+ Scav adds Scavenger columns', await page.locator('.c-head').count());
  await page.click('.c-head [data-a="col-ref"] >> nth=1');
  check(/scav=1/.test(await hash()) && /ref=/.test(await hash()), 'the link has + Scav and Ref', await hash());
  await page.goto(base + '#/compare/armpw,corak?view=table&scav=1&ref=corak');
  await page.reload();
  await page.waitForSelector('.cmp-table');
  check(await page.locator('thead th[data-col]').count() === 4, 'a link opens table, + Scav ...', await page.locator('thead th[data-col]').count());
  check((await page.textContent('th.is-ref .t-name')).includes('Grunt'), '... and the reference column', await page.textContent('th.is-ref .t-name'));

  // favorites: + Scav and Ref are saved with the units; an old favorite (only unit names) still loads
  await page.click('[data-a="fav-save"]');
  await page.goto(base + '#/compare/leggob?view=table');
  await page.waitForSelector('.cmp-table');
  await page.click('[data-a="fav-menu"]');
  await page.click('[data-a="fav-load"] >> nth=0');
  await page.waitForTimeout(300);
  check(/^#\/compare\/armpw,corak\?.*scav=1/.test(await hash()) && /ref=corak/.test(await hash()), 'a favorite brings back + Scav and Ref', await hash());
  await page.evaluate(() => localStorage.setItem('barunit.favorites', JSON.stringify([['armpw', 'corak']])));
  await page.reload(); await page.waitForSelector('.cmp-table');
  await page.click('[data-a="fav-menu"]');
  await page.click('[data-a="fav-load"] >> nth=0');
  await page.waitForTimeout(300);
  check(/^#\/compare\/armpw,corak\?/.test(await hash()) && !/scav=1|ref=/.test(await hash()), 'an old favorite loads without + Scav and Ref', await hash());

  // game versions (only with more than one in versions.json): the button Versions at the top shows only units with at least 2 versions; the button of a unit adds its newer versions
  const versions = JSON.parse(fs.readFileSync(path.join(site, 'assets', 'versions.json'), 'utf8')).versions;
  if (versions.length >= 12) {   // many versions: the list is grouped by month
    await page.goto(base + '#/catalog/arm/bots');
    await page.waitForSelector('.card');
    const groups = await page.$$eval('select[data-change="version"] optgroup', g => g.map(x => x.label));
    check(groups.length > 1 && /^[A-Z][a-z]+ \d{4} \(\d+ versions?\)$/.test(groups[0]), 'the version list is grouped by month', groups.slice(0, 2).join(' | '));
  }
  if (versions.length > 1) {
    // which units have more than one version (from the files: the first version that has a unit, and every one in which it changed)
    const listing = JSON.parse(fs.readFileSync(path.join(site, 'assets', 'versions.json'), 'utf8'));
    const read = v => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(site, 'assets', v.dir, 'data', v.file))).toString());
    const count = {};
    for (const [i, v] of listing.versions.entries()) for (const n of Object.keys(read(v).units)) count[n] = (count[n] || 0) + 1;
    const multi = Object.keys(count).filter(n => count[n] > 1 && !n.endsWith('_scav')), single = Object.keys(count).filter(n => count[n] === 1 && !n.endsWith('_scav'));
    if (multi.length && single.length) {
      // the button at the top: a filter, in the catalog and in the selection
      await page.goto(base + '#/compare/armpw?view=graphic');
      await page.waitForSelector('.c-head');
      await page.fill('[data-input="pick-search"]', '<a');   // all factions and categories
      const all = await page.locator('[data-a="pick-add"]').count();
      await page.click('.chooser [data-a="versions"]');   // in the unit selection, the only list it changes
      check(/versions=1/.test(await hash()), 'Changed units only: the link has versions=1', await hash());
      const n = await page.locator('[data-a="pick-add"]').count();
      check(n > 0 && n < all && (await page.locator('.pick .pick-ver').count()) === n, 'Changed units only: the selection shows only units with at least 2 versions', `${n} / ${all}`);
      const counts = await page.$$eval('.pick .pick-ver', e => e.map(x => Number(x.textContent)));
      check(counts.every(c => c >= 2), 'Changed units only: every unit shown has at least 2 versions', counts.slice(0, 8).join(','));
      await page.fill('[data-input="pick-search"]', `<${single[0]}>`);
      check(await page.locator('[data-a="pick-add"]').count() === 0, 'Changed units only: a unit with only one version is not listed', single[0]);
      await page.goto(base + '#/catalog/arm/bots'); await page.waitForSelector('.card');
      const catalogFiltered = await page.locator('.card').count();   // the filter is still on in the catalog
      await page.click('.controls [data-a="versions"]');   // off: all units
      const catalogAll = await page.locator('.card').count();
      check(catalogFiltered < catalogAll, 'Changed units only: the catalog shows fewer units than without the filter', `${catalogFiltered} / ${catalogAll}`);

      // the button of a unit: grey without another version; with one it adds every newer version right of the unit
      await page.goto(base + `#/compare/${single[0]}?view=graphic`);
      await page.waitForSelector('.c-head');
      const lone = page.locator('.c-head [data-a="col-versions"]');
      check(await lone.isDisabled() && /only one version/i.test(await lone.getAttribute('title')), 'Versions (unit): grey for a unit with only one version (the tooltip says why)', single[0]);
      check(await page.locator('select.c-ver').count() === 0 || await page.locator('select.c-ver').isDisabled(), 'a unit with only one version: its version list cannot be opened', single[0]);
      const beside = await page.$$eval('.c-head .c-verrow', r => r.length && r.every(x => x.querySelector('select.c-ver') && x.querySelector('[data-a="col-versions"]')));
      check(beside && await page.locator('.c-tools [data-a="col-versions"]').count() === 0, 'Versions (unit): the button is right of the list of versions', '');
      const removedAny = new Set(listing.versions.flatMap(v => read(v).removed || []));
      const unit = multi.find(u => !removedAny.has(u) && count[u] >= 3) || multi.find(u => !removedAny.has(u));   // more than one version, and still there in the newest game version (which the page shows)
      await page.goto(base + `#/compare/${unit}?view=graphic`);
      await page.waitForSelector('.c-head');
      check(!(await page.locator('.c-head [data-a="col-versions"]').first().isDisabled()), 'Versions (unit): the button works if the unit has older versions', unit);
      const badge = await page.locator('.c-head [data-a="col-versions"]').first().getAttribute('data-n');
      check(badge === (count[unit] > 9 ? '>' : String(count[unit])), 'Versions (unit): the icon shows how many versions the unit has', `${badge} / ${count[unit]}`);
      await page.click('.c-head [data-a="col-versions"] >> nth=0');
      await page.waitForTimeout(300);
      const cols =await page.$$eval('select.c-ver', s => s.map(x => x.value));
      const at = dir => listing.versions.findIndex(v => v.dir === dir);
      check(cols.length === count[unit] && cols.every((c, i) => i === 0 || at(c) < at(cols[i - 1])), 'Versions (unit): the older versions are columns right of the unit, newest first', `${cols.length} / ${count[unit]}: ${cols.join(', ')}`);
      check(await page.locator('.c-head.is-ref').count() === 1 && await page.locator('.c-head').first().evaluate(e => e.classList.contains('is-ref')), 'Versions (unit): the clicked unit is the reference (Ref)', '');
      check(await page.locator('.c-head [data-a="col-versions"]').first().evaluate(e => e.classList.contains('active') && !e.disabled), 'Versions (unit): the pressed button is lit (to take them out again)', '');
      await page.click('.c-head [data-a="col-versions"] >> nth=-1');
      await page.waitForTimeout(200);
      check(await page.locator('.c-head').count() === count[unit] && /already/.test(await page.locator('.note-pop').textContent()), 'Versions (unit): on another version column it says that all versions are shown', '');
      check(await page.locator('.stats .fill.diff-good, .stats .fill.diff-bad').count() > 0 || await page.locator('.stats .stat.changed').count() > 0, 'Versions (unit): the older versions are coloured and marked against the reference', '');
      const options = await page.$$eval('select.c-ver', s => [...s.at(-1).options].map(o => o.value));
      check(options.length === count[unit], 'a column lists only the versions of its unit (the first one and each change)', `${options.length}: ${options.join(', ')}`);
      check(cols[0] === options[0] && !/since/.test(await page.locator('select.c-ver >> nth=0').evaluate(s => s.selectedOptions[0].textContent)), 'the newest column shows the version of the last change (its date, no "since")', cols[0]);
      const beforeChange = await hash();
      await page.selectOption('select.c-ver >> nth=1', options.find(o => o !== cols[1]));   // the second column (not the Ref) to another version of its unit
      check((await hash()) !== beforeChange, 'a column can show another game version', await hash());
      await page.click('[data-a="undo"]');
      check((await hash()) === beforeChange, 'Undo takes the version change of a column back', `${await hash()} / ${beforeChange}`);
      await page.click('[data-a="undo"]');
      check(await page.locator('.c-head').count() === 1, 'Undo takes the added versions back (the Ref stays, as with every Undo)', await page.locator('.c-head').count());
      await page.click('.c-head [data-a="col-ref"] >> nth=0');   // Ref off (Undo kept it), so that the second press must switch it off again
      await page.waitForTimeout(200);
      await page.click('.c-head [data-a="col-versions"] >> nth=0');
      await page.waitForTimeout(300);
      check(await page.locator('.c-head').count() === count[unit], 'Versions (unit): pressed once, the older versions are added', await page.locator('.c-head').count());
      await page.click('.c-head [data-a="col-versions"] >> nth=0');
      await page.waitForTimeout(300);
      check(await page.locator('.c-head').count() === 1 && await page.locator('.c-head.is-ref').count() === 0, 'Versions (unit): pressed again, they are taken out and the Ref is as before', await page.locator('.c-head').count());
    }
  }

  // the choice of units is the same on every page: the factions and the tech levels in one line, the kinds of units below (filterHtml)
  const freshContext = await browser.newContext({ viewport: { width: 1600, height: 900 } }), fresh = await freshContext.newPage();   // a visitor without settings
  await fresh.goto(base + '#/compare/armpw');
  await fresh.waitForSelector('.chooser .filt');
  const pickAll = await fresh.locator('.pick').count();
  await fresh.click('[data-a="pick-tier"][data-v="2"]');
  const pickT2 = await fresh.$$eval('.pick .tier', s => s.map(x => x.textContent));
  check(pickT2.length > 0 && pickT2.length < pickAll && pickT2.every(x => x === 'T2'), 'compare: the tech level buttons of the unit selection keep only the units of that level', `${pickT2.length} / ${pickAll}`);
  await fresh.click('[data-a="pick-tier"][data-v="2"]');
  check(await fresh.locator('.pick').count() === pickAll, 'compare: the tech level pressed again shows all units of the selection', await fresh.locator('.pick').count());
  const parts = () => fresh.evaluate(() => { const f = document.querySelector('.filt'); return [f.querySelectorAll('.filt-row .filt-fac > *').length, f.querySelectorAll('.filt-row .seg button').length, f.querySelectorAll('.tabs > *').length, f.querySelector('.filt-row').getBoundingClientRect().bottom <= f.querySelector('.tabs').getBoundingClientRect().top + 1]; });
  const inCompare = await parts();
  await fresh.goto(base + '#/catalog/arm/bots');
  await fresh.waitForSelector('.filt .tabs a');
  const inCatalog = await parts();
  check([inCompare, inCatalog].every(x => x[0] === 5 && x[1] === 3 && x[2] > 3 && x[3]), 'catalog and compare: the same choice of units (5 factions, 3 tech levels, the kinds of units in the next line)', `${inCompare} / ${inCatalog}`);
  if (versions.length > 1) {
    check(await fresh.locator('.intro a[href="#/changes"]').count() === 1, 'catalog: the line for the first visit links to Changes', '');
    await fresh.goto(base + '#/changes');
    await fresh.waitForSelector('.filt');
    const inChanges = await parts();
    check(inChanges[0] === 6 && inChanges[1] === 3 && inChanges[3] && await fresh.locator('[data-a="chg-faction"][data-v="scv"]').count() === 1 && await fresh.locator('[data-a="chg-faction"][data-v="rap"]').count() === 1,
      'Changes: the same choice of units, all factions always offered (also Scavengers and Raptors)', inChanges.join());
  }
  // Undo / Redo: a badge with the number of steps, none without a step
  await fresh.goto(base + '#/compare/armpw,corak,leggob?view=graphic');
  await fresh.waitForSelector('.c-head');
  const badges = () => fresh.evaluate(() => ['undo', 'redo'].map(a => document.querySelector(`[data-a="${a}"]`).dataset.n || '-').join('/'));
  const b0 = await badges();
  await fresh.click('.c-head >> nth=2 >> [data-a="remove-column"]');
  await fresh.click('.c-head >> nth=1 >> [data-a="remove-column"]');
  const b2 = await badges();
  await fresh.click('[data-a="undo"]');
  const b3 = await badges();
  check(b0 === '-/-' && b2 === '2/-' && b3 === '1/1', 'Undo / Redo: a badge counts the steps (none without a step)', `${b0} ${b2} ${b3}`);
  // Clear asks first; Cancel keeps everything, Clear all removes the units and the Undo and Redo steps
  await fresh.click('[data-a="clear-all"]');
  const asked = await fresh.locator('.ask').count();
  await fresh.click('.ask [data-a="overlay-close"] >> nth=-1');
  const kept = await fresh.evaluate(() => document.querySelectorAll('.c-head').length);
  await fresh.click('[data-a="clear-all"]');
  await fresh.click('.ask [data-a="clear-yes"]');
  const cleared = await fresh.evaluate(() => [document.querySelectorAll('.c-head').length, undoStack.length, redoStack.length, !!document.querySelector('.ask')].join());
  check(asked === 1 && kept === 2 && cleared === '0,0,0,false', 'Clear: asks first, Cancel keeps the units, Clear all removes them and the Undo and Redo steps', `${asked} ${kept} ${cleared}`);
  // the weapons of a column: a unit with several weapons has the list (All weapons first), one weapon puts its values in place of the totals and is part of the link
  await fresh.goto(base + '#/compare/corcom,armpw?view=graphic');
  await fresh.waitForSelector('.c-head');
  const wpn = await fresh.evaluate(() => [...document.querySelectorAll('.c-head')].map(h => { const s = h.querySelector('select.c-wpn'); return s ? [s.disabled, [...s.options].map(o => o.value)] : null; }));
  check(wpn[0] && !wpn[0][0] && wpn[0][1].length >= 3 && wpn[0][1][0] === '' && wpn[1] && wpn[1][0] && wpn[1][1].length === 1,
    'weapons: the commander has the list of its weapons (All weapons first), the Pawn its one weapon, grey', JSON.stringify(wpn));
  const laser = await fresh.evaluate(() => state.units.corcom.weaponList.find(w => !w.kind));
  await fresh.selectOption('.c-head >> nth=0 >> select.c-wpn', laser.id);
  const chosen = await fresh.evaluate(() => [location.hash, unitOf(state.columns[0]).dps, unitOf(state.columns[0]).range, document.querySelector('select.c-wpn').classList.contains('on'),
    [...document.querySelectorAll('.stats')[0].querySelectorAll('.stat')].find(r => r.querySelector('label').textContent.trim() === 'DPS').textContent]);
  check(chosen[0].includes(`corcom~${laser.id}`) && chosen[1] === laser.dps && chosen[2] === laser.range && chosen[3] && chosen[4].includes(String(Math.round(laser.dps))),
    'weapons: one weapon chosen shows its own DPS and range, gold, in the link', JSON.stringify([chosen, laser]));
  await fresh.click('[data-a="undo"]');
  check(!(await fresh.evaluate(() => location.hash)).includes('~'), 'weapons: Undo goes back to all weapons', await fresh.evaluate(() => location.hash));
  // the weapon filter of the unit selection: every weapon, alphabetical; one chosen lists only the units that have it, of all factions
  const wf = await fresh.$$eval('select.c-wfilter option', o => o.map(x => x.value));
  const names = wf.slice(1), sorted = [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const j7 = names.find(k => k.startsWith(laser.name));
  await fresh.selectOption('select.c-wfilter', j7);
  const withIt = await fresh.evaluate(k => [...document.querySelectorAll('.pick')].map(b => [b.dataset.v, state.units[b.dataset.v].weaponList.some(w => weaponKey(w) === k)]), j7);
  check(wf[0] === '' && names.length > 50 && names.join() === sorted.join() && withIt.length > 0 && withIt.every(([, has]) => has) && withIt.some(([n]) => n === 'corcom'),
    'weapons: the filter of the unit selection lists every weapon alphabetically and shows only the units with the weapon chosen', JSON.stringify([names.length, j7, withIt]));
  await fresh.click('[data-a="pick-faction"][data-v="arm"]');
  check(await fresh.$eval('select.c-wfilter', s => s.value) === '', 'weapons: a faction pressed ends the weapon filter', await fresh.$eval('select.c-wfilter', s => s.value));
  await fresh.goto(base + `#/compare/corcom~${laser.id}?view=table`);
  await fresh.waitForSelector('th select.c-wpn');
  check(await fresh.$eval('th select.c-wpn', s => s.value) === laser.id, 'weapons: a link with a weapon opens with it chosen (table view)', await fresh.$eval('th select.c-wpn', s => s.value));
  await freshContext.close();
  // changes (the version compare): what changed between two versions, filters, a click opens the unit compare
  if (versions.length > 1) {
    await page.goto(base + '#/changes');
    await page.waitForSelector('.chg-row');
    const rows = await page.locator('.chg-row').count();
    check(rows > 0 && /\d+ changed/.test(await page.textContent('.chg-sum')), 'Changes: the newest version against the one before lists the units', `${rows} ${await page.textContent('.chg-sum')}`);
    // Older / Newer: From and To move by one version together
    const range0 = await page.evaluate(() => [indexOf(state.changesFrom), indexOf(state.changesTo)]);
    const newestOff = await page.locator('[data-a="chg-step"][data-v="1"]:disabled').count() === 1;   // To is the newest version: there is no newer one
    await page.click('[data-a="chg-step"][data-v="-1"]');
    await page.waitForFunction(r => indexOf(state.changesFrom) === r[0] - 1, range0);
    const range1 = await page.evaluate(() => [indexOf(state.changesFrom), indexOf(state.changesTo)]);
    await page.click('[data-a="chg-step"][data-v="1"]');
    await page.waitForFunction(r => indexOf(state.changesFrom) === r[0], range0);
    check(newestOff && range1[0] === range0[0] - 1 && range1[1] === range0[1] - 1 && await page.evaluate(() => indexOf(state.changesTo)) === range0[1], 'Changes: Older and Newer move From and To by one version (Newer off at the newest)', `${range0} -> ${range1} ${newestOff}`);
    await page.waitForSelector('.chg-row');
    await page.selectOption('[data-change="chg-from"]', versions[0].dir);   // a range: from the base to the newest version
    await page.waitForFunction(() => /from=/.test(location.hash));
    await page.waitForSelector('.chg-row');
    const wide = await page.locator('.chg-row').count();
    check(wide >= rows, 'Changes: a range from the base shows at least as many units', `${wide} / ${rows}`);
    // one column per faction, a unit and its counterparts in one row; the rows by the name of the unit at the left
    const grid = await page.evaluate(() => {
      const g = document.querySelector('.chg-grid');
      if (!g) return null;
      const n = Number(g.style.getPropertyValue('--n')), heads = [...g.querySelectorAll('.chg-head')].map(h => h.className.match(/f-(\w+)/)[1]), cells = [...g.querySelectorAll('.chg-cell')];
      const rows = []; for (let i = 0; i < cells.length; i += n) rows.push(cells.slice(i, i + n));
      const own = rows.every(r => r.every((c, i) => [...c.querySelectorAll('.chg-row')].every(x => x.classList.contains('f-' + heads[i]))));
      const first = rows.filter(r => r[0].children.length).map(r => r[0].querySelector('b').textContent);
      const led = rows.map(r => r.findIndex(c => c.children.length));   // the column in which a row starts: never falls back to the left
      return { n, heads, own, sorted: first.every((x, i) => !i || first[i - 1].localeCompare(x) <= 0), ordered: led.every((x, i) => !i || led[i - 1] <= x), pairs: rows.filter(r => r.filter(c => c.children.length).length > 1).length, rows: rows.length };
    });
    check(grid && grid.n === grid.heads.length && grid.n > 1 && grid.heads[0] === 'arm' && grid.own, 'Changes: one column per faction, Armada at the left, every unit in the column of its faction', JSON.stringify(grid));
    check(grid && grid.sorted && grid.ordered && grid.pairs > 0, 'Changes: the rows by the name of the Armada unit, counterparts side by side in one row', JSON.stringify(grid));
    const bots = await page.locator('[data-a="chg-category"][data-v="bots"]').count();
    if (bots) {
      await page.click('[data-a="chg-category"][data-v="bots"]');
      const shown = await page.locator('.chg-row').count();
      check(shown > 0 && shown < wide && new RegExp(`Bots\\s*${shown}$`).test((await page.textContent('[data-a="chg-category"][data-v="bots"]')).trim()), 'Changes: the button of a kind of unit keeps only these units and says how many', `${shown} / ${wide} ${await page.textContent('[data-a="chg-category"][data-v="bots"]')}`);
      await page.click('[data-a="chg-category"][data-v=""]');
    }
    await page.click('[data-a="chg-tier"][data-v="1"]');
    const t1 = await page.$$eval('.chg-row', r => r.length), t1Units = await page.evaluate(() => [...document.querySelectorAll('.chg-row')].every(r => { const u = state.units[r.querySelector('img').dataset.unit] || state.lastUnit[r.querySelector('img').dataset.unit]; return !u || u.tech === 1; }));
    check(t1 > 0 && t1 < wide && t1Units, 'Changes: the tech level buttons keep only the units of that level', `${t1} / ${wide}`);
    await page.click('[data-a="chg-tier"][data-v="1"]');
    check(await page.locator('.chg-row').count() === wide, 'Changes: all filters off shows every unit again', await page.locator('.chg-row').count());
    await page.click('[data-a="chg-faction"][data-v="arm"]');
    const faction = await page.$$eval('.chg-row', r => r.every(x => x.classList.contains('f-arm')));
    check(faction, 'Changes: the faction filter keeps only that faction', '');
    await page.selectOption('[data-change="chg-key"]', 'metal');
    const metal = await page.$$eval('.chg-row', r => [r.length, r.every(x => /Metal/.test(x.querySelector('.pills').textContent))]);
    check(metal[0] <= wide && metal[1], 'Changes: the value filter keeps only the units in which that value changed', metal.join(' '));
    await page.click('[data-a="chg-faction"][data-v="all"]'); await page.selectOption('[data-change="chg-key"]', '');
    const first = page.locator('.chg-row.f-arm, .chg-row.f-cor, .chg-row.f-leg').first();
    await first.click();
    await page.waitForSelector('.c-head');
    check(/^#\/compare\/[^?]*@[^?]+\?/.test(await hash()), 'Changes: a click opens the unit compare with the versions', await hash());
  }

  // keyboard: a column moves with the arrow keys
  await page.goto(base + '#/compare/armpw,corak,leggob?view=graphic');
  await page.waitForSelector('.grip');
  await page.focus('.grip >> nth=0'); await page.keyboard.press('ArrowRight');
  check((await hash()).startsWith('#/compare/corak,armpw,leggob'), 'arrow key moves the column', await hash());

  // pictures: the first ones are loaded
  await page.waitForTimeout(500);
  const pictures = await page.evaluate(() => [...document.querySelectorAll('.c-pic img')].filter(i => i.complete && i.naturalWidth > 0).length);
  check(pictures === 3, 'the unit pictures are loaded', pictures);

  // a phone (390 px wide): the unit selection is a sheet opened with "+ Add units", a column is moved with buttons, two columns fit on the screen
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(base + '#/compare/armpw,corak?view=graphic');
  await page.waitForSelector('.fab');
  check(await page.locator('.chooser.sheet.open').count() === 0, 'phone: the unit selection is closed at first', '');
  const widths = await page.$$eval('.c-head', h => h.map(x => Math.round(x.getBoundingClientRect().right)));
  check(widths.length === 2 && widths[1] <= 390, 'phone: two columns fit on the screen', widths.join(','));
  await page.click('.fab');
  await page.waitForSelector('.chooser.sheet.open');
  await page.click('.pick:not(.chosen) >> nth=0');
  await page.waitForFunction(() => document.querySelectorAll('.c-head').length === 3);
  check(await page.locator('.chooser.sheet.open').count() === 1, 'phone: a unit is added from the sheet, which stays open for the next one', '');
  await page.click('.chooser .toggle-pick');
  await page.waitForSelector('.fab');
  // a phone: the tools of a column are in its menu (three dots), each entry with its name; the buttons above the columns fit in one line
  const tools = await page.$$eval('.c-head >> nth=0 >> .c-tools button', b => b.map(x => [x.dataset.a, Math.round(x.getBoundingClientRect().width)]));
  check(tools.map(x => x[0]).join() === 'col-ref,col-menu' && tools.every(x => x[1] >= 36), 'phone: a column has Ref and a menu, big enough for a finger', JSON.stringify(tools));
  const bar = await page.$$eval('.cmp-clear .btn', b => [new Set(b.map(x => Math.round(x.getBoundingClientRect().top))).size, Math.min(...b.map(x => Math.round(x.getBoundingClientRect().height)))]);
  check(bar[0] === 1 && bar[1] >= 36, 'phone: the buttons above the columns are in one line', bar.join(' / '));
  const firstValue = await page.evaluate(() => Math.round(document.querySelector('.stats .stat').getBoundingClientRect().top));
  check(firstValue < 420, 'phone: the values start in the upper half of the screen', firstValue);
  await page.click('.c-head >> nth=0 >> [data-a="col-menu"]');
  await page.waitForSelector('.col-menu');
  const entries = await page.$$eval('.col-menu [data-a]', b => b.map(x => x.dataset.a));
  check(['col-ref', 'detail', 'col-versions', 'add-counterparts', 'col-counters', 'move', 'remove-column'].every(a => entries.includes(a)) && await page.locator('.col-menu .m-text small').count() >= 6, 'phone: the menu lists every tool with a line that explains it', entries.join());
  await page.click('.col-menu [data-a="move"][data-v="1"]');
  await page.waitForFunction(() => location.hash.startsWith('#/compare/corak,armpw'));
  check((await hash()).startsWith('#/compare/corak,armpw') && await page.locator('.col-menu').count() === 1, 'phone: the menu moves the column (and stays open to move on)', await hash());
  await page.click('.col-menu [data-a="col-ref"]');
  check(await page.locator('.col-menu').count() === 0 && /ref=armpw/.test(await hash()), 'phone: Ref from the menu, the menu closes', await hash());
  await page.click('.c-head.is-ref [data-a="col-menu"]');
  await page.click('.col-menu [data-a="detail"]');
  check(await page.locator('.detail .d-row').count() >= 5 && await page.locator('.col-menu').count() === 0, 'phone: the menu shows all values of the unit', await page.locator('.detail .d-row').count());
  await page.keyboard.press('Escape');
  check(await page.locator('.detail').count() === 0, 'Escape closes the values of the unit', '');
  await page.click('.c-head.is-ref [data-a="col-ref"]');
  // scrolled down: the names of the units stay at the top of the window
  await page.setViewportSize({ width: 390, height: 420 });   // a low screen: the page is long enough to scroll the names out of view
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.stats').getBoundingClientRect().top + window.scrollY + 40));
  await page.waitForTimeout(200);
  const pinned = await page.$$eval('.pin:not([hidden]) .pin-u', p => p.map(x => x.textContent));
  check(pinned.length === 3 && pinned[0] === 'Grunt', 'phone, scrolled down: the names of the units stay at the top', pinned.join());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  check(await page.locator('.pin[hidden]').count() === 1, 'at the top the line of names is hidden', '');
  await page.setViewportSize({ width: 390, height: 800 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: the page is not wider than the screen', '');
  await page.goto(base + '#/catalog/arm/bots');
  await page.waitForSelector('.card');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: the catalog is not wider than the screen', '');
  // the reference column stays in view when the other columns are scrolled: in the graphic view and in the table (its values are what the others are compared with)
  for (const view of ['graphic', 'table']) {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(base + `#/compare/armpw,corak,leggob,armflea,armllt?view=${view}&ref=armpw`);
    await page.waitForSelector('.cmp-scroll');
    const spot = () => page.evaluate(() => { const e = document.querySelector('.is-ref'), s = document.querySelector('.cmp-scroll').getBoundingClientRect(), b = e.getBoundingClientRect(); return [Math.round(b.left - s.left), Math.round(b.right - s.left)]; });
    const start = await spot(), first = start[0];
    await page.evaluate(() => { document.querySelector('.cmp-scroll').scrollLeft = 5000; });
    await page.waitForTimeout(200);
    const after = await spot(), sticky = await page.evaluate(() => { const v = document.querySelector(view_cell()); return v ? Math.round(v.getBoundingClientRect().left) : -1; function view_cell() { return document.querySelector('td.ref-col') ? 'td.ref-col' : '.stats.is-ref'; } });
    check(after[0] <= first && after[1] > after[0] && sticky >= 0 && sticky < 200, `the reference column stays in view when scrolled (${view})`, `${start} -> ${after} / ${sticky}`);
    check(await page.locator('.cmp-scroll.scrolled').count() === 1 && after[1] - after[0] < (start[1] - start[0]) / 1.5, `scrolled: the reference column shrinks to its values (${view})`, `${start} -> ${after}`);
    if (view === 'graphic') {   // halfway: the column next to the reference column sits right beside it (the gap between the columns)
      await page.evaluate(() => { document.querySelector('.cmp-scroll').style.scrollSnapType = 'none'; document.querySelector('.cmp-scroll').scrollLeft = 60; });
      await page.waitForTimeout(200);
      const gap = await page.evaluate(() => { const r = document.querySelector('.c-head.is-ref').getBoundingClientRect(), n = document.querySelector('.c-head:not(.is-ref)').getBoundingClientRect(); return Math.round(n.left - r.right); });
      check(gap >= 0 && gap <= 30, 'scrolled a little: the next column sits right beside the shrinking reference column', `gap ${gap}`);
    }
    await page.evaluate(() => { document.querySelector('.cmp-scroll').scrollLeft = 0; });
    await page.waitForTimeout(200);
    check(await page.locator('.cmp-scroll.scrolled').count() === 0, `back at the left edge: the reference column is whole again (${view})`, '');
  }
  // dragging the bar below the table: the scrolled area keeps its width when the reference column becomes a strip, and the position is kept
  // (it changed: the columns jumped to and fro, and with little to scroll the table jumped back to the start again and again)
  for (const width of [1100, 1500]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(base + '#/compare/armpw,corak,leggob,armflea,armllt?view=table&ref=armpw');
    await page.waitForSelector('.cmp-table');
    await page.waitForTimeout(200);
    const seen = [];
    const range = await page.evaluate(() => { const s = document.querySelector('.cmp-scroll'); return s.scrollWidth - s.clientWidth; });
    for (let x = 0; x <= range; x += 30) {
      await page.evaluate(x => { document.querySelector('.cmp-scroll').scrollLeft = x; }, x);
      await page.waitForTimeout(50);
      seen.push(await page.evaluate(() => { const s = document.querySelector('.cmp-scroll'); return [Math.round(s.scrollLeft), s.scrollWidth]; }));
    }
    const steady = range > 60 && seen.every(([at, w], i) => Math.abs(at - i * 30) < 2 && w === seen[0][1]);
    check(steady && await page.locator('.cmp-scroll.scrolled').count() === 1, `table with a Ref, scrolled step by step: the width and the position stay (${width} px)`, `range ${range}: ${seen.slice(0, 6).join(' / ')}`);
  }
  // a narrow window used with the mouse: the columns do not snap into place (that is for a swipe), the bar stays where it is dragged to
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto(base + '#/compare/armpw,corak,leggob,armflea,armllt?view=graphic&ref=armpw');
  await page.waitForSelector('.c-head');
  const dragged = [];
  for (const x of [20, 60, 140, 300]) {
    await page.evaluate(x => { document.querySelector('.cmp-scroll').scrollLeft = x; }, x);
    await page.waitForTimeout(150);
    dragged.push(await page.evaluate(() => Math.round(document.querySelector('.cmp-scroll').scrollLeft)));
  }
  check(dragged.join() === '20,60,140,300', 'narrow window, mouse: the columns stay where the bar is dragged to (no snapping)', dragged.join());
  // Ref: the other columns are green (better) or red (worse) against it, a value equal to it is greyed out; the reference column itself is not coloured
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(base + '#/compare/armpw,armpw_scav?view=graphic&ref=armpw');
  await page.waitForSelector('.stats');
  const verdicts = await page.$$eval('.stats', s => s.map(x => [...x.querySelectorAll('.fill')].map(f => (f.className.match(/diff-(good|bad|same)/) || ['', 'none'])[1])));
  check(verdicts[0].every(v => v === 'none') && verdicts[1].includes('same') && verdicts[1].some(v => v === 'good' || v === 'bad') && !verdicts[1].includes('none'), 'Ref: better green, worse red, equal greyed out, the reference itself uncoloured', JSON.stringify(verdicts));
  // the sign says more or less than the Ref (the colour says better or worse): the Scavenger copy costs more metal, +, in red
  const signs = await page.$$eval('.stats', s => { const label = x => x.closest('.stat').querySelector('label').textContent.trim();
    const ref = Object.fromEntries([...s[0].querySelectorAll('.fill')].map(f => [label(f), Number(f.nextElementSibling.textContent.replace(/[^\d.]/g, ''))]));
    return [...s[1].querySelectorAll('.fill')].map(f => [label(f), (f.className.match(/diff-(good|bad|same)/) || [])[1], f.nextElementSibling.textContent.trim()[0],
      Number((f.closest('.stat').querySelector('.abs') || {}).textContent?.replace(/[^\d.]/g, '')), ref[label(f)]]); });
  const signOk = ([, v, ch, own, r]) => v === 'same' ? ch === '±' : isNaN(own) || isNaN(r) || ch === (own > r ? '+' : '−');
  const metal = signs.find(x => x[0] === 'Metal');
  check(signs.length > 0 && signs.every(signOk) && metal && metal[1] === 'bad' && metal[2] === '+', 'Ref: the difference has the sign of more (+) or less (−), the colour says better or worse (more metal: + in red)', JSON.stringify(signs));
  await page.waitForFunction(() => [...document.querySelectorAll('.stats.is-ref .fill')].every(x => x.isConnected && getComputedStyle(x).backgroundColor));   // after a render the page may draw once more
  const refFills = await page.$$eval('.stats.is-ref .fill', f => [...new Set(f.map(x => getComputedStyle(x).backgroundColor))]);
  check(refFills.length === 1 && refFills[0] === 'rgb(255, 212, 138)', 'Ref: all bars of the reference column are yellow', JSON.stringify(refFills));
  // the tools of a column: icons; Counters and Counterparts pressed again take out what they added and bring back what they put aside
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(base + '#/compare/armpw,armflea?view=graphic');
  await page.waitForSelector('.c-head');
  check(await page.locator('.c-head:first-child .tool svg').count() >= 4, 'the tools of a column are icons', await page.locator('.c-head:first-child .tool svg').count());
  const startCols = await hash();
  await page.click('.c-head >> nth=0 >> [data-a="add-counterparts"]');
  await page.waitForTimeout(300);
  const withParts = await page.locator('.c-head').count();
  check(withParts > 2, 'Counterparts (icon) adds the counterparts', withParts);
  await page.click('.c-head >> nth=0 >> [data-a="add-counterparts"]');
  await page.waitForTimeout(300);
  check((await hash()) === startCols, 'Counterparts pressed again takes them out', await hash());
  if (await page.locator('.c-head >> nth=0 >> [data-a="col-counters"]').isEnabled()) {
    await page.click('.c-head >> nth=0 >> [data-a="col-counters"]');
    await page.waitForTimeout(300);
    const withCounters = await hash();
    check(withCounters !== startCols && !withCounters.includes('armflea'), 'Counters replaces the other columns', withCounters);
    await page.click('.c-head >> nth=0 >> [data-a="col-counters"]');
    await page.waitForTimeout(300);
    check((await hash()) === startCols, 'Counters pressed again brings the columns back', await hash());
  }
  // the edge arrows: three columns on a wide window fit without scrolling (no arrow); with more, the left arrow goes back to the very start and then disappears
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(base + '#/compare/armpw,corak,leggob?view=graphic');
  await page.waitForSelector('.c-head');
  check(await page.evaluate(() => { const s = document.querySelector('.cmp-scroll'); return s.scrollWidth <= s.clientWidth && document.querySelector('.more-left').hidden && document.querySelector('.more-right').hidden; }), 'three columns fit a wide window: no arrows, no shadow', '');
  await page.goto(base + '#/compare/armpw,corak,leggob,armflea,armllt?view=graphic');
  await page.waitForSelector('.c-head');
  await page.evaluate(() => { const s = document.querySelector('.cmp-scroll'); s.scrollLeft = s.scrollWidth; });
  await page.waitForTimeout(300);
  for (let i = 0; i < 6 && !(await page.locator('.more-left').isHidden()); i++) { await page.click('.more-left'); await page.waitForTimeout(700); }
  const back = await page.evaluate(() => `${document.querySelector('.cmp-scroll').scrollLeft} ${document.querySelector('.more-left').hidden} ${document.querySelector('.cmp-scroll').scrollWidth - document.querySelector('.cmp-scroll').clientWidth}`);
  check(back.startsWith('0 true'), 'the left arrow goes back to the start, then it is gone', back);
  // Ref: the column stays where it is, also when Ref is switched off; with a Ref every column is coloured against it
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(base + '#/compare/armpw,corak,leggob?view=graphic');
  await page.waitForSelector('.c-head');
  await page.click('.c-head >> nth=2 >> [data-a="col-ref"]');
  await page.waitForTimeout(200);
  check((await hash()).startsWith('#/compare/armpw,corak,leggob') && await page.locator('.c-head >> nth=2').evaluate(e => e.classList.contains('is-ref')), 'Ref: the column stays where it is (no jump to the left)', await hash());
  await page.click('.c-head >> nth=2 >> [data-a="col-ref"]');
  await page.waitForTimeout(200);
  check((await hash()).startsWith('#/compare/armpw,corak,leggob') && !/ref=/.test(await hash()), 'Ref off: the columns are as before', await hash());
  // a reference column in the middle sticks to the left edge only when it is scrolled there
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(base + '#/compare/armpw,corak,leggob,armflea,armllt?view=graphic&ref=leggob');
  await page.waitForSelector('.c-head.is-ref');
  const refAt = async x => { await page.evaluate(x => { const s = document.querySelector('.cmp-scroll'); s.style.scrollSnapType = 'none'; s.scrollLeft = x; }, x); await page.waitForTimeout(250);
    return page.evaluate(() => Math.round(document.querySelector('.c-head.is-ref').getBoundingClientRect().left - document.querySelector('.cmp-scroll').getBoundingClientRect().left)); };
  const r0 = await refAt(0), r1 = await refAt(150), r2 = await refAt(2000);
  check(r0 > 300 && r1 === r0 - 150 && r2 === 0, 'Ref in the middle: it scrolls with the others until it reaches the left edge, then it sticks', `${r0} ${r1} ${r2}`);
  await page.setViewportSize({ width: 1600, height: 900 });
  const vdir = JSON.parse(fs.readFileSync(path.join(site, 'assets', 'versions.json'), 'utf8')).versions[0].dir;
  await page.goto(base + `#/compare/corak,armpw,armpw@${vdir}?view=graphic&ref=corak`);
  await page.waitForSelector('.stats');
  const colours = await page.$$eval('.stats', s => s.map(x => x.querySelectorAll('.fill.diff-good, .fill.diff-bad, .fill.diff-same').length));
  check(colours[0] === 0 && colours[1] > 0 && colours[2] > 0, 'Ref: two versions of another unit are both coloured against the Ref', colours.join(','));
  // ---- the rest of the page: help, the folded unit selection, Redo, favorites, the catalog views, the game version at the top, drag and drop
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(base + '#/help');
  await page.waitForSelector('.help');
  check(await page.locator('.help h2').count() >= 5 && await page.locator('.help li').count() > 20, 'Help: the page lists the steps, the buttons and the values', await page.locator('.help li').count());

  await page.goto(base + '#/compare/armpw,corak,leggob?view=graphic');
  await page.reload();   // a fresh page: no columns, no Undo steps from before
  await page.waitForSelector('.c-head');
  await page.click('.chooser .toggle-pick');   // fold the unit selection away
  await page.click('.c-head >> nth=0 >> [data-a="col-ref"]');
  await page.waitForTimeout(200);
  check(await page.locator('.chooser.collapsed').count() === 1 && await page.evaluate(() => document.querySelector('.cmp-body').style.minHeight !== ''), 'the unit selection folded away: the compare is still laid out', errors.join(' | '));
  await page.click('.chooser .toggle-pick');
  await page.click('.c-head >> nth=0 >> [data-a="col-ref"]');

  await page.click('.c-head >> nth=2 >> [data-a="remove-column"]');
  await page.click('[data-a="undo"]');
  const undone = await page.locator('.c-head').count();
  await page.click('[data-a="redo"]');
  check(undone === 3 && await page.locator('.c-head').count() === 2, 'Undo brings a removed column back, Redo removes it again', `${undone} / ${await page.locator('.c-head').count()}`);
  await page.click('[data-a="undo"]');

  await page.dragAndDrop('.c-head >> nth=0 >> .grip', '.c-unit >> nth=2', { targetPosition: { x: 300, y: 100 } });
  await page.waitForTimeout(200);
  check((await hash()).startsWith('#/compare/corak,leggob,armpw'), 'drag and drop moves a column behind another one', await hash());

  await page.evaluate(() => localStorage.removeItem('barunit.favorites'));
  await page.reload(); await page.waitForSelector('.c-head');
  await page.click('[data-a="fav-save"]');
  await page.click('[data-a="fav-menu"]');
  const favs = await page.locator('.fav-item').count();
  await page.click('[data-a="fav-del"] >> nth=0');
  check(favs === 1 && await page.locator('.fav-item').count() === 0, 'a favorite can be deleted', `${favs} / ${await page.locator('.fav-item').count()}`);
  await page.keyboard.press('Escape');

  // a click on a difference shows the value itself (a phone has no tooltip)
  await page.goto(base + '#/compare/armpw,corak?view=graphic&ref=armpw');
  await page.waitForSelector('.c-head.is-ref');
  await page.click('.stats:not(.is-ref) .val span >> nth=0');
  check(/\(Ref: /.test(await page.locator('.note-pop').textContent()), 'a click on a difference shows the value and the one of the Ref', await page.locator('.note-pop').textContent());

  // the catalog: list view, tech filter, Ctrl+Z, only the categories a faction has
  await page.goto(base + '#/catalog/arm/bots');
  await page.reload();
  await page.waitForSelector('.card');
  await page.click('.card >> nth=0');
  await page.keyboard.press('Control+z');
  check(await page.locator('.card.selected').count() === 0, 'catalog: Ctrl+Z takes a marked unit back', await page.locator('.card.selected').count());
  await page.click('[data-a="view"][data-v="list"]');
  const listed = await page.locator('.row:not(.head)').count();
  await page.click('[data-a="tier"][data-v="2"]');
  const tiers = await page.$$eval('.row:not(.head) .tier', t => [...new Set(t.map(x => x.textContent))]);
  check(listed > 10 && tiers.join() === 'T2', 'catalog: the list view and the tech filter', `${listed} / ${tiers.join()}`);
  await page.click('[data-a="tier"][data-v="2"]');
  await page.click('[data-a="view"][data-v="grid"]');
  const tabs = async f => { await page.goto(base + `#/catalog/${f}/bots`); await page.waitForSelector('.tabs a'); return page.locator('.tabs a').count(); };
  const armTabs = await tabs('arm'), rapTabs = await tabs('rap');
  check(armTabs === 8 && rapTabs < armTabs, 'catalog: a category without units of the faction is not offered', `${armTabs} / ${rapTabs}`);

  if (versions.length > 1) {
    const newest = versions[versions.length - 1].dir, oldest = versions[0].dir;
    // the page Changes: the base cannot be the To version; search; Scavenger copies
    await page.goto(base + '#/changes/' + oldest);
    await page.waitForSelector('[data-change="chg-to"]');
    const toList = await page.$$eval('[data-change="chg-to"] option', o => o.map(x => x.value));
    check(!toList.includes(oldest) && await page.inputValue('[data-change="chg-to"]') === newest, 'Changes: the base cannot be the To version (the newest one is shown)', await page.inputValue('[data-change="chg-to"]'));
    await page.selectOption('[data-change="chg-from"]', oldest);
    await page.waitForFunction(() => /from=/.test(location.hash));
    await page.waitForSelector('.chg-row');
    const plain = await page.locator('.chg-row').count();
    await page.check('[data-change="chg-scav"]', { force: true });
    const withCopies = await page.locator('.chg-row').count();
    await page.uncheck('[data-change="chg-scav"]', { force: true });
    await page.fill('[data-input="chg-search"]', '<arm');
    const codes = await page.$$eval('.chg-row small', s => s.map(x => x.textContent));
    check(withCopies >= plain && codes.length > 0 && codes.length < plain && codes.every(c => c.includes('arm')), 'Changes: the switch Scavenger copies and the search', `${plain} / ${withCopies} / ${codes.length}`);
    await page.fill('[data-input="chg-search"]', '');

    // the game version at the top: in the link, and a step of Undo
    await page.goto(base + '#/compare/armpw?view=graphic');
    await page.reload();
    await page.waitForSelector('.c-head');
    await page.selectOption('select[data-change="version"]', oldest);
    const older = await hash();
    await page.click('[data-a="undo"]');
    check(older.includes('v=' + oldest) && !/[?&]v=/.test(await hash()) && await page.inputValue('select[data-change="version"]') === newest, 'the game version at the top: in the link, and Undo brings the old one back', `${older} / ${await hash()}`);
    await page.goto(base + `#/compare/armpw?view=graphic&v=${oldest}`);
    await page.reload();
    await page.waitForSelector('.c-head');
    check(await page.inputValue('select[data-change="version"]') === oldest, 'a link with a game version opens that version', await page.inputValue('select[data-change="version"]'));

    // a column set to another version of its unit and back is free again (no version of its own in the link)
    const many = await page.evaluate(() => Object.keys(state.unitVersions).find(n => state.unitVersions[n].length > 1 && state.merged[state.versions[state.versions.length - 1].dir][n]));
    await page.goto(base + `#/compare/${many}?view=graphic`);
    await page.reload();
    await page.waitForSelector('select.c-ver');
    await page.selectOption('select.c-ver', { index: 1 });
    const pinned = await hash();
    await page.selectOption('select.c-ver', { index: 0 });
    check(pinned.includes('@') && !(await hash()).includes('@'), 'a column set back to its newest version has no version of its own', `${pinned} / ${await hash()}`);
  }
  // ---- sort by a value, the value next to the difference, the values per metal, share, all values of a unit (right-click or a long press)
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(base + '#/compare/armpw,armflea,corak?view=graphic');
  await page.reload();
  await page.waitForSelector('.c-head');
  await page.click('.stats >> nth=0 >> label[data-v="metal"]');
  const cheap = await hash();
  await page.click('.stats >> nth=0 >> label[data-v="metal"]');
  const dear = await hash();
  const costs = await page.evaluate(() => state.columns.map(c => unitOf(c).metal));
  check(cheap.startsWith('#/compare/armflea,') && costs.every((m, i) => !i || m <= costs[i - 1]) && cheap !== dear, 'a click on the name of a value sorts the columns (the best first, again: the other way round)', `${cheap} / ${dear} / ${costs}`);
  check(await page.locator('.stat label .sorted').count() === 3 && /Sorted by Metal/.test(await page.locator('.note-pop').textContent()), 'the value the columns are sorted by is marked', await page.locator('.stat label .sorted').count());
  await page.click('[data-a="undo"]'); await page.click('[data-a="undo"]');
  check((await hash()).startsWith('#/compare/armpw,armflea,corak') && await page.locator('.sorted').count() === 0, 'Undo takes the sorting back', await hash());
  const perMetal = await page.evaluate(() => { const u = state.units.armpw, row = [...document.querySelectorAll('.stats')][0].querySelector('label[data-v="hpPerMetal"]').parentElement; return [row.querySelector('.val').textContent, (u.hitpoints / u.metal).toFixed(2)]; });
  check(perMetal[0] === perMetal[1] && await page.locator('label[data-v="dpsPerMetal"]').count() === 3, 'the values per metal: hitpoints and DPS for the cost', perMetal.join(' / '));
  await page.click('.c-head >> nth=0 >> [data-a="col-ref"]');
  const both = await page.evaluate(() => { const bar = document.querySelectorAll('.stats')[2].querySelector('.bar'); return [bar.querySelector('.val').textContent, bar.querySelector('.abs').textContent, String(Math.round(state.units.corak.metal))]; });
  check(/^[+−±]/.test(both[0]) && both[1] === both[2] && await page.locator('.stats.is-ref .abs').count() === 0, 'with a Ref the value itself stands next to the difference', both.join(' / '));
  await page.click('[data-a="view-table"]');
  check(await page.locator('.cmp-table td .abs').count() > 5, 'the table shows the value behind the difference', await page.locator('.cmp-table td .abs').count());
  await page.click('.cmp-table tbody th[data-v="hitpoints"]');
  const hp = await page.evaluate(() => state.columns.map(c => unitOf(c).hitpoints));
  check(hp.every((h, i) => !i || h <= hp[i - 1]), 'the table: a click on the name of a row sorts the columns', hp.join());
  await page.click('[data-a="view-table"]');
  await page.click('[data-a="share"]');
  await page.waitForFunction(() => /Link copied|Copy the address/.test((document.querySelector('.note-pop') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(/Link copied|Copy the address/.test(await page.locator('.note-pop').textContent()), 'Share copies the link (or says how to)', await page.locator('.note-pop').textContent());
  await page.goto(base + '#/changes');
  if (versions.length > 1) {
    await page.waitForSelector('[data-change="chg-key"]');
    const keys = await page.$$eval('[data-change="chg-key"] option', o => o.map(x => x.textContent).join());
    check(!/per metal/.test(keys), 'Changes does not list the values worked out per metal', keys);
  }
  await page.goto(base + '#/catalog/arm/bots');
  await page.reload();
  await page.waitForSelector('.card');
  const marked = await page.locator('.card.selected').count();
  await page.click('.card[data-v="armpw"]', { button: 'right' });
  await page.waitForSelector('.detail');
  const shownValues = await page.$$eval('.detail .d-row', r => r.map(x => x.textContent).join(' | '));
  check(/Metal/.test(shownValues) && /HP per metal/.test(shownValues) && await page.locator('.detail h3').textContent() === 'Pawn' && await page.locator('.card.selected').count() === marked, 'a right-click on a unit shows all its values without marking it', shownValues);
  check(await page.locator('.detail .d-more button').count() >= 2, 'the values of a unit list its counterparts', await page.locator('.detail .d-more button').count());
  await page.click('.detail .d-more button >> nth=0');
  check(await page.locator('.detail h3').textContent() !== 'Pawn', 'a counterpart there opens its values', await page.locator('.detail h3').textContent());
  await page.click('.detail [data-a="detail-toggle"]');
  check(await page.locator('.detail').count() === 0 && (await page.textContent('.tray span')).length > 0 && await page.evaluate(() => state.columns.length) === marked + 1, 'the unit shown can be added to the comparison from there', await page.evaluate(() => state.columns.length));
  await page.keyboard.press('Control+z');
  // a phone: the bar at the bottom of the catalog lies over the cards, a long press shows the values of a unit
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(base + '#/catalog/arm/bots');
  await page.waitForSelector('.card');
  await page.click('.card >> nth=0');
  const over = await page.evaluate(() => { const tray = document.querySelector('.tray').getBoundingClientRect(); return [...document.querySelectorAll('.card .tier, .card .role, .card .check')].filter(e => { const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; return x > tray.left && x < tray.right && y > tray.top && y < tray.bottom && !document.elementFromPoint(x, y).closest('.tray'); }).length; });
  check(over === 0, 'phone: the bar at the bottom of the catalog lies over the cards', over);
  await page.click('.card >> nth=0');
  const card = await page.locator('.card >> nth=1').boundingBox();
  const touch = (type, x, y) => page.evaluate(([type, x, y]) => { const el = document.elementFromPoint(x, y), t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y }); el.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] })); }, [type, x, y]);
  await touch('touchstart', card.x + 40, card.y + 60);
  await page.waitForTimeout(750);
  await touch('touchend', card.x + 40, card.y + 60);
  check(await page.locator('.detail').count() === 1 && await page.locator('.card.selected').count() === 0, 'phone: a long press on a unit shows its values', await page.locator('.detail').count());
  await page.waitForTimeout(600);
  await page.click('.detail [data-a="overlay-close"] >> nth=0');
  check(await page.locator('.detail').count() === 0, 'the values of a unit can be closed', '');
  // a phone, the table with a Ref: after a swipe no column rests under the strip of the reference column
  await page.goto(base + '#/compare/armpw,corak,leggob,armflea,armllt?view=table&ref=armpw');
  await page.waitForSelector('.cmp-table');
  await page.evaluate(() => { document.documentElement.classList.add('touch'); document.querySelector('.cmp-scroll').scrollLeft = 170; });   // touch: set by the first touch
  await page.waitForTimeout(1200);
  const rest = await page.evaluate(() => { const strip = document.querySelector('th.is-ref').getBoundingClientRect().right; return [...document.querySelectorAll('thead th[data-col]:not(.is-ref)')].map(h => Math.round(h.getBoundingClientRect().left - strip)).filter(x => x > -40)[0]; });
  check(Math.abs(rest) <= 3, 'phone, table: after a swipe a column sits right beside the strip of the reference column', rest);
  const clipped = await page.evaluate(() => { const td = [...document.querySelectorAll('td.ref-col.wpn')][0]; return !td || td.getBoundingClientRect().height < 30; });
  check(clipped, 'phone, table: the weapons of the strip stay in one line', clipped);
  await page.setViewportSize({ width: 1600, height: 900 });
  check(missing.length === 0, 'no file of the page is missing (no 404)', missing.join(' | '));
  check(errors.length === 0, 'no errors on the page', errors.join(' | '));
} catch (e) {
  check(false, 'the test ran through', e.message);
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
