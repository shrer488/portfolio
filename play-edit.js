// Drag-to-reorder for arranging the play grid — never loads for a normal
// visitor. Only activates on play.html?edit, and even then only pulls in
// Sortable.js on demand rather than shipping it in the default page weight.
//
// There's no backend here to persist an order, so this isn't meant to be
// a permanent feature: drag tiles into the arrangement you want, hit
// "Copy layout", and paste the result over the <main class="play-grid">
// block in play.html to make it permanent.
(function () {
  var params = new URLSearchParams(location.search);
  if (!params.has('edit')) return;

  var script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js';
  script.onload = initEditMode;
  document.head.appendChild(script);

  function initEditMode() {
    var cols = Array.prototype.slice.call(document.querySelectorAll('.play-col'));
    cols.forEach(function (col) {
      // Shared `group` lets a tile be dragged out of one column and
      // dropped into another, not just reordered within its own.
      new Sortable(col, {
        group: 'play-grid',
        animation: 150,
        ghostClass: 'play-item-ghost',
      });
    });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Copy layout';
    btn.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:999',
      'padding:10px 18px', 'background:#000', 'color:#fff', 'border:none',
      'border-radius:4px', 'font-family:sans-serif', 'font-size:13px',
      'cursor:pointer', 'box-shadow:0 4px 16px rgba(0,0,0,0.25)'
    ].join(';');

    btn.addEventListener('click', function () {
      var html = document.querySelector('.play-grid').outerHTML;
      var done = function () {
        btn.textContent = 'Copied — paste over <main class="play-grid">';
        setTimeout(function () { btn.textContent = 'Copy layout'; }, 2500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(html).then(done, function () {
          console.log(html);
          btn.textContent = 'Clipboard blocked — see console';
        });
      } else {
        console.log(html);
        btn.textContent = 'See console for HTML';
      }
    });

    document.body.appendChild(btn);
  }
})();
