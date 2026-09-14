(() => {
  'use strict';

  document.documentElement.dataset.js = 'ready';

  const storageKey = document.body.dataset.storage || 'bakery-trip-v01';
  const checks = [...document.querySelectorAll('[data-check]')];
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch {
    localStorage.removeItem(storageKey);
  }

  const refreshStatus = () => {
    const done = checks.filter((check) => check.checked).length;
    const total = checks.length;
    const bar = document.querySelector('[data-status-bar]');
    const meta = document.querySelector('[data-status-meta]');
    if (bar) bar.style.width = total ? `${Math.round(done / total * 100)}%` : '0%';
    if (meta) meta.textContent = `準備 ${done}/${total}`;
  };

  checks.forEach((input) => {
    input.checked = Boolean(saved[input.dataset.check]);
    input.addEventListener('change', () => {
      const state = {};
      checks.forEach((check) => {
        state[check.dataset.check] = check.checked;
      });
      localStorage.setItem(storageKey, JSON.stringify(state));
      refreshStatus();
    });
  });

  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    checks.forEach((check) => {
      check.checked = false;
    });
    localStorage.removeItem(storageKey);
    refreshStatus();
  });
  refreshStatus();

  const refreshGallery = (gallery) => {
    if (!gallery) return;
    const figures = [...gallery.querySelectorAll('figure')];
    if (!figures.length) {
      gallery.remove();
      return;
    }
    gallery.classList.toggle('is-single', figures.length === 1);
  };

  const removeFailedImage = (img) => {
    const figure = img.closest('figure');
    if (figure) {
      const gallery = figure.closest('.gallery');
      figure.remove();
      refreshGallery(gallery);
      return;
    }
    img.remove();
  };

  const seenSources = new Set();
  document.querySelectorAll('img[data-external]').forEach((img) => {
    const source = img.currentSrc || img.src;
    if (seenSources.has(source)) {
      removeFailedImage(img);
      return;
    }
    seenSources.add(source);
    img.addEventListener('error', () => removeFailedImage(img), { once: true });
    if (img.complete && img.naturalWidth === 0) removeFailedImage(img);
  });
  document.querySelectorAll('.gallery').forEach(refreshGallery);

  const fab = document.querySelector('[data-top]');
  const toggleFab = () => fab?.classList.toggle('show', window.scrollY > 700);
  addEventListener('scroll', toggleFab, { passive: true });
  toggleFab();
  fab?.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  const plans = [...document.querySelectorAll('[data-plan-time]')];
  const tripDate = document.body.dataset.tripDate;
  const statusTitle = document.querySelector('[data-status-title]');
  if (plans.length && statusTitle) {
    const now = new Date();
    const localDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');

    if (localDate === tripDate) {
      const minutesNow = now.getHours() * 60 + now.getMinutes();
      let active = plans[0];
      let hasStarted = false;
      for (const plan of plans) {
        const [hours, minutes] = plan.dataset.planTime.split(':').map(Number);
        if (hours * 60 + minutes <= minutesNow) {
          active = plan;
          hasStarted = true;
        }
      }
      statusTitle.innerHTML = hasStarted
        ? `<b>現在/次：</b> ${active.dataset.planLabel}`
        : `<b>次：</b> 05:10 袋井を出発`;
    }
  }
})();
