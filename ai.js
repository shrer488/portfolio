// AI page (ai.html).

// Live previews: each .ai-preview[data-src] gets an iframe of the real
// site, loaded only once its row nears the screen so the page isn't
// opening five sites at once. The iframe is laid out at 1440×900 (a
// desktop window) and scaled to fit the preview, so sites show their
// desktop layout instead of squeezing into a small frame.
(function () {
  var frames = Array.prototype.slice.call(document.querySelectorAll('.ai-preview[data-src]'));
  if (!frames.length) return;

  function fit(box) {
    var f = box.querySelector('iframe');
    if (f) box.style.setProperty('--s', box.clientWidth / 1440);
  }

  function load(box) {
    if (box.querySelector('iframe')) return;
    var f = document.createElement('iframe');
    f.title = (box.getAttribute('aria-label') || 'Live preview') + ' (preview)';
    f.setAttribute('tabindex', '-1');
    f.setAttribute('aria-hidden', 'true');
    // Scripts run (it's a live preview) but the site can't open popups,
    // navigate this page, or ask for the camera from inside the preview.
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    f.setAttribute('allow', 'camera \'none\'; microphone \'none\'; autoplay \'none\'');
    f.addEventListener('load', function () { box.classList.add('is-loaded'); });
    f.src = box.getAttribute('data-src');
    box.appendChild(f);
    fit(box);
  }

  if (typeof IntersectionObserver === 'undefined') {
    frames.forEach(load);
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { load(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '300px 0px' });
    frames.forEach(function (box) { io.observe(box); });
  }

  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (e) { fit(e.target); });
    });
    frames.forEach(function (box) { ro.observe(box); });
  } else {
    window.addEventListener('resize', function () { frames.forEach(fit); });
  }
})();

// Over a preview, the cursor becomes a pill with its call to action
// (data-cta), like Play's linked tiles. Mouse only.
(function () {
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.ai-preview'));
  if (!boxes.length) return;
  var pill = document.createElement('div');
  // .view-cursor makes transition.js's dot cursor step aside while visible.
  pill.className = 'view-cursor ai-cursor';
  pill.setAttribute('aria-hidden', 'true');
  pill.innerHTML = '<span class="ai-cursor-label">View</span><svg viewBox="0 0 14 14" width="13" height="13"><path d="M3 11L11 3M11 3H4.5M11 3V9.5" /></svg>';
  document.body.appendChild(pill);
  var label = pill.querySelector('.ai-cursor-label');
  function move(e) {
    pill.style.transform = 'translate3d(' + e.clientX + 'px, ' + e.clientY + 'px, 0) translate(-50%, -50%)';
  }
  boxes.forEach(function (box) {
    box.addEventListener('mouseenter', function (e) {
      label.textContent = box.getAttribute('data-cta') || 'View';
      move(e);
      pill.classList.add('visible');
    });
    box.addEventListener('mousemove', move);
    box.addEventListener('mouseleave', function () { pill.classList.remove('visible'); });
  });
})();

// Videos play only while on screen.
(function () {
  var vids = Array.prototype.slice.call(document.querySelectorAll('.ai-preview video[data-autoplay]'));
  if (!vids.length) return;
  function run(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  if (typeof IntersectionObserver === 'undefined') { vids.forEach(run); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) run(e.target); else e.target.pause(); });
  }, { rootMargin: '200px 0px' });
  vids.forEach(function (v) { io.observe(v); });
})();
