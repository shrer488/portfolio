(function () {
  var indexEl = document.getElementById('playIndex');
  var bioEl = document.getElementById('playBio');
  if (!indexEl || !bioEl) return;


  var items = Array.prototype.slice.call(document.querySelectorAll('.play-item'));

  // Text changes the way the homepage's project details do (script.js
  // swapPanels): the old words drift up, blur and fade out one after
  // another, then the new ones rise in from below and settle. Same
  // timings and easing as there.
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var STEP = 14, MAXD = 280, SHIFT = 0.5;   // ms between words, cap, em of travel

  // Wrap each word in an inline-block span so it can move. Handles both
  // plain text and the per-letter spans smear.js adds.
  function words(el) {
    if (el.querySelector('.swap-word')) return el.querySelectorAll('.swap-word');
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(function (tn) {
      var parent = tn.parentNode;
      if (!tn.nodeValue.trim() || parent.classList.contains('smear-ch')) return;
      var frag = document.createDocumentFragment();
      tn.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var w = document.createElement('span');
        w.className = 'swap-word';
        w.textContent = part;
        frag.appendChild(w);
      });
      parent.replaceChild(frag, tn);
    });
    Array.prototype.forEach.call(el.querySelectorAll('.smear-ch'), function (ch) {
      if (ch.parentNode.classList.contains('swap-word')) return;
      var w = document.createElement('span');
      w.className = 'swap-word';
      ch.parentNode.insertBefore(w, ch);
      var n = ch;
      while (n && n.nodeType === 1 && n.classList.contains('smear-ch')) {
        var next = n.nextSibling;
        w.appendChild(n);
        n = next;
      }
    });
    return el.querySelectorAll('.swap-word');
  }

  // Swap el's text to `text`. `animateOut` false skips straight to the
  // words rising in (used when nothing is showing yet).
  function swapText(el, text, animateOut) {
    var st = el._swap || (el._swap = { anims: [], timer: 0, token: 0 });
    var token = ++st.token;
    clearTimeout(st.timer);
    st.anims.forEach(function (a) { a.cancel(); });
    st.anims = [];
    if (reduceMotion || !el.animate) { el.textContent = text; return; }
    if (el._swapText === text && !animateOut) return;
    el._swapText = text;
    function bringIn() {
      if (token !== st.token) return;
      el.textContent = text;
      // smear.js re-wraps the new text into letters on a microtask; group
      // into words after that.
      Promise.resolve().then(function () {
        if (token !== st.token) return;
        Array.prototype.forEach.call(words(el), function (w, i) {
          st.anims.push(w.animate([
            { transform: 'translateY(' + SHIFT + 'em)', filter: 'blur(3px)', opacity: 0 },
            { transform: 'translateY(' + (SHIFT * 0.3) + 'em)', filter: 'blur(0.5px)', opacity: 0.9, offset: 0.5 },
            { transform: 'translateY(0)', filter: 'blur(0)', opacity: 1 }
          ], { duration: 760, delay: Math.min(i * STEP, MAXD), easing: 'cubic-bezier(0.33, 0.1, 0.25, 1)', fill: 'backwards' }));
        });
      });
    }
    if (!animateOut) { bringIn(); return; }
    Array.prototype.forEach.call(words(el), function (w, i) {
      st.anims.push(w.animate([
        { transform: 'translateY(0)', filter: 'blur(0)', opacity: 1 },
        { transform: 'translateY(' + (-SHIFT * 0.5) + 'em)', filter: 'blur(1px)', opacity: 0.2, offset: 0.5 },
        { transform: 'translateY(' + (-SHIFT) + 'em)', filter: 'blur(3px)', opacity: 0 }
      ], { duration: 520, delay: Math.min(i * STEP, MAXD), easing: 'cubic-bezier(0.37, 0, 0.63, 1)', fill: 'forwards' }));
    });
    // The new words start once the old ones have mostly cleared.
    st.timer = setTimeout(bringIn, 440);
  }

  // Moving from one tile straight onto another swaps the text in place;
  // leaving the grid altogether hides the rail (after a beat, so the gap
  // between two tiles doesn't count as leaving).
  var hideTimer = 0, showing = false;
  items.forEach(function (item) {
    var num = item.dataset.num;
    var caption = item.dataset.caption;
    if (!num || !caption || !canHover) return;   // no hover states on touch

    item.addEventListener('mouseenter', function () {
      clearTimeout(hideTimer);
      swapText(indexEl, num, showing);
      swapText(bioEl, caption, showing);
      showing = true;
      indexEl.classList.add('is-visible');
      bioEl.classList.add('is-visible');
    });

    item.addEventListener('mouseleave', function () {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        showing = false;
        indexEl.classList.remove('is-visible');
        bioEl.classList.remove('is-visible');
      }, 150);
    });
  });
})();

// Columns meter (top-left, upright): 1, 2 or 3 columns of pictures,
// remembered in this browser. Click or drag along the ruler (it snaps to
// the nearest setting) or use the arrow keys. The bar springs along and the
// ticks it passes darken; the pictures simply re-flow (animating them made
// the page lag). One wide column gets a gentler hover grow, so a tile never
// spills into the next.
(function () {
  var grid = document.querySelector('.play-grid');
  var meter = document.querySelector('.play-meter');
  if (!grid || !meter) return;
  var ticksBox = meter.querySelector('.play-meter-ticks');
  var ticks = Array.prototype.slice.call(ticksBox.querySelectorAll('i'));
  var cur = 0;

  function sweep(from, to) {
    var a = (from - 1) * 6, b = (to - 1) * 6, step = a < b ? 1 : -1, k = 0;
    for (var t = a + step; t !== b; t += step, k++) {
      (function (tick, delay) {
        setTimeout(function () {
          tick.classList.add('is-pass');
          setTimeout(function () { tick.classList.remove('is-pass'); }, 200);
        }, delay);
      })(ticks[t], k * 35);
    }
  }
  function apply(n) {
    grid.style.setProperty('--play-cols', n);
    grid.style.setProperty('--play-hover', n === 1 ? 1.012 : n === 2 ? 1.025 : 1.03);
    window.dispatchEvent(new Event('playcols'));   // the tiles re-deal (below)
  }
  function set(n, save) {
    n = Math.max(1, Math.min(3, n));
    if (n === cur) return;
    var first = !cur;
    if (!first) sweep(cur, n);
    cur = n;
    meter.style.setProperty('--p', (n - 1) / 2);
    meter.setAttribute('aria-valuenow', n);
    meter.setAttribute('aria-valuetext', n + (n === 1 ? ' column' : ' columns'));
    if (save) { try { localStorage.setItem('playCols', n); } catch (e) {} }
    apply(n);
  }
  var saved = 2;
  try { saved = +localStorage.getItem('playCols') || 2; } catch (e) {}
  set(saved >= 1 && saved <= 3 ? saved : 2, false);

  function at(e) {
    var r = ticksBox.getBoundingClientRect();
    var p = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    set(Math.round(p * 2) + 1, true);
  }
  var dragging = false;
  meter.addEventListener('pointerdown', function (e) {
    dragging = true; at(e);
    try { meter.setPointerCapture(e.pointerId); } catch (err) {}
  });
  meter.addEventListener('pointermove', function (e) { if (dragging) at(e); });
  meter.addEventListener('pointerup', function () { dragging = false; });
  meter.addEventListener('pointercancel', function () { dragging = false; });
  meter.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { set(cur - 1, true); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { set(cur + 1, true); e.preventDefault(); }
    else if (e.key === 'Home') { set(1, true); e.preventDefault(); }
    else if (e.key === 'End') { set(3, true); e.preventDefault(); }
  });
})();

// Reading order: CSS columns fill top to bottom, so the numbering ran down
// the first column. Instead deal each category's tiles into one stack per
// column in turn (tile 1 to the first column, 2 to the second, 3 to the
// third, 4 back to the first...), so 01, 02, 03 run across the top. The
// number of columns follows the meter on desktop, and the screen on
// tablets (2) and phones (1); re-dealt when that changes.
(function () {
  var cats = Array.prototype.slice.call(document.querySelectorAll('.play-cat-items'));
  var grid = document.querySelector('.play-grid');
  if (!cats.length || !grid) return;
  var lists = cats.map(function (c) { return Array.prototype.slice.call(c.querySelectorAll('.play-item')); });
  var dealt = 0;
  function count() {
    var w = window.innerWidth;
    if (w <= 780) return 1;
    if (w <= 900) return 2;
    return parseInt(getComputedStyle(grid).getPropertyValue('--play-cols'), 10) || 2;
  }
  function deal() {
    var n = count();
    if (n === dealt) return;
    dealt = n;
    cats.forEach(function (c, k) {
      var stacks = [];
      for (var i = 0; i < n; i++) {
        var st = document.createElement('div');
        st.className = 'play-stack';
        stacks.push(st);
      }
      lists[k].forEach(function (item, i) { stacks[i % n].appendChild(item); });
      c.textContent = '';
      stacks.forEach(function (st) { c.appendChild(st); });
      c.classList.add('is-stacked');
    });
    window.dispatchEvent(new Event('playdealt'));   // the videos re-check (below)
  }
  deal();
  window.addEventListener('playcols', deal);
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(deal, 120); });
})();

// Tiles that link out (.play-item--link): over one, the cursor becomes a
// pill with the tile's call to action ("Get Extension ↗", data-cta).
// Clicking opens the link in a new tab (it's a plain link). Mouse only.
(function () {
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var links = Array.prototype.slice.call(document.querySelectorAll('.play-item--link'));
  if (!links.length) return;
  var pill = document.createElement('div');
  pill.className = 'view-cursor play-view-cursor';
  pill.setAttribute('aria-hidden', 'true');
  pill.innerHTML = '<span class="play-view-label">View</span><svg viewBox="0 0 14 14" width="13" height="13"><path d="M3 11L11 3M11 3H4.5M11 3V9.5" /></svg>';
  document.body.appendChild(pill);
  var label = pill.querySelector('.play-view-label');
  function move(e) {
    pill.style.transform = 'translate3d(' + e.clientX + 'px, ' + e.clientY + 'px, 0) translate(-50%, -50%)';
  }
  links.forEach(function (tile) {
    tile.addEventListener('mouseenter', function (e) {
      label.textContent = tile.getAttribute('data-cta') || 'View';
      move(e);
      pill.classList.add('visible');
    });
    tile.addEventListener('mousemove', move);
    tile.addEventListener('mouseleave', function () { pill.classList.remove('visible'); });
  });
})();

// Videos play only while they're on screen (and pause once scrolled past),
// so the page isn't decoding every clip at once; each one only starts
// downloading as it comes near. Re-checked after the tiles are re-dealt,
// since moving a video pauses it.
(function () {
  var vids = Array.prototype.slice.call(document.querySelectorAll('.play-item video[data-autoplay]'));
  if (!vids.length) return;
  var seen = new Set();
  function run(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  if (typeof IntersectionObserver === 'undefined') { vids.forEach(function (v) { v.autoplay = true; run(v); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { seen.add(e.target); run(e.target); }
      else { seen.delete(e.target); e.target.pause(); }
    });
  }, { rootMargin: '200px 0px' });
  vids.forEach(function (v) { io.observe(v); });
  window.addEventListener('playdealt', function () { seen.forEach(run); });
})();
