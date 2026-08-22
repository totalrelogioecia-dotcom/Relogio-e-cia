(() => {
  function ensureMobileStyles() {
    if (document.querySelector('link[data-relogio-mobile-fixes]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'mobile-fixes.css';
    link.setAttribute('data-relogio-mobile-fixes', '1');
    document.head.appendChild(link);
  }

  function ensureLink(list, href, label) {
    if (!list || list.querySelector(`a[href="${href}"]`)) return;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    li.appendChild(a);
    list.appendChild(li);
  }

  function enhanceFooter() {
    ensureMobileStyles();

    document.querySelectorAll('footer .footer-grid').forEach(grid => {
      const navigation = Array.from(grid.children).find(column => {
        const title = column.querySelector('h5')?.textContent?.trim().toLowerCase();
        return title === 'navegação' || title === 'navegacao';
      });
      const list = navigation?.querySelector('ul');
      ensureLink(list, 'trocas-estornos.html', 'Trocas, devoluções e estornos');
      ensureLink(list, 'politica-de-privacidade.html', 'Política de Privacidade');
      ensureLink(list, 'termos-de-uso.html', 'Termos de Uso');
    });

    document.querySelectorAll('footer .footer-bottom span').forEach(span => {
      if (/site meramente ilustrativo/i.test(span.textContent || '')) {
        span.textContent = 'Compra online com atendimento pós-venda';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceFooter);
  else enhanceFooter();
})();

