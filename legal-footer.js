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
  const CONTRAST_STORAGE_KEY = 'reloja_high_contrast';

  function ensureMobileStyles() {
    if (document.querySelector('link[data-relogio-mobile-fixes]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'mobile-fixes.css';
    link.setAttribute('data-relogio-mobile-fixes', '1');
    document.head.appendChild(link);
  }

  function ensureAccessibilityControlsScript() {
    if (document.querySelector('script[src*="accessibility-controls.js"]')) return;
    const script = document.createElement('script');
    script.src = 'accessibility-controls.js?v=9';
    script.async = false;
    script.setAttribute('data-reloja-accessibility-controls', '1');
    document.head.appendChild(script);
  }

  function ensureAccessibilityStyles() {
    if (document.getElementById('reloja-accessibility-style')) return;
    const style = document.createElement('style');
    style.id = 'reloja-accessibility-style';
    style.textContent = `
      .cart-legal-summary{margin:16px 0;padding:13px 14px;border:1px solid var(--line-strong);background:var(--bg-soft);font-size:.78rem;line-height:1.5;color:var(--ink-soft)}
      .cart-legal-summary strong{display:block;color:var(--ink);margin-bottom:3px}
      .cart-legal-summary a{font-weight:600;text-underline-offset:2px}
    `;
    document.head.appendChild(style);
  }

  function readContrastPreference() {
    try { return localStorage.getItem(CONTRAST_STORAGE_KEY) === '1'; }
    catch { return false; }
  }

  function syncContrastButton(button) {
    if (!button) return;
    const enabled = document.documentElement.classList.contains('reloja-high-contrast');
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.setAttribute('aria-label', enabled ? 'Desativar alto contraste' : 'Ativar alto contraste');
    button.title = enabled ? 'Desativar alto contraste' : 'Ativar alto contraste';
  }

  function setContrast(enabled) {
    document.documentElement.classList.toggle('reloja-high-contrast', Boolean(enabled));
    try { localStorage.setItem(CONTRAST_STORAGE_KEY, enabled ? '1' : '0'); } catch (_) {}
    document.querySelectorAll('.reloja-contrast-toggle').forEach(syncContrastButton);
  }

  function ensureContrastToggle() {
    const nav = document.querySelector('.site-header .nav');
    if (!nav || nav.querySelector('.reloja-contrast-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reloja-contrast-toggle';
    button.innerHTML = '<span aria-hidden="true">◐</span><span class="reloja-contrast-label">Contraste</span>';
    syncContrastButton(button);
    button.addEventListener('click', () => {
      setContrast(!document.documentElement.classList.contains('reloja-high-contrast'));
    });
    const cta = nav.querySelector('.nav-cta');
    const toggle = nav.querySelector('.nav-toggle');
    nav.insertBefore(button, cta || toggle || null);
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

    const list = attendance.querySelector('ul');
    const phoneLink = list?.querySelector('a[href^="tel:"]');
    if (phoneLink) {
      phoneLink.href = LANDLINE_HREF;
      phoneLink.textContent = LANDLINE_LABEL;
      phoneLink.setAttribute('aria-label', `Telefone fixo para ligações: ${LANDLINE_LABEL}`);
    }
    ensureLink(list, `https://wa.me/${WHATSAPP_NUMBER}`, `WhatsApp: ${WHATSAPP_LABEL}`);
  }

  function normalizeTelephoneLinks() {
    document.querySelectorAll('a[href^="tel:"]').forEach(link => {
      if (String(link.getAttribute('href') || '') === 'tel:+555196311864') {
        link.href = LANDLINE_HREF;
        if (String(link.textContent || '').includes('9631-1864')) link.textContent = LANDLINE_LABEL;
      }
    });
  }

  function enhanceHomepageContact() {
    const cells = Array.from(document.querySelectorAll('.store-cell'));
    const attendance = cells.find(cell => /atendimento/i.test(cell.querySelector('h4')?.textContent || ''));
    const paragraph = attendance?.querySelector('p');
    if (!paragraph || paragraph.dataset.contactChannels === '1') return;
    paragraph.dataset.contactChannels = '1';
    paragraph.innerHTML = `<a href="${LANDLINE_HREF}">Telefone: ${LANDLINE_LABEL}</a><br><a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" rel="noopener noreferrer">WhatsApp: ${WHATSAPP_LABEL}</a><br><a href="mailto:totalrelogioecia@gmail.com">totalrelogioecia@gmail.com</a>`;
  }

  function clarifyLegalPageIdentity() {
    document.querySelectorAll('.policy-contact li strong').forEach(label => {
      const text = String(label.textContent || '').trim().toLowerCase();
      if (text === 'responsável pela loja:' || text === 'empresa:') {
        label.textContent = 'Razão social:';
      }
    });
  }

  function enhancePolicyContacts() {
    document.querySelectorAll('.policy-contact').forEach(card => {
      const list = card.querySelector('ul');
      if (list) {
        const phoneLi = Array.from(list.children).find(li => /telefone/i.test(li.querySelector('strong')?.textContent || ''));
        if (phoneLi) {
          const strong = phoneLi.querySelector('strong');
          if (strong) strong.textContent = 'Telefone fixo:';
          const link = phoneLi.querySelector('a[href^="tel:"]');
          if (link) {
            link.href = LANDLINE_HREF;
            link.textContent = LANDLINE_LABEL;
          }
        }
        if (!list.querySelector(`a[href="https://wa.me/${WHATSAPP_NUMBER}"]`)) {
          const li = document.createElement('li');
          li.innerHTML = `<strong>WhatsApp:</strong><br><a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" rel="noopener noreferrer">${WHATSAPP_LABEL}</a>`;
          if (phoneLi?.nextSibling) list.insertBefore(li, phoneLi.nextSibling);
          else list.appendChild(li);
        }
      }

      const actions = card.querySelector('.policy-actions');
      if (actions && !actions.querySelector(`a[href="https://wa.me/${WHATSAPP_NUMBER}"]`)) {
        const link = document.createElement('a');
        link.className = 'btn-dark-outline';
        link.href = `https://wa.me/${WHATSAPP_NUMBER}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Falar pelo WhatsApp';
        actions.appendChild(link);
      }
    });

    const contactParagraph = Array.from(document.querySelectorAll('.policy-card p')).find(p => /^Contato:/i.test(String(p.textContent || '').trim()));
    if (contactParagraph && !contactParagraph.querySelector(`a[href="https://wa.me/${WHATSAPP_NUMBER}"]`)) {
      contactParagraph.appendChild(document.createTextNode(' · WhatsApp '));
      const wa = document.createElement('a');
      wa.href = `https://wa.me/${WHATSAPP_NUMBER}`;
      wa.target = '_blank';
      wa.rel = 'noopener noreferrer';
      wa.textContent = WHATSAPP_LABEL;
      contactParagraph.appendChild(wa);
    }
  }

  function enhanceWarrantyInformation() {
    const termsHeading = Array.from(document.querySelectorAll('.policy-card h2')).find(h => /^8\.\s*Garantia/i.test(String(h.textContent || '').trim()));
    const termsSection = termsHeading?.closest('.policy-card');
    if (termsSection && termsSection.dataset.warrantyUpdated !== '1') {
      termsSection.dataset.warrantyUpdated = '1';
      termsSection.innerHTML = `
        <h2>8. Garantia e assistência</h2>
        <p>Todos os relógios comercializados pela Relógio e Cia contam com <strong>garantia contratual de 1 ano</strong>, conforme o termo ou certificado de garantia que acompanha o produto, sem prejuízo da garantia legal prevista no Código de Defesa do Consumidor.</p>
        <p>Para os demais produtos duráveis, o prazo legal para reclamar de vícios aparentes ou de fácil constatação é de <strong>90 dias</strong>, contado da entrega efetiva. Em caso de vício oculto, esse prazo começa quando o defeito ficar evidenciado.</p>
        <p>Em caso de defeito ou dúvida sobre assistência, entre em contato conosco. A garantia contratual é complementar à garantia legal e não reduz os direitos assegurados ao consumidor.</p>`;
    }

    const rulesHeading = Array.from(document.querySelectorAll('.policy-card h2')).find(h => /^Regras principais$/i.test(String(h.textContent || '').trim()));
    const rules = rulesHeading?.closest('.policy-card');
    if (rules && rules.dataset.warrantyUpdated !== '1') {
      const defectHeading = Array.from(rules.querySelectorAll('h3')).find(h => /Produto com defeito/i.test(String(h.textContent || '')));
      const paragraph = defectHeading?.nextElementSibling;
      if (paragraph?.tagName === 'P') {
        paragraph.innerHTML = 'Todos os relógios comercializados pela Relógio e Cia contam com <strong>garantia contratual de 1 ano</strong>, conforme o termo ou certificado que acompanha o produto, sem prejuízo da garantia legal. Para os demais produtos duráveis, o prazo legal para reclamar de vícios aparentes ou de fácil constatação é de <strong>90 dias</strong>, contado da entrega efetiva; em caso de vício oculto, a contagem começa quando o defeito ficar evidenciado.';
        rules.dataset.warrantyUpdated = '1';
      }
    }
  }

  function ensureCartLegalSummary() {
    const checkoutButton = document.getElementById('btn-finalizar');
    if (!checkoutButton || document.getElementById('cart-legal-summary')) return;
    const summary = document.createElement('div');
    summary.id = 'cart-legal-summary';
    summary.className = 'cart-legal-summary';
    summary.innerHTML = '<strong>Antes de finalizar</strong>Revise os itens, a forma de entrega e o valor total. Consulte os <a href="termos-de-uso.html">Termos de Uso e Compra</a>, a <a href="politica-de-privacidade.html">Política de Privacidade</a> e as regras de <a href="trocas-estornos.html">Trocas, Devoluções e Estornos</a>. Essas informações não limitam os direitos garantidos pela legislação ao consumidor.';
    checkoutButton.parentNode.insertBefore(summary, checkoutButton);
  }

  function enhanceFooter() {
    ensureMobileStyles();
    ensureAccessibilityStyles();
    ensureAccessibilityControlsScript();
    normalizeTelephoneLinks();
    clarifyLegalPageIdentity();
    enhanceHomepageContact();
    enhancePolicyContacts();
    enhanceWarrantyInformation();
    ensureCartLegalSummary();

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

  if (readContrastPreference()) document.documentElement.classList.add('reloja-high-contrast');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceFooter);
  else enhanceFooter();
})();
