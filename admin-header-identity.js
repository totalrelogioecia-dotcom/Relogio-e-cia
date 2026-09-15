(() => {
  'use strict';

  const ROLES = {
    owner: { label: 'Proprietário', hint: 'Acesso completo', color: '#e31e24', soft: '#fff2f3', description: 'Controle total do painel, configurações e usuários administrativos.' },
    manager: { label: 'Gerente', hint: 'Operação da loja', color: '#2367c9', soft: '#eef5ff', description: 'Acesso à operação da loja, com ações críticas reservadas ao proprietário.' },
    atendimento: { label: 'Atendimento', hint: 'Atendimento e pós-venda', color: '#16804a', soft: '#edf9f2', description: 'Acesso focado em clientes, pedidos, avaliações, pós-venda e andamento de envios.' }
  };

  let currentAdmin = null;
  let isOpen = false;

  function meta(level) { return ROLES[level] || ROLES.atendimento; }

  function addStyles() {
    if (document.getElementById('admin-header-identity-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-header-identity-style';
    style.textContent = `
      .admin-identity-wrap{--identity-accent:#e31e24;--identity-soft:#fff2f3;position:relative;margin-left:auto;margin-right:10px;z-index:80}
      .admin-identity{appearance:none;position:relative;overflow:hidden;min-height:44px;padding:7px 12px;display:flex;align-items:center;gap:10px;border:1px solid #c9c9c9;border-radius:999px;background:#fff;color:#111;font:inherit;text-align:left;cursor:pointer;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease,background .2s ease}
      .admin-identity::after{content:'';position:absolute;top:-80%;left:-45%;width:28%;height:260%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.9),transparent);transform:rotate(18deg) translateX(-260%);transition:transform .65s ease;pointer-events:none}
      .admin-identity:hover,.admin-identity:focus-visible,.admin-identity[aria-expanded="true"]{border-color:var(--identity-accent);background:var(--identity-soft);box-shadow:0 0 0 3px color-mix(in srgb,var(--identity-accent) 10%,transparent),0 8px 26px rgba(0,0,0,.12);outline:none;transform:translateY(-1px)}
      .admin-identity:hover::after,.admin-identity:focus-visible::after,.admin-identity[aria-expanded="true"]::after{transform:rotate(18deg) translateX(520%)}
      .admin-identity-symbol{width:30px;height:30px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:var(--identity-accent);color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--identity-accent) 12%,transparent);transition:box-shadow .2s ease,transform .2s ease}
      .admin-identity:hover .admin-identity-symbol,.admin-identity[aria-expanded="true"] .admin-identity-symbol{box-shadow:0 0 0 4px color-mix(in srgb,var(--identity-accent) 16%,transparent),0 0 16px color-mix(in srgb,var(--identity-accent) 38%,transparent);transform:scale(1.04)}
      .admin-identity-symbol svg{width:16px;height:16px;display:block}
      .admin-identity-copy{display:grid;gap:2px;min-width:0;line-height:1.05}.admin-identity-name{max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-display);font-size:.82rem;font-weight:800}.admin-identity-role{display:flex;align-items:center;gap:5px;color:var(--identity-accent);font-family:var(--font-mono);font-size:.59rem;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}.admin-identity-role::before{content:'';width:5px;height:5px;border-radius:50%;background:#20a35a;box-shadow:0 0 0 3px rgba(32,163,90,.11)}
      .admin-identity-chevron{width:16px;height:16px;display:grid;place-items:center;color:var(--identity-accent);font-size:.78rem;transition:transform .2s ease}.admin-identity[aria-expanded="true"] .admin-identity-chevron{transform:rotate(180deg)}
      .admin-identity-popover{position:absolute;top:calc(100% + 10px);right:0;width:min(350px,calc(100vw - 24px));display:none;padding:17px;background:var(--bg);color:var(--ink);border:1px solid var(--line-strong);box-shadow:0 20px 55px rgba(0,0,0,.18)}.admin-identity-popover.open{display:block;animation:adminIdentityIn .16s ease-out}@keyframes adminIdentityIn{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
      .admin-identity-popover::before{content:'';position:absolute;top:-6px;right:34px;width:10px;height:10px;background:var(--bg);border-left:1px solid var(--line-strong);border-top:1px solid var(--line-strong);transform:rotate(45deg)}
      .admin-identity-profile{display:grid;grid-template-columns:42px 1fr;gap:11px;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--line)}.admin-identity-profile .admin-identity-symbol{width:42px;height:42px}.admin-identity-profile strong{display:block;font-family:var(--font-display);font-size:1rem;line-height:1.2}.admin-identity-email{display:block;margin-top:3px;color:var(--ink-soft);font-size:.73rem;overflow-wrap:anywhere}
      .admin-identity-access{padding:14px 0;border-bottom:1px solid var(--line)}.admin-identity-access-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.admin-identity-role-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;background:var(--identity-soft);color:var(--identity-accent);border:1px solid var(--identity-accent);border-radius:999px;font-family:var(--font-mono);font-size:.62rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.admin-identity-role-pill::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--identity-accent)}.admin-identity-live{display:inline-flex;align-items:center;gap:6px;color:#16804a;font-size:.7rem;white-space:nowrap}.admin-identity-live::before{content:'';width:7px;height:7px;border-radius:50%;background:#1d9c58;box-shadow:0 0 0 3px rgba(29,156,88,.12)}.admin-identity-access p{margin:0;color:var(--ink-soft);font-size:.76rem;line-height:1.5}
      .admin-identity-actions{display:flex;gap:8px;padding-top:14px}.admin-identity-actions button{flex:1;min-height:38px;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);cursor:pointer;font-family:var(--font-mono);font-size:.68rem;letter-spacing:.04em;text-transform:uppercase;transition:.16s ease}.admin-identity-actions button:hover,.admin-identity-actions button:focus-visible{border-color:var(--identity-accent);color:var(--identity-accent);outline:none;background:var(--identity-soft)}.admin-identity-actions .admin-identity-logout:hover,.admin-identity-actions .admin-identity-logout:focus-visible{background:#fff1f1;border-color:#b71f25;color:#b71f25}
      html.reloja-dark .admin-identity,html.reloja-dark .admin-identity-popover,html.reloja-dark .admin-identity-popover::before,html.reloja-dark .admin-identity-actions button{background:var(--bg-soft)!important;color:var(--ink)!important}html.reloja-dark .admin-identity:hover,html.reloja-dark .admin-identity:focus-visible,html.reloja-dark .admin-identity[aria-expanded="true"],html.reloja-dark .admin-identity-actions button:hover{background:var(--paper)!important}html.reloja-dark .admin-identity-wrap{--identity-soft:var(--paper)!important}
      html.reloja-high-contrast .admin-identity,html.reloja-high-contrast .admin-identity-popover,html.reloja-high-contrast .admin-identity-actions button,html.reloja-high-contrast .admin-identity-role-pill{background:#fff!important;color:#000!important;border:2px solid #000!important;box-shadow:none!important}html.reloja-high-contrast .admin-identity-symbol{background:#000!important;color:#fff!important;box-shadow:none!important}html.reloja-high-contrast .admin-identity-role,html.reloja-high-contrast .admin-identity-chevron,html.reloja-high-contrast .admin-identity-email,html.reloja-high-contrast .admin-identity-access p,html.reloja-high-contrast .admin-identity-live{color:#000!important}
      @media(max-width:760px){.admin-identity-wrap{margin-right:6px}.admin-identity{min-height:42px;padding-right:8px}.admin-identity-copy,.admin-identity-chevron{display:none}.admin-identity-popover{position:fixed;top:74px;right:12px;width:min(350px,calc(100vw - 24px))}.admin-identity-popover::before{display:none}}
      @media(max-width:480px){.admin-identity-actions{flex-direction:column}}
      @media(prefers-reduced-motion:reduce){.admin-identity,.admin-identity::after,.admin-identity-symbol,.admin-identity-chevron,.admin-identity-popover{transition:none!important;animation:none!important}}
    `;
    document.head.appendChild(style);
  }

  function icon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"></circle><path d="M5.8 20c.8-3.2 3-5 6.2-5s5.4 1.8 6.2 5"></path></svg>';
  }

  function close() {
    isOpen = false;
    const button = document.querySelector('.admin-identity');
    const popover = document.querySelector('.admin-identity-popover');
    button?.setAttribute('aria-expanded', 'false');
    popover?.classList.remove('open');
  }

  function toggle() {
    isOpen = !isOpen;
    const button = document.querySelector('.admin-identity');
    const popover = document.querySelector('.admin-identity-popover');
    button?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    popover?.classList.toggle('open', isOpen);
  }

  function ensureShell() {
    const nav = document.querySelector('.site-header .nav');
    if (!nav) return null;
    const existing = document.getElementById('admin-user-badge');
    if (existing?.dataset.identityEnhanced === '1') return existing.closest('.admin-identity-wrap');
    if (existing) existing.remove();

    let wrap = document.querySelector('.admin-identity-wrap');
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.className = 'admin-identity-wrap';
    wrap.hidden = true;
    wrap.innerHTML = `
      <button id="admin-user-badge" class="admin-identity" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="admin-identity-popover" data-identity-enhanced="1">
        <span class="admin-identity-symbol" data-id-symbol>${icon()}</span>
        <span class="admin-identity-copy"><strong class="admin-identity-name" data-id-name>Administrador</strong><small class="admin-identity-role" data-id-role>Acesso</small></span>
        <span class="admin-identity-chevron" aria-hidden="true">⌄</span>
      </button>
      <div id="admin-identity-popover" class="admin-identity-popover" role="dialog" aria-label="Informações do usuário administrativo">
        <div class="admin-identity-profile"><span class="admin-identity-symbol" data-id-pop-symbol>${icon()}</span><div><strong data-id-pop-name>Administrador</strong><span class="admin-identity-email" data-id-email></span></div></div>
        <div class="admin-identity-access"><div class="admin-identity-access-top"><span class="admin-identity-role-pill" data-id-pop-role>Acesso</span><span class="admin-identity-live">Sessão ativa</span></div><p data-id-description></p></div>
        <div class="admin-identity-actions"><button type="button" data-id-users style="display:none">Gerenciar usuários</button><button type="button" class="admin-identity-logout" data-id-logout>Sair</button></div>
      </div>`;
    const cta = nav.querySelector('.nav-cta');
    if (cta) nav.insertBefore(wrap, cta); else nav.appendChild(wrap);

    wrap.querySelector('.admin-identity').addEventListener('click', event => { event.stopPropagation(); toggle(); });
    wrap.querySelector('.admin-identity-popover').addEventListener('click', event => event.stopPropagation());
    wrap.querySelector('[data-id-logout]').addEventListener('click', () => { close(); document.getElementById('logout-btn')?.click(); });
    wrap.querySelector('[data-id-users]').addEventListener('click', () => { close(); document.querySelector('.admin-tabs [data-tab="usuarios-admin"]')?.click(); });
    return wrap;
  }

  function render(admin) {
    currentAdmin = admin;
    const wrap = ensureShell();
    if (!wrap || !admin) return;
    const role = meta(admin.access_level);
    wrap.hidden = false;
    wrap.style.setProperty('--identity-accent', role.color);
    wrap.style.setProperty('--identity-soft', role.soft);
    wrap.querySelector('[data-id-name]').textContent = admin.name || admin.email || 'Administrador';
    wrap.querySelector('[data-id-role]').textContent = role.label;
    wrap.querySelector('[data-id-pop-name]').textContent = admin.name || 'Administrador';
    wrap.querySelector('[data-id-email]').textContent = admin.email || '';
    wrap.querySelector('[data-id-pop-role]').textContent = `${role.label} · ${role.hint}`;
    wrap.querySelector('[data-id-description]').textContent = role.description;
    wrap.querySelector('[data-id-users]').style.display = admin.access_level === 'owner' ? '' : 'none';
  }

  async function syncIdentity() {
    const wrap = ensureShell();
    if (!wrap) return;
    try {
      const response = await fetch('/api/admin/session', { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authenticated || !data.admin) { wrap.hidden = true; close(); return; }
      render(data.admin);
    } catch { if (!currentAdmin) wrap.hidden = true; }
  }

  function boot() {
    addStyles();
    ensureShell();
    syncIdentity();
    document.getElementById('login-btn')?.addEventListener('click', () => setTimeout(syncIdentity, 500));
  }

  document.addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && isOpen) { close(); document.querySelector('.admin-identity')?.focus(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
