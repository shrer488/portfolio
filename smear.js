/* Homepage text hover: the cursor softens the text it passes over into
   goo. Letters near the pointer blur, and their text block runs through an
   alpha threshold that forces everything above a cut fully solid and drops
   the rest, so neighbouring soft letters fuse into one blob (the same melt
   as textmelt.js and Viscose's text morph). Then they slowly firm back up
   into letters, leaving a fading trail behind the pointer.

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

  var SEL = '.nav-link, .profile-name, .profile-role, .profile-bio, .project-title, ' +
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
      if (!tn.nodeValue.trim()) return;
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
  Array.prototype.forEach.call(document.querySelectorAll(SEL), wrapLetters);

  // ---- per-block threshold filters ----------------------------------------
  // Built on first use, in the block's own text colour so grey text stays
  // grey. The cut is fairly gentle so letters that aren't wet keep most of
  // their antialiasing while their block is filtered.
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  document.body.appendChild(svg);

  var blocks = new Map(); // block -> { id, wet }
  var made = 0;
  function blockOf(el) {
    var b = el.closest(SEL);
    var s = blocks.get(b);
    if (!s) {
      var id = 'goo-' + (++made);
      svg.insertAdjacentHTML('beforeend',
        '<filter id="' + id + '" x="-10%" y="-60%" width="120%" height="220%" color-interpolation-filters="sRGB">' +
        '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 10 -3.8" result="mask"/>' +
        '<feFlood flood-color="' + getComputedStyle(b).color + '"/>' +
        '<feComposite in2="mask" operator="in"/>' +
        '</filter>');
      s = { el: b, id: id, wet: 0 };
      blocks.set(b, s);
    }
    return s;
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
        active.delete(el);
        if (--s.block.wet === 0) s.block.el.style.filter = '';
        return;
      }
      el.style.filter = 'blur(' + (s.fs * BLUR * s.t).toFixed(2) + 'px)';
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
    return el && el.classList && el.classList.contains('smear-ch') ? el : null;
  }

  document.addEventListener('mousemove', function (e) {
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
})();
