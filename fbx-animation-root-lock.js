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
  explanation.textContent = 'Experimental root-motion pass: after animation evaluation, the animation container cancels the measured X/Z center. On a loop restart the authored first pose is rendered with zero container correction, then normal correction resumes on the following frame.';
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
  let observedGroup = null;
  let loopObserver = null;
  let authoredLoopStartPending = false;

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
        // Babylon has just wrapped this AnimationGroup back to its authored
        // beginning. The first evaluated pose is already the correct canonical
        // origin for this workflow, so do not derive a new bounds correction
        // for that render. Zero the container in applyHorizontalRootLock().
        authoredLoopStartPending = true;
      });
    }
  }

  function neutralBounds() {
    // Measure with the correction container explicitly neutral. This avoids
    // deriving raw animation travel by subtracting last frame's correction and
    // makes clip changes / ordinary frames independent of previous state.
    resetContainerXZ();
    return refreshAnimatedBounds();
  }

  function applyHorizontalRootLock() {
    if (!lockInput) return;

    if (!modelAssets || !animationContainer || animationContainer.isDisposed()) {
      observedContainer = null;
      detachLoopObserver();
      observedGroup = null;
      authoredLoopStartPending = false;
      clearReadout();
      return;
    }

    if (animationContainer !== observedContainer) {
      observedContainer = animationContainer;
      resetContainerXZ();
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
      // Critical seam rule: the first evaluated pose after a loop is rendered
      // exactly as authored. Do not run bounds math on this one frame and do
      // not carry the previous loop's last-frame correction across the seam.
      authoredLoopStartPending = false;
      resetContainerXZ();
      refreshChildMatrices();
      if (rawTravelEl) rawTravelEl.textContent = 'loop start · authored';
      if (correctionEl) correctionEl.textContent = '0.000, 0.000';
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
    refreshChildMatrices();

    if (rawTravelEl) rawTravelEl.textContent = formatPair(rawX, rawZ);
    if (correctionEl) correctionEl.textContent = formatPair(correctionX, correctionZ);
  }

  lockInput?.addEventListener('change', () => {
    authoredLoopStartPending = false;
    if (!lockInput.checked) resetContainerXZ();
  });

  // Babylon evaluates AnimationGroups before onAfterAnimationsObservable. The
  // group loop observable fires during that evaluation, so the same render that
  // receives the restarted pose also receives the zero-correction seam rule.
  const correctionObservable = scene.onAfterAnimationsObservable || scene.onBeforeRenderObservable;
  correctionObservable.add(applyHorizontalRootLock, -1, true);
})();
