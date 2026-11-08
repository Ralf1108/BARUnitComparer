// Smoke test of the website (SPECIFICATION_WEBSITE.md): starts website/serve.py, opens the page in a headless Edge or Chrome and goes through catalog, compare,
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

  // game versions (only with more than one in versions.json): the selection shows the changed units, a click puts the version before and the changed version side by side
  const versions = JSON.parse(fs.readFileSync(path.join(site, 'assets', 'versions.json'), 'utf8')).versions;
  const changed = versions.filter(v => v.changed).length;
  if (versions.length > 1) {
    await page.goto(base + '#/compare/armpw?view=graphic');
    await page.waitForSelector('.c-head');
    await page.click('[data-a="versions"]');
    check(/versions=1/.test(await hash()), 'Versions: the link has versions=1', await hash());
    const picks = await page.locator('[data-a="pick-add"]').count();
    if (changed) {
      await page.fill('[data-input="pick-search"]', '<a');   // all factions and categories: still only the changed units
      const n = await page.locator('[data-a="pick-add"]').count();
      check(n > 0 && (await page.locator('.pick .pick-ver').count()) === n, 'Versions: the selection shows only units that changed', `${n} / ${picks}`);
      // a unit that the base has too, changed in the first version after the base (a new unit comes as one column)
      const read = v => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(site, 'assets', v.dir, 'data', v.file))).toString());
      const baseUnits = read(versions[0]).units, diff = read(versions[1]), later = versions.slice(2).map(v => read(v).units);
      const values = u => JSON.stringify(Object.entries(u).filter(([k]) => !['icon', 'ownPicture', 'ownIcon'].includes(k)));
      const unit = Object.keys(diff.units).find(n => baseUnits[n] && values(diff.units[n]) !== values(baseUnits[n]) && !n.endsWith('_scav')
        && later.every(units => !units[n]));   // its values changed, and only there: the click compares that version with the base
      await page.fill('[data-input="pick-search"]', `<${unit}>`);
      await page.click(`[data-a="pick-add"][data-v="${unit}"]`);
      await page.waitForTimeout(300);
      const cols = await page.$$eval('select.c-ver', s => s.map(x => x.value));
      const at = dir => versions.findIndex(v => v.dir === dir);
      check(cols.length >= 3 && at(cols.at(-2)) === at(cols.at(-1)) - 1, 'Versions: a click adds the changed version and the version before it', cols.join(', '));
      check(new RegExp(`${unit}@`).test(await hash()), 'Versions: the link has the versions of the columns', await hash());
      check(await page.locator('.stats .fill.diff-good, .stats .fill.diff-bad').count() > 0, 'Versions: the changed version is coloured against the version before', '');
      const baseDir = versions.find(v => v.base).dir;   // the last column (the changed version) back to the base version
      await page.selectOption('select.c-ver >> nth=-1', baseDir);
      check(new RegExp(`^#/compare/armpw,${unit}@[^,]+,${unit}@${baseDir}\\?`).test(await hash()), 'a column can show another game version', await hash());
    }
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
