/* Click and keyboard navigation; no service or pricing data is duplicated here. */
(function () {
  const items = Array.from(document.querySelectorAll('.main-nav-desktop .nav-item')).filter(item => item.querySelector('.mega-menu'));
  function closeMenus() {
    for (const item of items) {
      item.classList.remove('is-open');
      item.querySelector('button').setAttribute('aria-expanded', 'false');
      item.querySelector('.mega-menu').inert = true;
    }
  }
  closeMenus();
  for (const item of items) {
    const button = item.querySelector('button');
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      closeMenus();
      if (open) {
        item.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        item.querySelector('.mega-menu').inert = false;
      }
    });
    item.addEventListener('click', event => {
      if (event.target.closest('.mega-menu a, .mega-menu button')) closeMenus();
    });
    item.addEventListener('keydown', event => {
      if (event.key === 'Escape') { closeMenus(); button.focus(); event.preventDefault(); }
      if (event.key === 'ArrowDown' && event.target === button) {
        if (button.getAttribute('aria-expanded') !== 'true') button.click();
        requestAnimationFrame(() => { if (item.classList.contains('is-open')) item.querySelector('.mega-menu a, .mega-menu button')?.focus(); });
        event.preventDefault();
      }
    });
  }
  document.addEventListener('click', event => { if (!event.target.closest('.main-nav-desktop')) closeMenus(); });
  document.addEventListener('focusin', event => { if (!event.target.closest('.main-nav-desktop')) closeMenus(); });

  const drawer = document.getElementById('mobile-nav-drawer');
  const toggle = document.querySelector('.btn-mobile-menu-toggle');
  let previousFocus, previousOverflow = '';
  window.toggleMobileNav = function () {
    if (!drawer) return;
    const open = !drawer.classList.contains('active');
    if (open) { previousFocus = document.activeElement; previousOverflow = document.body.style.overflow; }
    drawer.inert = !open;
    drawer.setAttribute('aria-hidden', String(!open));
    drawer.classList.toggle('active', open);
    toggle?.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : previousOverflow;
    if (open) drawer.querySelector('.btn-close-sheet')?.focus();
    else previousFocus?.focus();
  };
  window.handleMobileDrawerBackdrop = function (event) { if (event.target === drawer) window.toggleMobileNav(); };
  window.toggleMobileAccordion = function (id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    const open = panel.classList.toggle('open');
    panel.inert = !open;
    drawer.querySelector(`[aria-controls="${id}"]`)?.setAttribute('aria-expanded', String(open));
  };
  drawer?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { window.toggleMobileNav(); event.preventDefault(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(drawer.querySelectorAll('button, a[href], input, select, textarea')).filter(el => !el.closest('[inert]') && !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
  });
  matchMedia('(min-width: 1024px)').addEventListener('change', event => { closeMenus(); if (event.matches && drawer?.classList.contains('active')) window.toggleMobileNav(); });
})();
