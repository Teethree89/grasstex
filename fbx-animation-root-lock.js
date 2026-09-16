(() => {
  'use strict';

  // Experimental FBX-lab layer: lock the skeleton's lowest/base root signal in
  // X/Z by translating only labAnimationContainer. This deliberately does not
  // write to a bone, linked transform, rig node, modelContainer, Y, rotation,
  // or scale. The previous animated-bounds center remains available only as a
  // visual diagnostic; it is no longer the lock source in this experiment.

  const lockLabel = document.createElement('label');
  lockLabel.className = 'check';
  lockLabel.innerHTML = '<input id="horizontalRootLock" type="checkbox"> Lock bottom skeleton root to model origin';
  const boundsLabel = document.getElementById('animationBounds')?.closest('label');
  if (boundsLabel) boundsLabel.after(lockLabel);

  const explanation = document.createElement('p');
  explanation.className = 'hint';
  explanation.style.marginTop = '9px';
  explanation.textContent = 'Bottom-root experiment: find the skeleton root bone that drives the long base line, measure its evaluated world X/Z with the animation container neutral, then translate only the outer animation container so that root projects to 0,0. Loop-start still renders authored with zero correction.';
  lockLabel.after(explanation);

  const modelStats = document.querySelector('#right dl.stats');
  if (modelStats) {
    modelStats.insertAdjacentHTML('beforeend', [
      '<dt>Bottom root</dt><dd id="bottomRootName">—</dd>',
      '<dt>Raw root X/Z</dt><dd id="rawTravel">—</dd>',
      '<dt>Container X/Z</dt><dd id="containerCorrection">—</dd>'
    ].join(''));
  }

  const lockInput = document.getElementById('horizontalRootLock');
  const rootNameEl = document.getElementById('bottomRootName');
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

  function formatPair(x, z) {
    return x.toFixed(3) + ', ' + z.toFixed(3);
  }

  function clearReadout() {
    if (rootNameEl) rootNameEl.textContent = rootDriver?.bone?.name || '—';
    if (rawTravelEl) rawTravelEl.textContent = '—';
    if (correctionEl) correctionEl.textContent = '—';
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
    if (activeGroup === observedGroup) return;

    detachLoopObserver();
    observedGroup = activeGroup;
    authoredLoopStartPending = false;

    if (observedGroup?.onAnimationGroupLoopObservable?.add) {
      loopObserver = observedGroup.onAnimationGroupLoopObservable.add(() => {
        authoredLoopStartPending = true;
      });
    }
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

    // Prefer the explicit Root -> Hips style hierarchy visible in the skeleton
    // viewer. If an asset has multiple independent roots, this avoids choosing
    // an accessory/helper root merely because it appears first in the array.
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

  function neutralRootPosition() {
    const driver = resolveRootDriver();
    if (!driver) return null;

    // The previous frame's correction must not contaminate this measurement.
    // Neutralize only the outer correction container, then ask Babylon for the
    // evaluated root bone position using a skinned mesh from that skeleton.
    resetContainerXZ();
    refreshChildMatrices();
    try {
      driver.skeleton.prepare?.();
    } catch (error) {
      // prepare() is not required by every Babylon version/loader path.
    }

    let position = null;
    try {
      position = driver.bone.getAbsolutePosition(driver.mesh);
    } catch (error) {
      console.warn('FBX lab: could not read bottom root position', error);
      return null;
    }
    return position && Number.isFinite(position.x) && Number.isFinite(position.z) ? position : null;
  }

  function applyHorizontalRootLock() {
    if (!lockInput) return;

    if (!modelAssets || !animationContainer || animationContainer.isDisposed()) {
      observedContainer = null;
      detachLoopObserver();
      observedGroup = null;
      authoredLoopStartPending = false;
      rootDriver = null;
      clearReadout();
      return;
    }

    if (animationContainer !== observedContainer) {
      observedContainer = animationContainer;
      rootDriver = null;
      resetContainerXZ();
      resolveRootDriver();
    }

    observeActiveGroup();

    if (!lockInput.checked) {
      if (Math.abs(animationContainer.position.x) > EPSILON || Math.abs(animationContainer.position.z) > EPSILON) {
        resetContainerXZ();
      }
      authoredLoopStartPending = false;
      clearReadout();
      return;
    }

    if (authoredLoopStartPending) {
      // Keep the seam experiment from the prior pass: the first evaluated pose
      // after a loop is canonical and receives no compensation at all.
      authoredLoopStartPending = false;
      resetContainerXZ();
      refreshChildMatrices();
      if (rawTravelEl) rawTravelEl.textContent = 'loop start · authored';
      if (correctionEl) correctionEl.textContent = '0.000, 0.000';
      return;
    }

    const rootPosition = neutralRootPosition();
    if (!rootPosition) {
      if (rawTravelEl) rawTravelEl.textContent = 'root unavailable';
      if (correctionEl) correctionEl.textContent = '0.000, 0.000';
      return;
    }

    const correctionX = TARGET_X - rootPosition.x;
    const correctionZ = TARGET_Z - rootPosition.z;

    animationContainer.position.x = correctionX;
    animationContainer.position.z = correctionZ;
    animationContainer.computeWorldMatrix(true);
    refreshChildMatrices();

    if (rawTravelEl) rawTravelEl.textContent = formatPair(rootPosition.x, rootPosition.z);
    if (correctionEl) correctionEl.textContent = formatPair(correctionX, correctionZ);
  }

  lockInput?.addEventListener('change', () => {
    authoredLoopStartPending = false;
    rootDriver = null;
    if (!lockInput.checked) resetContainerXZ();
    else resolveRootDriver();
  });

  // Babylon evaluates the skeleton before this observable. We read the base
  // root after that evaluation and correct the outer container before render.
  const correctionObservable = scene.onAfterAnimationsObservable || scene.onBeforeRenderObservable;
  correctionObservable.add(applyHorizontalRootLock, -1, true);
})();
