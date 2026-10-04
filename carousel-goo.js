/* Homepage carousel images fold over the top and bottom of the frame,
   replacing the frosted glass that used to soften those edges.

   The real slides stay in the page (they still scroll, take hovers and
   clicks, and play their videos) but are drawn invisibly; a WebGL canvas
   over the carousel paints them instead, each as a rounded-box distance
   field. In a band at the top and bottom of the frame the image folds over
   the edge towards the viewer: picture and shape both spread wider and
   squash tighter the nearer they get to the edge, dissolving into a soft
   haze whose colours bleed out into the background. The middle of the frame is untouched.

   Desktop only (the stacked mobile layout keeps the original look), and
   skipped where WebGL isn't available or for reduced-motion users. */
(function () {
  var wrap = document.querySelector('.carousel-wrap');
  if (!wrap || window.innerWidth < 780) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var slides = Array.prototype.slice.call(wrap.querySelectorAll('.slide'));
  var N = Math.min(slides.length, 5);
  if (!N) return;

  var cv = document.createElement('canvas');
  var gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return;
  cv.className = 'carousel-goo';
  cv.setAttribute('aria-hidden', 'true');
  wrap.appendChild(cv);
  document.documentElement.classList.add('has-goo');

  var ZONE = 130;        // px at the top and bottom of the frame where images fold
  var FLARE = 0.16;      // how much wider an image gets right at the frame edge
  var SQUASH = 0.7;      // how much of the image is pulled into the fold
  var BLUR = 16;         // px of haze right at the frame edge
  var TEX = 1024;        // pictures are kept as square power-of-two textures so they can be mipmapped
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Mipmaps give a wide, cheap blur; with this extension the shader can pick
  // the level itself, otherwise it nudges the hardware's choice.
  var lodExt = gl.getExtension('EXT_shader_texture_lod');
  var VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    lodExt ? '#extension GL_EXT_shader_texture_lod : enable\n#define TEX(s, uv, l) texture2DLodEXT(s, uv, l)'
           : '#define TEX(s, uv, l) texture2D(s, uv, l)',
    'precision highp float;',
    'uniform vec2 uRes; uniform float uDpr;',
    'uniform vec4 uRect[5];',   // centre x, centre y, half w, half h (css px, y down)
    'uniform vec3 uFit[5];',    // image aspect, fit (0 cover, 1 contain on white), texture
    'uniform float uZone;',     // px at the top and bottom of the frame where images fold
    'uniform float uFlare;',    // extra width right at the frame edge
    'uniform float uSquash;',   // how much of the image is pulled into the fold
    'uniform float uBlur;',     // px of blur right at the frame edge
    'uniform sampler2D uT0; uniform sampler2D uT1; uniform sampler2D uT2; uniform sampler2D uT3; uniform sampler2D uT4;',
    'float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'vec4 pick(float i, vec2 uv, float l){',
    '  if (i < 0.5) return TEX(uT0, uv, l); if (i < 1.5) return TEX(uT1, uv, l);',
    '  if (i < 2.5) return TEX(uT2, uv, l); if (i < 3.5) return TEX(uT3, uv, l);',
    '  return TEX(uT4, uv, l); }',
    // The card's picture at a point on the flat image (px from its centre).
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
    '  float field = 1e5, best = 1e5; bool hit = false;',
    '  vec4 rect = uRect[0]; vec3 fit = uFit[0]; vec2 local = vec2(0.0);',
    '  for (int i = 0; i < 5; i++){',
    '    vec4 r = uRect[i]; if (r.z <= 0.0) continue;',
    // Towards the top and bottom of the frame each image folds over the
    // edge towards the viewer: the screen point is mapped back to a point
    // on the flat image, which spreads wider and is squashed more and more
    // tightly the nearer it gets to the edge. Shape and picture warp
    // together. The middle of the frame is untouched.
    '    float edge = min(p.y, uRes.y - p.y);',
    '    float e = clamp(1.0 - edge / uZone, 0.0, 1.0);',
    '    float side = p.y < uRes.y * 0.5 ? -1.0 : 1.0;',
    '    vec2 q = vec2((p.x - r.x) / (1.0 + uFlare * e * e), p.y + side * uSquash * uZone * e * e - r.y);',
    // Images sitting at the top and bottom of the frame bend outward: the
    // nearer a card's centre is to the edge, the more the middle of its
    // inner edge pulls back towards the frame edge while its corners reach
    // in, so that edge arcs outward (picture and all) and the corners round
    // off; with the flare it reads as one curved shape, no straight line
    // left. The image in the middle stays a rectangle.
    '    float cd = min(r.y, uRes.y - r.y);',
    '    float ce = 1.0 - smoothstep(uZone * 0.46, uZone * 2.3, cd);',
    '    float u = clamp(q.x / r.z, -1.0, 1.0);',
    '    q.y -= (r.y < uRes.y * 0.5 ? -1.0 : 1.0) * 0.035 * r.w * (1.0 - u * u) * ce;',
    '    float d = sdBox(q, r.zw, mix(1.5, 0.08 * min(r.z, r.w), ce)) / (1.0 + 2.0 * uSquash * e);',
    '    field = min(field, d);',
    '    if (!hit && (d <= 0.0 || d < best)) { best = d; rect = r; fit = uFit[i]; local = q; hit = d <= 0.0; }',
    '  }',
    // In the fold the picture dissolves into a soft haze: blur grows from
    // nothing where the fold starts to uBlur px at the frame edge, the
    // outline melts away with it so the colours bleed out into the
    // background. The colour stays full strength right up to the edge.
    '  float ef = clamp(1.0 - min(p.y, uRes.y - p.y) / uZone, 0.0, 1.0);',
    '  float bl = uBlur * pow(ef, 1.6);',
    // Soft edge that eases in and out at both ends (a straight ramp left a
    // hard rim where the fully solid middle began, which showed the old
    // rectangle inside the blur).
    '  float sw = 1.0 + bl * 2.0;',
    '  float a = 1.0 - smoothstep(-0.5 * sw, 0.5 * sw, field);',
    '  if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }',
    '  float lod = log2(max(1.0, bl * 0.55 * ' + (TEX / 2) + '.0 / sqrt(rect.z * rect.w)));',
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

  function compile(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { cv.remove(); document.documentElement.classList.remove('has-goo'); return; }
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  function U(n) { return gl.getUniformLocation(prog, n); }
  var uRes = U('uRes'), uDpr = U('uDpr'), uRect = U('uRect'), uFit = U('uFit'), uZone = U('uZone'), uFlare = U('uFlare'), uSquash = U('uSquash'), uBlur = U('uBlur');
  for (var t = 0; t < 5; t++) gl.uniform1i(U('uT' + t), t);

  var items = slides.slice(0, N).map(function (slide, i) {
    var img = slide.querySelector('.slide-img');
    var it = { inner: slide.querySelector('.slide-inner'), img: img, video: slide.querySelector('.slide-video'),
      tex: gl.createTexture(), unit: i, aspect: 1.5, contain: 0, vidOn: false };
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, it.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (img) it.contain = getComputedStyle(img).objectFit === 'contain' ? 1 : 0;
    // Stretched onto a square canvas (the shader's uvs cover the whole
    // picture either way) so the texture can carry mipmaps for the haze.
    var sq = document.createElement('canvas'), sx = sq.getContext('2d');
    it.put = function (src, n) {
      if (sq.width !== n) { sq.width = n; sq.height = n; }
      sx.clearRect(0, 0, n, n);
      sx.drawImage(src, 0, 0, n, n);
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, it.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sq);
      gl.generateMipmap(gl.TEXTURE_2D);
    };
    it.upload = function () {
      if (!img) return;
      try {
        it.put(img, TEX);
        it.aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
      } catch (e) {}
    };
    if (img) {
      if (img.complete && img.naturalWidth) it.upload();
      else img.addEventListener('load', it.upload, { once: true });
    }
    return it;
  });

  var W = 0, H = 0;
  function size() {
    W = cv.offsetWidth; H = cv.offsetHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uDpr, dpr);
  }
  size();
  window.addEventListener('resize', function () {
    var on = window.innerWidth >= 780;
    document.documentElement.classList.toggle('has-goo', on);
    cv.style.display = on ? '' : 'none';
    if (on) size();
  });

  var rectArr = new Float32Array(20), fitArr = new Float32Array(15);

  function frame(now) {
    var wr = cv.getBoundingClientRect();
    var s = W / (wr.width || 1);

    items.forEach(function (it, i) {
      var r = it.inner.getBoundingClientRect();
      var cx = (r.left + r.width / 2 - wr.left) * s, cy = (r.top + r.height / 2 - wr.top) * s;
      var hw = r.width * s / 2, hh = r.height * s / 2;
      var visible = cy + hh > -60 && cy - hh < H + 60 && hw > 0.5;
      rectArr[i * 4] = cx; rectArr[i * 4 + 1] = cy;
      rectArr[i * 4 + 2] = visible ? hw : 0; rectArr[i * 4 + 3] = hh;
      fitArr[i * 3 + 2] = i;
      // A playing hover video replaces the still.
      var v = it.video;
      if (v && !v.paused && v.readyState >= 2 && parseFloat(getComputedStyle(v).opacity) > 0.5) {
        try {
          it.put(v, TEX / 2);
          it.vidOn = true;
          fitArr[i * 3] = v.videoWidth / (v.videoHeight || 1); fitArr[i * 3 + 1] = 0;
        } catch (e) {}
      } else {
        if (it.vidOn) { it.vidOn = false; it.upload(); }
        fitArr[i * 3] = it.aspect; fitArr[i * 3 + 1] = it.contain;
      }
    });

    gl.uniform4fv(uRect, rectArr);
    gl.uniform3fv(uFit, fitArr);
    gl.uniform1f(uZone, ZONE);
    gl.uniform1f(uFlare, FLARE);
    gl.uniform1f(uSquash, SQUASH);
    gl.uniform1f(uBlur, BLUR);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
