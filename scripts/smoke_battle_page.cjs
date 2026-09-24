/* Browser smoke test: boot battle_sim_local.php in headless Chromium, wait for window.__battle__,
   optionally start the battle, and save a screenshot. Proves the page loads and the sim constructs;
   it is not a behaviour test (use tools/ai-sim-harness for that).

   Serve the repo first, mounted at /grasstex like production:
     mkdir -p /tmp/www && ln -sfn "$PWD" /tmp/www/grasstex && php -S 127.0.0.1:8765 -t /tmp/www &
   Then:
     node scripts/smoke_battle_page.cjs
   Env: SMOKE_URL, SMOKE_SEED, SMOKE_SECONDS (sim wall seconds after Start, 0 = don't start),
        SMOKE_OUTPUT (screenshot path). Hosted textures 404 off-origin, so the ground renders red
        locally; that is expected. Exits non-zero if the sim never constructs or throws. */
const path = require('node:path');
const { execSync } = require('node:child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const url = process.env.SMOKE_URL || 'http://127.0.0.1:8765/grasstex/battle_sim_local.php';
const seed = process.env.SMOKE_SEED || 'smoke';
const seconds = Math.max(0, Number(process.env.SMOKE_SECONDS || '10'));
const output = path.resolve(process.env.SMOKE_OUTPUT || 'smoke.png');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    // ignoreHTTPSErrors: sandboxed environments proxy the CDN with their own CA.
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    await page.goto(url + (url.includes('?') ? '&' : '?') + 'seed=' + encodeURIComponent(seed), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__battle__, null, { timeout: 90000 });
    if (seconds > 0) {
      await page.getByText('Start battle').first().click().catch(() => {});
      await page.waitForTimeout(seconds * 1000);
    }
    await page.screenshot({ path: output });
    const simTime = await page.evaluate(() => window.__battle__.time);
    console.log('battle constructed; sim time ' + simTime + ' s; screenshot ' + output);
    if (seconds > 0 && !(simTime > 0)) {
      console.error('battle was started but sim time did not advance');
      process.exitCode = 1;
    }
    if (pageErrors.length) {
      console.error('page errors:\n  ' + pageErrors.join('\n  '));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('SMOKE FAIL', e.message); process.exit(1); });
