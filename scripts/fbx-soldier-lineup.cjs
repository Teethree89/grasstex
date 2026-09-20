/* FBX soldier visual lineup: posed weapon-in-hand verification for imported soldiers.
 *
 * What it does (all against the shipping battle page, no gameplay replacements):
 *  1. Loads battle_sim_local.php and waits for `[ANIM] FBX soldiers ready`, parsing the
 *     model set, retarget flags, weapon list, clip count and animated-bone count.
 *  2. Opens the in-page Motion Lab (one-soldier scene) and screenshots the US paratrooper
 *     rifleman with its M1 Garand in aim / reload / walk-aim / crouch-aim, front and side.
 *  3. Starts the live battle and captures each faction's rifleman, captain, engineer,
 *     gunner and both scout weapon variants.
 *  4. Writes <out>/summary.json plus the PNGs; exits non-zero when the backend never becomes
 *     ready, a soldier fails to bind, or the page throws.
 *
 * Visual PASS is still a human judgement (PIPELINE.md: stock at the shoulder, right hand on
 * the wrist, left hand on the fore-end). This harness exists so the evidence is one command.
 *
 * Run with:
 *   php -S 127.0.0.1:8765 -t <parent-of-grasstex>   # serve the repo, if not already running
 *   NODE_PATH=/Users/ivanpopov/node_modules node scripts/fbx-soldier-lineup.cjs
 *
 * Env: FBX_URL (page URL), FBX_SEED, FBX_OUT (output dir), FBX_CHROME (Chrome binary;
 * defaults to the AGENTS.md working binary), FBX_FRAME (fixed Motion Lab frame, 0-120),
 * FBX_LAB_RADIUS (Motion Lab camera radius), FBX_POSES (comma-separated lab poses),
 * FBX_ROLES (comma-separated faction/role names such as ge/scout2).
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CHROME = process.env.FBX_CHROME || '/Volumes/Expanse/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = process.env.FBX_URL || 'http://127.0.0.1:8765/grasstex/battle_sim_local.php';
const SEED = process.env.FBX_SEED || 'live-mu9r3081-4lnto';
const OUT = path.resolve(process.env.FBX_OUT || path.join(os.tmpdir(), 'fbx-lineup'));
const FRAME = Number(process.env.FBX_FRAME || 45);
const LAB_RADIUS = Number(process.env.FBX_LAB_RADIUS || 2.6);
const LAB_POSES = (process.env.FBX_POSES || 'aim,reload,walk-aim,crouch-aim').split(',');
const ROLE_FILTER = process.env.FBX_ROLES ? new Set(process.env.FBX_ROLES.split(',')) : null;

function parseReady(line) {
  // "[ANIM] FBX soldiers ready: paratrooper us-paratrooper* ... , weapons m1-garand.fbx ... , 106 clips, 53 animated bones, 11589 ms, smoothed normals"
  const m = /ready:\s*(\S+)\s+(.*),\s*weapons\s+(.*),\s*(\d+)\s*clips,\s*(\d+)\s*animated bones/.exec(line);
  if (!m) return null;
  const models = m[2].split(/\s+/).filter(Boolean).map(w => ({ file: w.replace(/\*$/, '') + '.fbx', retargeted: /\*$/.test(w) }));
  return { set: m[1], models, weapons: m[3].split(/\s+/).filter(Boolean), clips: +m[4], animatedBones: +m[5] };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const fail = [];
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const logs = [];
    page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', e => logs.push('[pageerror] ' + String(e && e.stack || e)));
    await page.goto(`${BASE_URL}?seed=${encodeURIComponent(SEED)}`, { waitUntil: 'load', timeout: 120000 });
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(1000);
      if (logs.some(l => l.includes('FBX soldiers ready') || l.includes('FBX soldiers unavailable'))) break;
    }
    const readyLine = logs.find(l => l.includes('FBX soldiers ready'));
    const ready = readyLine && parseReady(readyLine);
    if (!ready) fail.push('FBX backend never reported ready');
    if (logs.some(l => l.includes('FBX soldier bind failed'))) fail.push('at least one soldier failed to bind');
    if (ready && !ready.models.every(m => m.retargeted)) fail.push('not every model reports retargeted clips (*)');

    // --- Motion Lab: US paratrooper rifleman + M1 Garand through the weapon poses ---
    await page.evaluate(() => document.getElementById('animationLabToggle').click());
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);
      if (/FBX clip:/.test(await page.textContent('#animationLabSource').catch(() => ''))) break;
    }
    const labSource = await page.textContent('#animationLabSource').catch(() => '');
    if (!/FBX clip:/.test(labSource)) fail.push('Motion Lab soldier did not bind the FBX backend: ' + labSource);
    await page.addStyleTag({ content: '#animationLab{width:940px !important;} #animationLab canvas{height:660px !important;}' });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(1000);
    const canvas = page.locator('#animationLabCanvas');
    const box = await canvas.boundingBox();
    const labShots = [];
    for (const pose of LAB_POSES) {
      await page.evaluate(value => {
        const select = document.getElementById('animationLabPose');
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, pose);
      await page.evaluate(frame => {
        const input = document.getElementById('animationLabFrame');
        input.value = String(frame);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, FRAME);
      const state = await page.evaluate(() => window.__battleMotionLab.state());
      if (!state.paused || state.frame !== FRAME || Math.abs(state.rootX) > 1e-5 || Math.abs(state.rootZ) > 1e-5)
        fail.push(`Motion Lab ${pose}: frame/root state ${JSON.stringify(state)}`);
      if (pose === 'reload' && state.twoHand) fail.push('Motion Lab reload kept the left hand attached');
      if (['aim', 'walk-aim', 'crouch-aim'].includes(pose) && state.twoHand !== 1)
        fail.push(`Motion Lab ${pose}: two-hand hold did not attach (${JSON.stringify(state)})`);
      for (const view of ['front', 'side']) {
        const positioned = await page.evaluate(({ view, radius }) => {
          const engines = (BABYLON.EngineStore && BABYLON.EngineStore.Instances) || BABYLON.Engine.Instances || [];
          const engine = engines.find(e => e.getRenderingCanvas && e.getRenderingCanvas()?.id === 'animationLabCanvas');
          const cam = engine?.scenes?.[0]?.activeCamera;
          if (!cam || typeof cam.alpha !== 'number') return false;
          cam.alpha = view === 'front' ? -Math.PI / 2 : 0;
          cam.beta = 1.08;
          cam.radius = radius;
          cam.setTarget(new BABYLON.Vector3(0, .82, 0));
          return true;
        }, { view, radius: LAB_RADIUS });
        if (!positioned) fail.push(`Motion Lab ${pose}: camera unavailable`);
        await page.waitForTimeout(250);
        const file = `lab-us-${pose}-${view}.png`;
        await page.screenshot({ path: path.join(OUT, file), clip: box, timeout: 120000 });
        labShots.push({ pose, view, file, frame: FRAME, state });
      }
    }

    // --- Live battle close-ups for every character model and weapon variant ---
    await page.evaluate(() => document.getElementById('animationLabClose').click()).catch(() => {});
    await page.evaluate(() => document.getElementById('startBtn').click());
    await page.waitForTimeout(12000);
    async function battleCloseup(faction, role, index, png) {
      const info = await page.evaluate(({ faction, role, index }) => {
        const sim = window.__battle__;
        if (!sim) return { err: 'no battle' };
        const pool = [...(sim._roster[faction] || [])];
        const pick = pool.filter(s => s._fbx && s.role === role)[index];
        if (!pick) return { err: `no FBX ${faction}/${role} soldier at index ${index}` };
        const p = pick.root.position, cam = sim.scene && sim.scene.activeCamera;
        if (cam) {
          // Production serves the UniversalCamera fly controller (see battle/camera-controls.js),
          // not the page's ArcRotate fallback: place the eye in front of the soldier and look
          // at his chest so the weapon grip fills the frame.
          const yaw = pick.root.rotation.y || 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
          cam.position.set(p.x + fx * 2.6 - fz * 1.2, p.y + 1.7, p.z + fz * 2.6 + fx * 1.2);
          cam.setTarget(new BABYLON.Vector3(p.x, p.y + 1.1, p.z));
        }
        sim.pause();
        return { faction: pick.faction, role: pick.role, file: pick._fbx.lib.file,
          weapon: pick.weapon && (pick.weapon.model || pick.weapon.kind),
          twoHand: pick._fbx.twoHand, supportErrorCm: pick._fbx.supportErrorCm,
          supportReason: pick._fbx.supportReason,
          supportReach: pick._fbx.supportHandM == null ? null : {
            hand: pick._fbx.supportHandM, near: pick._fbx.supportNearM, far: pick._fbx.supportFarM } };
      }, { faction, role, index });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, png), timeout: 120000 });
      await page.evaluate(() => { const sim = window.__battle__; if (sim) sim.paused = false; });
      return { image: png, ...info };
    }
    const shots = [];
    const expected = {
      us: { rifleman: ['us-paratrooper.fbx', 'm1-garand.fbx'], captain: ['us-captain.fbx', 'm1911a1.fbx'],
        engineer: ['us-engineer.fbx', 'm1-garand.fbx'], gunner: ['us-gunner.fbx', 'm1919a6.fbx'],
        scout: ['us-scout.fbx', 'm1-carbine.fbx'], scout2: ['us-scout.fbx', 'thompson.fbx'] },
      ge: { rifleman: ['ge-paratrooper.fbx', 'kar98k.fbx'], captain: ['ge-captain.fbx', 'p38.fbx'],
        engineer: ['ge-engineer.fbx', 'kar98k.fbx'], gunner: ['ge-gunner.fbx', 'mg42.fbx'],
        scout: ['ge-scout.fbx', 'fg42.fbx'], scout2: ['ge-scout.fbx', 'mp40.fbx'] }
    };
    for (const faction of ['us', 'ge']) for (const label of Object.keys(expected[faction])) {
      if (ROLE_FILTER && !ROLE_FILTER.has(`${faction}/${label}`)) continue;
      const role = label === 'scout2' ? 'scout' : label, index = label === 'scout2' ? 1 : 0;
      const shot = await battleCloseup(faction, role, index, `battle-${faction}-${label}.png`);
      shots.push(shot);
      if (shot.err) fail.push(`${faction}/${label} close-up: ` + shot.err);
      else if (shot.file !== expected[faction][label][0] || shot.weapon !== expected[faction][label][1])
        fail.push(`${faction}/${label}: expected ${expected[faction][label].join(' + ')}, got ${shot.file} + ${shot.weapon}`);
      else if (shot.twoHand && shot.supportErrorCm > .5)
        fail.push(`${faction}/${label}: fore-end misses left hand by ${shot.supportErrorCm} cm`);
      else if (shot.supportReason === 'out-of-reach')
        fail.push(`${faction}/${label}: left hand outside fore-end reach ${JSON.stringify(shot.supportReach)}`);
      await page.waitForTimeout(1500);
    }
    const sockets = await page.evaluate(() => {
      try { return window.BattleFbxSoldier.status(window.__battle__.scene).sockets; }
      catch (e) { return { err: String(e).slice(0, 200) }; }
    }).catch(e => ({ err: String(e).slice(0, 200) }));
    if (sockets.err) fail.push('socket status: ' + sockets.err);
    const socketLines = [...new Set(logs.filter(l => l.includes('[ANIM] hand sockets')))];
    if (!socketLines.length) fail.push('no per-model hand-socket diagnostics logged');

    const pageErrors = [...new Set(logs.filter(l => /^\[pageerror\]|FBX soldier bind failed|FBX soldiers unavailable/.test(l)))];
    if (pageErrors.length) fail.push(...pageErrors.slice(0, 5));
    const summary = { seed: SEED, url: BASE_URL, ready, labShots, shots, sockets, socketLines,
      fail, ok: fail.length === 0, pageErrors };
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log('OUT ' + OUT);
    console.log(ready
      ? `READY set=${ready.set} models=${ready.models.length} retargeted=${ready.models.filter(m => m.retargeted).length} weapons=${ready.weapons.length} clips=${ready.clips} bones=${ready.animatedBones}`
      : 'READY missing');
    shots.forEach(s => console.log('SHOT ' + JSON.stringify(s)));
    console.log('SOCKETS ' + JSON.stringify(sockets));
    console.log(fail.length ? 'FAIL\n- ' + fail.join('\n- ') : 'OK: backend ready, lab + battle close-ups captured for human review');
    if (fail.length) process.exitCode = 1;
  } finally { await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]); }
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
