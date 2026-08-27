(() => {
  const TRADE_NAME = 'Relógio & Cia';
  const COMPANY_LEGAL_NAME = 'Albernard Comércio de Relógios Ltda';
  const COMPANY_CNPJ = '05.583.329/0001-46';
  const INSTAGRAM_URL = 'https://www.instagram.com/relogio.ecia/';
  const INSTAGRAM_HANDLE = '@relogio.ecia';

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

  function ensureCompanyIdentity(grid) {
    const firstColumn = grid?.children?.[0];
    if (!firstColumn || firstColumn.querySelector('.footer-company-identity')) return;

    const identity = document.createElement('p');
    identity.className = 'footer-company-identity';
    identity.style.marginTop = '12px';
    identity.style.fontSize = '12px';
    identity.style.lineHeight = '1.55';
    identity.style.opacity = '.82';

    const tradeName = document.createElement('span');
    tradeName.textContent = `Nome fantasia: ${TRADE_NAME}`;
    tradeName.style.display = 'block';

    const legalName = document.createElement('strong');
    legalName.textContent = `Razão social: ${COMPANY_LEGAL_NAME}`;
    legalName.style.display = 'block';
    legalName.style.fontWeight = '600';

    const cnpj = document.createElement('span');
    cnpj.textContent = `CNPJ: ${COMPANY_CNPJ}`;
    cnpj.style.display = 'block';

    identity.appendChild(tradeName);
    identity.appendChild(legalName);
    identity.appendChild(cnpj);
    firstColumn.appendChild(identity);
  }

  function ensureInstagram(grid) {
    const firstColumn = grid?.children?.[0];
    if (!firstColumn || firstColumn.querySelector('.footer-instagram-link')) return;

    const link = document.createElement('a');
    link.className = 'footer-instagram-link';
    link.href = INSTAGRAM_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Instagram da Relógio e Cia: ${INSTAGRAM_HANDLE}`);
    link.style.display = 'inline-flex';
    link.style.alignItems = 'center';
    link.style.gap = '8px';
    link.style.marginTop = '14px';
    link.style.padding = '8px 11px';
    link.style.border = '1px solid rgba(255,255,255,.24)';
    link.style.borderRadius = '999px';
    link.style.fontSize = '12px';
    link.style.fontWeight = '600';
    link.style.letterSpacing = '.01em';
    link.style.textDecoration = 'none';
    link.style.color = 'inherit';
    link.style.opacity = '.92';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.8');
    icon.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none"></circle>';

    const text = document.createElement('span');
    text.textContent = `Instagram ${INSTAGRAM_HANDLE}`;

    link.appendChild(icon);
    link.appendChild(text);
    firstColumn.appendChild(link);
  }

  function clarifyLegalPageIdentity() {
    document.querySelectorAll('.policy-contact li strong').forEach(label => {
      const text = String(label.textContent || '').trim().toLowerCase();
      if (text === 'responsável pela loja:' || text === 'empresa:') {
        label.textContent = 'Razão social:';
      }
    });
  }

  function enhanceFooter() {
    ensureMobileStyles();
    clarifyLegalPageIdentity();

    document.querySelectorAll('footer .footer-grid').forEach(grid => {
      ensureCompanyIdentity(grid);
      ensureInstagram(grid);

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
