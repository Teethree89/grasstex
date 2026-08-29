/* v54 amortized world streaming.
   Replaces the synchronous rebuildWorld() so crossing a chunk boundary no longer
   builds ~50k-450k clump matrices in a single frame.

   - work is time-sliced across frames against a millisecond budget
   - instance buffers are preallocated once and reused (no per-rebuild GC churn)
   - GPU uploads are spread one grass type per frame
   - near/patch instances are limited to chunks that can actually pass the
     NEAR_END distance test instead of the whole 242m ring
   - medium keeps FULL clump coverage in all near-capable chunks, then drops to
     half density only farther out; this guarantees every clump approaching the
     30m near boundary already has a medium representation instead of popping in
   - fill patch footprint is derived from the owning grass variant width and the
     exact clump scale, so it matches the crossed-card footprint instead of using
     a generic oversized scale
   - optional window.GrassAPI masks reject candidate clumps before any LOD/fill
     instance is written, preserving deterministic RNG sequence across clients
   - the restream trigger uses travel distance, not floor(x/CHUNK), so walking
     along a chunk seam can't thrash

   Load after the base game script and grass-api.js, before grass-effects.js. */
(function () {
  if (typeof BABYLON === 'undefined' || typeof scene === 'undefined' ||
      typeof camera === 'undefined' || typeof engine === 'undefined') return;
  if (typeof CHUNK === 'undefined' || typeof generateChunk !== 'function' ||
      typeof perChunkCount !== 'function' || typeof rng !== 'function' ||
      typeof hash2D !== 'function') return;
  if (typeof nearTypes === 'undefined' || typeof medTypes === 'undefined' ||
      typeof farTypes === 'undefined' || typeof nearPatch === 'undefined') return;

  var BUDGET_MS = 2.0;
  var COMMITS_PER_FRAME = 1;
  var PAD = CHUNK * 2.0;
  var HYST = CHUNK * 0.4;

  var NEAR_D = (typeof NEAR_END !== 'undefined' ? NEAR_END : 30) + PAD;
  var MED_D = (typeof MED_END !== 'undefined' ? MED_END : 165) + PAD;
  var FAR_LO = Math.max(0, (typeof FAR_START !== 'undefined' ? FAR_START : 150) - PAD);
  var FAR_HI = (typeof FAR_END !== 'undefined' ? FAR_END : 242) + PAD;
  var RING = Math.max(NEAR_D, MED_D, FAR_HI);

  var nearM = [], nearS = [], medM = [], farM = [], patchM = null;
  var nearN = new Int32Array(6), seedN = new Int32Array(6),
      medN = new Int32Array(6), farN = new Int32Array(6), patchN = 0;
  var bound = new WeakMap();

  var job = null, haveWorld = false;
  var builtX = 1e9, builtZ = 1e9, builtDen = -1;

  function fit(list, i, need) {
    var a = list[i];
    if (!a || a.length < need) list[i] = new Float32Array(Math.ceil(need * 1.25) + 16);
    return list[i];
  }

  function push(mesh, kind, data, stride, instances) {
    var b = bound.get(mesh);
    if (!b) { b = {}; bound.set(mesh, b); }
    if (b[kind] !== data) {
      mesh.thinInstanceSetBuffer(kind, data, stride, false);
      b[kind] = data;
    } else {
      mesh.thinInstanceBufferUpdated(kind);
    }
    if (instances >= 0) mesh.thinInstanceCount = instances;
  }

  function startJob(den) {
    var count = perChunkCount();
    var ox = camera.position.x, oz = camera.position.z;
    var range = Math.ceil(RING / CHUNK) + 1;
    var cx = Math.floor(ox / CHUNK), cz = Math.floor(oz / CHUNK);

    var list = [], nearC = 0, medFullC = 0, medHalfC = 0, farC = 0;
    for (var z = cz - range; z <= cz + range; z++) {
      for (var x = cx - range; x <= cx + range; x++) {
        var dx = (x + .5) * CHUNK - ox, dz = (z + .5) * CHUNK - oz;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > RING) continue;
        var wn = d <= NEAR_D, wm = d <= MED_D, wf = d >= FAR_LO && d <= FAR_HI;
        if (!wn && !wm && !wf) continue;
        if (wn) nearC++;
        if (wm) {
          if (wn) medFullC++;
          else medHalfC++;
        }
        if (wf) farC++;
        list.push({ x: x, z: z, d: d, n: wn, m: wm, f: wf });
      }
    }
    list.sort(function (a, b) { return a.d - b.d; });

    var c6 = new Int32Array(6), cm = new Int32Array(6), cf = new Int32Array(6);
    for (var i = 0; i < count; i++) {
      var v = i % 6;
      c6[v]++;
      if ((Math.floor(i / 6) & 1) === 0) cm[v]++;
      if (i % 7 === 0) cf[v]++;
    }
    for (var t = 0; t < 6; t++) {
      fit(nearM, t, nearC * c6[t] * 16);
      fit(nearS, t, nearC * c6[t]);
      fit(medM, t, (medFullC * c6[t] + medHalfC * cm[t]) * 16);
      fit(farM, t, farC * cf[t] * 16);
      nearN[t] = seedN[t] = medN[t] = farN[t] = 0;
    }
    var pNeed = nearC * count * 16;
    if (!patchM || patchM.length < pNeed) patchM = new Float32Array(Math.ceil(pNeed * 1.25) + 16);
    patchN = 0;

    job = { list: list, i: 0, count: count, commit: 0 };
    builtX = ox; builtZ = oz; builtDen = den;
    if (typeof status !== 'undefined' && status) status.textContent = 'Streaming chunks…';
  }

  function visitChunk(cx, cz, count, sink) {
    var r = rng(hash2D(cx, cz)), ox = cx * CHUNK, oz = cz * CHUNK;
    for (var i = 0; i < count; i++) {
      var x = ox + r() * CHUNK, z = oz + r() * CHUNK;
      var yaw = r() * Math.PI * 2, s = .70 + r() * .48, h = .82 + r() * .30, seed = r();
      /* Consume the full deterministic random sequence before filtering. That way the
         same chunk produces the same remaining clumps on every client given the same mask. */
      if (window.GrassAPI && typeof window.GrassAPI.isAllowed === 'function' &&
          !window.GrassAPI.isAllowed(x, z, {chunkX:cx, chunkZ:cz, index:i, seed:seed})) continue;
      sink(i, x, z, yaw, s, h, seed);
    }
  }

  function bakeChunk(e, count) {
    var wn = e.n, wm = e.m, wf = e.f;
    visitChunk(e.x, e.z, count, function (i, gx, gz, yaw, gs, gh, seed) {
      var v = i % 6, s = gs, sy = gs * gh, c = Math.cos(yaw), sn = Math.sin(yaw);
      var a, o;

      if (wn) {
        a = nearM[v]; o = nearN[v];
        a[o] = c * s;  a[o + 1] = 0;   a[o + 2] = -sn * s; a[o + 3] = 0;
        a[o + 4] = 0;  a[o + 5] = sy;  a[o + 6] = 0;       a[o + 7] = 0;
        a[o + 8] = sn * s; a[o + 9] = 0; a[o + 10] = c * s; a[o + 11] = 0;
        a[o + 12] = gx; a[o + 13] = 0; a[o + 14] = gz;    a[o + 15] = 1;
        nearN[v] = o + 16;
        nearS[v][seedN[v]++] = seed;

        var pw = (typeof V !== 'undefined' && V[v] && V[v].width) ? V[v].width : .71;
        var ps = gs * pw / .65, q = patchN;
        patchM[q] = c * ps;  patchM[q + 1] = 0;  patchM[q + 2] = -sn * ps; patchM[q + 3] = 0;
        patchM[q + 4] = 0;   patchM[q + 5] = ps; patchM[q + 6] = 0;        patchM[q + 7] = 0;
        patchM[q + 8] = sn * ps; patchM[q + 9] = 0; patchM[q + 10] = c * ps; patchM[q + 11] = 0;
        patchM[q + 12] = gx; patchM[q + 13] = .01; patchM[q + 14] = gz;   patchM[q + 15] = 1;
        patchN = q + 16;
      }

      if (wm && (wn || (Math.floor(i / 6) & 1) === 0)) {
        a = medM[v]; o = medN[v];
        a[o] = c * s;  a[o + 1] = 0;   a[o + 2] = -sn * s; a[o + 3] = 0;
        a[o + 4] = 0;  a[o + 5] = sy;  a[o + 6] = 0;       a[o + 7] = 0;
        a[o + 8] = sn * s; a[o + 9] = 0; a[o + 10] = c * s; a[o + 11] = 0;
        a[o + 12] = gx; a[o + 13] = 0; a[o + 14] = gz;    a[o + 15] = 1;
        medN[v] = o + 16;
      }

      if (wf && i % 7 === 0) {
        a = farM[v]; o = farN[v];
        a[o] = c * s;  a[o + 1] = 0;   a[o + 2] = -sn * s; a[o + 3] = 0;
        a[o + 4] = 0;  a[o + 5] = sy;  a[o + 6] = 0;       a[o + 7] = 0;
        a[o + 8] = sn * s; a[o + 9] = 0; a[o + 10] = c * s; a[o + 11] = 0;
        a[o + 12] = gx; a[o + 13] = 0; a[o + 14] = gz;    a[o + 15] = 1;
        farN[v] = o + 16;
      }
    });
  }

  function commitType(t) {
    push(nearTypes[t].mesh, 'matrix', nearM[t], 16, nearN[t] / 16);
    push(nearTypes[t].mesh, 'instanceSeed', nearS[t], 1, -1);
    push(medTypes[t].mesh, 'matrix', medM[t], 16, medN[t] / 16);
    push(farTypes[t].mesh, 'matrix', farM[t], 16, farN[t] / 16);
  }

  function step(unlimited) {
    if (!job) return;
    var t0 = performance.now(), L = job.list;

    while (job.i < L.length) {
      bakeChunk(L[job.i], job.count);
      job.i++;
      if (!unlimited && performance.now() - t0 > BUDGET_MS) return;
    }

    var done = 0;
    while (job.commit < 7) {
      if (job.commit < 6) commitType(job.commit);
      else push(nearPatch, 'matrix', patchM, 16, patchN / 16);
      job.commit++;
      if (!unlimited && ++done >= COMMITS_PER_FRAME) return;
    }

    var total = 0;
    for (var t = 0; t < 6; t++) total += nearN[t] / 16 + medN[t] / 16 + farN[t] / 16;
    job = null;
    haveWorld = true;
    if (typeof status !== 'undefined' && status)
      status.textContent = 'Ready — ' + fmt(total) + ' instances • ' + L.length + ' chunks';
  }

  function fmt(n) { return Math.round(n).toLocaleString(); }

  window.rebuildWorld = function (force) {
    var den = +density.value, dx = camera.position.x - builtX, dz = camera.position.z - builtZ;
    var moved = Math.sqrt(dx * dx + dz * dz);
    var jump = !haveWorld || moved > MED_D;
    if (force || den !== builtDen) startJob(den);
    else if (!job && moved > HYST) startJob(den);
    if (job) {
      window.__grassStreamBusy = true;
      step(jump);
      window.__grassStreamBusy = !!job;
    }
  };

  window.GrassStream = {
    visitChunk: visitChunk,
    get busy() { return !!job; },
    setBudget: function (ms) { BUDGET_MS = Math.max(.5, +ms || 2); },
    stats: function () {
      return { chunks: job ? job.list.length : 0, progress: job ? job.i / job.list.length : 1 };
    }
  };
})();