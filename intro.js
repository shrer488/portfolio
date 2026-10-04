/* Homepage intro, after Viscose by Yousuf Soomro
   (https://github.com/Yousuf-developer/Viscose-carousel, MIT).

   1. A 001→100 counter runs while one card is born in the middle of the
      screen with every other card hidden inside it.
   2. When the counter lands, that card slides right, then the others peel
      off it one at a time, alternating either way around a circle centred
      on the screen, each dragging a gooey thread behind it, until the ring
      closes, and rests there a beat.
   3. The ring turns once while "RIYA" melts in at its centre.
   4. The heading melts away and the ring, still spinning, turns on its
      vertical axis towards the viewer, like a wheel rolling round to face
      the screen. Seen side-on it becomes a drum: the card at the front is
      the active slide and the ones above and below curve away from it, as
      the carousel's own images do. Halfway through, the overlay's
      background clears so the page builds up behind the wheel, and the
      cards land drawn exactly as the carousel draws its slides (same fold,
      same blur), so the overlay is simply removed with nothing to settle.

   There are no card elements during the intro: one full-screen canvas runs
   a fragment shader where every card is a rotated rounded-box distance
   field. A smooth minimum fuses nearby cards into one surface, and each
   thread is its own swept shape that thins, pinches and finally dissolves
   as its two cards separate. Each pixel shows the image of the card it
   belongs to (or, in the goo between cards, the nearest one).

   The ring holds the five projects twice over, dealt in carousel order, so
   turning the ring and reading down the carousel step through projects the
   same way.

   Plays once per browser session, and never for reduced-motion users or
   where WebGL is unavailable. */
(function () {
  var KEY = 'introPlayed';
  var root = document.documentElement;
  function bail() { root.classList.remove('intro-pending'); }
  try { if (sessionStorage.getItem(KEY)) return bail(); } catch (e) {}
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return bail();

  var slides = Array.prototype.slice.call(document.querySelectorAll('.carousel .slide'));
  if (!slides.length) return bail();

  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
  if (!gl) return bail();
  try { sessionStorage.setItem(KEY, '1'); } catch (e) {}

  // ---- overlay ------------------------------------------------------------
  var overlay = document.createElement('div');
  overlay.className = 'intro';
  overlay.setAttribute('aria-hidden', 'true');
  var counter = document.createElement('p');
  counter.className = 'intro-counter';
  counter.textContent = '001';
  var heading = document.createElement('p');
  heading.className = 'intro-heading';
  Array.from('RIYA').forEach(function (ch, i) {
    var s = document.createElement('span');
    s.textContent = ch;
    s.style.transitionDelay = (i * 0.05) + 's';
    heading.appendChild(s);
  });
  overlay.appendChild(canvas);
  overlay.appendChild(heading);
  overlay.appendChild(counter);
  document.body.appendChild(overlay);
  // The background glow rises in while the intro plays (styles.css).
  setTimeout(function () { overlay.classList.add('is-glowing'); }, 60);
  root.classList.add('intro-cover');   // keeps the real carousel hidden until the hand-over
  root.classList.remove('intro-pending');

  // ---- shader -------------------------------------------------------------
  var N = 10;       // cards in the ring
  var TEX = 5;      // distinct images
  var VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  // Mipmapped textures give the cards a cheap wide blur at the end, where
  // they soften into the carousel's folded edges.
  var lodExt = gl.getExtension('EXT_shader_texture_lod');
  var FRAG = [
    lodExt ? '#extension GL_EXT_shader_texture_lod : enable\n#define TEX(s, uv, l) texture2DLodEXT(s, uv, l)'
           : '#define TEX(s, uv, l) texture2D(s, uv, l)',
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform float uDpr;',
    'uniform vec4 uRect[10];',  // centre x, centre y, half w, half h (css px, y down)
    'uniform float uRot[10];',  // rotation, radians
    'uniform vec3 uFit[10];',   // image aspect, fit (0 cover, 1 contain on white), texture
    'uniform vec4 uThA[9];',    // thread end points
    'uniform float uThW[9];',   // thread half width (<= 0: none)
    'uniform float uK;',        // how gooey the whole field is, in px
    'uniform float uRadius;',
    'uniform vec4 uFrame;',     // carousel frame top, bottom, fold zone, blur at its edge (px)
    'uniform float uSoft;',     // 0 .. 1: how much of the carousel's edge fold and blur is on
    'uniform vec2 uFold;',      // the carousel's fold: extra width at the edge, squash
    'uniform sampler2D uT0; uniform sampler2D uT1; uniform sampler2D uT2;',
    'uniform sampler2D uT3; uniform sampler2D uT4;',
    'float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r;',
    '  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'float smin(float a, float b, float k){ if (k <= 0.0) return min(a, b);',
    '  float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }',
    // A thread: a segment whose radius pinches in the middle.
    'float sdThread(vec2 p, vec2 a, vec2 b, float w){',
    '  vec2 pa = p - a, ba = b - a;',
    '  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);',
    '  float r = w * (1.0 - 0.55 * sin(3.14159 * h));',
    '  return length(pa - ba * h) - r; }',
    'vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x + s * v.y, -s * v.x + c * v.y); }',
    'vec4 pick(float i, vec2 uv, float l){',
    '  if (i < 0.5) return TEX(uT0, uv, l);',
    '  if (i < 1.5) return TEX(uT1, uv, l);',
    '  if (i < 2.5) return TEX(uT2, uv, l);',
    '  if (i < 3.5) return TEX(uT3, uv, l);',
    '  return TEX(uT4, uv, l); }',
    // A card's picture at a point on it (px from its centre, unrotated).
    'vec3 picture(vec3 fit, vec4 rect, vec2 local, float l){',
    '  vec2 uv = (local + rect.zw) / (2.0 * rect.zw);',
    '  float box = rect.z / rect.w;',
    '  if (fit.y < 0.5) {',
    '    if (fit.x > box) uv.x = 0.5 + (uv.x - 0.5) * box / fit.x;',
    '    else uv.y = 0.5 + (uv.y - 0.5) * fit.x / box;',
    '    return pick(fit.z, clamp(uv, 0.0, 1.0), l).rgb;',
    '  }',
    '  if (fit.x > box) uv.y = 0.5 + (uv.y - 0.5) * fit.x / box;',
    '  else uv.x = 0.5 + (uv.x - 0.5) * box / fit.x;',
    '  vec4 t = pick(fit.z, clamp(uv, 0.0, 1.0), l);',
    '  bool inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;',
    '  return inside ? mix(vec3(1.0), t.rgb, t.a) : vec3(1.0); }',
    'void main(){',
    '  vec2 p = gl_FragCoord.xy / uDpr; p.y = uRes.y - p.y;',
    // Cards are listed front to back: inside a card, the frontmost one wins
    // (so the others stay hidden inside the seed until they peel out);
    // outside every card, the goo takes the colour of the nearest one.
    '  float field = 1e5; float best = 1e5; bool hit = false;',
    '  vec4 rect = uRect[0]; vec3 fit = uFit[0]; vec2 local = vec2(0.0);',
    // Towards the end, the carousel's fold (carousel-goo.js): near the top
    // and bottom of its frame each card spreads wider and squashes into the
    // edge, so the cards land looking exactly like the page.
    '  float ef = clamp(1.0 - min(p.y - uFrame.x, uFrame.y - p.y) / uFrame.z, 0.0, 1.0);',
    '  float fe = uSoft * ef * ef;',
    '  float side = p.y < (uFrame.x + uFrame.y) * 0.5 ? -1.0 : 1.0;',
    '  for (int i = 0; i < 10; i++){',
    '    vec4 r = uRect[i];',
    '    if (r.z <= 0.0) continue;',
    '    vec2 pw = vec2(r.x + (p.x - r.x) / (1.0 + uFold.x * fe), p.y + side * uFold.y * uFrame.z * fe);',
    '    vec2 q = rot(pw - r.xy, uRot[i]);',
    // ...and, as there, cards near the top and bottom of the frame bend
    // outward, their inner edge arcing back towards the frame edge.
    '    float cd = min(r.y - uFrame.x, uFrame.y - r.y);',
    '    float ce = uSoft * (1.0 - smoothstep(uFrame.z * 0.46, uFrame.z * 2.3, cd));',
    '    float u = clamp(q.x / r.z, -1.0, 1.0);',
    '    q.y -= (r.y < (uFrame.x + uFrame.y) * 0.5 ? -1.0 : 1.0) * 0.035 * r.w * (1.0 - u * u) * ce;',
    '    float d = sdBox(q, r.zw, mix(min(uRadius, min(r.z, r.w)), 0.08 * min(r.z, r.w), ce)) / (1.0 + 2.0 * uFold.y * uSoft * ef);',
    '    field = smin(field, d, uK);',
    '    if (!hit && (d <= 0.0 || d < best - 2.0)) { best = d; rect = r; fit = uFit[i]; local = q; hit = d <= 0.0; }',
    '  }',
    '  for (int j = 0; j < 9; j++){',
    '    if (uThW[j] <= 0.0) continue;',
    '    field = smin(field, sdThread(p, uThA[j].xy, uThA[j].zw, uThW[j]), uK * 0.6 + 6.0);',
    '  }',
    // ...the carousel's soft blur in the fold...
    '  float bl = uSoft * uFrame.w * pow(ef, 1.6);',
    // Soft edge that eases in and out at both ends (a straight ramp left a
    // hard rim where the fully solid middle began, which showed the old
    // rectangle inside the blur).
    '  float sw = 1.0 + bl * 2.0;',
    '  float a = 1.0 - smoothstep(-0.5 * sw, 0.5 * sw, field);',
    // ...and, like the carousel, nothing past the frame's top and bottom.
    '  float outside = step(p.y, uFrame.x) + step(uFrame.y, p.y);',
    '  a *= 1.0 - uSoft * min(outside, 1.0);',
    '  if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }',
    '  float lod = log2(max(1.0, bl * 0.55 * 512.0 / sqrt(rect.z * rect.w)));',
    '  vec3 col = picture(fit, rect, local, lod);',
    '  if (bl > 0.3) {',
    '    for (int k = 0; k < 12; k++){',
    '      float fk = float(k);',
    '      float ang = fk * 2.39996, rr = bl * 0.7 * sqrt((fk + 0.5) / 12.0);',
    '      col += picture(fit, rect, local + rr * vec2(cos(ang), sin(ang)), lod);',
    '    }',
    '    col /= 13.0;',
    '  }',
    '  gl_FragColor = vec4(col * a, a);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { overlay.remove(); root.classList.remove('intro-cover'); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  function U(name) { return gl.getUniformLocation(prog, name); }
  var uRes = U('uRes'), uDpr = U('uDpr'), uRect = U('uRect'), uRot = U('uRot'), uFit = U('uFit');
  var uThA = U('uThA'), uThW = U('uThW'), uK = U('uK'), uRadius = U('uRadius');
  var uFrame = U('uFrame'), uSoft = U('uSoft'), uFold = U('uFold');
  gl.uniform2f(uFold, 0.16, 0.7);   // carousel-goo.js's FLARE and SQUASH
  for (var t = 0; t < TEX; t++) gl.uniform1i(U('uT' + t), t);
  gl.uniform1f(uRadius, 2);

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var vw = 0, vh = 0;
  function size() {
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, vw, vh);
    gl.uniform1f(uDpr, dpr);
  }
  size();
  window.addEventListener('resize', size);

  // ---- images -------------------------------------------------------------
  var n = slides.length;
  var activeIdx = slides.findIndex(function (s) { return s.classList.contains('is-active'); });
  if (activeIdx < 0) activeIdx = 0;
  // One texture per project, in carousel order starting at the active one.
  var images = [];
  for (var i = 0; i < Math.min(TEX, n); i++) {
    var slide = slides[(activeIdx + i) % n];
    images.push({ slide: slide, img: slide.querySelector('.slide-img'), aspect: 1.5, contain: 0 });
  }

  var blank = new Uint8Array([255, 255, 255, 255]);
  var loaded = 0;
  images.forEach(function (im, i) {
    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blank);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    var img = im.img;
    if (!img) { loaded++; return; }
    im.contain = getComputedStyle(img).objectFit === 'contain' ? 1 : 0;
    function go() {
      try {
        // Stretched onto a square canvas so it can carry mipmaps.
        var sq = document.createElement('canvas');
        sq.width = sq.height = 1024;
        sq.getContext('2d').drawImage(img, 0, 0, 1024, 1024);
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sq);
        gl.generateMipmap(gl.TEXTURE_2D);
        if (img.naturalWidth && img.naturalHeight) im.aspect = img.naturalWidth / img.naturalHeight;
      } catch (e) {}
      loaded++;
    }
    if (img.complete && img.naturalWidth) go();
    else {
      img.addEventListener('load', go, { once: true });
      img.addEventListener('error', function () { loaded++; }, { once: true });
    }
  });

  // ---- cards --------------------------------------------------------------
  // Ring positions in the order they peel off: 0 (the seed), then +1, -1,
  // +2, -2 ... alternating either way round. Position k shows project k
  // steps down the carousel from the active one, and lands k slots from it.
  var fan = [0];
  for (var s = 1; fan.length < N; s++) { fan.push(s); if (fan.length < N) fan.push(-s); }
  var cards = fan.map(function (k) {
    var tex = ((k % images.length) + images.length) % images.length;
    return { k: k, tex: tex, x: 0, y: 0, hw: 0, hh: 0, rot: 0 };
  });
  cards.forEach(function (c) {
    if (c.k === 0) return;
    var inner = Math.sign(c.k) * (Math.abs(c.k) - 1);
    c.parent = cards.find(function (o) { return o.k === inner; });
  });

  // Where the column of real slides sits: the active slide and its two
  // visible neighbours, measured from the page. Further out, the carousel's
  // loop may have wrapped a slide round to the other end, so those slots
  // are extrapolated up and down the same line instead (all off screen).
  var col = null;
  function measure() {
    var rects = {};
    for (var off = -1; off <= 1; off++) {
      var sl = slides[((activeIdx + off) % n + n) % n];
      var r = sl.querySelector('.slide-inner').getBoundingClientRect();
      rects[off] = [r.left + r.width / 2, r.top + r.height / 2, r.width / 2, r.height / 2];
    }
    col = { rects: rects, pitch: rects[1][1] - rects[0][1], peek: [rects[1][2], rects[1][3]] };
    // The carousel's frame, and its fold zone and edge blur (carousel-goo.js
    // works in unscaled stage px: 130 and 16) in screen px.
    var wrap = document.querySelector('.carousel-wrap');
    if (wrap) {
      var wr = wrap.getBoundingClientRect(), sc = wr.height / (wrap.offsetHeight || 1);
      gl.uniform4f(uFrame, wr.top, wr.bottom, 130 * sc, 16 * sc);
    } else gl.uniform4f(uFrame, -1e4, 1e4, 1, 0);
  }
  function slot(k) {
    if (col.rects[k]) return col.rects[k];
    var edge = col.rects[k > 0 ? 1 : -1];
    return [edge[0], edge[1] + (k - Math.sign(k)) * col.pitch, col.peek[0], col.peek[1]];
  }

  // ---- timeline -----------------------------------------------------------
  var BIRTH = 1.0;        // seed grows in
  var MOVE = 0.75;        // seed slides from the middle to the ring's right edge
  var MIN_COUNT = 1.5;    // counter never finishes faster than this
  var PEEL = 0.85;        // each card's trip round the ring
  var STAGGER = 0.11;
  // Once every card has peeled off (about 1.7s in), the finished ring rests
  // for a beat, giving the eye time to settle, before it starts to turn.
  var REST = 0.5;
  var SPIN_AT = 1.73 + REST, SPIN = 1.9;     // one full turn
  var TEXT_IN = SPIN_AT + 0.4, TEXT_OUT = SPIN_AT + 1.4;
  // The turn towards the screen starts while the ring is still finishing
  // its spin, so the two run into each other instead of stopping between.
  var STAGE_AT = SPIN_AT + 1.3, STAGE = 4.1;   // ring turns to face the screen and becomes the column
  var PAGE_IN = 0.45;                // how far through that the page starts showing behind it
  var TEXT_AT = 0.7;                 // ...and its text starts melting in, a beat later
  var FOCAL = 1400;                  // perspective distance for the turn, px

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  // cubic-bezier(x1, y1, x2, y2), as in CSS.
  function bezier(x1, y1, x2, y2) {
    function at(a, b, t) { return ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t; }
    return function (x) {
      // Exact at the ends: the timeline checks for stage === 0.
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 20; i++) { t = (lo + hi) / 2; if (at(x1, x2, t) < x) lo = t; else hi = t; }
      return at(y1, y2, t);
    };
  }
  // The last turn eases in softly and then takes its time settling: most of
  // the travel is done early and the final approach is long and gentle.
  var landEase = bezier(0.4, 0, 0.12, 1);
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  var TAU = Math.PI * 2;

  var start = performance.now();
  var pageLoaded = document.readyState === 'complete';
  window.addEventListener('load', function () { pageLoaded = true; });
  var shown = 0, last = 0;
  var launchAt = null;
  var pageShown = false, textShown = false;

  var rectArr = new Float32Array(N * 4), rotArr = new Float32Array(N), fitArr = new Float32Array(N * 3);
  var thA = new Float32Array(9 * 4), thW = new Float32Array(9);

  function frame(now) {
    var t = (now - start) / 1000;
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!col) measure();

    // Counter: the slower of what has loaded and a minimum pace, so a warm
    // cache doesn't jump straight to 100 and then sit there.
    var target = Math.min((loaded + (pageLoaded ? 1 : 0)) / (images.length + 1), t / MIN_COUNT);
    shown = Math.min(target, shown + dt / 0.8);
    counter.textContent = String(Math.max(1, Math.round(shown * 100))).padStart(3, '0');
    if (shown >= 1 && launchAt === null && t > BIRTH) {
      launchAt = t;
      measure();
      counter.style.opacity = '0';
    }
    var launched = launchAt === null ? 0 : t - launchAt;
    // Seed slides right first; everything after is timed from when it lands.
    var move = easeInOut(clamp01(launched / MOVE));
    var L = launchAt === null ? 0 : launched - MOVE;

    // The ring is centred on the screen. The seed is born in the middle,
    // then slides out to the ring's right edge, where the ring forms from it.
    var cw = Math.min(vw, vh) * 0.06, ch = cw * 0.66;         // card half size on the ring
    var R = Math.min(vw, vh) * 0.3;
    var cx = vw / 2, cy = vh / 2;
    var shift = (move - 1) * R;
    var spin = TAU * easeInOut(clamp01((L - SPIN_AT) / SPIN));
    var stageT = clamp01((L - STAGE_AT) / STAGE);
    var stage = landEase(stageT);
    var born = easeOut(clamp01(t / BIRTH));

    var k = 0;
    // Stage: the ring turns about its vertical axis until it faces side-on,
    // so it reads as a drum seen from the front, spinning one more turn as
    // it goes. Its centre moves onto the carousel, and its radius grows so
    // neighbouring cards end up a carousel pitch apart. The seed (on the
    // ring's right edge) swings round to the front and becomes the active
    // slide. A last blend snaps each card onto its exact slide.
    var phi = stage * Math.PI / 2;                       // 0 flat .. 90deg side-on
    var sinP = Math.sin(phi), cosP = Math.cos(phi);
    // Size and radius grow early in the turn, so the wheel stays full and
    // bold while it rolls round instead of shrinking into a sparse ring.
    var grow = 1 - Math.pow(1 - stage, 2.5);
    var Rd = lerp(R, col.pitch / Math.sin(TAU / N), grow);
    var ax = lerp(cx, col.rects[0][0], stage), ay = lerp(cy, col.rects[0][1], stage);
    // The extra turn shares the same soft landing.
    var spin2 = TAU * stage;
    var snap = clamp01((stage - 0.6) / 0.4);
    snap = snap * snap * (3 - 2 * snap);

    cards.forEach(function (c, i) {
      // Peel: sweep round the circle from the seed's angle to its own.
      // Positive positions go clockwise (downward from the seed), matching
      // the carousel, where they sit below the active slide.
      var p = i === 0 ? 1 : (L <= 0 ? 0 : clamp01((L - (i - 1) * STAGGER) / PEEL));
      c.p = p;
      var to = slot(c.k);
      var sz = i === 0 ? born : lerp(0.75, 1, easeInOut(p));
      var ang, x, y, depth = 1, show = 1, flat = 1;
      if (stage === 0) {
        ang = -(c.k / N) * TAU * easeInOut(p) - spin;
        x = cx + shift + R * Math.cos(ang); y = cy - R * Math.sin(ang);
        c.z = 0;
      } else {
        ang = -(c.k / N) * TAU - spin - spin2;   // the first spin may still be finishing
        var ca = Math.cos(ang), sa = Math.sin(ang);
        // Turned about the vertical axis: the right of the ring comes
        // towards the viewer. Perspective is normalised so the card at the
        // very front is drawn at its own size.
        var z = Rd * ca * sinP;
        depth = FOCAL / (FOCAL + Rd * sinP - z);
        x = ax + Rd * ca * cosP * depth; y = ay - Rd * sa * depth;
        c.z = z;
        // Cards curving away are squashed (their faces tilt away), and the
        // ones round the back of the drum shrink away to nothing.
        flat = lerp(1, Math.abs(ca), sinP);
        show = clamp01(lerp(1, ca * 4 + 0.6, sinP));
      }
      // Width points out from the centre, like spokes; upright once side-on.
      var r0 = -ang;
      r0 = Math.atan2(Math.sin(r0), Math.cos(r0)) * (1 - easeInOut(stage));
      c.x = lerp(x, to[0], snap);
      c.y = lerp(y, to[1], snap);
      c.hw = lerp(lerp(cw * sz, to[2], grow) * depth * show, to[2], snap);
      c.hh = lerp(lerp(ch * sz, to[3], grow) * depth * show * flat, to[3], snap);
      c.rot = lerp(r0, 0, snap);
      // Not peeled yet: still inside the seed, so leave it out of the field
      // (stacked copies would otherwise each add their own bulge).
      if (i > 0 && p === 0) c.hw = c.hh = 0;
    });

    // Threads: thick while two faces are close, thinning on a curve, then
    // pushed below zero so they snap rather than fade to a hairline.
    thW.fill(0);
    cards.forEach(function (c, i) {
      if (i === 0 || L <= 0) return;
      var a = c.parent, j = i - 1;
      var gap = Math.hypot(c.x - a.x, c.y - a.y) - c.hh - a.hh;
      var v = clamp01(gap / 70);
      var w = Math.min(c.hh, a.hh) * 0.6 * Math.pow(1 - v, 1.6) - v * 4;
      thA[j * 4] = a.x; thA[j * 4 + 1] = a.y; thA[j * 4 + 2] = c.x; thA[j * 4 + 3] = c.y;
      if (c.p > 0 && stage === 0) {
        thW[j] = w;
        k = Math.max(k, 34 * (1 - v));
      }
    });

    // Frontmost card first, so it wins where cards overlap (during the turn
    // the order changes as the drum spins; until then it is the peel order).
    var order = cards.slice().sort(function (a, b) { return (b.z || 0) - (a.z || 0); });
    order.forEach(function (c, i) {
      rectArr[i * 4] = c.x; rectArr[i * 4 + 1] = c.y; rectArr[i * 4 + 2] = c.hw; rectArr[i * 4 + 3] = c.hh;
      rotArr[i] = c.rot;
      var im = images[c.tex];
      fitArr[i * 3] = im.aspect; fitArr[i * 3 + 1] = im.contain; fitArr[i * 3 + 2] = c.tex;
    });
    gl.uniform4fv(uRect, rectArr);
    gl.uniform1fv(uRot, rotArr);
    gl.uniform3fv(uFit, fitArr);
    gl.uniform4fv(uThA, thA);
    gl.uniform1fv(uThW, thW);
    gl.uniform1f(uK, k);
    gl.uniform1f(uSoft, easeInOut(clamp01((stage - 0.5) / 0.5)));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Heading sits in the middle of the ring and rides along as it moves.
    heading.style.left = (stage ? ax : cx) + 'px';
    heading.style.top = cy + 'px';
    if (L > TEXT_IN) heading.classList.add('is-in');
    if (L > TEXT_OUT) heading.classList.add('is-out');

    // Partway through the turn the overlay's own background clears, so the
    // page builds up behind the wheel while the real carousel stays hidden
    // underneath; a beat later textmelt.js starts melting the text in.
    if (!pageShown && stageT > PAGE_IN) {
      pageShown = true;
      overlay.classList.add('is-clearing');
    }
    if (!textShown && stageT > TEXT_AT) {
      textShown = true;
      window.dispatchEvent(new Event('intro:done'));
    }
    // By the end the cards are drawn exactly as the carousel draws its
    // slides, so the swap is invisible: same frame, no fade.
    if (stageT >= 1) {
      root.classList.remove('intro-cover');
      window.removeEventListener('resize', size);
      overlay.remove();
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
