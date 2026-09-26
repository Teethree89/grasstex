/* Pistol support-cup smoothness probe for the Motion Lab.
 *
 * Plays pistol clips in labs/fbx-animation-lab.html at a fixed 60 Hz step with a real
 * per-model sidecar and measures the left arm every frame, before (raw clip pose) and
 * after the lab's pose pipeline (arm dials + support-cup solver):
 *   gap        cm between contact B and the right-hand-local Left Grip target
 *   off        degrees each left-arm joint is bent away from the clip
 *   jerk       degrees of angular acceleration per frame of the left hand's world
 *              rotation (angle between consecutive frame-to-frame rotations);
 *              the raw column is the clip's own jerk, so solved - raw is what we add
 *   posJerk    cm/frame² of contact B relative to the target (glued hand: ~0)
 *   rightHand / targetJerkCm  the same for the firing hand and the target it carries
 *
 * Run (serve the repo first, see AGENTS.md "Browser smoke"):
 *   CUP_SIDECAR=/path/us-captain.fbx.json NODE_PATH=$(npm root -g) node scripts/probe_pistol_cup.cjs
 * Env: CUP_URL, CUP_MODEL (us-captain.fbx), CUP_WEAPON (m1911a1.fbx), CUP_CLIPS
 * (clip files separated by |), CUP_SECONDS (per clip, default the clip length),
 * CUP_OUTPUT (JSON path), CUP_SERIES=1 (per-frame gap/jerk/mode series). Sidecars are server-owned and never committed, so pass one.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');

const URL = process.env.CUP_URL || 'http://127.0.0.1:8765/grasstex/labs/fbx-animation-lab.html';
const MODEL = process.env.CUP_MODEL || 'us-captain.fbx';
const WEAPON = process.env.CUP_WEAPON || 'm1911a1.fbx';
const SIDECAR = process.env.CUP_SIDECAR;
const CLIPS = (process.env.CUP_CLIPS || [
  'Idle With Aimed Pistol - Pistol Idle.fbx',
  'Idle Holding Pistol, Kicking Out And Shaking Legs - Pistol Idle.fbx',
  'Hit Reaction While Holding A Pistol - Hit Reaction.fbx',
  'Reaction To Getting Hit To The Left While Holding A Pistol - Hit Reaction.fbx',
  'Walking With An Aimed Pistol - Pistol Walk.fbx'
].join('|')).split('|');
const SECONDS = +process.env.CUP_SECONDS || 0;
const SERIES = process.env.CUP_SERIES === '1';

(async () => {
  if (!SIDECAR) throw new Error('CUP_SIDECAR=<model>.fbx.json is required');
  const sidecar = fs.readFileSync(SIDECAR, 'utf8');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.stack || e)));
  await page.route('**/Assets/soldiers/*.fbx.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: sidecar }));
  const probe = async ({ MODEL, WEAPON, CLIPS, SECONDS, SERIES }) => {
    const fetchFile = (dir, name) => labFetchFile('../Assets/' + dir + '/' + encodeURIComponent(name), name);
    if ($('keepPoints')) $('keepPoints').checked = true;
    await importModel(await fetchFile('soldiers', MODEL));
    await labLoadSidecarFromServer(false);
    await labImportWeapon(await fetchFile('weapons', WEAPON), WEAPON);
    if ($('trackHands')) $('trackHands').checked = true;
    engine.stopRenderLoop();
    // Fixed 60 Hz: the clip clock and the solver's filter both read these.
    const DT = 1000 / 60;
    engine.getDeltaTime = () => DT;
    scene.useConstantAnimationDeltaTime = true;
    const V = BABYLON.Vector3, Q = BABYLON.Quaternion;
    const ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(Q.Dot(a, b)))) * 180 / Math.PI;
    const worldRot = n => { n.computeWorldMatrix(true); const s = new V(), q = new Q(), t = new V(); n.getWorldMatrix().decompose(s, q, t); return q; };
    const joints = () => { const h = labHandNode('left'); return [h, h.parent, h.parent.parent]; };
    let rec = null, raw = null;
    // First observer: the clean clip pose, before stash/dials/cup touch the arm.
    scene.onBeforeRenderObservable.add(() => {
      if (!rec) return;
      raw = { local: joints().map(j => j.rotationQuaternion.clone()), world: worldRot(labHandNode('left')) };
    }, undefined, true);
    // Last observer: the solved pose that is about to be drawn.
    scene.onBeforeRenderObservable.add(() => {
      if (!rec || !raw) return;
      const js = joints(), hand = js[0];
      const target = labPistolLeftGripWorld(), B = labAnchorWorld('left');
      rec.push({
        rawWorld: raw.world, world: worldRot(hand), right: worldRot(labHandNode('right')), T: target,
        off: js.map((j, i) => ang(j.rotationQuaternion, raw.local[i])),
        rel: target && B ? B.subtract(target) : null,
        gap: target && B ? V.Distance(B, target) * 100 : null,
        mode: labCupFollow.mode, weight: labCupFollow.weight
      });
    });
    const stats = xs => {
      const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
      if (!v.length) return null;
      const q = p => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
      return { mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), p95: +q(.95).toFixed(2), max: +v[v.length - 1].toFixed(2) };
    };
    const jerkOf = rots => {
      const out = [];
      for (let i = 2; i < rots.length; i++) {
        const d1 = rots[i - 1].multiply(Q.Inverse(rots[i - 2])), d2 = rots[i].multiply(Q.Inverse(rots[i - 1]));
        out.push(ang(d1, d2));
      }
      return out;
    };
    const report = [];
    for (const name of CLIPS) {
      const before = loadedClips.length;
      await importAnimations([await fetchFile('animations', name)]);
      if (loadedClips.length === before) { report.push({ clip: name, error: 'not loaded' }); continue; }
      const group = activeGroup;
      group.stop(); group.start(true, 1);
      labResetCupFollow();
      const seconds = SECONDS || (group.to - group.from) / (group.targetedAnimations[0]?.animation.framePerSecond || 30);
      rec = [];
      for (let f = 0; f < Math.round(seconds * 60); f++) scene.render();
      const r = rec; rec = null;
      const modes = {};
      r.forEach(x => { modes[x.mode] = (modes[x.mode] || 0) + 1; });
      const posJerk = [];
      for (let i = 2; i < r.length; i++) if (r[i].rel && r[i - 1].rel && r[i - 2].rel)
        posJerk.push(r[i].rel.subtract(r[i - 1].rel.scale(2)).add(r[i - 2].rel).length() * 100);
      report.push({
        clip: name, frames: r.length, modes,
        gapCm: stats(r.map(x => x.gap)),
        offDeg: { wrist: stats(r.map(x => x.off[0])), elbow: stats(r.map(x => x.off[1])), shoulder: stats(r.map(x => x.off[2])) },
        handJerkDeg: { raw: stats(jerkOf(r.map(x => x.rawWorld))), solved: stats(jerkOf(r.map(x => x.world))), rightHand: stats(jerkOf(r.map(x => x.right))) },
        targetJerkCm: stats(r.slice(2).map((x, i) => x.T && r[i].T && r[i + 1].T ? x.T.subtract(r[i + 1].T.scale(2)).add(r[i].T).length() * 100 : NaN)),
        posJerkCm: stats(posJerk),
        series: SERIES ? { gap: r.map(x => x.gap == null ? null : +x.gap.toFixed(1)), jerk: jerkOf(r.map(x => x.world)).map(v => +v.toFixed(2)), rjerk: jerkOf(r.map(x => x.right)).map(v => +v.toFixed(2)), mode: r.map(x => x.mode[0]).join(''), weight: r.map(x => +(+x.weight).toFixed(2)) } : undefined
      });
    }
    return report;
  };
  // The CDN loader occasionally is not ready on the first page load; reload and retry.
  let result;
  for (let attempt = 1; ; attempt++) {
    await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => typeof importModel === 'function' && typeof labImportWeapon === 'function', null, { timeout: 60000 });
    try { result = await page.evaluate(probe, { MODEL, WEAPON, CLIPS, SECONDS, SERIES }); break; }
    catch (error) { if (attempt >= 3) throw error; console.error('retrying after: ' + String(error.message).split('\n')[0]); }
  }
  const text = JSON.stringify({ model: MODEL, weapon: WEAPON, clips: result, errors }, null, 1);
  if (process.env.CUP_OUTPUT) fs.writeFileSync(process.env.CUP_OUTPUT, text);
  console.log(text);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
