// node render.mjs <jobs.json> <work dir> <browser exe>
// Renders all jobs with ONE browser (a start of the browser costs more than a picture). jobs.json: [{ "out": "<png>", "query": "model=...&tex=...&size=400" }, ...]
// A small web server gives the page (renderer/), the node_modules (three.js) and the work dir (models and textures, under /work/): a page opened from a file cannot load them.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [jobsFile, workDir, browserExe] = process.argv.slice(2);
const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(rendererDir);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.s3o': 'application/octet-stream' };

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
const browser = await chromium.launch({ executablePath: browserExe, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const job of jobs) {
  const size = parseInt(new URLSearchParams(job.query).get('size') || '400', 10);
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  let error = null;
  page.on('pageerror', e => { error = e.message; });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) error = error || m.text(); });
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html?${job.query}`);
    await page.waitForFunction('window.__done === true', null, { timeout: 120000 });
    await page.locator('canvas').screenshot({ path: job.out, omitBackground: true });   // transparent background
    console.log('ok', job.out);
  } catch (e) {
    failed++;
    console.log('FAILED', job.out, error || e.message);
  }
  await page.close();
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
