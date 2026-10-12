/* Focus and Escape behavior shared by the consultation, quiz, compare and receipt sheets. */
(function () {
  const definitions = [
    ['bottom-sheet-backdrop', () => closeBottomSheet()],
    ['quiz-backdrop', () => closeQuizModal()],
    ['compare-backdrop', () => closeCompareModal()],
    ['confirmation-backdrop', () => closeConfirmationModal()],
  ];
  const dialogs = definitions.map(([id, close]) => ({el: document.getElementById(id), close, open: false, trigger: null})).filter(item => item.el);
  const controls = item => Array.from(item.el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')).filter(el => !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const activeDialog = () => dialogs.find(item => item.el.classList.contains('active'));
  function update() {
    let newlyOpened, closed;
    for (const item of dialogs) {
      const open = item.el.classList.contains('active');
      if (open && !item.open) { item.trigger = document.activeElement; newlyOpened = item; }
      if (!open && item.open) closed = item;
      item.open = open;
      item.el.inert = !open;
      item.el.setAttribute('aria-hidden', String(!open));
    }
    if (newlyOpened) {
      requestAnimationFrame(() => {
        if (newlyOpened.open && !newlyOpened.el.contains(document.activeElement)) controls(newlyOpened)[0]?.focus();
      });
    } else if (closed && !activeDialog()) {
      if (closed.trigger?.isConnected && !closed.trigger.closest('[inert]') && getComputedStyle(closed.trigger).visibility !== 'hidden') closed.trigger.focus();
      else document.querySelector('.logo-group')?.focus();
    }
  }
  for (const item of dialogs) new MutationObserver(update).observe(item.el, {attributes: true, attributeFilter: ['class']});
  update();
  document.addEventListener('keydown', event => {
    const item = activeDialog();
    if (!item) return;
    if (event.key === 'Escape') { item.close(); event.preventDefault(); }
    if (event.key !== 'Tab') return;
    const elements = controls(item), first = elements[0], last = elements.at(-1);
    if (!item.el.contains(document.activeElement)) { (event.shiftKey ? last : first)?.focus(); event.preventDefault(); }
    else if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
  });
})();
