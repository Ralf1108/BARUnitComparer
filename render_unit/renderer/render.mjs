// node render.mjs <jobs.json> <work dir> <browser exe> [gpu|software]
// Renders all jobs with ONE browser (a start of the browser costs more than a picture). jobs.json: [{ "out": "<png>", "query": "model=...&tex=...&size=400" }, ...]
// A small web server gives the page (renderer/), the node_modules (three.js) and the work dir (models and textures, under /work/): a page opened from a file cannot load them.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [jobsFile, workDir, browserExe, mode0] = process.argv.slice(2);
const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(rendererDir);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.s3o': 'application/octet-stream', '.dae': 'text/xml' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let root = rendererDir, rel = url;
  if (url.startsWith('/work/')) { root = path.resolve(workDir); rel = url.slice(5); }
  else if (url.startsWith('/node_modules/')) { root = projectDir; }
  const f = path.resolve(path.join(root, rel));
  if (!f.startsWith(path.resolve(root)) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));   // wait until it listens: only then the port is known
const port = server.address().port;

const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
// gpu: the browser uses the graphics card (fast); software: SwiftShader, rendering on the processor (works without a graphics driver). With `gpu` the browser falls back
// to software by itself when no usable GPU is there (the page cannot make its WebGL context).
const ARGS = { gpu: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'], software: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
let mode = mode0 === 'software' ? 'software' : 'gpu', browser = null, failed = 0;
const pages = new Map();   // one page per picture size, kept open for all pictures of that size: renderer, environment and shaders are made once (index.html: window.renderUnit)
async function pageFor(size) {
  if (!pages.has(size)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.text().startsWith('timing')) console.log(m.text()); else if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html?size=${size}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
    pages.set(size, page);
  }
  return pages.get(size);
}
async function start() {
  browser = await chromium.launch({ executablePath: browserExe, headless: true, args: ARGS[mode] });
  if (jobs.length) {
    const size = parseInt(new URLSearchParams(jobs[0].query).get('size') || '400', 10);
    await pageFor(size);   // makes the WebGL context: fails here if there is no usable GPU
    console.log(`renderer (${mode}): ${await pages.get(size).evaluate('window.__glRenderer')}`);
  }
}
try { await start(); } catch (e) {
  if (mode !== 'gpu') throw e;
  console.log(`no usable GPU (${e.message.split('\n')[0]}): rendering on the processor`);
  await browser?.close().catch(() => {}); pages.clear(); mode = 'software'; await start();
}
for (const job of jobs) {
  const size = parseInt(new URLSearchParams(job.query).get('size') || '400', 10);
  let page = null;
  try {
    page = await pageFor(size);
    page.errors.length = 0;
    const t0 = Date.now();
    await page.evaluate(q => window.renderUnit(q), job.query);
    const t1 = Date.now();
    await page.locator('canvas').screenshot({ path: job.out, omitBackground: true });   // transparent background
    if (new URLSearchParams(job.query).has('timing')) console.log(`timing render ${t1 - t0} ms, screenshot ${Date.now() - t1} ms`);
    console.log('ok', job.out);
  } catch (e) {
    failed++;
    console.log('FAILED', job.out, (page && page.errors[0]) || e.message);
    if (page) { await page.close(); pages.delete(size); }   // after an error the page starts again
  }
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
