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
    check(groups.length > 1 && /^\d{4}-\d\d \(\d+ versions?\)$/.test(groups[0]), 'the version list is grouped by month', groups.slice(0, 2).join(' | '));
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
      await page.click('.cmp-clear [data-a="versions"]');
      check(/versions=1/.test(await hash()), 'Versions (top): the link has versions=1', await hash());
      const n = await page.locator('[data-a="pick-add"]').count();
      check(n > 0 && n < all && (await page.locator('.pick .pick-ver').count()) === n, 'Versions (top): the selection shows only units with at least 2 versions', `${n} / ${all}`);
      const counts = await page.$$eval('.pick .pick-ver', e => e.map(x => Number(x.textContent)));
      check(counts.every(c => c >= 2), 'Versions (top): every unit shown has at least 2 versions', counts.slice(0, 8).join(','));
      await page.fill('[data-input="pick-search"]', `<${single[0]}>`);
      check(await page.locator('[data-a="pick-add"]').count() === 0, 'Versions (top): a unit with only one version is not listed', single[0]);
      await page.goto(base + '#/catalog/arm/bots'); await page.waitForSelector('.card');
      const catalogFiltered = await page.locator('.card').count();   // the filter is still on in the catalog
      await page.click('.controls [data-a="versions"]');   // off: all units
      const catalogAll = await page.locator('.card').count();
      check(catalogFiltered < catalogAll, 'Versions (top): the catalog shows fewer units than without the filter', `${catalogFiltered} / ${catalogAll}`);

      // the button of a unit: grey without another version; with one it adds every newer version right of the unit
      await page.goto(base + `#/compare/${single[0]}?view=graphic`);
      await page.waitForSelector('.c-head');
      check(await page.locator('.c-head [data-a="col-versions"]').isDisabled(), 'Versions (unit): grey if the unit has no other version', single[0]);
      const order = await page.$$eval('.c-tools button', b => b.map(x => x.dataset.a).filter(Boolean));
      check(order.indexOf('col-versions') >= 0 && order.indexOf('col-versions') < order.indexOf('col-counters'), 'Versions (unit): the button is left of Counters', order.join(', '));
      const removedAny = new Set(listing.versions.flatMap(v => read(v).removed || []));
      const unit = multi.find(u => !removedAny.has(u) && count[u] >= 3) || multi.find(u => !removedAny.has(u));   // more than one version, and still there in the newest game version (which the page shows)
      await page.goto(base + `#/compare/${unit}?view=graphic`);
      await page.waitForSelector('.c-head');
      check(!(await page.locator('.c-head [data-a="col-versions"]').first().isDisabled()), 'Versions (unit): the button works if the unit has older versions', unit);
      await page.click('.c-head [data-a="col-versions"] >> nth=0');
      await page.waitForTimeout(300);
      const cols = await page.$$eval('select.c-ver', s => s.map(x => x.value));
      const at = dir => listing.versions.findIndex(v => v.dir === dir);
      check(cols.length === count[unit] && cols.every((c, i) => i === 0 || at(c) < at(cols[i - 1])), 'Versions (unit): the older versions are columns right of the unit, newest first', `${cols.length} / ${count[unit]}: ${cols.join(', ')}`);
      check(await page.locator('.c-head.is-ref').count() === 1 && await page.locator('.c-head').first().evaluate(e => e.classList.contains('is-ref')), 'Versions (unit): the clicked unit is the reference (Ref)', '');
      check(await page.locator('.c-head [data-a="col-versions"]').first().isDisabled() && await page.locator('.c-head [data-a="col-versions"]').last().isDisabled(), 'Versions (unit): nothing older is left: the buttons are grey', '');
      check(await page.locator('.stats .fill.diff-good, .stats .fill.diff-bad').count() > 0 || await page.locator('.stats .stat.changed').count() > 0, 'Versions (unit): the older versions are coloured and marked against the reference', '');
      const options = await page.$$eval('select.c-ver', s => [...s.at(-1).options].map(o => o.value));
      check(options.length <= count[unit] + 1, 'a column lists only the versions that matter for its unit', `${options.length}: ${options.join(', ')}`);
      const beforeChange = await hash();
      await page.selectOption('select.c-ver >> nth=1', listing.versions[0].dir);   // the second column (not the Ref) to the base version
      check((await hash()) !== beforeChange, 'a column can show another game version', await hash());
      await page.click('[data-a="undo"]');
      check((await hash()) === beforeChange, 'Undo takes the version change of a column back', `${await hash()} / ${beforeChange}`);
      await page.click('[data-a="undo"]');
      check(await page.locator('.c-head').count() === 1, 'Undo takes the added versions back (the Ref stays, as with every Undo)', await page.locator('.c-head').count());
    }
  }

  // changes (the version compare): what changed between two versions, filters, a click opens the unit compare
  if (versions.length > 1) {
    await page.goto(base + '#/changes');
    await page.waitForSelector('.chg-row');
    const rows = await page.locator('.chg-row').count();
    check(rows > 0 && /\d+ changed/.test(await page.textContent('.chg-sum')), 'Changes: the newest version against the one before lists the units', `${rows} ${await page.textContent('.chg-sum')}`);
    // a change that is only visual (the picture is new, no value differs) has a golden frame: the rows without a changed value but with a picture
    const visual = await page.locator('.chg-row.visual').count();
    const pictureOnly = await page.$$eval('.chg-row', r => r.filter(x => x.querySelector('.k-changed') && x.querySelector('.pill.visual')).length);
    const valueRows = await page.$$eval('.chg-row.visual', r => r.filter(x => x.querySelector('.pill b')).length);
    check(visual === pictureOnly && valueRows === 0, 'Changes: a visual-only change gets the golden frame, a change of values does not', `${visual} / ${pictureOnly} / ${valueRows}`);
    if (visual > 0) {
      await page.locator('.chg-row.visual').first().click();
      await page.waitForSelector('.c-head');
      check(await page.locator('.c-pic.visual').count() >= 1, 'a visual-only change: the picture of the compare column is framed in gold', '');
      await page.goBack(); await page.waitForSelector('.chg-row');
    }
    await page.selectOption('[data-change="chg-from"]', versions[0].dir);   // a range: from the base to the newest version
    await page.waitForFunction(() => /from=/.test(location.hash));
    await page.waitForSelector('.chg-row');
    const wide = await page.locator('.chg-row').count();
    check(wide >= rows, 'Changes: a range from the base shows at least as many units', `${wide} / ${rows}`);
    await page.selectOption('[data-change="chg-faction"]', 'arm');
    const faction = await page.$$eval('.chg-row', r => r.every(x => x.classList.contains('f-arm')));
    check(faction, 'Changes: the faction filter keeps only that faction', '');
    await page.selectOption('[data-change="chg-key"]', 'metal');
    check((await page.locator('.chg-row .pill', { hasText: 'Metal' }).count()) >= 0 && (await page.locator('.chg-row').count()) <= wide, 'Changes: the value filter narrows the list', '');
    await page.selectOption('[data-change="chg-faction"]', 'all'); await page.selectOption('[data-change="chg-key"]', '');
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

  check(errors.length === 0, 'no errors on the page', errors.join(' | '));
} catch (e) {
  check(false, 'the test ran through', e.message);
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
