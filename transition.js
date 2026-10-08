/* Shared page-transition overlay: every page carries the same #pageTransition
   div (see transition.css), already covering the screen on first paint. As
   soon as the page is parsed, this opens it: a hole like a slow, thick
   droplet swells from the centre until the page fills the screen. On any
   internal link click it plays the other way, the page oozing shut onto the
   point that was clicked, then hands off to the real navigation once it has
   closed, so leaving one page and arriving at the next reads as one motion.
   window.pageTransition.navigate() is exposed so script.js's own carousel
   click-to-navigate can route through the same animation.

   Drawn on a canvas each frame, so the edge can behave like something
   viscous rather than a clean circle:
     - the outline is a sum of a few slow, low sine waves round the rim that
       drift over time, so it gently oozes and changes shape as it moves;
     - a few soft bulges: broad, gentle bumps in the cover that lean into
       the opening, lag behind the rim, then ease back; they peak
       mid-motion and retract by the end;
     - a thin lens highlight follows the edge.
   Movement uses long, heavy easing so it starts slowly and settles slowly.

   Inspired by Skecher UI's Liquid Morphology slideshow
   (https://skecher-ui.com/docs/liquid-morphology-slideshow); the code is
   our own. */
(function () {
  var CLOSE = 2000; // ms, leaving a page
  var OPEN = 2400;  // ms, arriving
  var HOLD = 80;    // extra pause once fully covered, so the swap never lands mid-motion
  var BG = '#fafafa';
  var bg = null;    // the cover's background (see paintBg), redrawn per size
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isNavigating = false; // guards against a second click re-triggering navigate()
  // mid-animation — without this, an impatient double-click queued two
  // competing `window.location` assignments and looked like the transition
  // restarting/glitching partway through.

  var overlay = document.getElementById('pageTransition');
  var canvas = null, ctx = null, dpr = 1, w = 0, h = 0;
  var cx = 0, cy = 0, raf = 0;

  // Per page load: random phases and strand angles, so no two look alike.
  var waves = [3, 4, 5, 7].map(function (k, i) {
    return { k: k, amp: [0.035, 0.022, 0.012, 0.006][i], ph: Math.random() * 6.28, sp: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35) };
  });
  var strands = [];
  for (var i = 0; i < 4; i++) {
    strands.push({ at: Math.random() * 6.28, width: 0.22 + Math.random() * 0.12, len: 0.05 + Math.random() * 0.05, lag: Math.random() * 0.25 });
  }

  function setup() {
    if (!overlay || canvas) return;
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    overlay.appendChild(canvas);
    size();
    window.addEventListener('resize', function () { size(); });
    // Paint the full cover before swapping it in for the CSS one, so there's
    // never a frame with nothing covering the page.
    draw(0, 0, 0);
    overlay.classList.add('has-canvas');
  }

  function size() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBg();
  }

  // The cover wears the site background (transition.css): the off-white,
  // the turquoise wash and grey-mint bloom rising from the bottom, and a
  // fine grain, painted once per size onto an offscreen canvas.
  function paintBg() {
    bg = bg || document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    var g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);
    var lin = g.createLinearGradient(0, h, 0, h / 2);
    lin.addColorStop(0, 'rgba(64, 224, 208, 0.14)');
    lin.addColorStop(1, 'rgba(64, 224, 208, 0)');
    g.fillStyle = lin;
    g.fillRect(0, 0, w, h);
    // The bloom: an ellipse 75% of the width by 50% of the height across,
    // centred on the bottom edge.
    g.save();
    g.translate(w / 2, h);
    g.scale(w * 0.75, h * 0.5);
    var rad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    rad.addColorStop(0, 'rgba(210, 228, 226, 0.2)');
    rad.addColorStop(0.75, 'rgba(64, 224, 208, 0)');
    g.fillStyle = rad;
    g.fillRect(-2, -2, 4, 4);
    g.restore();
    // Grain, one speck per device pixel: a soft grey-teal at random strength.
    var tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    var tc = tile.getContext('2d'), img = tc.createImageData(256, 256), d = img.data;
    for (var q = 0; q < d.length; q += 4) {
      var n = (Math.random() + Math.random()) / 2;
      d[q] = 64; d[q + 1] = 77; d[q + 2] = 77;
      d[q + 3] = Math.max(0, Math.min(1, 1.4 * n - 0.6)) * 0.12 * 255;
    }
    tc.putImageData(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = g.createPattern(tile, 'repeat');
    g.fillRect(0, 0, bg.width, bg.height);
  }

  // Radius that just covers the whole screen from (x, y), with room for the
  // wobble, so none of the motion happens off screen.
  function coverRadius(x, y) {
    return Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) * 1.18 + 40;
  }

  // Draw the cover with a viscous hole of base radius R. `p` (0-1) is the
  // progress through the move, used to swell and settle the goo.
  function draw(R, p, time) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bg, 0, 0, w, h);
    if (R <= 0.5) return;

    // Goo is strongest mid-move and calm at either end.
    var swell = Math.sin(Math.PI * p);
    var pts = [], N = 160;
    for (var j = 0; j < N; j++) {
      var a = (j / N) * Math.PI * 2;
      var wob = 0;
      waves.forEach(function (wv) { wob += wv.amp * Math.sin(wv.k * a + wv.ph + wv.sp * time); });
      var r = R * (1 + wob * (0.4 + 0.6 * swell));
      // Strands reach in from the cover towards the centre.
      strands.forEach(function (st) {
        var d = Math.atan2(Math.sin(a - st.at), Math.cos(a - st.at)) / st.width;
        var reach = st.len * Math.sin(Math.PI * Math.min(1, Math.max(0, (p - st.lag) / (1 - st.lag))));
        r -= R * reach * Math.exp(-d * d);
      });
      pts.push([cx + Math.cos(a) * Math.max(0, r), cy + Math.sin(a) * Math.max(0, r)]);
    }

    // Smooth closed curve through the points (midpoint quadratic curves).
    ctx.beginPath();
    var m0 = mid(pts[N - 1], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (var k = 0; k < N; k++) {
      var pnt = pts[k], next = pts[(k + 1) % N], m = mid(pnt, next);
      ctx.quadraticCurveTo(pnt[0], pnt[1], m[0], m[1]);
    }
    ctx.closePath();

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill();
    ctx.restore();

    // Lens edge: a soft turquoise glow just inside, and a bright thin line.
    ctx.save();
    ctx.clip();
    ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(64, 224, 208, 0.14)';
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255, 140, 210, 0.08)';
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();
  }

  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

  // Heavy easing: slow to get going, slow to settle.
  function ease(x) { return x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2; }
  function easeOpen(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  function animate(from, to, dur, easing, done) {
    cancelAnimationFrame(raf);
    var t0 = performance.now();
    overlay.classList.remove('is-open');
    (function frame(now) {
      var p = Math.min(1, (now - t0) / dur);
      draw(from + (to - from) * easing(p), p, now / 1000);
      if (p < 1) raf = requestAnimationFrame(frame);
      else if (done) done();
    })(t0);
  }

  function reveal() {
    // If a link has already been clicked (isNavigating), the user is
    // leaving this page — a late event firing after that must NOT reopen it,
    // or it fights the close animation already in flight.
    if (isNavigating || !overlay) return;
    setup();
    cx = w / 2; cy = h / 2;
    var end = function () {
      // Fully open: hide the layer so it costs nothing while the page is used.
      overlay.classList.add('is-open');
    };
    if (reduce) { end(); return; }
    requestAnimationFrame(function () {
      animate(0, coverRadius(cx, cy), OPEN, easeOpen, end);
    });
  }

  // Opening as soon as the DOM is parsed (rather than on full `load`) keeps
  // the covered period brief on image-heavy pages.
  function scheduleReveal() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', reveal);
    } else {
      reveal();
    }
  }

  // x, y: where the droplet closes to (defaults to the centre).
  function navigate(href, x, y) {
    if (isNavigating) return;
    isNavigating = true;
    if (!overlay) {
      window.location.href = href;
      return;
    }
    setup();
    cx = typeof x === 'number' ? x : w / 2;
    cy = typeof y === 'number' ? y : h / 2;
    var go = function () { window.location.href = href; };
    if (reduce) { draw(0, 1, 0); overlay.classList.remove('is-open'); go(); return; }
    animate(coverRadius(cx, cy), 0, CLOSE, ease, function () {
      window.setTimeout(go, HOLD);
    });
  }

  window.pageTransition = { navigate: navigate };

  // Coming back via the browser's back/forward cache restores the page as
  // it was left: closed. Open it again.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    isNavigating = false;
    reveal();
  });

  scheduleReveal();

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var link = e.target.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;
    if (link.hostname && link.hostname !== window.location.hostname) return;

    e.preventDefault();
    navigate(href, e.clientX, e.clientY);
  });
})();

/* Site-wide custom cursor: a black dot that follows the mouse. Over
   anything clickable or over plain text it becomes a lens that shows what's
   inside it in turquoise. Mouse/trackpad only — touch devices keep
   their native behavior. Steps aside for the homepage's "View" pill (which
   draws its own) and the About photo's tooltip. */
(function () {
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var style = document.createElement('style');
  style.textContent =
    'html.has-dot-cursor, html.has-dot-cursor * { cursor: none !important; }' +
    '.dot-cursor { position: fixed; top: 0; left: 0; width: 16px; height: 16px; margin: -8px 0 0 -8px;' +
    ' border-radius: 50%; background: #000; pointer-events: none; z-index: 10000;' +
    ' opacity: 0; transition: opacity 0.2s ease, background-color 0.2s ease; }' +
    '.dot-cursor.is-visible { opacity: 1; }' +
    '.dot-cursor.is-hidden { opacity: 0 !important; }' +
    /* Over clickable things and plain text the dot becomes a lens: two discs stacked on the
       pointer. The first, in the page colour with a difference blend, turns
       the page background black and dark text light; the second, turquoise
       with a multiply blend, keeps black black and tints the light text
       turquoise. So it still reads as a black dot, with the text inside it
       showing through in turquoise. */
    '.dot-lens { position: fixed; top: 0; left: 0; width: 16px; height: 16px; margin: -8px 0 0 -8px;' +
    ' border-radius: 50%; pointer-events: none; z-index: 10000; opacity: 0; transition: opacity 0.15s ease; }' +
    '.dot-lens.is-on { opacity: 1; }' +
    '.dot-lens-invert { background: #fafafa; mix-blend-mode: difference; }' +
    '.dot-lens-tint { background: rgb(64, 224, 208); mix-blend-mode: multiply; }' +
    '.dot-cursor.is-lens { opacity: 0 !important; }';
  document.head.appendChild(style);

  var dot = document.createElement('div');
  dot.className = 'dot-cursor';
  dot.setAttribute('aria-hidden', 'true');

  var lens = ['dot-lens dot-lens-invert', 'dot-lens dot-lens-tint'].map(function (cls) {
    var el = document.createElement('div');
    el.className = cls;
    el.setAttribute('aria-hidden', 'true');
    return el;
  });

  function mount() {
    document.body.appendChild(dot);
    lens.forEach(function (el) { document.body.appendChild(el); });
    document.documentElement.classList.add('has-dot-cursor');
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  var CLICKABLE = 'a, button, [role="button"], input, textarea, select, label, .slide-inner, .play-item, .cursor-hint, .cs-carousel-dot';
  // Plain text: anything that reads as copy. Text that already has the
  // hover blob effect (split into .smear-ch letters) is left to that while
  // the trail is on.
  var TEXT = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dt, dd, td, th, span, strong, em';

  function isPlainText(t) {
    if (!t || !t.closest) return false;
    var el = t.closest(TEXT);
    if (!el || !el.textContent.trim()) return false;
    // Text with the hover blob (split into letters) is left to that,
    // unless the trail has been turned off, in which case it's plain text.
    if (!trailOff && (t.closest('.smear-ch') || el.querySelector('.smear-ch'))) return false;
    return true;
  }

  document.addEventListener('mousemove', function (e) {
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
    dot.classList.add('is-visible');

    var viewCursor = document.querySelector('.view-cursor.visible');
    // The About photo's tooltip follows the pointer and stands in for it,
    // so the icon tucks away behind it there.
    var underTooltip = e.target && e.target.closest && e.target.closest('.about-photo');
    dot.classList.toggle('is-hidden', !!viewCursor || !!underTooltip);

    var target = e.target && e.target.closest ? e.target.closest(CLICKABLE) : null;
    dot.classList.toggle('is-hover', !!target);

    // Clickable things and plain text both get the turquoise lens.
    var useLens = !dot.classList.contains('is-hidden') && (!!target || isPlainText(e.target));
    dot.classList.toggle('is-lens', useLens);
    lens.forEach(function (el) {
      el.style.left = e.clientX + 'px';
      el.style.top = e.clientY + 'px';
      el.classList.toggle('is-on', useLens);
    });
  });

  document.addEventListener('mouseleave', function () {
    dot.classList.remove('is-visible');
    lens.forEach(function (el) { el.classList.remove('is-on'); });
  });

  /* "Trail" switch, top right (knob on the left and turquoise when on): switches the hover text
     blob (smear.js) off and on. The choice is remembered in this browser and
     announced to smear.js with a 'trailchange' event. */
  var trailOff = false;
  try { trailOff = localStorage.getItem('trailOff') === '1'; } catch (e) {}
  style.textContent +=
    '.trail-toggle { position: fixed; top: 20px; right: 24px; z-index: 900;' +
    ' display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: none;' +
    " font-family: '42dot Sans', 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1;" +
    ' color: rgba(0, 0, 0, 0.7); }' +
    // Phones have no cursor trail, and the nav needs that corner there.
    '@media (max-width: 780px) { .trail-toggle { display: none; } }' +
    // An outlined track. On: knob on the left, knob and outline turquoise.
    // Off: knob slides right, knob and outline black.
    '.trail-toggle-track { position: relative; box-sizing: border-box; width: 30px; height: 18px;' +
    ' border-radius: 999px; border: 1px solid #000; background: transparent;' +
    ' transition: background-color 0.25s ease, border-color 0.25s ease; }' +
    '.trail-toggle-knob { position: absolute; top: 2.5px; left: 2.5px; width: 11px; height: 11px;' +
    ' border-radius: 50%; background: #000;' +
    ' transition: transform 0.25s cubic-bezier(0.3, 0.7, 0.3, 1), background-color 0.25s ease; }' +
    '.trail-toggle[aria-checked="false"] .trail-toggle-knob { transform: translateX(12px); }' +
    // On, the knob is the glowy aqua jelly ball from the homepage (marbles.js):
    // a bright core, deeper turquoise edge, a glossy shine and highlight,
    // and a soft glow.
    '.trail-toggle[aria-checked="true"] .trail-toggle-knob {' +
    ' background:' +
    ' radial-gradient(circle at 66% 30%, #fff 0, #fff 0.8px, rgba(255, 255, 255, 0) 1.4px),' +
    ' radial-gradient(ellipse 55% 32% at 45% 26%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 100%),' +
    ' radial-gradient(circle at 48% 66%, #c8fff0 0%, #6ee6dc 45%, #24aab4 86%, #a0ebf0 100%);' +
    ' box-shadow: 0 0 4px rgba(64, 224, 208, 0.55); }' +
    '.trail-toggle[aria-checked="true"] .trail-toggle-track { border-color: rgb(64, 224, 208); }';
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'trail-toggle';
  toggle.setAttribute('role', 'switch');
  toggle.innerHTML = '<span class="trail-toggle-track"><span class="trail-toggle-knob"></span></span>' +
    '<span class="trail-toggle-label">Trail</span>';
  function label() {
    toggle.setAttribute('aria-checked', trailOff ? 'false' : 'true');
  }
  label();
  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    trailOff = !trailOff;
    try { localStorage.setItem('trailOff', trailOff ? '1' : '0'); } catch (err) {}
    label();
    window.dispatchEvent(new CustomEvent('trailchange', { detail: { off: trailOff } }));
  });
  function mountToggle() { document.body.appendChild(toggle); }
  if (document.body) mountToggle();
  else document.addEventListener('DOMContentLoaded', mountToggle);
})();
