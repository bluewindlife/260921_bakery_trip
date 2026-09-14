(() => {
  const storageKey = document.body.dataset.storage || 'bakery-trip-v01';
  const checks = [...document.querySelectorAll('[data-check]')];
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  checks.forEach((input) => {
    input.checked = Boolean(saved[input.dataset.check]);
    input.addEventListener('change', () => {
      const state = {};
      checks.forEach((c) => state[c.dataset.check] = c.checked);
      localStorage.setItem(storageKey, JSON.stringify(state));
      refreshStatus();
    });
  });
  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    checks.forEach((c) => c.checked = false);
    localStorage.removeItem(storageKey);
    refreshStatus();
  });
  function refreshStatus() {
    const done = checks.filter((c) => c.checked).length;
    const total = checks.length || 1;
    const bar = document.querySelector('[data-status-bar]');
    const meta = document.querySelector('[data-status-meta]');
    if (bar) bar.style.width = `${Math.round(done / total * 100)}%`;
    if (meta) meta.textContent = `準備 ${done}/${checks.length}`;
  }
  refreshStatus();

  document.querySelectorAll('img[data-external]').forEach((img) => {
    img.addEventListener('error', () => {
      const figure = img.closest('figure');
      if (figure) {
        const gallery = figure.closest('.gallery');
        figure.remove();
        if (gallery && !gallery.querySelector('figure')) gallery.remove();
        return;
      }
      img.remove();
    }, { once: true });
  });

  const fab = document.querySelector('[data-top]');
  const toggleFab = () => fab?.classList.toggle('show', scrollY > 700);
  addEventListener('scroll', toggleFab, { passive: true });
  toggleFab();
  fab?.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  const plans = [...document.querySelectorAll('[data-plan-time]')];
  const tripDate = document.body.dataset.tripDate;
  const statusTitle = document.querySelector('[data-status-title]');
  if (plans.length && statusTitle) {
    const now = new Date();
    const yyyyMmDd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    if (yyyyMmDd === tripDate) {
      const mins = now.getHours() * 60 + now.getMinutes();
      let current = plans[0];
      for (const plan of plans) {
        const [h,m] = plan.dataset.planTime.split(':').map(Number);
        if (h * 60 + m <= mins) current = plan;
      }
      statusTitle.innerHTML = `<b>現在/次：</b> ${current.dataset.planLabel}`;
    }
  }
})();
