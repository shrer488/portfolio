/* Shared page-transition overlay: every page carries the same #pageTransition
   div (see transition.css) already covering the screen on first paint. As
   soon as the page is parsed, this lifts it away to reveal the page. On any
   internal link click, it plays that same cover-and-blur animation forward,
   then hands off to the real navigation once the overlay has fully closed —
   so leaving one page and arriving at the next reads as a single motion
   instead of a cut. window.pageTransition.navigate() is exposed so
   script.js's own carousel click-to-navigate can route through the same
   animation instead of jumping straight to window.location. */
(function () {
  var DURATION = 850; // matches the CSS transition duration in transition.css
  var HOLD = 120; // extra pause once fully covered, so the swap never lands mid-motion
  var isNavigating = false; // guards against a second click re-triggering navigate()
  // mid-animation — without this, an impatient double-click queued two
  // competing `window.location` assignments and looked like the transition
  // restarting/glitching partway through.

  function getOverlay() {
    return document.getElementById('pageTransition');
  }

  function reveal() {
    // If a link has already been clicked (isNavigating), the user is
    // leaving this page — a late `load` event firing after that must NOT
    // re-open the shutters, or it fights the close animation already in
    // flight and the page briefly reopens before the real navigation cuts
    // it off, reading as a glitch.
    if (isNavigating) return;
    var overlay = getOverlay();
    if (!overlay || overlay.classList.contains('is-revealed')) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('is-revealed');
      });
    });
  }

  // Waiting for the full `load` event (every image decoded) before opening
  // was tried, but on an image-heavy page that wait itself was the
  // problem: the shutters would sit fully closed — just a flat, glassless
  // white panel with nothing loaded yet behind it to blur — for however
  // long the hero images took. Opening as soon as the DOM is parsed keeps
  // that closed period brief instead.
  function scheduleReveal() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', reveal);
    } else {
      reveal();
    }
  }

  function navigate(href) {
    if (isNavigating) return;
    isNavigating = true;

    var overlay = getOverlay();
    if (!overlay) {
      window.location.href = href;
      return;
    }
    overlay.classList.remove('is-revealed');
    window.setTimeout(function () {
      window.location.href = href;
    }, DURATION + HOLD);
  }

  window.pageTransition = { navigate: navigate };

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
    navigate(href);
  });
})();

/* Site-wide custom cursor: a small black dot that follows the mouse and
   grows over anything clickable. Mouse/trackpad only — touch devices keep
   their native behavior. Steps aside for the homepage's "View" pill and the
   fog-wipe flower cursor, which each draw their own. */
(function () {
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var style = document.createElement('style');
  style.textContent =
    'html.has-dot-cursor, html.has-dot-cursor * { cursor: none !important; }' +
    '.dot-cursor { position: fixed; top: 0; left: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px;' +
    ' border-radius: 50%; background: #000; pointer-events: none; z-index: 10000;' +
    ' opacity: 0; transition: opacity 0.2s ease, transform 0.2s ease; will-change: transform; }' +
    '.dot-cursor.is-visible { opacity: 1; }' +
    '.dot-cursor.is-hover { transform: scale(2.4); }' +
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
    var fogActive = document.body.classList.contains('fog-active');
    dot.classList.toggle('is-hidden', !!viewCursor || fogActive);

    var target = e.target && e.target.closest ? e.target.closest(CLICKABLE) : null;
    dot.classList.toggle('is-hover', !!target);
  });

  document.addEventListener('mouseleave', function () {
    dot.classList.remove('is-visible');
  });
})();
