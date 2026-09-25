(() => {
  'use strict';

  // FBX-lab experiment, phase 2:
  //   1) KEEP the working animated-bounds center lock on labAnimationContainer.
  //   2) ADD a separate X/Z constraint on the skeleton's base/root bone.
  //
  // The two corrections intentionally have different owners. The bone keeps the
  // lower/root signal from walking away inside the rig; the outer container keeps
  // the rendered animated footprint centered at the canonical model origin.

  const lockLabel = document.createElement('label');
  lockLabel.className = 'check';
  lockLabel.innerHTML = '<input id="horizontalRootLock" type="checkbox"> Lock animated container center to model origin';
  const boundsLabel = document.getElementById('animationBounds')?.closest('label');
  if (boundsLabel) boundsLabel.after(lockLabel);

  const bottomRootLabel = document.createElement('label');
  bottomRootLabel.className = 'check';
  bottomRootLabel.innerHTML = '<input id="bottomRootLock" type="checkbox" checked> Also lock bottom/base skeleton root X/Z';
  lockLabel.after(bottomRootLabel);

  const explanation = document.createElement('p');
  explanation.className = 'hint';
  explanation.style.marginTop = '9px';
  explanation.textContent = 'Combined experiment: preserve the proven animated-bounds container lock, then additionally hold the skeleton base root at its clip-start local X/Z. The root Y/rotation and all other bones remain animation-owned. Loop-start still renders exactly as authored with no correction math.';
  bottomRootLabel.after(explanation);

  const modelStats = document.querySelector('#right dl.stats');
  if (modelStats) {
    modelStats.insertAdjacentHTML('beforeend', [
      '<dt>Bottom root</dt><dd id="bottomRootName">—</dd>',
      '<dt>Root anchor X/Z</dt><dd id="rootAnchor">—</dd>',
      '<dt>Raw root X/Z</dt><dd id="rawRoot">—</dd>',
      '<dt>Root drift X/Z</dt><dd id="rootDrift">—</dd>',
      '<dt>Raw center X/Z</dt><dd id="rawTravel">—</dd>',
      '<dt>Container X/Z</dt><dd id="containerCorrection">—</dd>'
    ].join(''));
  }

  const lockInput = document.getElementById('horizontalRootLock');
  const bottomRootInput = document.getElementById('bottomRootLock');
  const rootNameEl = document.getElementById('bottomRootName');
  const rootAnchorEl = document.getElementById('rootAnchor');
  const rawRootEl = document.getElementById('rawRoot');
  const rootDriftEl = document.getElementById('rootDrift');
  const rawTravelEl = document.getElementById('rawTravel');
  const correctionEl = document.getElementById('containerCorrection');

  const TARGET_X = 0;
  const TARGET_Z = 0;
  const EPSILON = 1e-8;
  let observedContainer = null;
  let observedGroup = null;
  let loopObserver = null;
  let authoredLoopStartPending = false;
  let rootDriver = null;
  let rootAnchor = null;

  function formatPair(x, z) {
    return x.toFixed(3) + ', ' + z.toFixed(3);
  }

  function resetContainerXZ() {
    if (!animationContainer || animationContainer.isDisposed()) return;
    animationContainer.position.x = 0;
    animationContainer.position.z = 0;
    animationContainer.computeWorldMatrix(true);
  }

  function refreshChildMatrices() {
    renderableMeshes().forEach(mesh => mesh.computeWorldMatrix(true));
  }

  function clearCenterReadout() {
    if (rawTravelEl) rawTravelEl.textContent = '—';
    if (correctionEl) correctionEl.textContent = '—';
  }

  function clearRootReadout() {
    if (rootNameEl) rootNameEl.textContent = rootDriver?.bone?.name || '—';
    if (rootAnchorEl) rootAnchorEl.textContent = rootAnchor ? formatPair(rootAnchor.x, rootAnchor.z) : '—';
    if (rawRootEl) rawRootEl.textContent = '—';
    if (rootDriftEl) rootDriftEl.textContent = '—';
  }

  function detachLoopObserver() {
    if (observedGroup && loopObserver && observedGroup.onAnimationGroupLoopObservable?.remove) {
      try {
        observedGroup.onAnimationGroupLoopObservable.remove(loopObserver);
      } catch (error) {
        // A disposed/replaced animation group can invalidate its observable.
      }
    }
    loopObserver = null;
  }

  function observeActiveGroup() {
    if (activeGroup === observedGroup) return false;

    detachLoopObserver();
    observedGroup = activeGroup;
    authoredLoopStartPending = false;
    rootAnchor = null;

    if (observedGroup?.onAnimationGroupLoopObservable?.add) {
      loopObserver = observedGroup.onAnimationGroupLoopObservable.add(() => {
        authoredLoopStartPending = true;
      });
    }
    return true;
  }

  function hasDescendantNamed(bone, wanted) {
    const stack = [...(bone.getChildren?.() || [])];
    while (stack.length) {
      const child = stack.pop();
      if ((child.name || '').toLowerCase() === wanted) return true;
      stack.push(...(child.getChildren?.() || []));
    }
    return false;
  }

  function chooseRootBone(skeleton) {
    const roots = (skeleton?.bones || []).filter(bone => !bone.getParent?.());
    if (!roots.length) return null;
    if (roots.length === 1) return roots[0];

    const scored = roots.map(bone => {
      const name = (bone.name || '').toLowerCase();
      let score = 0;
      if (name === 'root' || name.endsWith(':root') || name.endsWith('|root')) score += 100;
      if (name.includes('root')) score += 25;
      if (hasDescendantNamed(bone, 'hips')) score += 50;
      return { bone, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].bone;
  }

  function resolveRootDriver() {
    if (rootDriver && modelSkeletons?.includes(rootDriver.skeleton) && !rootDriver.mesh?.isDisposed?.()) {
      return rootDriver;
    }

    rootDriver = null;
    for (const skeleton of modelSkeletons || []) {
      const bone = chooseRootBone(skeleton);
      if (!bone) continue;
      const mesh = renderableMeshes().find(candidate => candidate.skeleton === skeleton);
      if (!mesh) continue;
      rootDriver = { skeleton, bone, mesh };
      break;
    }

    if (rootNameEl) rootNameEl.textContent = rootDriver?.bone?.name || 'no usable root';
    return rootDriver;
  }

  function readRootLocalPosition() {
    const driver = resolveRootDriver();
    if (!driver) return null;

    try {
      const position = driver.bone.getPosition(BABYLON.Space.LOCAL, driver.mesh);
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
        return position.clone ? position.clone() : new BABYLON.Vector3(position.x, position.y, position.z);
      }
    } catch (error) {
      console.warn('FBX lab: could not read bottom root local position', error);
    }
    return null;
  }

  function captureRootAnchorIfNeeded() {
    if (rootAnchor || !observedGroup) return;
    const position = readRootLocalPosition();
    if (!position) return;
    rootAnchor = { x: position.x, z: position.z };
    if (rootAnchorEl) rootAnchorEl.textContent = formatPair(rootAnchor.x, rootAnchor.z);
  }

  function lockBottomRootXZ() {
    const driver = resolveRootDriver();
    const raw = readRootLocalPosition();
    if (!driver || !raw) return null;

    captureRootAnchorIfNeeded();
    if (!rootAnchor) return null;

    const driftX = raw.x - rootAnchor.x;
    const driftZ = raw.z - rootAnchor.z;

    if (bottomRootInput?.checked && (Math.abs(driftX) > EPSILON || Math.abs(driftZ) > EPSILON)) {
      try {
        // This is the additive experiment the outer-container-only pass did not
        // perform: constrain only the base root's LOCAL X/Z to the pose captured
        // at this clip's first evaluated frame. Preserve its animated Y exactly.
        driver.bone.setPosition(
          new BABYLON.Vector3(rootAnchor.x, raw.y, rootAnchor.z),
          BABYLON.Space.LOCAL,
          driver.mesh
        );
        driver.skeleton.prepare?.();
        refreshChildMatrices();
      } catch (error) {
        console.warn('FBX lab: could not constrain bottom root X/Z', error);
      }
    }

    if (rawRootEl) rawRootEl.textContent = formatPair(raw.x, raw.z);
    if (rootDriftEl) rootDriftEl.textContent = formatPair(driftX, driftZ);
    return { raw, driftX, driftZ };
  }

  function neutralBounds() {
    // Outer center lock stays exactly conceptually where it was: remove only its
    // previous X/Z correction, measure the now-evaluated/deformed model, then
    // apply the inverse center offset to labAnimationContainer.
    resetContainerXZ();
    return refreshAnimatedBounds();
  }

  function applyCombinedLock() {
    if (!lockInput) return;

    if (!modelAssets || !animationContainer || animationContainer.isDisposed()) {
      observedContainer = null;
      detachLoopObserver();
      observedGroup = null;
      authoredLoopStartPending = false;
      rootDriver = null;
      rootAnchor = null;
      clearRootReadout();
      clearCenterReadout();
      return;
    }

    if (animationContainer !== observedContainer) {
      observedContainer = animationContainer;
      rootDriver = null;
      rootAnchor = null;
      resetContainerXZ();
      resolveRootDriver();
    }

    const groupChanged = observeActiveGroup();
    if (groupChanged) {
      // The callback runs after Babylon's animation evaluation, so this captures
      // the new clip's actual first evaluated base-root pose even if the user
      // does not enable the lock until later.
      captureRootAnchorIfNeeded();
    } else if (!rootAnchor) {
      captureRootAnchorIfNeeded();
    }

    if (!lockInput.checked) {
      if (Math.abs(animationContainer.position.x) > EPSILON || Math.abs(animationContainer.position.z) > EPSILON) {
        resetContainerXZ();
      }
      authoredLoopStartPending = false;
      clearCenterReadout();
      if (rootAnchorEl) rootAnchorEl.textContent = rootAnchor ? formatPair(rootAnchor.x, rootAnchor.z) : '—';
      if (rootNameEl) rootNameEl.textContent = rootDriver?.bone?.name || '—';
      if (rawRootEl || rootDriftEl) {
        const raw = readRootLocalPosition();
        if (rawRootEl) rawRootEl.textContent = raw ? formatPair(raw.x, raw.z) : '—';
        if (rootDriftEl) rootDriftEl.textContent = raw && rootAnchor ? formatPair(raw.x-rootAnchor.x, raw.z-rootAnchor.z) : '—';
      }
      return;
    }

    if (authoredLoopStartPending) {
      // Keep the accepted seam rule: the restarted first pose is already good.
      // On this one render do NOT touch the base root and do NOT run center math.
      authoredLoopStartPending = false;
      resetContainerXZ();
      refreshChildMatrices();
      const raw = readRootLocalPosition();
      if (rawRootEl) rawRootEl.textContent = raw ? formatPair(raw.x, raw.z) : 'loop start';
      if (rootDriftEl) rootDriftEl.textContent = 'loop start · authored';
      if (rawTravelEl) rawTravelEl.textContent = 'loop start · authored';
      if (correctionEl) correctionEl.textContent = '0.000, 0.000';
      return;
    }

    // ADDITIVE lower-root constraint first. It changes only that root's local
    // X/Z; then the original outer center lock measures the resulting pose.
    lockBottomRootXZ();

    const bounds = neutralBounds();
    if (!bounds) {
      clearCenterReadout();
      return;
    }

    const rawX = (bounds.min.x + bounds.max.x) * 0.5;
    const rawZ = (bounds.min.z + bounds.max.z) * 0.5;
    const correctionX = TARGET_X - rawX;
    const correctionZ = TARGET_Z - rawZ;

    animationContainer.position.x = correctionX;
    animationContainer.position.z = correctionZ;
    animationContainer.computeWorldMatrix(true);
    refreshChildMatrices();

    if (rawTravelEl) rawTravelEl.textContent = formatPair(rawX, rawZ);
    if (correctionEl) correctionEl.textContent = formatPair(correctionX, correctionZ);
  }

  lockInput?.addEventListener('change', () => {
    authoredLoopStartPending = false;
    if (!lockInput.checked) resetContainerXZ();
  });

  bottomRootInput?.addEventListener('change', () => {
    // Do not redefine the clip-start anchor when toggling this diagnostic. That
    // makes A/B comparison use the same reference pose.
    if (rootAnchorEl) rootAnchorEl.textContent = rootAnchor ? formatPair(rootAnchor.x, rootAnchor.z) : '—';
  });

  // Babylon evaluates AnimationGroups before this observable. Apply the lower
  // root constraint and then the proven outer center correction before render.
  const correctionObservable = scene.onAfterAnimationsObservable || scene.onBeforeRenderObservable;
  correctionObservable.add(applyCombinedLock, -1, true);
})();
