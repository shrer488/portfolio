(function () {
  var stage = document.getElementById('stage');
  var page = stage.querySelector('.page');
  var CANVAS_WIDTH = 1440;
  var CANVAS_HEIGHT = 838;
  var BREAKPOINT = 1440;
  // Below this, styles.css's own mobile media query (max-width: 780px,
  // matching about.css/play.css's convention) takes over with a real
  // stacked mobile layout instead of the tablet range's uniform shrink —
  // that layout needs the canvas at its natural, unscaled size, so this
  // range is excluded from the scale-transform below exactly like the
  // >=1440 case already is.
  var MOBILE_BREAKPOINT = 780;

  function resize() {
    if (window.innerWidth >= BREAKPOINT || window.innerWidth < MOBILE_BREAKPOINT) {
      // Large screens: fluid layout defined in styles.css takes over.
      // Small screens: styles.css's own mobile stacked layout takes over.
      page.style.transform = '';
      stage.style.width = '';
      stage.style.height = '';
      return;
    }

    // Mid-sized screens (tablets, between the mobile and desktop
    // breakpoints): uniformly scale the fixed 1440x838 canvas to fit the
    // viewport so nothing stretches and nothing is cut off.
    var scale = Math.min(
      window.innerWidth / CANVAS_WIDTH,
      window.innerHeight / CANVAS_HEIGHT
    );
    page.style.transform = 'scale(' + scale + ')';
    stage.style.width = (CANVAS_WIDTH * scale) + 'px';
    stage.style.height = (CANVAS_HEIGHT * scale) + 'px';
  }

  window.addEventListener('resize', resize);
  resize();
})();

// Keeps .carousel-wrap (visibility:hidden by default, see styles.css) off
// the very first paint(s), where its own overflow:hidden can visibly lag
// behind its stacked children — most reliably triggered by the hero
// number's web font swapping in and forcing a reflow right as the page
// settles. Waiting for window 'load' (fonts, images, everything) plus one
// extra frame, rather than DOMContentLoaded, is what actually lands after
// that reflow instead of just before it.
window.addEventListener('load', function () {
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var wrap = document.querySelector('.carousel-wrap');
      if (wrap) wrap.classList.add('is-ready');
    });
  });
});

// Hovering a slide's image plays its video (placeholder source, same clip
// on every slide for now) in place of the static shot; leaving it pauses
// and rewinds so it starts fresh next time. CSS handles the opacity
// cross-fade — this just drives actual playback, which opacity alone
// doesn't touch. The same hover also swaps in a custom "View ↗" cursor
// (following the real pointer via mousemove) in place of the system one,
// and clicking navigates to that project's case study (one dummy page for
// every project for now — the point is the click-through/nav being wired
// up, not five distinct pages yet).
(function () {
  var viewCursor = document.getElementById('viewCursor');

  // On first load the videos wait until the homepage text has finished
  // melting in (textmelt.js), plus half a second, so the landing image
  // doesn't start playing while the page is still assembling. If the
  // pointer is already resting on an image by then, its video starts.
  var VIDEO_DELAY = 500;
  var videosReady = false;
  function readyVideos() {
    if (videosReady) return;
    videosReady = true;
    document.documentElement.classList.add('videos-ready');
    Array.prototype.forEach.call(document.querySelectorAll('.slide-inner'), function (inner) {
      var v = inner.querySelector('.slide-video');
      if (v && inner.matches(':hover')) { v.currentTime = 0; v.play().catch(function () {}); }
    });
  }
  window.addEventListener('textmelt:done', function () { setTimeout(readyVideos, VIDEO_DELAY); });
  setTimeout(readyVideos, 20000);   // never leave them off

  function moveCursor(e) {
    viewCursor.style.left = e.clientX + 'px';
    viewCursor.style.top = e.clientY + 'px';
  }

  Array.prototype.forEach.call(document.querySelectorAll('.slide-inner'), function (inner) {
    var video = inner.querySelector('.slide-video');
    inner.addEventListener('mouseenter', function (e) {
      if (video && videosReady) {
        video.currentTime = 0;
        video.play().catch(function () {});
      }
      if (viewCursor) {
        moveCursor(e);
        viewCursor.classList.add('visible');
        inner.style.cursor = 'none';
        inner.addEventListener('mousemove', moveCursor);
      }
    });
    inner.addEventListener('mouseleave', function () {
      if (video) video.pause();
      if (viewCursor) {
        viewCursor.classList.remove('visible');
        inner.style.cursor = '';
        inner.removeEventListener('mousemove', moveCursor);
      }
    });
    inner.addEventListener('click', function (e) {
      var slide = inner.closest('.slide');
      var href = (slide && slide.dataset.href) || 'case-study.html';
      if (window.pageTransition) {
        window.pageTransition.navigate(href, e.clientX, e.clientY);
      } else {
        window.location.href = href;
      }
    });
  });
})();

/* verticalLoop: GreenSock's public "seamless loop" helper function
   (MIT-licensed, from https://gsap.com/docs/v3/HelperFunctions/helpers/seamlessLoop/),
   adapted for the y-axis. Pasted in verbatim (not loaded from a second CDN
   URL) so there's one fewer network dependency. Makes a group of elements
   loop infinitely via yPercent transforms — no DOM cloning, no scroll
   boundaries to detect. See the big comment above .carousel-wrap in
   styles.css for why this replaced the native-scroll approach. */
function verticalLoop(items, config) {
  items = gsap.utils.toArray(items);
  config = config || {};
  let onChange = config.onChange,
    lastIndex = 0,
    tl = gsap.timeline({
      repeat: config.repeat,
      onUpdate:
        onChange &&
        function () {
          let i = tl.closestIndex();
          if (lastIndex !== i) {
            lastIndex = i;
            onChange(items[i], i);
          }
        },
      paused: config.paused,
      defaults: { ease: 'none' },
      onReverseComplete: () => tl.totalTime(tl.rawTime() + tl.duration() * 100)
    }),
    length = items.length,
    startY = items[0].offsetTop,
    times = [],
    heights = [],
    spaceBefore = [],
    yPercents = [],
    curIndex = 0,
    center = config.center,
    clone = (obj) => {
      let result = {}, p;
      for (p in obj) result[p] = obj[p];
      return result;
    },
    pixelsPerSecond = (config.speed || 1) * 100,
    snap = config.snap === false ? (v) => v : gsap.utils.snap(config.snap || 1),
    timeOffset = 0,
    container = center === true ? items[0].parentNode : gsap.utils.toArray(center)[0] || items[0].parentNode,
    totalHeight,
    getTotalHeight = () =>
      items[length - 1].offsetTop +
      (yPercents[length - 1] / 100) * heights[length - 1] -
      startY +
      spaceBefore[0] +
      items[length - 1].offsetHeight * gsap.getProperty(items[length - 1], 'scaleY') +
      (parseFloat(config.paddingBottom) || 0),
    populateHeights = () => {
      let b1 = container.getBoundingClientRect(), b2;
      items.forEach((el, i) => {
        heights[i] = parseFloat(gsap.getProperty(el, 'height', 'px'));
        yPercents[i] = snap(
          (parseFloat(gsap.getProperty(el, 'y', 'px')) / heights[i]) * 100 + gsap.getProperty(el, 'yPercent')
        );
        b2 = el.getBoundingClientRect();
        spaceBefore[i] = b2.top - (i ? b1.bottom : b1.top);
        b1 = b2;
      });
      gsap.set(items, { yPercent: (i) => yPercents[i] });
      totalHeight = getTotalHeight();
    },
    timeWrap,
    populateOffsets = () => {
      // Original helper used container.offsetWidth here (copy-pasted from
      // the horizontal version); offsetHeight is correct for a y-axis loop.
      timeOffset = center ? (tl.duration() * (container.offsetHeight / 2)) / totalHeight : 0;
      center &&
        times.forEach((t, i) => {
          times[i] = timeWrap(
            tl.labels['label' + i] + (tl.duration() * heights[i]) / 2 / totalHeight - timeOffset
          );
        });
    },
    getClosest = (values, value, wrap) => {
      let i = values.length, closest = 1e10, index = 0, d;
      while (i--) {
        d = Math.abs(values[i] - value);
        if (d > wrap / 2) d = wrap - d;
        if (d < closest) {
          closest = d;
          index = i;
        }
      }
      return index;
    },
    populateTimeline = () => {
      let i, item, curY, distanceToStart, distanceToLoop;
      tl.clear();
      for (i = 0; i < length; i++) {
        item = items[i];
        curY = (yPercents[i] / 100) * heights[i];
        distanceToStart = item.offsetTop + curY - startY + spaceBefore[0];
        distanceToLoop = distanceToStart + heights[i] * gsap.getProperty(item, 'scaleY');
        tl.to(
          item,
          {
            yPercent: snap(((curY - distanceToLoop) / heights[i]) * 100),
            duration: distanceToLoop / pixelsPerSecond
          },
          0
        )
          .fromTo(
            item,
            { yPercent: snap(((curY - distanceToLoop + totalHeight) / heights[i]) * 100) },
            {
              yPercent: yPercents[i],
              duration: (curY - distanceToLoop + totalHeight - curY) / pixelsPerSecond,
              immediateRender: false
            },
            distanceToLoop / pixelsPerSecond
          )
          .add('label' + i, distanceToStart / pixelsPerSecond);
        times[i] = distanceToStart / pixelsPerSecond;
      }
      timeWrap = gsap.utils.wrap(0, tl.duration());
    },
    proxy;
  gsap.set(items, { y: 0 });
  populateHeights();
  populateTimeline();
  populateOffsets();
  // GSAP's original helper re-measures and repositions everything on every
  // window resize — meant for loops whose item sizes are actually fluid.
  // Ours aren't: .stage/.page is a fixed 1440x838 canvas that a *separate*
  // script (top of this file) scales visually via CSS transform, so the
  // underlying layout (in canvas units) never changes with viewport size.
  // Worse, re-measuring through that transform is unsafe: spaceBefore[] is
  // measured via getBoundingClientRect (screen pixels, i.e. scaled) while
  // heights[]/offsetTop are measured via raw CSS box-model properties (i.e.
  // unscaled) — a resize can shift the two independently, and refresh()
  // below restores the *old* progress fraction onto freshly-rebuilt (now
  // mismatched) tween geometry with events suppressed, silently moving the
  // active slide to a new position without firing onChange/setActive to
  // update its label. Any resize event — a scrollbar toggling, a mobile
  // browser's address bar hiding, even a 1px viewport nudge — could trigger
  // this, which is exactly what "it randomly scrolls by itself" looked like.
  // Not listening for resize at all removes the whole class of bug (and
  // the refresh() function that only that listener called is gone with it).
  function toIndex(index, vars) {
    vars = clone(vars);
    Math.abs(index - curIndex) > length / 2 && (index += index > curIndex ? -length : length);
    let newIndex = gsap.utils.wrap(0, length, index),
      time = times[newIndex];
    if (time > tl.time() !== index > curIndex) {
      time += tl.duration() * (index > curIndex ? 1 : -1);
    }
    if (vars.revolutions) {
      time += tl.duration() * Math.round(vars.revolutions);
      delete vars.revolutions;
    }
    if (time < 0 || time > tl.duration()) {
      vars.modifiers = { time: timeWrap };
    }
    curIndex = newIndex;
    vars.overwrite = true;
    gsap.killTweensOf(proxy);
    return tl.tweenTo(time, vars);
  }
  tl.elements = items;
  tl.next = (vars) => toIndex(curIndex + 1, vars);
  tl.previous = (vars) => toIndex(curIndex - 1, vars);
  tl.current = () => curIndex;
  tl.toIndex = (index, vars) => toIndex(index, vars);
  tl.closestIndex = (setCurrent) => {
    let index = getClosest(times, tl.time(), tl.duration());
    setCurrent && (curIndex = index);
    return index;
  };
  tl.times = times;
  tl.progress(1, true).progress(0, true);
  if (config.reversed) {
    tl.vars.onReverseComplete();
    tl.reverse();
  }
  tl.closestIndex(true);
  onChange && onChange(items[curIndex], curIndex);
  return tl;
}

(function () {
  var carousel = document.getElementById('carousel');
  var carouselWrap = document.querySelector('.carousel-wrap');
  if (!carousel || typeof gsap === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger, Observer);

  var slides = Array.prototype.slice.call(carousel.querySelectorAll('.slide'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.project-panel'));
  var heroNumber = document.querySelector('.hero-number');
  var digitSlots = heroNumber ? Array.prototype.slice.call(heroNumber.querySelectorAll('.digit-slot')) : [];
  var length = slides.length;

  // Shared with the settle tween and the .slide-inner CSS transition
  // (styles.css) further down — the image takes this long to finish
  // growing into its active size once a slide becomes active. Making the
  // number's own change take the same fixed duration, triggered at the
  // same instant, is what keeps the two finishing together regardless of
  // how fast the user scrolled through the crossing. An earlier version
  // tied the number's position directly to raw scroll instead, which
  // completed instantly at the crossing point no matter what — visibly
  // "snapping" well before the image, still 0.9s into its own transition,
  // caught up.
  var TRANSITION_DURATION = 0.9;
  var TRANSITION_EASE = 'sine.out';

  // The tens digit is never touched by JS at all: for 01-05 it's always
  // "0", so it's left exactly as the static markup has it. Only the ones
  // digit ever changes.
  var onesSlot = digitSlots[1];
  var onesStrip = onesSlot && onesSlot.querySelector('.digit-strip');
  var onesRollToken = 0;
  // Tracked explicitly rather than read back from the DOM (the previous
  // version did `onesStrip.querySelector('.digit-val')` and took whichever
  // span came first) — mid-roll, the strip holds two spans, and which one
  // is "first" depends on direction (direction -1 puts the new target
  // first, to get the downward-roll stacking). If a second roll fires
  // before the first finishes — a fast scroll landing on two index
  // crossings inside one settle-debounce window is a completely normal
  // way to trigger that, not an edge case — reading DOM order picked up
  // the wrong value as "current" for a -1 roll, which could misjudge the
  // oldVal===targetVal no-op check and/or animate from the wrong number.
  // Matches the markup's baked-in "01" default.
  var onesCurrentVal = 1;

  // Triggered from setActive below — the exact same index-crossing event
  // that flips the slide's is-active class and starts its CSS size
  // transition — so both always start in the same instant. targetVal is
  // the new ones digit (1-5); direction is +1/-1 for whether it's rolling
  // up or down (matters only for which value briefly shows through before
  // landing, since there's just one intermediate step here, not a full
  // 0-9 sequence).
  function rollOnesDigit(targetVal, direction) {
    if (!onesStrip) return;
    var oldVal = onesCurrentVal;
    if (oldVal === targetVal) return;
    onesCurrentVal = targetVal;

    gsap.killTweensOf(onesStrip);

    // direction -1 (scrolling to a lower index) needs to visibly roll
    // downward — old value slides down and out, new value enters from
    // above — which is the reverse stacking AND the reverse animation of
    // the direction +1 case, not just the same upward roll landing on a
    // smaller number.
    var startY, endY;
    if (direction === -1) {
      onesStrip.innerHTML =
        '<span class="digit-val">' + targetVal + '</span>' +
        '<span class="digit-val">' + oldVal + '</span>';
      startY = -onesSlot.offsetHeight;
      endY = 0;
    } else {
      onesStrip.innerHTML =
        '<span class="digit-val">' + oldVal + '</span>' +
        '<span class="digit-val">' + targetVal + '</span>';
      startY = 0;
      endY = -onesSlot.offsetHeight;
    }
    gsap.set(onesStrip, { y: startY });

    var token = ++onesRollToken;
    var done = false;
    function finish() {
      if (done || onesRollToken !== token) return;
      done = true;
      onesStrip.innerHTML = '<span class="digit-val">' + targetVal + '</span>';
      gsap.set(onesStrip, { y: 0 });
      if (heroNumber) heroNumber.classList.remove('is-rolling');
    }

    if (heroNumber) heroNumber.classList.add('is-rolling');
    // Same reasoning as the old rollNumber()'s safety timeout: if this
    // tween is ever killed by a later roll instead of completing
    // naturally, onComplete never fires — this guarantees finish() still
    // runs (as a no-op if superseded, via the token check) so nothing
    // stays half-finished indefinitely.
    var safety = setTimeout(finish, TRANSITION_DURATION * 1000 + 250);
    gsap.to(onesStrip, {
      y: endY,
      duration: TRANSITION_DURATION,
      ease: TRANSITION_EASE,
      onComplete: function () {
        clearTimeout(safety);
        finish();
      }
    });
  }

  var prevIndex = null;

  // Project details change the same way "RIYA" leaves the intro: words
  // slide in the direction of the scroll while blurring out one after
  // another, and the next project's words follow them in, sharpening into
  // place. Scrolling down sends text up (new text rises from below);
  // scrolling up sends it down.
  var swapReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var swapAnims = [];

  // Wrap each word in an inline-block span so it can move (spaces stay as
  // plain text between them, so lines wrap as before). Handles both plain
  // text and the per-letter spans smear.js adds on mouse devices.
  function swapWords(panel) {
    if (panel.dataset.swapReady) return panel.querySelectorAll('.swap-word');
    var walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    var texts = [];
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
    Array.prototype.forEach.call(panel.querySelectorAll('.smear-ch'), function (ch) {
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
    panel.dataset.swapReady = '1';
    return panel.querySelectorAll('.swap-word');
  }

  // Wrap up front (after smear.js has made its letters), so the first swap
  // doesn't reflow the visible text.
  window.addEventListener('load', function () {
    if (!swapReduce && window.innerWidth >= 780) panels.forEach(swapWords);
  });

  function swapPanels(from, to, dir) {
    if (swapReduce || !from || !to || from === to || window.innerWidth < 780 || !from.animate) return;
    swapAnims.forEach(function (a) { a.cancel(); });
    swapAnims = [];
    var outW = swapWords(from), inW = swapWords(to);
    var shift = 0.5 * dir; // em, in the direction of the scroll
    var STEP = 14, MAXD = 280;
    from.style.opacity = '1';
    // Words fade out before they get blurry, and only a light blur, so
    // they never smear into grey smudges. Soft in-out easing on the way out
    // and a long, gentle settle on the way in, so nothing snaps.
    Array.prototype.forEach.call(outW, function (w, i) {
      swapAnims.push(w.animate([
        { transform: 'translateY(0)', filter: 'blur(0)', opacity: 1 },
        { transform: 'translateY(' + (-shift * 0.5) + 'em)', filter: 'blur(1px)', opacity: 0.2, offset: 0.5 },
        { transform: 'translateY(' + (-shift) + 'em)', filter: 'blur(3px)', opacity: 0 }
      ], { duration: 520, delay: Math.min(i * STEP, MAXD), easing: 'cubic-bezier(0.37, 0, 0.63, 1)', fill: 'both' }));
    });
    // The new project starts once the old one has mostly cleared, so the
    // two never overlap.
    var last = null;
    Array.prototype.forEach.call(inW, function (w, i) {
      last = w.animate([
        { transform: 'translateY(' + shift + 'em)', filter: 'blur(3px)', opacity: 0 },
        { transform: 'translateY(' + (shift * 0.3) + 'em)', filter: 'blur(0.5px)', opacity: 0.9, offset: 0.5 },
        { transform: 'translateY(0)', filter: 'blur(0)', opacity: 1 }
      ], { duration: 760, delay: 440 + Math.min(i * STEP, MAXD), easing: 'cubic-bezier(0.33, 0.1, 0.25, 1)', fill: 'both' });
      swapAnims.push(last);
    });
    function done() {
      from.style.opacity = '';
      swapAnims.forEach(function (a) { a.cancel(); });
      swapAnims = [];
    }
    if (last) last.finished.then(done).catch(function () { from.style.opacity = ''; });
  }


  function setActive(el, index) {
    slides.forEach(function (slide, i) {
      slide.classList.remove('is-active', 'above', 'below');
      if (i === index) {
        slide.classList.add('is-active');
      } else if (i === (index - 1 + length) % length) {
        slide.classList.add('above');
      } else if (i === (index + 1) % length) {
        slide.classList.add('below');
      }
    });
    var fromPanel = null, toPanel = null;
    panels.forEach(function (panel) {
      var on = parseInt(panel.getAttribute('data-index'), 10) === index;
      if (panel.classList.contains('is-active') && !on) fromPanel = panel;
      if (on) toPanel = panel;
      panel.classList.toggle('is-active', on);
    });
    if (prevIndex !== null && index !== prevIndex) {
      var direction = index === (prevIndex + 1) % length ? 1 : index === (prevIndex - 1 + length) % length ? -1 : index > prevIndex ? 1 : -1;
      rollOnesDigit(index + 1, direction);
      swapPanels(fromPanel, toPanel, direction);
    }
    prevIndex = index;
  }

  // The markup already ships with slide/digit index 0 ("01") as the
  // default visible state (see index.html), so the very first paint is
  // correct before any JS runs — no class or text ever gets written by
  // this script until the user actually navigates. That sidesteps every
  // timing edge case that a JS-driven "jump to index 2 on load" ran into
  // (GSAP's tween/ticker resolving a frame late, a stray onChange firing
  // for whatever index the geometry naturally lands on first), any of
  // which could otherwise paint a wrong index for a moment and read as
  // the carousel auto-scrolling on load.
  var initializing = true;
  var loop = verticalLoop(slides, {
    repeat: -1,
    center: true,
    paused: true,
    onChange: function (el, index) {
      if (initializing) return;
      setActive(el, index);
    }
  });

  // Still sync GSAP's own internal position/curIndex to 0 (silently) so
  // next()/previous() compute correctly from the very first real scroll.
  // Deliberately NOT using toIndex()/tweenTo() here: even a duration:0 tween
  // is only guaranteed to render on GSAP's next ticker tick, which on a real
  // page (competing with fonts/images for the main thread) can land a frame
  // or more after this script runs — during that window the correctly-sized
  // "active" element (from the baked-in HTML classes above) would still be
  // sitting at whatever position the natural DOM order left it in, then
  // visibly slide into its centered spot once the tween finally resolves.
  // .time(value, true) renders synchronously (suppressEvents only skips the
  // onUpdate/onChange callbacks, not the actual transform), so the position
  // is correct in the very first frame, same as the CSS classes already are.
  loop.time(loop.times[0], true);
  loop.closestIndex(true);
  initializing = false;
  prevIndex = 0;

  // Drives the carousel directly off the raw scroll/drag delta instead of
  // snapping a fixed distance per gesture — the strip just follows the
  // wheel or touch movement 1:1, the way a real scrollable list would, with
  // no forced "settle on the nearest slide" step. verticalLoop's own
  // pixelsPerSecond (100, since no config.speed override above) defines
  // how many pixels of visual travel one unit of timeline time covers, so
  // dividing the pixel delta by that converts it to the right time delta.
  // totalTime() (not time()) is what verticalLoop's own internal wraparound
  // trick uses too (see onReverseComplete above) — it's what correctly
  // keeps an infinitely-repeating timeline's position coherent as it's
  // pushed past either end, rather than clamping at [0, duration].
  if (carouselWrap && typeof Observer !== 'undefined') {
    var PIXELS_PER_SECOND = 100;
    // Once scrolling actually stops (no wheel/touch event for SETTLE_DELAY_MS),
    // ease gently into full alignment with whichever slide is currently
    // closest — free-following while active, like Obys, but never left
    // resting slightly off-center. The gentle part is entirely the tween's
    // own duration/ease below; it has nothing to do with how quickly it
    // gets scheduled.
    var SETTLE_DELAY_MS = 160;
    var settleTimer = null;
    var settleTween = null;

    function settle() {
      // closestIndex(true) both reads the current nearest slide AND syncs
      // verticalLoop's internal curIndex to it — needed because direct
      // totalTime() scrubbing (below) never touches curIndex itself, so
      // without this it would still reflect wherever the carousel last
      // stopped via toIndex()/next()/previous(), not the real position
      // continuous scrolling has since moved to.
      var idx = loop.closestIndex(true);
      // The shortest wrapped path from the current time to that slide's
      // target time — computed directly rather than via toIndex(), which
      // derives direction from curIndex and (per the comment above) can't
      // be trusted to already be in sync with a position reached by
      // scrubbing rather than a discrete jump.
      var full = loop.duration();
      var diff = ((loop.times[idx] - loop.time() + full / 2) % full + full) % full - full / 2;
      var time = loop.time() + diff;
      var vars = { duration: TRANSITION_DURATION, ease: TRANSITION_EASE, overwrite: true };
      // Only wrap when the shortest-path target actually lands outside
      // [0, full) — matching how toIndex() above guards this same modifier.
      // Applying it unconditionally (even to an already in-range time)
      // visibly corrupted the tween: every slide collapsed to nearly the
      // same position instead of the strip settling normally.
      if (time < 0 || time > full) {
        vars.modifiers = { time: gsap.utils.wrap(0, full) };
      }
      settleTween = loop.tweenTo(time, vars);
    }

    // Targets document (any scroll/swipe on the page drives the
    // carousel), not just the carousel itself — on desktop the whole
    // page is exactly one screen tall (overflow:hidden, no page scroll
    // exists to conflict with), so there's nothing a page-wide capture
    // could hijack there. The mobile layout (styles.css, 780px
    // breakpoint) is the one case that DOES have real page scroll
    // (header/image/details/profile stacked taller than one viewport),
    // so preventDefault is applied manually inside onChange rather than
    // via Observer's own `preventDefault: true` — that option calls
    // preventDefault() on every captured event unconditionally, before
    // onChange even runs, which would swallow mobile's real scroll
    // before the breakpoint check below ever got a chance to bail out.
    Observer.create({
      target: document,
      type: 'wheel,touch',
      preventDefault: false,
      onChange: function (self) {
        // Mobile (see MOBILE_SWIPE_BREAKPOINT below) drives the carousel
        // via the discrete left/right swipe handler instead — this
        // continuous vertical scroll-follow stays inert there rather than
        // also reacting to the same touch events, and lets them scroll
        // the page normally.
        if (window.innerWidth < MOBILE_SWIPE_BREAKPOINT) return;
        self.event.preventDefault();
        clearTimeout(settleTimer);
        if (settleTween) {
          settleTween.kill();
          settleTween = null;
        }
        loop.totalTime(loop.rawTime() + self.deltaY / PIXELS_PER_SECOND);
        settleTimer = setTimeout(settle, SETTLE_DELAY_MS);
      }
    });
  }

  // Mobile shows one full-bleed card per project instead of the desktop/
  // tablet peeking carousel (styles.css, 780px breakpoint) — "scroll past
  // it" doesn't read naturally there the way "swipe to the next one"
  // does, the way any mobile-native card stack or story viewer works.
  // Reuses the same loop.next()/previous() the desktop settle logic
  // above calls — the underlying timeline still moves on a vertical axis
  // internally, but since only the active card is ever visible on mobile
  // (everything else is opacity:0), that's imperceptible; what's visible
  // is just the crossfade, triggered by a horizontal gesture instead of
  // a vertical one.
  var MOBILE_SWIPE_BREAKPOINT = 780;
  if (carouselWrap) {
    var SWIPE_THRESHOLD = 40;
    var touchStartX = 0;
    var touchStartY = 0;
    var swipeHorizontal = false;

    // Registered in the capture phase, and BEFORE Observer.create() above
    // in source order doesn't actually matter for that — what matters is
    // capture:true, since Observer's own touch listeners are (like most
    // libraries') bubble-phase and call stopImmediatePropagation(), which
    // silently ate every one of these events when they were plain
    // bubble-phase listeners on the same element. Capture-phase listeners
    // run before the target's bubble-phase listeners regardless of
    // registration order, so this always sees the event first.
    carouselWrap.addEventListener('touchstart', function (e) {
      if (window.innerWidth >= MOBILE_SWIPE_BREAKPOINT) return;
      var t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      swipeHorizontal = false;
    }, { passive: true, capture: true });

    carouselWrap.addEventListener('touchmove', function (e) {
      if (window.innerWidth >= MOBILE_SWIPE_BREAKPOINT) return;
      var t = e.touches[0];
      var dx = t.clientX - touchStartX;
      var dy = t.clientY - touchStartY;
      // Only claim the gesture (and block the page's own vertical scroll)
      // once it's clearly more horizontal than vertical — a mostly-
      // vertical drag should keep scrolling the page normally.
      if (!swipeHorizontal && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        swipeHorizontal = true;
      }
      if (swipeHorizontal) e.preventDefault();
    }, { passive: false, capture: true });

    carouselWrap.addEventListener('touchend', function (e) {
      if (window.innerWidth >= MOBILE_SWIPE_BREAKPOINT || !swipeHorizontal) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - touchStartX;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      var vars = { duration: TRANSITION_DURATION, ease: TRANSITION_EASE };
      if (dx < 0) {
        loop.next(vars);
      } else {
        loop.previous(vars);
      }
    }, { passive: true, capture: true });
  }
})();
