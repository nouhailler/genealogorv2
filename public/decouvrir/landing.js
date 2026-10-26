// Menu mobile de la landing page : ouverture/fermeture accessible (clavier, Échap, clic sur un lien)
(function () {
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('menu-principal');
  if (!toggle || !nav) return;

  var label = toggle.querySelector('.visually-hidden');
  var icon = toggle.querySelector('use');

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Fermer le menu' : 'Ouvrir le menu';
    if (icon) icon.setAttribute('href', open ? '#i-x' : '#i-menu');
  }

  toggle.addEventListener('click', function () {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  // Repasser en affichage bureau referme le menu mobile
  window.matchMedia('(min-width: 960px)').addEventListener('change', function (mq) {
    if (mq.matches) setOpen(false);
  });
})();
