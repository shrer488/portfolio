(function () {
  var photo = document.querySelector('.about-photo');
  var tooltip = document.querySelector('.about-photo-tooltip');
  if (!photo || !tooltip) return;

  photo.addEventListener('mousemove', function (e) {
    var rect = photo.getBoundingClientRect();
    tooltip.style.left = e.clientX - rect.left + 'px';
    tooltip.style.top = e.clientY - rect.top + 'px';
  });

  // Clicking a snap photo swaps it into the big photo on the right and
  // updates the caption to match; hovering previews the caption too
  // (reverting to whatever is currently selected on mouseleave).
  var bigImg = document.getElementById('aboutPhotoImg');
  var caption = document.getElementById('aboutSnapCaption');
  var thumbs = document.querySelectorAll('.about-snap-photos img');
  var activeCaption = caption ? caption.textContent : '';

  thumbs.forEach(function (thumb) {
    thumb.addEventListener('mouseenter', function () {
      if (!caption || !thumb.dataset.caption) return;
      caption.textContent = thumb.dataset.caption;
    });

    thumb.addEventListener('mouseleave', function () {
      if (!caption) return;
      caption.textContent = activeCaption;
    });

    thumb.addEventListener('click', function () {
      if (!bigImg || !caption) return;
      bigImg.src = thumb.src;
      bigImg.alt = thumb.alt;
      activeCaption = thumb.dataset.caption || activeCaption;
      caption.textContent = activeCaption;
      if (thumb.dataset.tooltip) tooltip.textContent = thumb.dataset.tooltip;

      thumbs.forEach(function (t) { t.classList.remove('is-selected'); });
      thumb.classList.add('is-selected');
    });
  });
})();
