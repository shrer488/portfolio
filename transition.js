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
     - a handful of honey strands: narrow bumps in the cover that reach in
       across the opening, lag behind the rim, stretch, then let go; they
       peak mid-motion and retract by the end;
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
    return { k: k, amp: [0.07, 0.05, 0.035, 0.02][i], ph: Math.random() * 6.28, sp: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35) };
  });
  var strands = [];
  for (var i = 0; i < 5; i++) {
    strands.push({ at: Math.random() * 6.28, width: 0.1 + Math.random() * 0.08, len: 0.18 + Math.random() * 0.17, lag: Math.random() * 0.25 });
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
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    if (R <= 0.5) return;

    // Goo is strongest mid-move and calm at either end.
    var swell = Math.sin(Math.PI * p);
    var pts = [], N = 160;
    for (var j = 0; j < N; j++) {
      var a = (j / N) * Math.PI * 2;
      var wob = 0;
      waves.forEach(function (wv) { wob += wv.amp * Math.sin(wv.k * a + wv.ph + wv.sp * time); });
      var r = R * (1 + wob * (0.35 + swell));
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

/* Site-wide custom cursor: a black dot that follows the mouse and turns
   negative over anything clickable. Mouse/trackpad only — touch devices keep
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
    /* Over clickable things the dot turns "negative": a white disc with a
       difference blend inverts whatever sits beneath it, size unchanged. */
    '.dot-cursor.is-hover { background: #fff; mix-blend-mode: difference; }' +
    '.dot-cursor.is-hidden { opacity: 0 !important; }';
  document.head.appendChild(style);

  var dot = document.createElement('div');
  dot.className = 'dot-cursor';
  dot.setAttribute('aria-hidden', 'true');

  function mount() {
    document.body.appendChild(dot);
    document.documentElement.classList.add('has-dot-cursor');
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  var CLICKABLE = 'a, button, [role="button"], input, textarea, select, label, .slide-inner, .play-item, .cursor-hint, .cs-carousel-dot';

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
  });

  document.addEventListener('mouseleave', function () {
    dot.classList.remove('is-visible');
  });
})();
