(() => {
  'use strict';

  // Experimental FBX-lab layer: keep the animated character's measured X/Z
  // footprint center on the model's canonical preview origin (0,0). This writes
  // only labAnimationContainer.position.x/z. Bones, rig nodes, modelContainer,
  // vertical motion, rotation and scale remain animation/import owned.

  const lockLabel = document.createElement('label');
  lockLabel.className = 'check';
  lockLabel.innerHTML = '<input id="horizontalRootLock" type="checkbox"> Lock horizontal travel to model origin';
  const boundsLabel = document.getElementById('animationBounds')?.closest('label');
  if (boundsLabel) boundsLabel.after(lockLabel);

  const explanation = document.createElement('p');
  explanation.className = 'hint';
  explanation.style.marginTop = '9px';
  explanation.textContent = 'Experimental root-motion pass: after animation evaluation, the animation container cancels the measured X/Z center so every clip and every loop resolves to the same model origin. Y and every bone remain untouched.';
  lockLabel.after(explanation);

  const modelStats = document.querySelector('#right dl.stats');
  if (modelStats) {
    modelStats.insertAdjacentHTML('beforeend', [
      '<dt>Raw X/Z center</dt><dd id="rawTravel">—</dd>',
      '<dt>Container X/Z</dt><dd id="containerCorrection">—</dd>'
    ].join(''));
  }

  const lockInput = document.getElementById('horizontalRootLock');
  const rawTravelEl = document.getElementById('rawTravel');
  const correctionEl = document.getElementById('containerCorrection');

  const TARGET_X = 0;
  const TARGET_Z = 0;
  const EPSILON = 1e-8;
  let observedContainer = null;

  function formatPair(x, z) {
    return x.toFixed(3) + ', ' + z.toFixed(3);
  }

  function clearReadout() {
    if (rawTravelEl) rawTravelEl.textContent = '—';
    if (correctionEl) correctionEl.textContent = '—';
  }

  function resetContainerXZ() {
    if (!animationContainer || animationContainer.isDisposed()) return;
    animationContainer.position.x = 0;
    animationContainer.position.z = 0;
    animationContainer.computeWorldMatrix(true);
  }

  function neutralBounds() {
    // Measure with the correction container explicitly neutral. This avoids
    // deriving raw animation travel by subtracting last frame's correction and
    // makes clip changes / loop wraps independent of previous state.
    resetContainerXZ();
    return refreshAnimatedBounds();
  }

  function applyHorizontalRootLock() {
    if (!lockInput) return;

    if (!modelAssets || !animationContainer || animationContainer.isDisposed()) {
      observedContainer = null;
      clearReadout();
      return;
    }

    if (animationContainer !== observedContainer) {
      observedContainer = animationContainer;
      resetContainerXZ();
    }

    if (!lockInput.checked) {
      if (Math.abs(animationContainer.position.x) > EPSILON || Math.abs(animationContainer.position.z) > EPSILON) {
        resetContainerXZ();
      }
      clearReadout();
      return;
    }

    const bounds = neutralBounds();
    if (!bounds) {
      clearReadout();
      return;
    }

    const rawX = (bounds.min.x + bounds.max.x) * 0.5;
    const rawZ = (bounds.min.z + bounds.max.z) * 0.5;
    const correctionX = TARGET_X - rawX;
    const correctionZ = TARGET_Z - rawZ;

    animationContainer.position.x = correctionX;
    animationContainer.position.z = correctionZ;
    animationContainer.computeWorldMatrix(true);

    // Force child world matrices current before the existing debug-bounds pass.
    // The debug + and cube should therefore show the final corrected frame,
    // including the exact frame on which an AnimationGroup loops back to start.
    renderableMeshes().forEach(mesh => mesh.computeWorldMatrix(true));

    if (rawTravelEl) rawTravelEl.textContent = formatPair(rawX, rawZ);
    if (correctionEl) correctionEl.textContent = formatPair(correctionX, correctionZ);
  }

  lockInput?.addEventListener('change', () => {
    if (!lockInput.checked) resetContainerXZ();
  });

  // Babylon evaluates AnimationGroups before onAfterAnimationsObservable. Doing
  // the correction there removes the one-render lag that can otherwise expose
  // a loop-reset pose before its matching container correction is applied.
  const correctionObservable = scene.onAfterAnimationsObservable || scene.onBeforeRenderObservable;
  correctionObservable.add(applyHorizontalRootLock, -1, true);
})();
