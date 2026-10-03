// Clicking the "Click" hint (.cursor-hint, bottom-right of the hero) melts
// the whole homepage into mush: text and images alike bleed downward in
// uneven drips, their edges turn to goo, and the whole page slumps down
// onto the bottom edge of the screen and pools there. After a moment it
// pulls itself back into shape, the same way the text blobs into place on
// load (textmelt.js). A "Reset" button (or clicking anywhere, or Escape)
// brings it back sooner.
//
// It's one SVG filter on the whole stage:
//   1. blur — everything softens;
//   2. displacement by tall, thin noise, biased one way, so each column of
//      pixels is pulled down by a different amount — the drips;
//   3. an alpha threshold, so soft edges snap to solid goo instead of
//      fading out. That needs alpha to work on, so while the filter is on
//      the page's own background goes transparent (the body behind it is
//      the same colour, so nothing visibly changes).
// A single 0→1 "melt" value drives all three, tweened in and back out.
(function () {
  var hint = document.querySelector('.cursor-hint');
  var stage = document.getElementById('stage');
  if (!hint || !stage) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var MELT_IN = 2.4;   // seconds to melt down
  var MELT_OUT = 1.6;  // seconds to pull back into shape
  var HOLD = 1.4;      // seconds it sits fully mushed before reforming
  var NS = 'http://www.w3.org/2000/svg';

  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML =
    '<filter id="mush" x="0" y="0" width="100%" height="140%" color-interpolation-filters="sRGB">' +
    '<feGaussianBlur in="SourceGraphic" stdDeviation="0" result="soft"/>' +
    // Broad, smooth noise: wide drips that sag by different amounts, rather
    // than a comb of thin streaks.
    '<feTurbulence type="fractalNoise" baseFrequency="0.007 0.004" numOctaves="1" seed="4" result="noise"/>' +
    // Hold red at 0.5 (no sideways shift) and squash green into 0–0.5, so
    // every pixel samples from straight above itself: content only drips down.
    '<feComponentTransfer in="noise" result="drip"><feFuncR type="linear" slope="0" intercept="0.5"/>' +
    '<feFuncG type="linear" slope="0.5" intercept="0"/></feComponentTransfer>' +
    '<feDisplacementMap in="soft" in2="drip" scale="0" xChannelSelector="R" yChannelSelector="G" result="moved"/>' +
    // A softened copy of the sagged page, run through a threshold, gives
    // the goo: fat, rounded lumps with firm edges, filled black like ink.
    // The sharp sagged page is laid on top and fades out as it melts, so
    // everything turns to black ink.
    '<feGaussianBlur in="moved" stdDeviation="0" result="fat"/>' +
    '<feColorMatrix in="fat" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="goo"/>' +
    // The goo is solid black ink, like the site's black components.
    '<feFlood flood-color="#000" result="ink"/>' +
    '<feComposite in="ink" in2="goo" operator="in" result="inkgoo"/>' +
    // The page itself fades into the ink as it melts (see apply()).
    '<feComponentTransfer in="moved" result="fading"><feFuncA type="linear" slope="1" intercept="0"/></feComponentTransfer>' +
    '<feMerge><feMergeNode in="inkgoo"/><feMergeNode in="fading"/></feMerge>' +
    '</filter>';
  document.body.appendChild(svg);
  var blurs = svg.querySelectorAll('feGaussianBlur');
  var blur = blurs[0], fatten = blurs[1];
  var disp = svg.querySelector('feDisplacementMap');
  var cut = svg.querySelector('#mush > feColorMatrix');
  var fade = svg.querySelector('#mush > feComponentTransfer[result="fading"] feFuncA');

  var resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'mush-reset';
  resetBtn.textContent = 'Reset';
  document.body.appendChild(resetBtn);

  var melt = 0, raf = 0, state = 'idle';

  function apply(m) {
    var vh = window.innerHeight;
    // Collapse onto the bottom edge of the screen: the page squashes down
    // towards it (the top falls furthest) and spreads a little sideways,
    // pooling there like a puddle while the drips run into it.
    stage.style.transform = m ? 'scale(' + (1 + 0.12 * m).toFixed(4) + ', ' + (1 - 0.78 * m).toFixed(4) + ')' : '';
    // Just enough softening before the sag to keep stretched edges smooth.
    blur.setAttribute('stdDeviation', (m * 1.5).toFixed(2));
    fatten.setAttribute('stdDeviation', (m * 12).toFixed(2));
    // With the green channel held under 0.5, the offset (g - 0.5) * scale
    // is always negative: every pixel samples from above it, by up to
    // scale / 2, so content only drips down.
    disp.setAttribute('scale', (m * vh * 0.55).toFixed(1));
    // Threshold eases in, so the very start is just a soft blur rather than
    // a sudden hardening of every antialiased edge.
    // The colours drain away into black ink partway through the melt, so by
    // the time it has pooled it's all ink; reforming brings them back.
    var ink = Math.min(1, Math.max(0, (m - 0.2) / 0.55));
    ink = ink * ink * (3 - 2 * ink);
    fade.setAttribute('slope', (1 - ink).toFixed(3));
    // A low cut keeps the soft, spread-out mass, so the lumps stay thick.
    var k = 1 + m * 26;
    cut.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ' + k.toFixed(2) + ' ' + (-(k - 1) * 0.18).toFixed(2));
  }

  function easeIn(x) { return x * x * x; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  function run(to, dur, done) {
    cancelAnimationFrame(raf);
    var from = melt, t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / 1000 / dur);
      // Melting starts slow and gathers pace; reforming snaps back quickly
      // then settles.
      var e = to > from ? easeIn(p) : easeOut(p);
      melt = from + (to - from) * e;
      apply(melt);
      if (p < 1) raf = requestAnimationFrame(step);
      else if (done) done();
    })(t0);
  }

  var holdTimer = 0;

  function mushOn() {
    if (state !== 'idle') return;
    state = 'melting';
    document.body.classList.add('is-mushed');
    // Squash towards the bottom edge of the screen, wherever the stage sits.
    var r = stage.getBoundingClientRect();
    stage.style.transformOrigin = (window.innerWidth / 2 - r.left) + 'px ' + (window.innerHeight - r.top) + 'px';
    stage.style.filter = 'url(#mush)';
    // Reset is available from the start, so it's never a trap.
    resetBtn.classList.add('is-visible');
    function melted() {
      state = 'mushed';
      // Sit in the mush for a moment, then pull back into shape on its own.
      holdTimer = setTimeout(mushOff, HOLD * 1000);
    }
    if (reduce) { melt = 1; apply(1); melted(); return; }
    run(1, MELT_IN, melted);
  }

  // Reforms from wherever the melt has got to: fully mushed, or partway.
  function mushOff() {
    if (state !== 'mushed' && state !== 'melting') return;
    clearTimeout(holdTimer);
    state = 'reforming';
    resetBtn.classList.remove('is-visible');
    function finish() {
      melt = 0;
      stage.style.filter = '';
      stage.style.transform = '';
      stage.style.transformOrigin = '';
      document.body.classList.remove('is-mushed');
      state = 'idle';
    }
    if (reduce) { finish(); return; }
    run(0, MELT_OUT * Math.max(0.4, melt), finish);
  }

  hint.addEventListener('click', function (e) {
    e.stopPropagation();
    mushOn();
  });
  resetBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    mushOff();
  });
  // Clicking anywhere on the mush, or Escape, also brings it back.
  document.addEventListener('click', function () {
    if (state === 'mushed' || state === 'melting') mushOff();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') mushOff();
  });
})();
