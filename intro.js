/* Homepage intro, after Viscose by Yousuf Soomro
   (https://github.com/Yousuf-developer/Viscose-carousel, MIT).

   1. A 001→100 counter runs while one card is born in the middle of the
      screen with every other card hidden inside it.
   2. When the counter lands, that card slides right, then the others peel
      off it one at a time, alternating either way around a circle centred
      on the screen, each dragging a gooey thread behind it, until the ring
      closes.
   3. The ring turns once while "RIYA" melts in at its centre.
   4. The heading melts away and the cards straighten out of the ring into
      the carousel column, landing exactly on the real slides. The overlay
      then fades and hands over to the page.

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
  root.classList.remove('intro-pending');

  // ---- shader -------------------------------------------------------------
  var N = 10;       // cards in the ring
  var TEX = 5;      // distinct images
  var VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
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
    'vec4 pick(float i, vec2 uv){',
    '  if (i < 0.5) return texture2D(uT0, uv);',
    '  if (i < 1.5) return texture2D(uT1, uv);',
    '  if (i < 2.5) return texture2D(uT2, uv);',
    '  if (i < 3.5) return texture2D(uT3, uv);',
    '  return texture2D(uT4, uv); }',
    'void main(){',
    '  vec2 p = gl_FragCoord.xy / uDpr; p.y = uRes.y - p.y;',
    // Cards are listed front to back: inside a card, the frontmost one wins
    // (so the others stay hidden inside the seed until they peel out);
    // outside every card, the goo takes the colour of the nearest one.
    '  float field = 1e5; float best = 1e5; bool hit = false;',
    '  vec4 rect = uRect[0]; vec3 fit = uFit[0]; vec2 local = vec2(0.0);',
    '  for (int i = 0; i < 10; i++){',
    '    vec4 r = uRect[i];',
    '    if (r.z <= 0.0) continue;',
    '    vec2 q = rot(p - r.xy, uRot[i]);',
    '    float d = sdBox(q, r.zw, min(uRadius, min(r.z, r.w)));',
    '    field = smin(field, d, uK);',
    '    if (!hit && (d <= 0.0 || d < best - 2.0)) { best = d; rect = r; fit = uFit[i]; local = q; hit = d <= 0.0; }',
    '  }',
    '  for (int j = 0; j < 9; j++){',
    '    if (uThW[j] <= 0.0) continue;',
    '    field = smin(field, sdThread(p, uThA[j].xy, uThA[j].zw, uThW[j]), uK * 0.6 + 6.0);',
    '  }',
    '  float a = clamp(0.5 - field, 0.0, 1.0);',
    '  if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }',
    '  vec2 uv = (local + rect.zw) / (2.0 * rect.zw);',
    '  float box = rect.z / rect.w;',
    '  vec3 col;',
    '  if (fit.y < 0.5) {',
    '    if (fit.x > box) uv.x = 0.5 + (uv.x - 0.5) * box / fit.x;',
    '    else uv.y = 0.5 + (uv.y - 0.5) * fit.x / box;',
    '    col = pick(fit.z, clamp(uv, 0.0, 1.0)).rgb;',
    '  } else {',
    '    if (fit.x > box) uv.y = 0.5 + (uv.y - 0.5) * fit.x / box;',
    '    else uv.x = 0.5 + (uv.x - 0.5) * box / fit.x;',
    '    vec4 t = pick(fit.z, clamp(uv, 0.0, 1.0));',
    '    bool inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;',
    '    col = inside ? mix(vec3(1.0), t.rgb, t.a) : vec3(1.0);',
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
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { overlay.remove(); return; }
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var img = im.img;
    if (!img) { loaded++; return; }
    im.contain = getComputedStyle(img).objectFit === 'contain' ? 1 : 0;
    function go() {
      try {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
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
  var SPIN_AT = 1.1, SPIN = 1.9;     // one full turn
  var TEXT_IN = 1.5, TEXT_OUT = 3.1;
  var STAGE_AT = 3.0, STAGE = 1.4;   // ring straightens into the column
  var HOLD = 0.25, FADE = 0.55;

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  var TAU = Math.PI * 2;

  var start = performance.now();
  var pageLoaded = document.readyState === 'complete';
  window.addEventListener('load', function () { pageLoaded = true; });
  var shown = 0, last = 0;
  var launchAt = null;
  var fadeStarted = false;

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
    var stage = easeInOut(clamp01((L - STAGE_AT) / STAGE));
    var born = easeOut(clamp01(t / BIRTH));

    var k = 0;
    // Stage: the ring slides so its seed point lands on the active slide,
    // and swells into a huge wheel whose edge is all that's left on screen.
    // The spacing round the rim eases from the ring's to the carousel's, so
    // by the end that edge is the carousel column. A last blend snaps each
    // card onto its exact slide.
    var Rs = R * Math.pow(vh * 60 / R, stage);
    var step = lerp(TAU * R / N, col.pitch, stage);
    var ax = lerp(cx + R, col.rects[0][0], stage), ay = lerp(cy, col.rects[0][1], stage);
    var snap = clamp01((stage - 0.8) / 0.2);
    snap = snap * snap * (3 - 2 * snap);

    cards.forEach(function (c, i) {
      // Peel: sweep round the circle from the seed's angle to its own.
      // Positive positions go clockwise (downward from the seed), matching
      // the carousel, where they sit below the active slide.
      var p = i === 0 ? 1 : (L <= 0 ? 0 : clamp01((L - (i - 1) * STAGGER) / PEEL));
      c.p = p;
      var to = slot(c.k);
      var sz = i === 0 ? born : lerp(0.75, 1, easeInOut(p));
      var ang, x, y, rad;
      if (stage === 0) {
        ang = -(c.k / N) * TAU * easeInOut(p) - spin;
        rad = R;
        x = cx + shift + R * Math.cos(ang); y = cy - R * Math.sin(ang);
      } else {
        ang = -c.k * step / Rs;
        rad = Rs;
        x = ax - Rs + Rs * Math.cos(ang); y = ay - Rs * Math.sin(ang);
      }
      // Width points out from the centre, like spokes.
      var r0 = -ang;
      r0 = Math.atan2(Math.sin(r0), Math.cos(r0));
      c.x = lerp(x, to[0], snap);
      c.y = lerp(y, to[1], snap);
      c.hw = lerp(cw * sz, to[2], stage);
      c.hh = lerp(ch * sz, to[3], stage);
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

    cards.forEach(function (c, i) {
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Heading sits in the middle of the ring and rides along as it moves.
    heading.style.left = (stage ? ax - Rs : cx) + 'px';
    heading.style.top = cy + 'px';
    if (L > TEXT_IN) heading.classList.add('is-in');
    if (L > TEXT_OUT) heading.classList.add('is-out');

    if (!fadeStarted && L > STAGE_AT + STAGE + HOLD) {
      fadeStarted = true;
      overlay.classList.add('is-done');
      // textmelt.js melts the page text in as the overlay fades.
      window.dispatchEvent(new Event('intro:done'));
      setTimeout(function () {
        window.removeEventListener('resize', size);
        overlay.remove();
      }, FADE * 1000 + 50);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
