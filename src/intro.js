/* ============================================================
   PiPiLabu — intro.js
   Conducts the auto-playing launch intro: animates the loader
   counter, auto-"scrolls" through the scenes, then reveals the
   app. Skippable via the Skip button, the Start button or Esc.
   ============================================================ */
(function () {
  'use strict';

  const intro = document.getElementById('intro');
  if (!intro) return;

  const track   = document.getElementById('intro-track');
  const pctEl    = document.getElementById('intro-pct');
  const barEl    = document.getElementById('intro-bar');
  const captionEl = document.getElementById('intro-caption');
  const skipBtn  = document.getElementById('intro-skip');
  const startBtn = document.getElementById('intro-start');
  const scenes   = Array.prototype.slice.call(intro.querySelectorAll('.intro-scene'));

  const reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let current = 0;
  let finished = false;
  const timers = [];
  const after = (ms, fn) => timers.push(setTimeout(fn, ms));

  function goTo(i) {
    if (i < 0 || i >= scenes.length) return;
    current = i;
    track.style.transform = 'translateY(' + (-i * 100) + 'vh)';
    scenes.forEach((s, idx) => s.classList.toggle('is-active', idx === i));
  }

  /* Loader counter 0 -> 100% (drives the % HUD and the bar). */
  function runCounter(durationMs, done) {
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 2);        // ease-out
      const pct = Math.round(eased * 100);
      if (pctEl) pctEl.textContent = pct + '%';
      if (barEl) barEl.style.width = pct + '%';
      if (t < 1) requestAnimationFrame(tick);
      else done && done();
    }
    requestAnimationFrame(tick);
  }

  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    intro.classList.add('intro-done');
    setTimeout(() => { if (intro && intro.parentNode) intro.parentNode.removeChild(intro); }, 650);
  }

  /* ── timeline ────────────────────────────────────────────── */
  const G = reduced
    ? { count: 450, hold: 520, gap: 650 }   // snappy when reduced motion
    : { count: 1700, hold: 450, gap: 1250 };

  goTo(0);

  // QA-only: ?introstill freezes the timeline and exposes manual scene control.
  if (/[?&]introstill\b/.test(location.search)) {
    window.__introGoTo = goTo;
    runCounter(600);
    return;
  }

  runCounter(G.count, () => {
    if (captionEl) captionEl.textContent = 'Pronto! 🎉';
    after(G.hold, () => goTo(1));
    after(G.hold + G.gap, () => goTo(2));
    after(G.hold + G.gap * 2, () => goTo(3));
    // the brand scene shows the Start button; auto-enter shortly after.
    after(G.hold + G.gap * 3 + 1600, finish);
  });

  /* ── manual exits ────────────────────────────────────────── */
  if (skipBtn)  skipBtn.addEventListener('click', finish);
  if (startBtn) startBtn.addEventListener('click', finish);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Enter') finish();
  });
})();
