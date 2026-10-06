// Clicking the "Click" hint (.cursor-hint, bottom-right of the hero) drops
// a shower of little aqua jelly balls (the size of the cursor dot)
// from the top of the screen. They stretch as they fall, squash flat and
// jiggle back when they land, press softly into one another and pile up: on top of the centre image, the profile photo and
// text, the project details and the nav, as if on shelves, rolling off the
// edges and gathering along the bottom of the screen. The cursor nudges
// them aside. After a while they fade away; clicking again drops more, and
// Escape clears them.
//
// A small physics loop of circles (gravity, circle-circle and circle-box
// collisions) on one canvas over the page that never takes the pointer.
// Each marble is one pre-drawn sprite.
(function () {
  var hint = document.querySelector('.cursor-hint');
  if (!hint) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var R = 8;               // ball radius, px (16px across, the size of the cursor dot)
  var COUNT = 140;         // balls per click
  var SPAWN = 4.5;         // seconds over which they fall in
  var STAY = 9;            // seconds they rest before fading
  var FADE = 1.5;
  var MAX = 360;
  var G = 2000;            // gravity, px/s^2
  var BOUNCE = 0.15;       // how much of their speed they keep off a surface (jelly: not much)
  var FRICTION = 0.97;     // per contact, sideways
  var SOFT = 0.7;         // how hard two balls push apart (under 1 lets them press into each other)
  var JIGGLE_K = 420, JIGGLE_D = 26;   // the wobble spring: stiffness, damping
  var SUBSTEPS = 6;        // small balls move far for their size, so step finely enough not to skip through thin text

  // The surfaces they land on (re-measured every frame, so a moving
  // carousel carries them along).
  var SHELVES = '.slide.is-active .slide-inner, .profile-photo, .profile-name, .profile-role, .profile-bio, ' +
    '.project-panel.is-active .project-title, .project-panel.is-active .project-desc, ' +
    '.project-panel.is-active .meta-label, .project-panel.is-active .meta-list, ' +
    '.project-panel.is-active .meta-stat, .project-panel.is-active .meta-caption, .nav-link, .cursor-label';

  var cv = document.createElement('canvas');
  cv.className = 'marbles';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d');
  var w = 0, h = 0, dpr = 1;

  // ---- the marble sprite ---------------------------------------------------
  // A glowing aqua glass marble: brightest pale mint low in the middle,
  // deeper teal-blue at the top and edges, a paler rim, two small sharp
  // highlights up and to the right.
  var sprite = document.createElement('canvas');
  function drawSprite() {
    var GLOW = 9;   // px of soft halo beyond the ball
    var s = Math.ceil((R + GLOW) * 2 * dpr) + 4, c = s / 2, r = R * dpr;
    sprite.width = sprite.height = s;
    var g = sprite.getContext('2d');
    g.clearRect(0, 0, s, s);
    // A faint, tight turquoise halo, so each small drop glows a little; a
    // pile glows softly as a whole without turning into one bright smudge.
    // From the centre (hidden under the ball) out, so there's no hard ring
    // at the ball's edge: just a faint light that eases away.
    var outer = r + GLOW * dpr, e = r / outer;
    var halo = g.createRadialGradient(c, c, 0, c, c, outer);
    halo.addColorStop(0, 'rgba(64, 224, 208, 0.2)');
    halo.addColorStop(e, 'rgba(64, 224, 208, 0.16)');
    halo.addColorStop(e + (1 - e) * 0.3, 'rgba(64, 224, 208, 0.07)');
    halo.addColorStop(e + (1 - e) * 0.65, 'rgba(64, 224, 208, 0.02)');
    halo.addColorStop(1, 'rgba(64, 224, 208, 0)');
    g.fillStyle = halo;
    g.beginPath(); g.arc(c, c, r + GLOW * dpr, 0, Math.PI * 2); g.fill();
    // Translucent gummy jelly: a bright, almost clear core, deeper turquoise
    // towards the edge, and a paler rim.
    var body = g.createRadialGradient(c - r * 0.05, c + r * 0.3, r * 0.05, c, c, r);
    body.addColorStop(0, 'rgba(200, 255, 240, 0.78)');
    body.addColorStop(0.5, 'rgba(110, 230, 220, 0.82)');
    body.addColorStop(0.88, 'rgba(36, 170, 180, 0.9)');
    body.addColorStop(1, 'rgba(160, 235, 240, 0.85)');
    g.fillStyle = body;
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
    // A broad glossy shine across the top, like on a gummy sweet.
    g.save();
    g.beginPath(); g.ellipse(c - r * 0.05, c - r * 0.45, r * 0.62, r * 0.32, -0.25, 0, Math.PI * 2);
    var sh = g.createLinearGradient(0, c - r * 0.8, 0, c - r * 0.15);
    sh.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    sh.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = sh; g.fill();
    g.restore();
    // highlights
    g.fillStyle = 'rgba(255, 255, 255, 0.95)';
    g.beginPath(); g.arc(c + r * 0.24, c - r * 0.42, r * 0.12, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(c + r * 0.42, c - r * 0.26, r * 0.065, 0, Math.PI * 2); g.fill();
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSprite();
  }
  size();
  window.addEventListener('resize', size);

  // ---- physics -------------------------------------------------------------
  // Each click is its own batch with its own fade time, so a new click never
  // brings back balls that are already fading out.
  var balls = [], queue = 0, spawnRate = 0, batch = null, batches = [], raf = 0, last = 0;
  var mouse = { x: -1e4, y: -1e4, vx: 0, vy: 0 };

  document.addEventListener('mousemove', function (e) {
    mouse.vx = e.clientX - mouse.x; mouse.vy = e.clientY - mouse.y;
    mouse.x = e.clientX; mouse.y = e.clientY;
  });

  // Images (the centre image, the profile photo) are shelves as boxes.
  // Text is measured line by line, as wide as its words and trimmed to the
  // height of the letters, so balls sit on the text itself and roll off
  // where it ends, rather than on the empty end of its box.
  var BOXES = '.slide.is-active .slide-inner, .profile-photo, .cursor-icon';
  // In the grid view (grid.js) they land on the project cards instead.
  var GRID_SHELVES = '.work-card-media, .work-card-title, .profile-photo, .profile-name, .profile-role, .profile-bio, .nav-link';
  var GRID_BOXES = '.work-card-media, .profile-photo';
  var range = document.createRange();
  function textLines(el) {
    var fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    range.selectNodeContents(el);
    var lines = [];
    Array.prototype.forEach.call(range.getClientRects(), function (r) {
      if (r.width < 1 || r.height < 1) return;
      var line = null;
      for (var i = 0; i < lines.length; i++) {
        if (Math.abs(lines[i].mid - (r.top + r.bottom) / 2) < r.height * 0.4) { line = lines[i]; break; }
      }
      if (!line) { line = { mid: (r.top + r.bottom) / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; lines.push(line); }
      line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom);
    });
    return lines.map(function (l) {
      // From the line box down to roughly the letters' cap height.
      var trim = Math.max(0, (l.bottom - l.top - fs * 0.74) / 2);
      return { left: l.left, right: l.right, top: l.top + trim, bottom: l.bottom - trim };
    });
  }
  function shelves() {
    var out = [];
    function keep(r) { if (r.right - r.left >= 2 && r.bottom - r.top >= 2 && r.bottom > 0 && r.top < h) out.push(r); }
    var gridView = document.documentElement.classList.contains('is-grid');
    var boxes = gridView ? GRID_BOXES : BOXES, all = gridView ? GRID_SHELVES : SHELVES;
    Array.prototype.forEach.call(document.querySelectorAll(boxes), function (el) {
      if (getComputedStyle(el).visibility === 'hidden') return;
      keep(el.getBoundingClientRect());
    });
    Array.prototype.forEach.call(document.querySelectorAll(all), function (el) {
      if (el.matches(boxes) || getComputedStyle(el).visibility === 'hidden') return;
      textLines(el).forEach(keep);
    });
    return out;
  }

  function spawn() {
    if (balls.length >= MAX) return;
    balls.push({
      x: R + Math.random() * (w - 2 * R),
      y: -R - Math.random() * 40,
      vx: (Math.random() - 0.5) * 120,
      vy: Math.random() * 120,
      sq: 0, sv: 0, ang: Math.PI / 2,   // squash amount, its speed, and the axis it squashes along
      batch: batch
    });
  }

  // A knock along normal (nx, ny) at closing speed v squashes the ball
  // along that axis; the spring in frame() jiggles it back.
  function knock(b, nx, ny, v) {
    var amt = Math.min(0.2, v / 5200);
    if (amt < 0.01) return;
    // Lean the squash axis towards this knock, by how hard it is.
    var a = Math.atan2(ny, nx), cur = b.ang;
    var dA = Math.atan2(Math.sin(a - cur), Math.cos(a - cur));
    if (Math.abs(dA) > Math.PI / 2) dA -= Math.sign(dA) * Math.PI;   // an axis, not a direction
    b.ang = cur + dA * Math.min(1, amt * 4);
    b.sv += amt * 20;
  }

  function collideRect(b, r) {
    var cx = Math.max(r.left, Math.min(b.x, r.right));
    var cy = Math.max(r.top, Math.min(b.y, r.bottom));
    var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    var nx, ny, pen;
    if (d2 > 1e-6) {
      var d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = R - d;
    } else {
      // Centre inside the box: out through the nearest side (mostly the top).
      var up = b.y - r.top, down = r.bottom - b.y, left = b.x - r.left, right = r.right - b.x;
      var m = Math.min(up, down, left, right);
      if (m === up) { nx = 0; ny = -1; pen = up + R; }
      else if (m === down) { nx = 0; ny = 1; pen = down + R; }
      else if (m === left) { nx = -1; ny = 0; pen = left + R; }
      else { nx = 1; ny = 0; pen = right + R; }
    }
    b.x += nx * pen; b.y += ny * pen;
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      knock(b, nx, ny, -vn);
      b.vx -= (1 + BOUNCE) * vn * nx; b.vy -= (1 + BOUNCE) * vn * ny;
      // a little drag along the surface, so they roll and settle
      var tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
      b.vx -= (1 - FRICTION) * vt * tx; b.vy -= (1 - FRICTION) * vt * ty;
    }
  }

  function step(dt, rects) {
    var i, j, b, o;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      b.vy += G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      // walls and floor
      if (b.x < R) { b.x = R; if (b.vx < 0) b.vx *= -BOUNCE; }
      if (b.x > w - R) { b.x = w - R; if (b.vx > 0) b.vx *= -BOUNCE; }
      if (b.y > h - R) { b.y = h - R; if (b.vy > 0) { knock(b, 0, -1, b.vy); b.vy *= -BOUNCE; b.vx *= FRICTION; } }
      for (j = 0; j < rects.length; j++) collideRect(b, rects[j]);
      // the cursor nudges them aside
      var mx = b.x - mouse.x, my = b.y - mouse.y, md = Math.hypot(mx, my), reach = R + 10;
      if (md < reach && md > 1e-3) {
        var push = (reach - md) / md;
        b.x += mx * push; b.y += my * push;
        b.vx += mx / md * 260 + mouse.vx * 4; b.vy += my / md * 260 + mouse.vy * 4;
      }
    }
    // marble against marble
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      for (j = i + 1; j < balls.length; j++) {
        o = balls[j];
        var dx = o.x - b.x, dy = o.y - b.y;
        if (dx > 2 * R || dx < -2 * R || dy > 2 * R || dy < -2 * R) continue;
        var d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 < 1e-6) continue;
        // Soft: only part of the overlap is pushed out each step, so they
        // press into one another a little, like jelly.
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (2 * R - d) / 2 * SOFT;
        b.x -= nx * pen; b.y -= ny * pen; o.x += nx * pen; o.y += ny * pen;
        var vn = (o.vx - b.vx) * nx + (o.vy - b.vy) * ny;
        if (vn < 0) {
          knock(b, nx, ny, -vn * 0.6); knock(o, nx, ny, -vn * 0.6);
          var jimp = -(1 + BOUNCE) * vn / 2;
          b.vx -= jimp * nx; b.vy -= jimp * ny; o.vx += jimp * nx; o.vy += jimp * ny;
        }
      }
    }
  }

  function frame() {
    var now = performance.now() / 1000;
    var dt = last ? Math.min(1 / 30, now - last) : 1 / 60;
    last = now;
    // feed in the queue at a steady rate
    if (queue > 0) {
      var n = spawnRate * dt + (frame.carry || 0);
      var k = Math.floor(n); frame.carry = n - k;
      while (k-- > 0 && queue > 0) { spawn(); queue--; }
    }
    var rects = shelves();
    var sdt = dt / SUBSTEPS;
    for (var s = 0; s < SUBSTEPS; s++) step(sdt, rects);
    mouse.vx *= 0.5; mouse.vy *= 0.5;
    // The jiggle: each ball's squash springs back and overshoots a little.
    for (var q = 0; q < balls.length; q++) {
      var jb = balls[q];
      jb.sv += (-JIGGLE_K * jb.sq - JIGGLE_D * jb.sv) * dt;
      jb.sq += jb.sv * dt;
      if (jb.sq > 0.22) { jb.sq = 0.22; jb.sv = 0; }
      if (jb.sq < -0.12) { jb.sq = -0.12; jb.sv = 0; }
    }

    // Each batch fades out once it has rested a while; faded balls go.
    balls = balls.filter(function (b) {
      b.alpha = now < b.batch.fadeAt ? 1 : 1 - (now - b.batch.fadeAt) / FADE;
      return b.alpha > 0;
    });

    ctx.clearRect(0, 0, w, h);
    var sw = sprite.width / dpr;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      ctx.globalAlpha = b.alpha;
      // Squash along its knock axis (keeping its volume), and stretch a
      // little along its path while it falls fast.
      var sp = Math.hypot(b.vx, b.vy), st = Math.min(0.06, sp / 20000);
      ctx.save();
      ctx.translate(b.x, b.y);
      if (st > 0.01) {
        var va = Math.atan2(b.vy, b.vx);
        ctx.rotate(va); ctx.scale(1 + st, 1 / (1 + st)); ctx.rotate(-va);
      }
      ctx.rotate(b.ang);
      var k = 1 - b.sq;
      ctx.scale(k, 1 / k);
      ctx.rotate(-b.ang);
      ctx.drawImage(sprite, -sw / 2, -sw / 2, sw, sw);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (!balls.length && queue <= 0) { raf = 0; last = 0; batches = []; ctx.clearRect(0, 0, w, h); return; }
    raf = requestAnimationFrame(frame);
  }

  function drop() {
    queue += COUNT;
    spawnRate = COUNT / SPAWN;
    batch = { fadeAt: performance.now() / 1000 + SPAWN + STAY };
    batches.push(batch);
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }

  hint.addEventListener('click', function (e) { e.stopPropagation(); drop(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && raf) {
      queue = 0;
      var now = performance.now() / 1000;
      batches.forEach(function (bt) { bt.fadeAt = Math.min(bt.fadeAt, now); });
    }
  });
})();
