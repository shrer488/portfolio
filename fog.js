// Clicking the "Click" hint (.cursor-hint, bottom-right of the hero) fogs
// the whole viewport over, like a bathroom mirror after a hot shower. The
// system cursor is swapped for the same flower icon used in that hint,
// enlarged, and dragging it across the fog erases a soft-edged patch to
// reveal the sharp page underneath — with a synthesized rubbing sound
// tied to the motion, since there's no audio asset to license or ship. A
// "Wipe" button (visible only while fogged) sweeps the whole thing clear
// top-to-bottom in one animated pass. Once enough of the fog is gone —
// checked by downsampling rather than reading every pixel — it fades out
// and the interaction ends on its own, same as finishing the auto-wipe.
//
// Two layers, not one: `.fog-blur` is a plain div carrying the real glass
// look (backdrop-filter + translucent tint, same recipe as play.html's
// lightbox). backdrop-filter blurs everything behind an element's box
// regardless of that element's own alpha — erasing a hole in a canvas
// that ALSO carries backdrop-filter does not stop the blur there, it just
// removes the tint and leaves the blur behind. Cutting an actual hole
// needs the element's rendered shape to change, which is what
// mask-image does. So `.fog-mask` (an offscreen, undisplayed canvas) is
// the thing fog.js actually draws and erases on, and its bitmap is
// pushed into `.fog-blur`'s mask-image (a raster PNG data URL, not a CSS
// gradient — the mask+backdrop-filter bug that broke the case study
// pages' edge blur was specifically about gradient masks losing their
// alpha in WebKit) on every stroke, throttled to animation-frame rate.
(function () {
  var hint = document.querySelector('.cursor-hint');
  if (!hint) return;

  var blurLayer = document.createElement('div');
  blurLayer.className = 'fog-blur';
  document.body.appendChild(blurLayer);

  var maskCanvas = document.createElement('canvas');
  var mctx = maskCanvas.getContext('2d');

  var cursorEl = document.createElement('img');
  cursorEl.src = 'assets/cursor.svg';
  cursorEl.alt = '';
  cursorEl.className = 'fog-cursor';
  document.body.appendChild(cursorEl);

  // Pre-rasterize the flower once onto an offscreen canvas at brush size,
  // rather than re-rendering the (fairly dense) SVG path on every stamp —
  // drawImage from a plain canvas bitmap is much cheaper than from a live
  // SVG image source when it's happening dozens of times per drag.
  var STAMP_SIZE = 100;
  var flowerStamp = document.createElement('canvas');
  var flowerReady = false;
  (function loadFlowerStamp() {
    var img = new Image();
    img.onload = function () {
      flowerStamp.width = STAMP_SIZE;
      flowerStamp.height = STAMP_SIZE;
      flowerStamp.getContext('2d').drawImage(img, 0, 0, STAMP_SIZE, STAMP_SIZE);
      flowerReady = true;
    };
    img.src = 'assets/cursor.svg';
  })();

  var wipeBtn = document.createElement('button');
  wipeBtn.type = 'button';
  wipeBtn.className = 'fog-wipe-btn';
  wipeBtn.textContent = 'Wipe';
  document.body.appendChild(wipeBtn);

  var active = false;
  var dragging = false;
  var lastX = null;
  var lastY = null;
  var autoWiping = false;
  var maskDirty = false;
  var maskFrameScheduled = false;

  // Opaque white, not black: CSS mask-image mode (alpha vs. luminance)
  // isn't consistent across browsers for raster images — WebKit has
  // historically defaulted `-webkit-mask-image` to luminance while the
  // unprefixed spec defaults to alpha. White satisfies both (full
  // luminance AND full alpha = fully visible), and erasing to fully
  // transparent black-or-not still reads as hidden under either mode
  // (luminance is multiplied by alpha, so alpha:0 always wins).
  function paintMask() {
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  }

  function sizeCanvas() {
    maskCanvas.width = window.innerWidth;
    maskCanvas.height = window.innerHeight;
    if (active) {
      paintMask();
      pushMask();
    }
  }
  window.addEventListener('resize', sizeCanvas);

  function pushMask() {
    if (maskFrameScheduled) { maskDirty = true; return; }
    maskFrameScheduled = true;
    requestAnimationFrame(function () {
      maskFrameScheduled = false;
      var url = 'url(' + maskCanvas.toDataURL() + ')';
      blurLayer.style.maskImage = url;
      blurLayer.style.webkitMaskImage = url;
      if (maskDirty) { maskDirty = false; pushMask(); }
    });
  }

  function activate() {
    if (active) return;
    active = true;
    autoWiping = false;
    sizeCanvas();
    blurLayer.classList.remove('is-clearing');
    blurLayer.classList.add('is-active');
    wipeBtn.classList.add('is-visible');
    document.body.classList.add('fog-active');
  }

  function deactivate() {
    active = false;
    dragging = false;
    blurLayer.classList.remove('is-active');
    wipeBtn.classList.remove('is-visible');
    cursorEl.classList.remove('is-visible');
    document.body.classList.remove('fog-active');
    stopSound();
  }

  hint.style.cursor = 'pointer';
  hint.addEventListener('click', activate);

  // Stamps the actual flower shape along the drag path (not a plain
  // circle) so the wiped trail reads as "wiped with this cursor" rather
  // than a generic round eraser. Falls back to a circular brush for the
  // handful of frames before the flower bitmap has loaded (effectively
  // never, in practice — it's already on the page as the hint icon).
  function drawWipe(x, y, x0, y0) {
    mctx.globalCompositeOperation = 'destination-out';
    var dist = x0 == null ? 0 : Math.hypot(x - x0, y - y0);
    var spacing = flowerReady ? 14 : 6;
    var steps = Math.max(1, Math.floor(dist / spacing));
    for (var i = 0; i <= steps; i++) {
      var t = steps === 0 ? 0 : i / steps;
      var px = x0 == null ? x : x0 + (x - x0) * t;
      var py = y0 == null ? y : y0 + (y - y0) * t;
      if (flowerReady) {
        mctx.drawImage(flowerStamp, px - STAMP_SIZE / 2, py - STAMP_SIZE / 2);
      } else {
        var r = 48;
        var rg = mctx.createRadialGradient(px, py, 0, px, py, r);
        rg.addColorStop(0, 'rgba(0,0,0,1)');
        rg.addColorStop(0.72, 'rgba(0,0,0,0.95)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        mctx.fillStyle = rg;
        mctx.beginPath();
        mctx.arc(px, py, r, 0, Math.PI * 2);
        mctx.fill();
      }
    }
    pushMask();
  }

  function pointerMove(e) {
    cursorEl.style.left = e.clientX + 'px';
    cursorEl.style.top = e.clientY + 'px';
    if (!active) return;
    cursorEl.classList.add('is-visible');
    if (dragging && !autoWiping) {
      e.preventDefault();
      drawWipe(e.clientX, e.clientY, lastX, lastY);
      tickSound();
      scheduleClearedCheck();
    }
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function pointerDown(e) {
    if (!active || autoWiping) return;
    // Without this, dragging over the page underneath starts a native
    // text-selection drag (the overlay intercepts clicks via
    // pointer-events, but the browser still runs its own selection
    // logic on mousedown+move regardless of what's on top).
    e.preventDefault();
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    drawWipe(e.clientX, e.clientY, null, null);
    startSound();
  }

  function pointerUp() {
    if (!dragging) return;
    dragging = false;
    lastX = lastY = null;
    stopSound();
  }

  document.addEventListener('mousemove', pointerMove);
  blurLayer.addEventListener('mousedown', pointerDown);
  window.addEventListener('mouseup', pointerUp);
  blurLayer.addEventListener('mouseleave', function () { cursorEl.classList.remove('is-visible'); });
  blurLayer.addEventListener('mouseenter', function () { if (active) cursorEl.classList.add('is-visible'); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && active) deactivate();
  });

  // --- Synthesized rubbing sound (Web Audio API, no audio file needed):
  // looping filtered noise, silent until a stroke starts, with the
  // bandpass center frequency jittered on every stroke segment so it
  // reads as an uneven hand-on-glass squeak rather than a flat drone.
  var audioCtx, noiseGain, noiseFilter;

  function ensureAudio() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    var bufferSize = 2 * audioCtx.sampleRate;
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    var noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 1.1;
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0;
    noiseSource.connect(noiseFilter).connect(noiseGain).connect(audioCtx.destination);
    noiseSource.start();
  }

  function startSound() {
    ensureAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    noiseGain.gain.cancelScheduledValues(audioCtx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0.055, audioCtx.currentTime + 0.05);
  }

  function stopSound() {
    if (!audioCtx) return;
    noiseGain.gain.cancelScheduledValues(audioCtx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.12);
  }

  var lastTick = 0;
  function tickSound() {
    if (!audioCtx) return;
    var now = audioCtx.currentTime;
    if (now - lastTick < 0.05) return;
    lastTick = now;
    noiseFilter.frequency.setValueAtTime(650 + Math.random() * 550, now);
  }

  // --- Detecting "mostly clear": downsample the mask canvas to a tiny
  // offscreen canvas and average its alpha channel, instead of reading
  // every pixel of a full-viewport canvas on every stroke.
  var clearedCheckPending = false;
  var offCanvas = document.createElement('canvas');
  offCanvas.width = 40;
  offCanvas.height = 24;
  var offCtx = offCanvas.getContext('2d');

  function scheduleClearedCheck() {
    if (clearedCheckPending) return;
    clearedCheckPending = true;
    window.setTimeout(function () {
      clearedCheckPending = false;
      checkCleared();
    }, 250);
  }

  function checkCleared() {
    if (!active || autoWiping) return;
    offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
    offCtx.drawImage(maskCanvas, 0, 0, offCanvas.width, offCanvas.height);
    var data = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height).data;
    var sum = 0;
    for (var i = 3; i < data.length; i += 4) sum += data[i];
    var avg = sum / (offCanvas.width * offCanvas.height * 255);
    if (avg < 0.08) finishClear();
  }

  function finishClear() {
    blurLayer.classList.add('is-clearing');
    window.setTimeout(function () { deactivate(); }, 450);
  }

  // --- "Wipe" button: animated sweep from top to bottom, clearing
  // everything above the sweep line as it descends.
  wipeBtn.addEventListener('click', function () {
    if (!active || autoWiping) return;
    autoWiping = true;
    dragging = false;
    var start = null;
    var duration = 1100;
    var softEdge = 70;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      var bandH = maskCanvas.height * eased;
      mctx.globalCompositeOperation = 'destination-out';
      // A canvas gradient clamps to its end-stop colors outside its own
      // defined range — the previous version relied on this soft-edge
      // rect alone, so anything already swept past only got a handful of
      // partial hits as the gradient passed over it, not a guaranteed
      // full erase, which left faint un-cleared patches behind. Filling
      // the already-swept region solid first makes that region's
      // clearing immediate and unconditional; the gradient then only has
      // to handle the thin leading edge.
      mctx.fillStyle = 'rgba(0,0,0,1)';
      mctx.fillRect(0, 0, maskCanvas.width, Math.max(0, bandH - softEdge));
      var grad = mctx.createLinearGradient(0, Math.max(0, bandH - softEdge), 0, bandH);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      mctx.fillStyle = grad;
      mctx.fillRect(0, Math.max(0, bandH - softEdge), maskCanvas.width, softEdge);
      pushMask();
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        pushMask();
        autoWiping = false;
        finishClear();
      }
    }
    requestAnimationFrame(step);
  });
})();
