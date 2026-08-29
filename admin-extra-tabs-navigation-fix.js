/* RELÓGIO E CIA — corrige navegação das abas extras do painel */
(() => {
  'use strict';

  const EXTRA_TABS = new Set(['confirmacoes', 'cancelamentos-loja']);
  const BASE_PANELS = ['tab-produtos', 'tab-pedidos', 'tab-cupons', 'tab-trocas'];

  function activateExtraTab(button) {
    const tab = String(button?.dataset?.tab || '');
    if (!EXTRA_TABS.has(tab)) return;

    document.querySelectorAll('.admin-tabs button').forEach(item => {
      item.classList.toggle('active', item === button);
    });

    BASE_PANELS.forEach(id => {
      const panel = document.getElementById(id);
      if (panel) panel.style.display = 'none';
    });

    const confirmations = document.getElementById('tab-confirmacoes');
    const cancellations = document.getElementById('tab-cancelamentos-loja');
    if (confirmations) confirmations.style.display = tab === 'confirmacoes' ? 'block' : 'none';
    if (cancellations) cancellations.style.display = tab === 'cancelamentos-loja' ? 'block' : 'none';
  }

  function bind() {
    document.querySelectorAll('.admin-tabs button[data-tab="confirmacoes"], .admin-tabs button[data-tab="cancelamentos-loja"]').forEach(button => {
      if (button.dataset.navigationFixBound === '1') return;
      button.dataset.navigationFixBound = '1';
      button.addEventListener('click', () => activateExtraTab(button), true);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(bind, 30);
  });
})();
