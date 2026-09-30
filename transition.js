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
