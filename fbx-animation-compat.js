(() => {
  'use strict';

  if (!window.BABYLON?.AnimationGroup) {
    console.warn('[FBX Motion Lab] Babylon AnimationGroup is unavailable; compatibility guard not installed.');
    return;
  }

  const proto = BABYLON.AnimationGroup.prototype;
  if (proto.__fbxLabNullTargetGuardInstalled) return;

  const originalStart = proto.start;
  proto.start = function (...args) {
    const targeted = Array.isArray(this.targetedAnimations) ? this.targetedAnimations : [];
    const invalid = targeted.filter(item => !item?.target || !item?.animation);

    if (invalid.length) {
      const dropped = invalid.map(item => ({
        target: item?.target?.name ?? null,
        property: item?.animation?.targetProperty ?? null,
        animation: item?.animation?.name ?? null
      }));

      for (const item of invalid) {
        try {
          this.removeTargetedAnimation(item);
        } catch (error) {
          console.warn('[FBX Motion Lab] Could not remove invalid animation target cleanly.', error);
        }
      }

      // Some Babylon builds expose targetedAnimations as a mutable backing array.
      // Filter as a fallback in case removeTargetedAnimation did not remove every entry.
      if (Array.isArray(this.targetedAnimations)) {
        for (let i = this.targetedAnimations.length - 1; i >= 0; i--) {
          const item = this.targetedAnimations[i];
          if (!item?.target || !item?.animation) this.targetedAnimations.splice(i, 1);
        }
      }

      console.warn(
        `[FBX Motion Lab] Dropped ${invalid.length} animation channel(s) whose retargeted target was null.`,
        dropped
      );

      const compatibility = document.getElementById('compatibility');
      if (compatibility) {
        const usable = this.targetedAnimations?.length ?? 0;
        compatibility.innerHTML =
          `<span class="key">${usable}</span> usable animation channel${usable === 1 ? '' : 's'}; ` +
          `<span style="color:var(--warn)">${invalid.length} unmatched channel${invalid.length === 1 ? '' : 's'} dropped</span>.`;
      }
    }

    if (!this.targetedAnimations?.length) {
      const message = `[FBX Motion Lab] Animation group "${this.name || 'unnamed'}" has no usable targets after retargeting.`;
      console.error(message);
      const status = document.getElementById('status');
      if (status) {
        status.textContent = message;
        status.className = 'error';
      }
      return this;
    }

    return originalStart.apply(this, args);
  };

  proto.__fbxLabNullTargetGuardInstalled = true;
  console.info('[FBX Motion Lab] Null-target animation compatibility guard installed.');
})();
