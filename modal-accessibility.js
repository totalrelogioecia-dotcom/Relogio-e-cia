/* Foco e isolamento do fundo para os diálogos da loja e do painel. */
(() => {
  'use strict';
  const selector = '[role="dialog"][aria-modal="true"]';
  const controls = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';
  let active = null;
  let lastExternalFocus = document.activeElement;
  const history = new Map();
  const inertState = new Map();
  let scheduled = false;
  function visible(element) {
    return !element.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0;
  }
  function focusable(dialog) { return [...dialog.querySelectorAll(controls)].filter(element => visible(element) && element.tabIndex >= 0); }
  function focusFirst(dialog) {
    const options = focusable(dialog);
    const first = options.find(element => /cancel/i.test(element.id + ' ' + element.className + ' ' + element.textContent)) || options[0] || dialog;
    if (first === dialog && !dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
    first.focus({ preventScroll: true });
  }
  function restoreBackground() {
    for (const [element, wasInert] of inertState) element.inert = wasInert;
    inertState.clear();
  }
  function isolate(dialog) {
    let branch = dialog;
    while (branch && branch !== document.body) {
      for (const sibling of branch.parentElement?.children || []) {
        if (sibling === branch || sibling.matches('script,style,link')) continue;
        inertState.set(sibling, sibling.inert); sibling.inert = true;
      }
      branch = branch.parentElement;
    }
  }
  function reconcile() {
    scheduled = false;
    const dialogs = [...document.querySelectorAll(selector)].filter(visible);
    for (const dialog of dialogs) if (!history.has(dialog)) history.set(dialog, dialog.contains(document.activeElement) ? lastExternalFocus : document.activeElement);
    const top = dialogs.sort((a, b) => {
      const z = element => { let max = 0; for (let node = element; node && node !== document.body; node = node.parentElement) max = Math.max(max, Number.parseInt(getComputedStyle(node).zIndex, 10) || 0); return max; };
      return z(a) - z(b);
    }).at(-1) || null;
    const previous = active;
    if (previous !== top) {
      restoreBackground(); active = top;
      if (top) { isolate(top); if (!top.contains(document.activeElement)) focusFirst(top); }
      else {
        const saved = history.get(previous);
        if (saved?.isConnected && visible(saved) && (!document.activeElement || document.activeElement === document.body || previous?.contains(document.activeElement))) saved.focus({ preventScroll: true });
      }
    } else if (top) {
      // Inclui novos irmãos inseridos enquanto o diálogo já está aberto.
      restoreBackground(); isolate(top);
    }
    for (const dialog of history.keys()) if (!dialogs.includes(dialog)) history.delete(dialog);
    document.body.classList.toggle('ui-modal-open', Boolean(top));
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(reconcile); } }
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') {
      const close = active.querySelector('[aria-label^="Fechar"],[data-modal-cancel],button[id*="cancel"],button[id*="close"],button[class*="close"]');
      if (close && !close.disabled) { event.preventDefault(); event.stopImmediatePropagation(); close.click(); }
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable(active);
    const index = items.indexOf(document.activeElement);
    if (!items.length) { event.preventDefault(); focusFirst(active); return; }
    if (index < 0 || (!event.shiftKey && index === items.length - 1) || (event.shiftKey && index === 0)) {
      event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0]).focus();
    }
  }, true);
  document.addEventListener('focusin', event => {
    if (!event.target.closest(selector)) lastExternalFocus = event.target;
    if (active && visible(active) && !active.contains(event.target)) focusFirst(active);
  });
  function boot() {
    new MutationObserver(records => {
      if (records.some(record => {
        const element = record.target;
        return (element instanceof Element && (element.matches(selector) || element.querySelector(selector))) || [...record.addedNodes].some(node => node instanceof Element && (node.matches(selector) || node.querySelector(selector)));
      })) schedule();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style'] });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
