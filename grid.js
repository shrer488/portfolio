// Homepage view switch: the four-squares button in the top-right corner
// turns the vertical carousel into a two-column grid of the projects (each
// its image, title and feature tags, playing its video on hover), and back.
// The profile stays put and the nav glides up beside it, making a header
// row; the projects sit in a row below, across the full width. The
// carousel and its project details soften away as the cards rise in one
// after another (and the reverse on the way back).
//
// The grid is built from the carousel's own slides and project panels, so
// it never drifts out of step with them. On phones it's the whole homepage:
// one column, no carousel (styles.css).
(function () {
  var root = document.documentElement;
  var page = document.querySelector('.page');
  var nav = document.querySelector('.nav');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.carousel .slide'));
  if (!page || !nav || !slides.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;   // no hover states on touch

  // ---- the grid ----------------------------------------------------------
  var grid = document.createElement('div');
  grid.className = 'work-grid';
  grid.setAttribute('aria-label', 'Projects');
  slides.forEach(function (slide) {
    var i = slide.getAttribute('data-index');
    var panel = document.querySelector('.project-panel[data-index="' + i + '"]');
    var img = slide.querySelector('.slide-img');
    var vid = slide.querySelector('.slide-video');
    var title = panel ? panel.querySelector('.project-title').textContent : '';
    var tags = panel ? Array.prototype.map.call(panel.querySelectorAll('.meta-list p'), function (p) { return p.textContent; }) : [];

    var a = document.createElement('a');
    a.className = 'work-card';
    // Projects still to come (data-soon) stay as plain cards, not links.
    if (slide.hasAttribute('data-soon')) a.classList.add('is-soon');
    else a.href = slide.getAttribute('data-href') || '#';
    if (/^https?:/.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener'; }
    var media = document.createElement('span');
    media.className = 'work-card-media';
    var im = document.createElement('img');
    im.src = img.getAttribute('src');
    im.alt = img.alt || '';
    im.loading = 'lazy';
    if (img.style.objectFit === 'contain') im.classList.add('is-contain');
    media.appendChild(im);
    if (vid && canHover) {
      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
      v.src = vid.getAttribute('src');
      v.setAttribute('aria-hidden', 'true');
      media.appendChild(v);
      // Hover: start from the top and fade in once it actually has frames;
      // leaving fades it back out to the still, then pauses.
      var hideT = 0;
      a.addEventListener('mouseenter', function () {
        clearTimeout(hideT);
        v.currentTime = 0;
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      });
      v.addEventListener('playing', function () { if (a.matches(':hover')) a.classList.add('is-playing'); });
      a.addEventListener('mouseleave', function () {
        a.classList.remove('is-playing');
        hideT = setTimeout(function () { v.pause(); }, 600);
      });
    }
    a.appendChild(media);
    var h = document.createElement('span');
    h.className = 'work-card-title';
    h.textContent = title;
    a.appendChild(h);
    // The description shows only in the phone layout's single column.
    var descEl = panel && panel.querySelector('.project-desc');
    if (descEl) {
      var d = document.createElement('span');
      d.className = 'work-card-desc';
      d.textContent = descEl.textContent;
      a.appendChild(d);
    }
    if (tags.length) {
      var t = document.createElement('span');
      t.className = 'work-card-tags';
      tags.forEach(function (tag) {
        var s = document.createElement('span');
        s.textContent = tag;
        t.appendChild(s);
      });
      a.appendChild(t);
    }
    // The same "View" pill as the carousel's images follows the pointer.
    var vc = document.getElementById('viewCursor');
    if (vc && canHover) {
      // (it lives inside the scaled page, so pointer coordinates are mapped into it)
      var follow = function (e) {
        var r = page.style.transform ? page.getBoundingClientRect() : { left: 0, top: 0, width: page.offsetWidth }, k = r.width / (page.offsetWidth || 1) || 1;
        vc.style.left = (e.clientX - r.left) / k + 'px'; vc.style.top = (e.clientY - r.top) / k + 'px';
      };
      media.addEventListener('mouseenter', function (e) {
        follow(e);
        vc.classList.toggle('is-external', a.target === '_blank');
        vc.querySelector('.view-label').textContent = a.classList.contains('is-soon') ? 'Coming Soon' : 'View';
        vc.classList.add('visible');
        media.style.cursor = 'none';
        media.addEventListener('mousemove', follow);
      });
      media.addEventListener('mouseleave', function () {
        vc.classList.remove('visible');
        media.style.cursor = '';
        media.removeEventListener('mousemove', follow);
      });
    }
    a.addEventListener('click', function (e) {
      if (a.classList.contains('is-soon')) { e.preventDefault(); return; }
      if (a.target === '_blank') return;   // off-site: a new tab, no transition
      if (window.pageTransition) {
        e.preventDefault();
        window.pageTransition.navigate(a.getAttribute('href'), e.clientX, e.clientY);
      }
    });
    grid.appendChild(a);
  });
  page.appendChild(grid);
  var cards = Array.prototype.slice.call(grid.children);

  // The header isn't sticky: the profile and nav scroll away with the
  // projects, and the wheel scrolls the grid wherever the pointer is.
  function setScroll(y) { page.style.setProperty('--grid-scroll', y); }
  grid.addEventListener('scroll', function () { setScroll(grid.scrollTop); }, { passive: true });
  window.addEventListener('wheel', function (e) {
    if (!root.classList.contains('is-grid') || grid.contains(e.target)) return;
    grid.scrollTop += e.deltaY;
  }, { passive: true });

  // ---- the switch ----------------------------------------------------------
  // A "Grid" switch, the same as the "Trail" one (transition.js) and just
  // after it in the top-right corner; knob left and turquoise when on.
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'trail-toggle view-toggle';
  btn.setAttribute('role', 'switch');
  btn.innerHTML = '<span class="trail-toggle-track"><span class="trail-toggle-knob"></span></span>' +
    '<span class="trail-toggle-label">Grid</span>';
  document.body.appendChild(btn);
  // The Trail switch sits 24px to its left, wherever this one's width ends.
  function placeTrail() { root.style.setProperty('--grid-toggle-w', btn.offsetWidth + 'px'); root.classList.add('has-grid-toggle'); }
  placeTrail();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeTrail);

  var isGrid = false, busy = 0;
  function label() {
    btn.setAttribute('aria-checked', isGrid ? 'true' : 'false');
  }
  label();

  var EASE = 'cubic-bezier(0.45, 0.05, 0.25, 1)';

  // The nav glides between its two places: measured before and after the
  // switch, then played back from the old spot (FLIP). The page may be
  // scaled to fit the window, so screen distances are divided back out.
  function moveNav(apply, delay, also) {
    var els = [nav].concat(also || []);
    var before = els.map(function (el) { return el.getBoundingClientRect(); });
    apply();
    var scale = page.getBoundingClientRect().width / (page.offsetWidth || 1) || 1;
    if (reduce || !nav.animate) return;
    // No glide: like the project details, it fades out softly blurring,
    // holds its old place unseen until `delay`, then fades back in at the new one.
    var OUT = 600, IN = 800;
    var hold = Math.max(delay || 0, OUT), total = hold + IN;
    els.forEach(function (el, i) {
      var after = el.getBoundingClientRect();
      var dx = (before[i].left - after.left) / scale, dy = (before[i].top - after.top) / scale;
      var from = 'translate(' + dx + 'px, ' + dy + 'px)';
      el.animate([
        { offset: 0, transform: from, opacity: 1, filter: 'blur(0px)', easing: 'ease' },
        { offset: OUT / total, transform: from, opacity: 0, filter: 'blur(8px)' },
        { offset: hold / total, transform: from, opacity: 0, filter: 'blur(8px)' },
        { offset: hold / total, transform: 'translate(0, 0)', opacity: 0, filter: 'blur(8px)', easing: 'ease' },
        { offset: 1, transform: 'translate(0, 0)', opacity: 1, filter: 'blur(0px)' }
      ], { duration: total });
    });
  }

  // ---- the viscous morph ----------------------------------------------------
  // Switching views, the project images don't slide: they flow together into
  // the middle, fusing like the cards of the intro's wheel (intro.js),
  // line up with the centre image, then shrink together into one small
  // card, like the intro's seed; then the cards peel off it one by one,
  // gooey threads stretching and snapping between them, growing as they
  // settle into their new places. Drawn on one WebGL canvas over the page: every
  // card a rounded box in a distance field, fused with a smooth minimum.
  var N = slides.length;
  var cv = document.createElement('canvas');
  cv.className = 'morph-canvas';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  var gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  var prog = null, U = {};
  var lodExt = gl && gl.getExtension('EXT_shader_texture_lod');
  if (gl) {
    var FRAG = [
      lodExt ? '#extension GL_EXT_shader_texture_lod : enable\n#define TEX(s, uv, l) texture2DLodEXT(s, uv, l)'
             : '#define TEX(s, uv, l) texture2D(s, uv, l)',
      'precision highp float;',
      'uniform vec2 uRes; uniform float uDpr, uK, uAlpha;',
      'uniform vec4 uRect[6];',   // centre x, centre y, half w, half h (css px, y down)
      'uniform float uRot[6];',
      'uniform float uCB[6];',    // each card's own blur while it moves, px
      'uniform vec3 uFit[6];',    // image aspect, fit (0 cover, 1 contain on white), texture
      'uniform vec2 uTsz[6];',    // texture sizes, texels
      // The carousel's own look (carousel-goo.js), faded in by uSoft so the
      // morph lands as (or leaves from) exactly what the carousel draws:
      // the fold and blur at the frame's top and bottom, the curve of the
      // images there, the shadow under the middle one, and the clip.
      'uniform vec4 uFrame;',     // frame top, bottom, fold zone, blur at its edge (px)
      'uniform vec2 uFold;',      // extra width at the edge, squash
      'uniform float uSoft;',
      'uniform sampler2D uT0; uniform sampler2D uT1; uniform sampler2D uT2; uniform sampler2D uT3; uniform sampler2D uT4; uniform sampler2D uT5;',
      'float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
      'float smin(float a, float b, float k){ if (k <= 0.0) return min(a, b); float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }',
      'vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x + s * v.y, -s * v.x + c * v.y); }',
      'vec4 pick(float i, vec2 uv, float l){',
      '  if (i < 0.5) return TEX(uT0, uv, l); if (i < 1.5) return TEX(uT1, uv, l);',
      '  if (i < 2.5) return TEX(uT2, uv, l); if (i < 3.5) return TEX(uT3, uv, l);',
      '  if (i < 4.5) return TEX(uT4, uv, l); return TEX(uT5, uv, l); }',
      'vec3 picture(vec3 fit, vec4 rect, vec2 local, float l){',
      '  vec2 uv = clamp((local + rect.zw) / (2.0 * rect.zw), 0.0, 1.0);',
      '  float box = rect.z / rect.w;',
      '  if (fit.y < 0.5) {',
      '    if (fit.x > box) uv.x = 0.5 + (uv.x - 0.5) * box / fit.x; else uv.y = 0.5 + (uv.y - 0.5) * fit.x / box;',
      '    return pick(fit.z, uv, l).rgb;',
      '  }',
      '  if (fit.x > box) uv.y = 0.5 + (uv.y - 0.5) * fit.x / box; else uv.x = 0.5 + (uv.x - 0.5) * box / fit.x;',
      '  vec4 t = pick(fit.z, clamp(uv, 0.0, 1.0), l);',
      '  bool inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;',
      '  return inside ? mix(vec3(1.0), t.rgb, t.a) : vec3(1.0); }',
      'void main(){',
      '  vec2 p = gl_FragCoord.xy / uDpr; p.y = uRes.y - p.y;',
      '  float field = 1e5, best = 1e5; bool hit = false; float shA = 0.0, cb = 0.0;',
      '  vec4 rect = uRect[0]; vec3 fit = uFit[0]; vec2 local = vec2(0.0); vec2 tsz = uTsz[0];',
      '  float spx = uFrame.z / 130.0, fmid = (uFrame.x + uFrame.y) * 0.5;',
      '  float ef = clamp(1.0 - min(p.y - uFrame.x, uFrame.y - p.y) / uFrame.z, 0.0, 1.0);',
      '  float fe = uSoft * ef * ef;',
      '  float side = p.y < fmid ? -1.0 : 1.0;',
      '  for (int i = 0; i < 6; i++){',
      '    vec4 r = uRect[i]; if (r.z <= 0.0) continue;',
      '    vec2 pw = vec2(r.x + (p.x - r.x) / (1.0 + uFold.x * fe), p.y + side * uFold.y * uFrame.z * fe);',
      '    vec2 q = rot(pw - r.xy, uRot[i]);',
      '    float cd = min(r.y - uFrame.x, uFrame.y - r.y);',
      '    float near = 1.0 - smoothstep(uFrame.z * 0.46, uFrame.z * 2.3, cd);',
      '    float ce = uSoft * near;',
      '    float u = clamp(q.x / r.z, -1.0, 1.0);',
      '    q.y -= (r.y < fmid ? -1.0 : 1.0) * 0.035 * r.w * (1.0 - u * u) * ce;',
      '    float d = sdBox(q, r.zw, 0.08 * min(r.z, r.w) * ce) / (1.0 + 2.0 * uFold.y * uSoft * ef);',
      // The goo only bridges cards that are apart: one lying right on top of
      // the front card stays a crisp rectangle instead of puffing out round.
      '    float apart = clamp(length(r.xy - uRect[0].xy) / 60.0, 0.0, 1.0);',
      '    field = smin(field, d, uK * apart);',
      '    float sd = sdBox(rot(p - r.xy - vec2(0.0, 12.0 * spx), uRot[i]), r.zw * vec2(0.96, 0.94), 8.0 * spx);',
      '    shA = max(shA, (1.0 - smoothstep(-14.0 * spx, 30.0 * spx, sd)) * 0.13 * (1.0 - near) * (1.0 - near) * uSoft);',
      '    if (!hit && (d <= 0.0 || d < best - 2.0)) { best = d; rect = r; fit = uFit[i]; local = q; tsz = uTsz[i]; cb = uCB[i]; hit = d <= 0.0; }',
      '  }',
      '  float bl = uSoft * uFrame.w * pow(ef, 1.6) + cb;',
      '  float sw = 1.0 + bl * 2.0;',
      '  float a = (1.0 - smoothstep(-0.5 * sw, 0.5 * sw, field)) * uAlpha;',
      '  float outside = min(step(p.y, uFrame.x) + step(uFrame.y, p.y), 1.0);',
      '  a *= 1.0 - uSoft * outside;',
      '  shA *= (1.0 - uSoft * outside) * uAlpha;',
      '  vec4 shadow = vec4(vec3(0.05, 0.12, 0.13) * shA, shA);',
      '  if (a <= 0.0) { gl_FragColor = shadow; return; }',
      '  float box = rect.z / rect.w;',
      '  vec2 sc = vec2(1.0);',
      '  if ((fit.y < 0.5) == (fit.x > box)) sc.x = box / fit.x; else sc.y = fit.x / box;',
      '  float tpp = max(tsz.x * sc.x / (2.0 * rect.z), tsz.y * sc.y / (2.0 * rect.w));',
      '  float lod = max(log2(max(1.0, tpp / uDpr)) - 0.25, log2(max(1.0, bl * 0.55 * tpp)));',
      '  vec3 col = picture(fit, rect, local, lod);',
      '  if (bl > 0.3) {',
      '    for (int k = 0; k < 12; k++){',
      '      float fk = float(k);',
      '      float ang = fk * 2.39996, rr = bl * 0.7 * sqrt((fk + 0.5) / 12.0);',
      '      col += picture(fit, rect, local + rr * vec2(cos(ang), sin(ang)), lod);',
      '    }',
      '    col /= 13.0;',
      '  }',
      '  gl_FragColor = vec4(col * a, a) + shadow * (1.0 - a);',
      '}'
    ].join('\n');
    var sh = function (type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) prog = null;
  }
  var texReady = [], tszs = [];
  if (prog) {
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    ['uRes', 'uDpr', 'uK', 'uAlpha', 'uRect', 'uRot', 'uCB', 'uFit', 'uTsz', 'uFrame', 'uFold', 'uSoft'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    for (var ti = 0; ti < 6; ti++) gl.uniform1i(gl.getUniformLocation(prog, 'uT' + ti), ti);
    gl.uniform2f(U.uFold, 0.16, 0.7);   // carousel-goo.js's FLARE and SQUASH
  }
  // The pictures at the carousel's own resolution (carousel-goo.js), so
  // nothing sharpens or softens at the hand-over.
  function potSide(n) { return Math.max(1024, Math.min(2048, Math.pow(2, Math.ceil(Math.log(n || 1024) / Math.LN2 - 0.01)))); }
  var srcImgs = slides.map(function (sl) { return sl.querySelector('.slide-img'); });
  var aspects = [], contain = [];
  // Preparing a texture is heavy (a large canvas draw and mipmaps), so it's
  // done ahead of time, one picture per idle moment after the page loads,
  // rather than all at once on the first click (which froze the page).
  function prepare(i) {
    var img = srcImgs[i];
    if (texReady[i] || !img.complete || !img.naturalWidth) return;
    {
      var c = document.createElement('canvas');
      c.width = potSide(img.naturalWidth); c.height = potSide(img.naturalHeight);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      aspects[i] = img.naturalWidth / img.naturalHeight;
      contain[i] = img.style.objectFit === 'contain' ? 1 : 0;
      tszs[i] = [c.width, c.height];
      texReady[i] = true;
    }
  }
  function loadTextures() {
    for (var i = 0; i < N; i++) prepare(i);   // whatever is still missing
    return texReady.filter(Boolean).length === N;
  }
  if (prog) {
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 200); };
    var next = 0;
    var warm = function () {
      if (next >= N) return;
      if (srcImgs[next].complete && srcImgs[next].naturalWidth) { prepare(next); next++; }
      idle(warm, { timeout: 1500 });
    };
    // Only once the page has settled (after the intro and the text melting
    // in), so it never makes those stutter.
    var started = false;
    var start = function () { if (started) return; started = true; setTimeout(function () { idle(warm, { timeout: 1500 }); }, 800); };
    window.addEventListener('textmelt:done', start);
    setTimeout(start, 20000);
  }

  var slideInners = slides.map(function (sl) { return sl.querySelector('.slide-inner'); });
  var medias = cards.map(function (c) { return c.querySelector('.work-card-media'); });
  var activeIdx = function () { var a = slides.findIndex(function (s) { return s.classList.contains('is-active'); }); return a < 0 ? 0 : a; };
  function rectOf(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 }; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function bez(x1, y1, x2, y2) {
    function at(a, b, t) { return ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var k = 0; k < 24; k++) { t = (lo + hi) / 2; if (at(x1, x2, t) < x) lo = t; else hi = t; }
      return at(y1, y2, t);
    };
  }
  var soft = bez(0.4, 0.05, 0.5, 1);    // the intro's gentle landing ease

  var ALIGN = 1.0, SHRINK = 0.72, TURN = 0.15, SPREAD = 1.45;   // seconds (TURN: a beat as the seed)
  var MERGE = ALIGN + SHRINK;
  var MSTAG = 0.06, SSTAG = 0.095;
  var GOO = 52;                                   // how gooey, px
  var MORPH = MERGE + TURN + SPREAD + SSTAG * N;

  // Runs the morph from `froms` to `tos` (rects, by slide index) through
  // the merged centre `ctr`, then calls done(fadeOut).
  // `toCarousel`: the carousel's look fades in as the cards land (else it
  // fades out as they leave the carousel).
  var morphing = false;   // one morph at a time; a click mid-morph waits
  function morph(froms, tos, ctr, centre, toCarousel, done) {
    morphing = true;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uDpr, dpr);
    // The carousel's frame, its fold zone and edge blur, in screen px.
    var wrap = document.querySelector('.carousel-wrap');
    var wr = wrap.getBoundingClientRect(), fsc = wr.height / (wrap.offsetHeight || 1);
    gl.uniform4f(U.uFrame, wr.top, wr.bottom, 130 * fsc, 16 * fsc);
    cv.style.opacity = '1';
    cv.style.display = 'block';
    // Front to back: the centre image first, then the rest by distance.
    var order = slides.map(function (s, i) { return i; }).sort(function (a, b) {
      return (a === centre ? -1 : b === centre ? 1 : Math.abs(froms[a].y - ctr.y) - Math.abs(froms[b].y - ctr.y));
    });
    // The seed: a small card in the middle, a little larger than the intro's.
    // (larger on the way back to the carousel)
    var shw = toCarousel ? Math.min(ctr.hw * 0.85, Math.max(170, Math.min(w, h) * 0.3))
                         : Math.min(ctr.hw * 0.8, Math.max(130, Math.min(w, h) * 0.22));
    var back = { x: ctr.x, y: ctr.y, hw: shw, hh: shw * (ctr.hh / ctr.hw) };
    var rects = new Float32Array(24), rots = new Float32Array(6), fits = new Float32Array(18);
    var cbs = new Float32Array(6), tsz = new Float32Array(12);
    var t0 = performance.now();
    (function frame(now) {
      var t = (now - t0) / 1000, k = 0;
      order.forEach(function (i, slot) {
        var f = froms[i], to = tos[i], c, rr = 0, cbv = 0;
        var tilt = slot % 2 ? 1 : -1;   // neighbours lean opposite ways
        var al = soft(clamp01((t - slot * MSTAG) / (ALIGN - MSTAG * (N - 1))));
        var shr = soft(clamp01((t - ALIGN) / SHRINK));
        var sp = soft(clamp01((t - MERGE - TURN - slot * SSTAG) / SPREAD));
        if (shr <= 0) {
          // 1. gliding onto the centre image and lining up with it, full size
          c = { x: lerp(f.x, ctr.x, al), y: lerp(f.y, ctr.y, al), hw: lerp(f.hw, ctr.hw, al), hh: lerp(f.hh, ctr.hh, al) };
          k = Math.max(k, GOO * 0.55 * al);
          if (slot) { rr = tilt * 0.05 * Math.sin(Math.PI * al); cbv = 5 * Math.sin(Math.PI * al); }
        } else if (sp <= 0) {
          // 2. the aligned stack shrinking together into the seed
          c = { x: ctr.x, y: ctr.y, hw: lerp(ctr.hw, back.hw, shr), hh: lerp(ctr.hh, back.hh, shr) };
          k = GOO * 0.55;
        } else {
          // 3. peeling off and settling into place, threads snapping
          c = { x: lerp(back.x, to.x, sp), y: lerp(back.y, to.y, sp), hw: lerp(back.hw, to.hw, sp), hh: lerp(back.hh, to.hh, sp) };
          k = Math.max(k, GOO * 0.55 * Math.pow(1 - sp, 2));
          // leaning a little and softly blurred while travelling, then
          // straightening and sharpening as it lands
          // (the centre image just grows straight back into place, no lean)
          if (slot || !toCarousel) rr = tilt * 0.06 * Math.sin(Math.PI * sp);
          cbv = 6 * Math.sin(Math.PI * sp);
        }
        rects[slot * 4] = c.x; rects[slot * 4 + 1] = c.y; rects[slot * 4 + 2] = c.hw; rects[slot * 4 + 3] = c.hh;
        rots[slot] = rr;
        cbs[slot] = cbv;
        fits[slot * 3] = aspects[i]; fits[slot * 3 + 1] = contain[i]; fits[slot * 3 + 2] = i;
        tsz[slot * 2] = tszs[i][0]; tsz[slot * 2 + 1] = tszs[i][1];
      });
      // The carousel's look: gone by the time the cards line up when leaving
      // it, and fully there by the time they land when going back to it.
      var look = toCarousel
        ? soft(clamp01((t - MERGE - TURN - SPREAD * 0.2) / (SPREAD * 0.8 + SSTAG * N)))
        : 1 - soft(clamp01(t / (ALIGN * 0.7)));
      gl.uniform1f(U.uSoft, look);
      gl.uniform1fv(U.uCB, cbs);
      gl.uniform2fv(U.uTsz, tsz);
      gl.uniform4fv(U.uRect, rects);
      gl.uniform1fv(U.uRot, rots);
      gl.uniform3fv(U.uFit, fits);
      gl.uniform1f(U.uK, k);
      gl.uniform1f(U.uAlpha, 1);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (t < MORPH) requestAnimationFrame(frame);
      else { morphing = false; done(function () {
        // The last frame already matches what's underneath: swap at once,
        // a frame after the page's own drawing has caught up.
        requestAnimationFrame(function () { requestAnimationFrame(function () { cv.style.display = 'none'; }); });
      }); }
    })(t0);
  }

  function fadeText(dir, delay) {
    var anims = [];
    cards.forEach(function (c, i) {
      Array.prototype.forEach.call(c.querySelectorAll('.work-card-title, .work-card-tags'), function (el) {
        anims.push(el.animate(dir > 0
          ? [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }]
          : [{ opacity: 1 }, { opacity: 0 }],
          { duration: dir > 0 ? 600 : 280, delay: delay + (dir > 0 ? i * SSTAG * 1000 : 0), easing: EASE, fill: dir > 0 ? 'backwards' : 'forwards' }));
      });
    });
    return anims;
  }

  function canMorph() { return !reduce && prog && cards[0].animate && loadTextures(); }

  function toGrid() {
    isGrid = true; label();
    grid.scrollTop = 0; setScroll(0);
    if (!canMorph()) { moveNav(function () { root.classList.add('is-grid'); }, 0); return; }
    var ai = activeIdx();
    var froms = slideInners.map(rectOf), ctr = froms[ai];
    root.classList.add('grid-fly');                       // carousel steps aside; the canvas carries on
    moveNav(function () { root.classList.add('is-grid'); }, (MERGE + TURN) * 1000);
    var tos = medias.map(rectOf);
    fadeText(1, (MERGE + TURN + SPREAD * 0.75) * 1000);
    morph(froms, tos, ctr, ai, false, function (hide) {
      root.classList.remove('grid-fly');                  // the grid's own images take over
      hide();
    });
  }

  function toCarousel() {
    isGrid = false; label();
    if (!canMorph()) { moveNav(function () { setScroll(0); root.classList.remove('is-grid'); }, 0); return; }
    var froms = medias.map(rectOf);
    var fades = fadeText(-1, 0);
    root.classList.add('grid-fly', 'is-grid-leaving');
    setTimeout(function () {
      // Scrolled down the grid, the profile fades back in at the top like the nav.
      var profile = grid.scrollTop > 0 && document.querySelector('.profile');
      moveNav(function () { setScroll(0); root.classList.remove('is-grid'); }, (MERGE + TURN) * 1000, profile ? [profile] : []);
      var ai = activeIdx();
      var tos = slideInners.map(rectOf), ctr = tos[ai];
      morph(froms, tos, ctr, ai, true, function (hide) {
        // The cards have landed looking just like the carousel: it takes
        // over at once (no fade), and the details fade in after.
        root.classList.add('grid-snap');
        root.classList.remove('grid-fly', 'is-grid-leaving');
        hide();
        setTimeout(function () { root.classList.remove('grid-snap'); fades.forEach(function (a) { a.cancel(); }); }, 120);
      });
    }, 220);
  }

  var animT = 0;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var now = performance.now();
    if (now < busy || morphing) return;   // let one switch finish before the next
    busy = now + 4600;
    // The carousel's fade in and out only applies while switching (so the
    // intro's own hand-over to the carousel stays instant).
    root.classList.add('grid-anim');
    clearTimeout(animT);
    animT = setTimeout(function () { root.classList.remove('grid-anim'); }, 5400);
    // The carousel's "View" pointer would otherwise stay up over nothing.
    Array.prototype.forEach.call(document.querySelectorAll('.view-cursor.visible'), function (el) { el.classList.remove('visible'); });
    slideInners.forEach(function (el) { el.style.cursor = ''; });
    if (isGrid) toCarousel(); else toGrid();
  });
})();
