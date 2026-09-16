(() => {
  'use strict';

  // Experimental FBX-lab layer: keep the animated character's measured X/Z
  // footprint center at the place where the current clip started. This writes
  // only labAnimationContainer.position.x/z. Bones, rig nodes, modelContainer,
  // vertical motion, rotation and scale remain animation/import owned.

  const lockLabel = document.createElement('label');
  lockLabel.className = 'check';
  lockLabel.innerHTML = '<input id="horizontalRootLock" type="checkbox"> Lock horizontal travel to clip start';
  const boundsLabel = document.getElementById('animationBounds')?.closest('label');
  if (boundsLabel) boundsLabel.after(lockLabel);

  const explanation = document.createElement('p');
  explanation.className = 'hint';
  explanation.style.marginTop = '9px';
  explanation.textContent = 'Experimental root-motion pass: measures each deformed frame, subtracts only X/Z center drift through the animation container, and leaves Y plus every bone untouched.';
  lockLabel.after(explanation);

  const modelStats = document.querySelector('#right dl.stats');
  if (modelStats) {
    modelStats.insertAdjacentHTML('beforeend', [
      '<dt>Raw X/Z travel</dt><dd id="rawTravel">—</dd>',
      '<dt>Container X/Z</dt><dd id="containerCorrection">—</dd>'
    ].join(''));
  }

  const lockInput = document.getElementById('horizontalRootLock');
  const rawTravelEl = document.getElementById('rawTravel');
  const correctionEl = document.getElementById('containerCorrection');

  let observedContainer = null;
  let observedGroup = null;
  let anchor = null;

  function formatPair(x, z) {
    return x.toFixed(3) + ', ' + z.toFixed(3);
  }

  function clearReadout() {
    if (rawTravelEl) rawTravelEl.textContent = '—';
    if (correctionEl) correctionEl.textContent = '—';
  }

  function clearAnchor() {
    anchor = null;
  }

  function resetContainerXZ() {
    if (!animationContainer || animationContainer.isDisposed()) return;
    animationContainer.position.x = 0;
    animationContainer.position.z = 0;
    animationContainer.computeWorldMatrix(true);
  }

  function currentRawCenter(bounds) {
    // labAnimationContainer currently owns translation only. Removing its X/Z
    // translation from the world-space AABB center yields the animation/model
    // center before our correction without touching any animation target.
    return {
      x: ((bounds.min.x + bounds.max.x) * 0.5) - animationContainer.position.x,
      z: ((bounds.min.z + bounds.max.z) * 0.5) - animationContainer.position.z
    };
  }

  function captureAnchor(bounds, raw) {
    anchor = {
      rawX: raw.x,
      rawZ: raw.z,
      worldX: (bounds.min.x + bounds.max.x) * 0.5,
      worldZ: (bounds.min.z + bounds.max.z) * 0.5
    };
  }

  function applyHorizontalRootLock() {
    if (!lockInput) return;

    if (!modelAssets || !animationContainer || animationContainer.isDisposed()) {
      observedContainer = null;
      observedGroup = null;
      clearAnchor();
      clearReadout();
      return;
    }

    if (animationContainer !== observedContainer) {
      observedContainer = animationContainer;
      observedGroup = activeGroup;
      clearAnchor();
    }

    const groupChanged = activeGroup !== observedGroup;
    if (groupChanged) {
      // Each clip gets a fresh zero-correction reference frame. The first
      // evaluated pose becomes its horizontal anchor on this render.
      observedGroup = activeGroup;
      resetContainerXZ();
      clearAnchor();
    }

    if (!lockInput.checked) {
      if (animationContainer.position.x !== 0 || animationContainer.position.z !== 0) {
        resetContainerXZ();
      }
      clearAnchor();
      clearReadout();
      return;
    }

    const bounds = refreshAnimatedBounds();
    if (!bounds) {
      clearReadout();
      return;
    }

    const raw = currentRawCenter(bounds);
    if (!anchor) captureAnchor(bounds, raw);

    const travelX = raw.x - anchor.rawX;
    const travelZ = raw.z - anchor.rawZ;
    const correctionX = anchor.worldX - raw.x;
    const correctionZ = anchor.worldZ - raw.z;

    animationContainer.position.x = correctionX;
    animationContainer.position.z = correctionZ;
    animationContainer.computeWorldMatrix(true);

    if (rawTravelEl) rawTravelEl.textContent = formatPair(travelX, travelZ);
    if (correctionEl) correctionEl.textContent = formatPair(correctionX, correctionZ);
  }

  lockInput?.addEventListener('change', () => {
    // Enabling mid-clip anchors exactly where the character is currently
    // displayed. Disabling immediately restores uncorrected animation travel.
    clearAnchor();
    if (!lockInput.checked) resetContainerXZ();
  });

  // Run before the lab's existing animated-bounds debug callback so the orange
  // + and optional box visualize the final corrected position for this frame.
  scene.onBeforeRenderObservable.add(applyHorizontalRootLock, -1, true);
})();
