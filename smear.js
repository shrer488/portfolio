/* Homepage text hover: the cursor softens the text it passes over into
   goo. Letters near the pointer blur, and their text block runs through an
   alpha threshold that forces everything above a cut fully solid and drops
   the rest, so neighbouring soft letters fuse into one blob (the same melt
   as textmelt.js and Viscose's text morph), tinted turquoise while wet.
   Then they slowly firm back up into letters in their own colour, leaving
   a fading trail behind the pointer.

   A single 0→1 "wetness" per letter drives its blur. Letters are hit along
   the whole path the pointer travelled since the last event (so fast moves
   don't skip any), their neighbours catch some of it, and the wetness then
   decays. A block only carries the threshold filter while one of its
   letters is wet, so resting text keeps its ordinary antialiased edges.
   Blur scales with font size so a 12px caption and a 20px title melt
   alike. */
(function () {
  if (!window.matchMedia) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Which text blocks take part: the homepage's by default, or a page's own
  // list via the script tag's data-smear attribute.
  var me = document.currentScript;
  var SEL = (me && me.dataset.smear) ||
    '.nav-link, .profile-name, .profile-role, .profile-bio, .project-title, ' +
    '.project-desc, .meta-label, .meta-list p, .meta-stat, .meta-caption, .cursor-label';
  var RISE = 0.3;        // how fast a letter soaks up wetness (per frame)
  var HALF_LIFE = 380;   // ms for a letter's wetness to halve once left alone
  var SPILL = 0.6;       // wetness passed to the letters either side
  var SPILL2 = 0.3;      // ...and the ones beyond those
  var BLUR = 0.28;       // blur at full wetness, as a fraction of font size
  var STEP = 5;          // px between samples along the pointer's path
  var NS = 'http://www.w3.org/2000/svg';

  // ---- split text into letter spans --------------------------------------
  // Plain inline spans: no extra break opportunities inside words, so lines
  // wrap exactly as before.
  function wrapLetters(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(function (tn) {
      if (!tn.nodeValue.trim() || tn.parentNode.classList.contains('smear-ch')) return;
      var frag = document.createDocumentFragment();
      Array.from(tn.nodeValue).forEach(function (ch) {
        if (/\s/.test(ch)) { frag.appendChild(document.createTextNode(ch)); return; }
        var s = document.createElement('span');
        s.className = 'smear-ch';
        s.textContent = ch;
        frag.appendChild(s);
      });
      tn.parentNode.replaceChild(frag, tn);
    });
  }
  var blockEls = Array.prototype.slice.call(document.querySelectorAll(SEL));
  blockEls.forEach(wrapLetters);

  // Some pages swap text in on hover (the About photo caption, the Play
  // bio); split the new text into letters too so it keeps the effect.
  if (window.MutationObserver) {
    var mo = new MutationObserver(function (records) {
      records.forEach(function (r) {
        var b = r.target.nodeType === 1 ? r.target.closest(SEL) : null;
        if (b) wrapLetters(b);
      });
    });
    blockEls.forEach(function (b) { mo.observe(b, { childList: true }); });
  }

  // ---- per-block threshold filters ----------------------------------------
  // Built on first use. The threshold keeps each letter's own colour (so
  // wet letters can carry their turquoise tint) and then scales back down
  // to the block's own text opacity, so grey text stays grey rather than
  // being pushed to solid. The cut is fairly gentle so letters that aren't
  // wet keep most of their antialiasing while their block is filtered.
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  document.body.appendChild(svg);

  function parseColor(c) {
    var m = c.match(/rgba?\(([^)]+)\)/);
    var p = m ? m[1].split(',').map(parseFloat) : [0, 0, 0, 1];
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  var blocks = new Map(); // block -> { id, wet, color }
  var made = 0;
  function blockOf(el) {
    var b = el.closest(SEL);
    var s = blocks.get(b);
    if (!s) {
      var id = 'goo-' + (++made);
      var col = parseColor(getComputedStyle(b).color);
      svg.insertAdjacentHTML('beforeend',
        '<filter id="' + id + '" x="-10%" y="-60%" width="120%" height="220%" color-interpolation-filters="sRGB">' +
        '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 10 -3.8"/>' +
        '<feComponentTransfer><feFuncA type="linear" slope="' + col.a + '" intercept="0"/></feComponentTransfer>' +
        '</filter>');
      s = { el: b, id: id, wet: 0, color: col };
      blocks.set(b, s);
    }
    return s;
  }

  // Wet letters take on a turquoise tint, strongest at their wettest.
  var TINT = { r: 64, g: 224, b: 208 };
  function tint(col, t) {
    var k = Math.min(1, t * 1.8) * 0.9;
    return 'rgb(' + Math.round(col.r + (TINT.r - col.r) * k) + ', ' +
      Math.round(col.g + (TINT.g - col.g) * k) + ', ' +
      Math.round(col.b + (TINT.b - col.b) * k) + ')';
  }

  // ---- wetness simulation ------------------------------------------------
  var active = new Map(); // letter span -> { heat, t, fs, block }
  var running = false;
  var last = 0;

  function soak(el, amount) {
    var s = active.get(el);
    if (!s) {
      var b = blockOf(el);
      s = { heat: 0, t: 0, fs: parseFloat(getComputedStyle(el).fontSize) || 16, block: b };
      active.set(el, s);
      if (b.wet++ === 0) b.el.style.filter = 'url(#' + b.id + ')';
    }
    if (amount > s.heat) s.heat = amount;
  }

  function sibling(el, dir) {
    var n = dir < 0 ? el.previousSibling : el.nextSibling;
    // Step over a single space so the goo can bridge between words.
    if (n && n.nodeType === 3 && !n.nodeValue.trim()) n = dir < 0 ? n.previousSibling : n.nextSibling;
    return n && n.nodeType === 1 && n.classList.contains('smear-ch') ? n : null;
  }

  function hit(el) {
    soak(el, 1);
    [-1, 1].forEach(function (dir) {
      var a = sibling(el, dir);
      if (!a) return;
      soak(a, SPILL);
      var b = sibling(a, dir);
      if (b) soak(b, SPILL2);
    });
  }

  function frame(now) {
    var dt = last ? now - last : 16;
    last = now;
    var decay = Math.pow(0.5, dt / HALF_LIFE);
    active.forEach(function (s, el) {
      s.heat *= decay;
      // Soak up quickly, firm up slowly (following the decaying heat).
      s.t += (s.heat - s.t) * (s.heat > s.t ? RISE : 1);
      if (s.t < 0.01 && s.heat < 0.01) {
        el.style.filter = '';
        el.style.color = '';
        active.delete(el);
        if (--s.block.wet === 0) s.block.el.style.filter = '';
        return;
      }
      el.style.filter = 'blur(' + (s.fs * BLUR * s.t).toFixed(2) + 'px)';
      el.style.color = tint(s.block.color, s.t);
    });
    if (active.size) requestAnimationFrame(frame);
    else { running = false; last = 0; }
  }

  function kick() {
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  // ---- pointer -----------------------------------------------------------
  var px = null, py = null;

  function letterAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || !el.classList || !el.classList.contains('smear-ch')) return null;
    // Never a letter in a hidden homepage project panel.
    var panel = el.closest('.project-panel');
    return panel && !panel.classList.contains('is-active') ? null : el;
  }

  // The "Turn off trail" toggle (transition.js) switches this on and off.
  var trailOff = false;
  try { trailOff = localStorage.getItem('trailOff') === '1'; } catch (e) {}
  window.addEventListener('trailchange', function (e) {
    trailOff = !!(e.detail && e.detail.off);
    if (!trailOff) return;
    // Settle everything at once rather than letting it fade out.
    active.forEach(function (st, el) {
      el.style.filter = '';
      el.style.color = '';
      st.block.wet = 0;
      st.block.el.style.filter = '';
    });
    active.clear();
  });

  document.addEventListener('mousemove', function (e) {
    if (trailOff) return;
    var x = e.clientX, y = e.clientY;
    var any = false;
    // Sample the whole segment travelled since the last event.
    var dx = px === null ? 0 : x - px, dy = py === null ? 0 : y - py;
    var steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / STEP));
    for (var i = 1; i <= steps; i++) {
      var el = letterAt(x - dx * (1 - i / steps), y - dy * (1 - i / steps));
      if (el) { hit(el); any = true; }
    }
    px = x; py = y;
    if (any) kick();
  });

  document.addEventListener('mouseleave', function () { px = py = null; });

  // ---- images ------------------------------------------------------------
  // Pictures ripple like water (after Componentry's Image Ripple Effect,
  // https://componentry.dev/docs/components/image-ripple-effect). Any
  // element with data-smear-img is redrawn on a WebGL canvas a little larger
  // than itself, with clear space around the picture. Moving the pointer
  // drops soft ring-shaped waves that slowly turn, grow and fade; they're
  // painted into a displacement map, and the picture is drawn through that
  // map, so it refracts as the waves pass, and because its edges are drawn
  // through the same map, the rectangle itself bends out of shape. Once the
  // waves have died away the canvas hides and the real image shows again.
  // data-smear-strength, -wave, -fade and -pad override the strength, wave
  // size, how quickly waves die away and the clear margin per picture (the
  // big About photo uses small, faint, short-lived waves).
  Array.prototype.forEach.call(document.querySelectorAll('[data-smear-img]'), function (host) {
    var img = host.querySelector('img');
    var parent = host.offsetParent;
    if (!img || !parent) return;
    var cv = document.createElement('canvas');
    var gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true });
    if (!gl) return;
    // Work in Display P3 where the browser can, so wide-colour photos (the
    // iPhone profile picture) keep their colour while rippling instead of
    // being squashed into sRGB and looking dull.
    if ('drawingBufferColorSpace' in gl) gl.drawingBufferColorSpace = 'display-p3';
    if ('unpackColorSpace' in gl) gl.unpackColorSpace = 'display-p3';
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;pointer-events:none;display:none;';
    // Just before the picture, so anything stacked over it (the About
    // photo's tooltip) stays on top of the ripple.
    host.parentNode.insertBefore(cv, host);

    var PAD = parseFloat(host.dataset.smearPad) || 0.6;               // clear margin round the picture, as a fraction of its size
    var STRENGTH = parseFloat(host.dataset.smearStrength) || 0.06;    // how far the waves bend the picture
    var WAVE = parseFloat(host.dataset.smearWave) || 0.55;   // a new wave's size, relative to the picture
    var FADE = parseFloat(host.dataset.smearFade) || 0.95;   // how much of a wave is left each frame
    var MAX_WAVES = 60;
    var k = 1;   // canvas resolution, set per size in layout()
    var W = 0, H = 0, pw = 0, ph = 0, ox = 0, oy = 0;

    function compile(vs, fs) {
      var pr = gl.createProgram();
      [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (d) {
        var sh = gl.createShader(d[0]); gl.shaderSource(sh, d[1]); gl.compileShader(sh); gl.attachShader(pr, sh);
      });
      gl.bindAttribLocation(pr, 0, 'p');
      gl.linkProgram(pr);
      return pr;
    }
    // One wave: a quad turned and scaled about its centre, textured with a
    // soft ring, added (not blended) into the displacement map.
    var waveProg = compile(
      'attribute vec2 p; uniform vec2 uC, uRes; uniform float uS, uR; varying vec2 vUv;' +
      'void main(){ vUv = p * 0.5 + 0.5; float c = cos(uR), s = sin(uR);' +
      ' vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) * uS * 0.5 + uC;' +
      ' gl_Position = vec4(q / uRes * 2.0 - 1.0, 0.0, 1.0); }',
      'precision mediump float; uniform sampler2D uBrush; uniform float uA; varying vec2 vUv;' +
      'void main(){ gl_FragColor = texture2D(uBrush, vUv) * uA; }');
    // The picture, sampled through the displacement map: the brightness of
    // the map picks both a direction and an amount to push each pixel.
    var showProg = compile(
      'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }',
      'precision mediump float; uniform sampler2D uImg, uDisp; uniform float uStrength; varying vec2 vUv;' +
      'void main(){ float d = texture2D(uDisp, vUv).r; float a = d * 6.2832;' +
      ' vec2 uv = vUv + vec2(sin(a), cos(a)) * d * uStrength;' +
      ' gl_FragColor = texture2D(uImg, uv); }');

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function tex(src) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    // Soft ring brush.
    var bc = document.createElement('canvas');
    bc.width = bc.height = 128;
    var bx = bc.getContext('2d');
    var g = bx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    bx.fillStyle = g;
    bx.fillRect(0, 0, 128, 128);
    var brush = tex(bc);
    var picture = null, dispTex = null, dispFb = null;

    function layout() {
      pw = host.offsetWidth; ph = host.offsetHeight;
      var padY = ph * PAD;
      // Sideways, the margin stops at the edges of the window, so the canvas
      // never pokes out and adds a horizontal scroll.
      var hr0 = host.getBoundingClientRect(), sc0 = pw / (hr0.width || 1);
      var docW = document.documentElement.clientWidth;
      var padL = Math.max(0, Math.min(pw * PAD, hr0.left * sc0));
      var padR = Math.max(0, Math.min(pw * PAD, (docW - hr0.right) * sc0));
      W = pw + padL + padR; H = ph + padY * 2;
      ox = padL; oy = padY;
      // Extra resolution for small pictures, capped so big ones stay light.
      k = Math.min(Math.min(window.devicePixelRatio || 1, 2) * 3, 2400 / Math.max(W, H));
      cv.width = Math.round(W * k); cv.height = Math.round(H * k);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      cv.style.left = (host.offsetLeft - padL) + 'px';
      cv.style.top = (host.offsetTop - padY) + 'px';

      // The picture as it's laid out in its frame (cropped, rounded corners),
      // centred on clear space.
      var off = document.createElement('canvas');
      off.width = cv.width; off.height = cv.height;
      var c = off.getContext('2d', { colorSpace: 'display-p3' }) || off.getContext('2d');
      c.scale(k, k);
      var ir = img.getBoundingClientRect(), hr = host.getBoundingClientRect(), sx = pw / (hr.width || 1);
      var bw = ir.width * sx, bh = ir.height * sx;
      var nr = (img.naturalWidth || 1) / (img.naturalHeight || 1), br = bw / bh;
      var dw = br > nr ? bw : bh * nr, dh = br > nr ? bw / nr : bh;   // object-fit: cover
      var radius = parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0;
      c.beginPath();
      if (c.roundRect) c.roundRect(ox, oy, pw, ph, radius); else c.rect(ox, oy, pw, ph);
      c.clip();
      try {
        c.drawImage(img, ox + (ir.left - hr.left) * sx + (bw - dw) / 2, oy + (ir.top - hr.top) * sx + (bh - dh) / 2, dw, dh);
      } catch (e) { return false; }
      picture = tex(off);

      dispTex = tex(null);
      gl.bindTexture(gl.TEXTURE_2D, dispTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cv.width, cv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      dispFb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, dispFb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dispTex, 0);
      return true;
    }

    var waves = [], raf = 0, ready = false;

    function frame() {
      // Paint the waves into the displacement map.
      gl.bindFramebuffer(gl.FRAMEBUFFER, dispFb);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(waveProg);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, brush);
      gl.uniform1i(gl.getUniformLocation(waveProg, 'uBrush'), 0);
      gl.uniform2f(gl.getUniformLocation(waveProg, 'uRes'), W, H);
      var uC = gl.getUniformLocation(waveProg, 'uC'), uS = gl.getUniformLocation(waveProg, 'uS');
      var uR = gl.getUniformLocation(waveProg, 'uR'), uA = gl.getUniformLocation(waveProg, 'uA');
      waves = waves.filter(function (w) {
        w.rot += 0.025;
        w.alpha *= FADE;
        // Grows towards a size set by its starting size (about 6x it).
        w.size = w.size * 0.982 + pw * WAVE * 0.109;
        if (w.alpha < 0.01) return false;
        gl.uniform2f(uC, w.x, w.y);
        gl.uniform1f(uS, w.size);
        gl.uniform1f(uR, w.rot);
        gl.uniform1f(uA, w.alpha);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      });
      gl.disable(gl.BLEND);

      // Draw the picture through it.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(showProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, picture);
      gl.uniform1i(gl.getUniformLocation(showProg, 'uImg'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, dispTex);
      gl.uniform1i(gl.getUniformLocation(showProg, 'uDisp'), 1);
      gl.uniform1f(gl.getUniformLocation(showProg, 'uStrength'), STRENGTH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (waves.length) raf = requestAnimationFrame(frame);
      else {
        // Calm again: hand back to the real image.
        raf = 0;
        fadeOut();
      }
    }

    // The ripple layer fades in over the picture (which is only hidden once
    // the layer fully covers it) and fades back off it at the end, so any
    // difference in how the two render blends across instead of flicking.
    var FADE_IN = 350, FADE_OUT = 700, imgT = 0, hideT = 0;
    function fadeIn() {
      clearTimeout(hideT);
      if (cv.style.display !== 'block') {
        cv.style.opacity = '0';
        cv.style.display = 'block';
        void cv.offsetWidth;   // start the fade from 0
      }
      cv.style.transition = 'opacity ' + FADE_IN + 'ms ease';
      cv.style.opacity = '1';
      clearTimeout(imgT);
      imgT = setTimeout(function () { img.style.visibility = 'hidden'; }, FADE_IN);
    }
    function fadeOut() {
      clearTimeout(imgT);
      img.style.visibility = '';
      cv.style.transition = 'opacity ' + FADE_OUT + 'ms ease';
      cv.style.opacity = '0';
      clearTimeout(hideT);
      hideT = setTimeout(function () { if (!raf) cv.style.display = 'none'; }, FADE_OUT);
    }

    var lx = null, ly = null;
    host.addEventListener('mouseenter', function () {
      if (!ready) ready = layout();
      lx = ly = null;
    });
    host.addEventListener('mousemove', function (e) {
      if (trailOff || !ready) return;
      var r = host.getBoundingClientRect(), s = pw / (r.width || 1);
      var x = ox + (e.clientX - r.left) * s, y = H - (oy + (e.clientY - r.top) * s);   // GL is y-up
      if (lx !== null && Math.hypot(x - lx, y - ly) < pw * 0.04) return;
      lx = x; ly = y;
      waves.push({ x: x, y: y, size: pw * WAVE, rot: Math.random() * 6.28, alpha: 1 });
      if (waves.length > MAX_WAVES) waves.shift();
      if (!raf) {
        fadeIn();
        raf = requestAnimationFrame(frame);
      }
    });
    host.addEventListener('mouseleave', function () { lx = ly = null; });
    window.addEventListener('resize', function () { ready = false; });
    // A new picture swapped in (the About page's snap photos) is re-captured
    // on the next hover.
    img.addEventListener('load', function () { ready = false; });
    window.addEventListener('trailchange', function (e) {
      if (e.detail && e.detail.off) waves = [];
    });
  });
})();
