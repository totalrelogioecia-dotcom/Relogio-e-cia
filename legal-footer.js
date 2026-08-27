(() => {
  const TRADE_NAME = 'Relógio & Cia';
  const COMPANY_LEGAL_NAME = 'Albernard Comércio de Relógios Ltda';
  const COMPANY_CNPJ = '05.583.329/0001-46';
  const COMPANY_STATE_REGISTRATION = '096/2976806';

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

    const stateRegistration = document.createElement('span');
    stateRegistration.textContent = `Inscrição Estadual: ${COMPANY_STATE_REGISTRATION}`;
    stateRegistration.style.display = 'block';

    identity.appendChild(tradeName);
    identity.appendChild(legalName);
    identity.appendChild(cnpj);
    identity.appendChild(stateRegistration);
    firstColumn.appendChild(identity);
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
