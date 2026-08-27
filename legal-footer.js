(() => {
  const TRADE_NAME = 'Relógio & Cia';
  const COMPANY_LEGAL_NAME = 'Albernard Comércio de Relógios Ltda';
  const COMPANY_CNPJ = '05.583.329/0001-46';
  const INSTAGRAM_URL = 'https://www.instagram.com/relogio.ecia/';
  const INSTAGRAM_HANDLE = '@relogio.ecia';
  const WHATSAPP_NUMBER = '555196311864';
  const WHATSAPP_LABEL = '(51) 9631-1864';
  const LANDLINE_HREF = 'tel:+555137377267';
  const LANDLINE_LABEL = '(51) 3737-7267';

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

  function makeFooterButton({ className, href, label, ariaLabel, iconHtml, newTab = false }) {
    const link = document.createElement('a');
    link.className = className;
    link.href = href;
    if (newTab) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.setAttribute('aria-label', ariaLabel);
    link.style.display = 'inline-flex';
    link.style.alignItems = 'center';
    link.style.gap = '8px';
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
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.innerHTML = iconHtml;

    const text = document.createElement('span');
    text.textContent = label;

    link.appendChild(icon);
    link.appendChild(text);
    return link;
  }

  function ensureContactButtons(grid) {
    const firstColumn = grid?.children?.[0];
    if (!firstColumn || firstColumn.querySelector('.footer-contact-buttons')) return;

    const wrap = document.createElement('div');
    wrap.className = 'footer-contact-buttons';
    wrap.style.display = 'flex';
    wrap.style.flexWrap = 'wrap';
    wrap.style.gap = '8px';
    wrap.style.marginTop = '14px';

    const instagram = makeFooterButton({
      className: 'footer-instagram-link',
      href: INSTAGRAM_URL,
      label: `Instagram ${INSTAGRAM_HANDLE}`,
      ariaLabel: `Instagram da Relógio e Cia: ${INSTAGRAM_HANDLE}`,
      newTab: true,
      iconHtml: '<rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none"></circle>'
    });

    const whatsapp = makeFooterButton({
      className: 'footer-whatsapp-link',
      href: `https://wa.me/${WHATSAPP_NUMBER}`,
      label: `WhatsApp ${WHATSAPP_LABEL}`,
      ariaLabel: `Conversar com a Relógio e Cia pelo WhatsApp ${WHATSAPP_LABEL}`,
      newTab: true,
      iconHtml: '<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.2a8.5 8.5 0 1 1 15.6-4.7Z"></path><path d="M8.4 7.7c.3-.5.7-.5 1-.1l1.1 1.5c.2.3.2.6 0 .9l-.6.8c-.2.2-.1.5.1.8.8 1.3 1.8 2.3 3.2 3 .3.2.6.2.8 0l.9-1c.2-.3.5-.3.8-.2l1.7.8c.4.2.5.5.4.9-.3 1.2-1.4 2.1-2.7 2.2-1.4.1-3.2-.6-5.2-2.4-2-1.8-3.1-3.7-3.1-5.2 0-.8.3-1.5.8-2Z"></path>'
    });

    wrap.appendChild(instagram);
    wrap.appendChild(whatsapp);
    firstColumn.appendChild(wrap);
  }

  function replaceAttendancePhone(grid) {
    const attendance = Array.from(grid.children).find(column => {
      const title = column.querySelector('h5')?.textContent?.trim().toLowerCase();
      return title === 'atendimento';
    });
    if (!attendance) return;

    const phoneLink = attendance.querySelector('a[href^="tel:"]');
    if (!phoneLink) return;
    phoneLink.href = LANDLINE_HREF;
    phoneLink.textContent = LANDLINE_LABEL;
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
      ensureContactButtons(grid);
      replaceAttendancePhone(grid);

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
