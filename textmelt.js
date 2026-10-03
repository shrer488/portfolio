/* Homepage text loading, after the text morph in Viscose by Yousuf Soomro
   (https://github.com/Yousuf-developer/Viscose-carousel, MIT).

   Each text block melts in: it starts heavily blurred and sharpens, while
   running through an alpha threshold that forces everything above a cut
   fully solid and drops the rest. Overlapping soft letters cross that cut
   as one shape, so each line arrives as a gooey blob that pulls apart into
   words and tightens into letters. Blocks follow one another down the page.

   The blur is animated on one SVG filter per block (a handful in all) from a
   single rAF loop, rather than per letter, which keeps it smooth while the
   intro fades out at the same moment.

   Starts when the intro (intro.js) hands over, or straight after load when
   the intro isn't playing. html.text-melt (set by an inline script in
   index.html's head) keeps the text hidden until this takes over. Skipped
   for reduced-motion users. */
(function () {
  var root = document.documentElement;
  var SEL = '.nav-link, .profile-name, .profile-role, .profile-bio, .project-title, ' +
    '.project-desc, .meta-label, .meta-list, .meta-stat, .meta-caption, .cursor-label';
  var DUR = 1.0;          // each block's melt, seconds
  var STAGGER = 0.08;     // between blocks
  var NS = 'http://www.w3.org/2000/svg';

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.remove('text-melt');
    return;
  }

  var blocks = Array.prototype.slice.call(document.querySelectorAll(SEL));

  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  document.body.appendChild(svg);

  // One filter per block, in that block's own text colour, so grey text
  // stays grey (a plain threshold would push it to solid).
  var plan = blocks.map(function (b, i) {
    var cs = getComputedStyle(b);
    var id = 'melt-' + i;
    svg.insertAdjacentHTML('beforeend',
      '<filter id="' + id + '" x="-10%" y="-60%" width="120%" height="220%" color-interpolation-filters="sRGB">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="0"/>' +
      '<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 20 -8" result="mask"/>' +
      '<feFlood flood-color="' + cs.color + '"/>' +
      '<feComposite in2="mask" operator="in"/>' +
      '</filter>');
    // Some blocks (the dimmed nav links) have their own resting opacity;
    // fade up to that rather than to full, so nothing jumps at the end.
    var base = parseFloat(cs.opacity);
    b.style.opacity = '0';
    return {
      block: b,
      base: isNaN(base) ? 1 : base,
      id: id,
      blur: svg.lastChild.firstChild,
      fs: parseFloat(cs.fontSize) || 16,
      delay: i * STAGGER,
      done: false
    };
  });
  root.classList.remove('text-melt');

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  var started = false, t0 = 0;
  function frame(now) {
    var t = (now - t0) / 1000;
    var busy = false;
    plan.forEach(function (p) {
      if (p.done) return;
      var q = Math.max(0, Math.min(1, (t - p.delay) / DUR));
      if (q <= 0) { busy = true; return; }
      if (q < 1) {
        busy = true;
        if (!p.block.style.filter) p.block.style.filter = 'url(#' + p.id + ')';
        var e = easeOut(q);
        p.blur.setAttribute('stdDeviation', (p.fs * 0.45 * (1 - e)).toFixed(2));
        p.block.style.opacity = (p.base * Math.min(1, q * 3)).toFixed(3);
      } else {
        // Settled: hand the block back with no filter, so its edges are
        // ordinary antialiased text again.
        p.done = true;
        p.block.style.filter = '';
        p.block.style.opacity = '';
      }
    });
    if (busy) requestAnimationFrame(frame);
    else svg.remove();
  }

  function start() {
    if (started) return;
    started = true;
    requestAnimationFrame(function (now) { t0 = now; frame(now); });
  }

  if (document.querySelector('.intro')) window.addEventListener('intro:done', start);
  else if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
  // Safety net: never leave the text hidden.
  setTimeout(start, 12000);
})();
