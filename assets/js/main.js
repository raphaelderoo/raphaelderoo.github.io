// Boutons "copier" (email, téléphone)
document.querySelectorAll('.copy-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var text = btn.getAttribute('data-copy');
    var original = btn.textContent;
    var done = function () {
      btn.textContent = 'copié';
      setTimeout(function () { btn.textContent = original; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { selectFallback(btn); });
    } else {
      selectFallback(btn);
    }
  });
});

function selectFallback(btn) {
  var valueEl = btn.parentElement.querySelector('.contact-value');
  if (!valueEl) return;
  var range = document.createRange();
  range.selectNodeContents(valueEl);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Apparition progressive des blocs au scroll
if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('io-ready');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
}

// Année du footer
var yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
