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

  // Lightbox: click any tile to see it large, with the same number/
  // caption treatment as the left rail, plus a thumbnail strip to jump
  // between images — matches the Figma expanded-image frame.
  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightboxImg');
  var lightboxVideo = document.getElementById('lightboxVideo');
  var lightboxIndex = document.getElementById('lightboxIndex');
  var lightboxCaption = document.getElementById('lightboxCaption');
  var lightboxClose = document.getElementById('lightboxClose');
  var lightboxPrev = document.getElementById('lightboxPrev');
  var lightboxNext = document.getElementById('lightboxNext');
  var lightboxStrip = document.getElementById('lightboxStrip');
  var lightboxStage = document.querySelector('.lightbox-stage');
  if (!lightbox || !lightboxImg || !lightboxStrip) return;

  var thumbs = [];

  items.forEach(function (item, i) {
    var num = item.dataset.num;
    var caption = item.dataset.caption;
    if (!num || !caption) return;

    var video = item.querySelector('video');
    var mainImg = item.querySelector('.play-stack-front') || item.querySelector('img');
    // A video-only tile has no <img> to key off of — its poster frame
    // stands in for the thumbnail strip (which is always plain <img>s).
    var thumbSrc = mainImg ? mainImg.src : (video ? video.poster : '');
    if (!thumbSrc) return;

    var thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'lightbox-thumb';
    thumb.innerHTML = '<img src="' + thumbSrc + '" alt="" />';
    thumb.addEventListener('click', function () {
      if (lightbox.classList.contains('is-open')) {
        switchImage(i);
      } else {
        openLightbox(i);
      }
    });
    lightboxStrip.appendChild(thumb);
    thumbs.push(thumb);

    item.addEventListener('click', function () {
      openLightbox(i);
    });
  });

  // Just paints the given item's content into the lightbox — no animation
  // of its own. Both openLightbox (instant; the popup itself is already
  // animating in, so the content doesn't need its own fade) and
  // switchImage (crossfades, see below) go through this.
  function renderLightbox(i) {
    var item = items[i];
    var num = item.dataset.num;
    var caption = item.dataset.caption;
    var video = item.querySelector('video');
    var mainImg = item.querySelector('.play-stack-front') || item.querySelector('img');
    if (!num || !caption || (!mainImg && !video)) return false;

    // Video tiles play for real in the lightbox (unlike the grid, which
    // just loops silently in the background) — swap which element is
    // visible rather than keeping both around at once.
    if (video) {
      var targetSrc = video.currentSrc || video.getAttribute('src');
      lightboxImg.style.display = 'none';
      lightboxImg.removeAttribute('src');
      lightboxVideo.style.display = '';
      lightboxVideo.poster = video.poster || '';
      lightboxVideo.loop = true;
      if (lightboxVideo.getAttribute('src') !== targetSrc) {
        lightboxVideo.src = targetSrc;
      }
      lightboxVideo.currentTime = 0;
      lightboxVideo.play().catch(function () {});
    } else {
      lightboxVideo.pause();
      lightboxVideo.style.display = 'none';
      lightboxVideo.removeAttribute('src');
      lightboxImg.style.display = '';
      lightboxImg.src = mainImg.src;
      lightboxImg.alt = mainImg.alt || '';
    }

    // Stepping between images in the lightbox swaps the caption the same
    // way; opening it just shows the text.
    var stepping = lightbox.classList.contains('is-open');
    swapText(lightboxIndex, num, stepping && lightboxIndex.textContent !== num);
    swapText(lightboxCaption, caption, stepping && lightboxCaption.textContent !== caption);

    thumbs.forEach(function (thumb, ti) {
      thumb.classList.toggle('is-active', ti === i);
    });

    lightbox.dataset.activeIndex = String(i);
    return true;
  }

  function openLightbox(i) {
    if (!renderLightbox(i)) return;
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    lockScroll();
  }

  // Used to move to a different image while the lightbox is already open
  // (arrow keys, scroll — see advance() below). Swapping lightboxImg.src
  // instantly made moving through images feel like a hard cut; fading the
  // stage out, swapping underneath, then fading back in reads as one
  // continuous, smoother motion instead.
  var SWITCH_FADE_MS = 180;
  var switchTimer = null;

  function switchImage(i) {
    lightboxStage.classList.add('is-switching');
    clearTimeout(switchTimer);
    switchTimer = setTimeout(function () {
      renderLightbox(i);
      lightboxStage.classList.remove('is-switching');
    }, SWITCH_FADE_MS);
  }

  function closeLightbox() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxVideo.pause();
    unlockScroll();
  }

  // Freezes the page at its current scroll position (rather than just
  // hiding overflow) so the background doesn't jump to the top while
  // the lightbox is open, then restores it on close.
  var savedScrollY = 0;

  function lockScroll() {
    savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = -savedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
  }

  function unlockScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, savedScrollY);
  }

  lightboxClose.addEventListener('click', closeLightbox);

  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  if (lightboxPrev) lightboxPrev.addEventListener('click', function () { advance(-1); });
  if (lightboxNext) lightboxNext.addEventListener('click', function () { advance(1); });

  // Shared by the arrow keys and the wheel handler below, so "next image"
  // means the same thing regardless of input method.
  function advance(direction) {
    var current = Number(lightbox.dataset.activeIndex || 0);
    var next = direction > 0
      ? (current + 1) % items.length
      : (current - 1 + items.length) % items.length;
    switchImage(next);
  }

  document.addEventListener('keydown', function (e) {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      advance(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  // Scrolling while the lightbox is open steps through images one at a
  // time instead of doing nothing (the page itself is scroll-locked while
  // open — see lockScroll).
  //
  // This accumulates scroll distance rather than reacting to a single
  // tick: a low per-tick threshold (an earlier pass used 12) meant almost
  // any trackpad movement counted, and a slow, steady scroll kept
  // re-triggering every time the cooldown expired — racing through
  // several images from one continuous gesture, which is what read as
  // janky/uncontrollable. Requiring a real accumulated distance makes one
  // deliberate swipe advance exactly one image; drifting below that (or
  // pausing) resets the count instead of leaving it to fire late.
  var wheelLocked = false;
  var wheelAccum = 0;
  var wheelResetTimer = null;
  var WHEEL_COOLDOWN_MS = 400;
  var WHEEL_SWITCH_THRESHOLD = 120;
  var WHEEL_IDLE_RESET_MS = 300;

  lightbox.addEventListener('wheel', function (e) {
    if (!lightbox.classList.contains('is-open')) return;
    e.preventDefault();
    if (wheelLocked) return;

    var delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 1) return;

    // Reversing direction mid-gesture restarts the accumulation the
    // other way instead of fighting the previous direction's progress.
    if ((delta > 0 && wheelAccum < 0) || (delta < 0 && wheelAccum > 0)) {
      wheelAccum = 0;
    }
    wheelAccum += delta;

    clearTimeout(wheelResetTimer);
    wheelResetTimer = setTimeout(function () {
      wheelAccum = 0;
    }, WHEEL_IDLE_RESET_MS);

    if (Math.abs(wheelAccum) < WHEEL_SWITCH_THRESHOLD) return;

    wheelLocked = true;
    wheelAccum = 0;
    clearTimeout(wheelResetTimer);
    advance(delta > 0 ? 1 : -1);
    setTimeout(function () {
      wheelLocked = false;
    }, WHEEL_COOLDOWN_MS);
  }, { passive: false });
})();
