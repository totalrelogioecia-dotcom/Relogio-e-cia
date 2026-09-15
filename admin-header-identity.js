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
  function initials(name, email) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) return `${parts[0][0] || ''}${parts.at(-1)[0] || ''}`.toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return String(email || 'AD').slice(0, 2).toUpperCase();
  }

  function addStyles() {
    if (document.getElementById('admin-header-identity-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-header-identity-style';
    style.textContent = `
      .admin-identity-wrap{--identity-accent:#e31e24;--identity-soft:#fff2f3;position:relative;margin-left:auto;margin-right:10px;z-index:80}
      .admin-identity{appearance:none;min-height:46px;padding:5px 10px 5px 6px;display:flex;align-items:center;gap:9px;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);font:inherit;text-align:left;cursor:pointer;transition:.16s ease}
      .admin-identity:hover,.admin-identity:focus-visible,.admin-identity[aria-expanded="true"]{border-color:var(--identity-accent);background:var(--identity-soft);box-shadow:0 8px 24px rgba(0,0,0,.08);outline:none;transform:translateY(-1px)}
      .admin-identity-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:var(--identity-accent);color:#fff;font-family:var(--font-display);font-size:.78rem;font-weight:800;letter-spacing:.02em;box-shadow:inset 0 0 0 2px rgba(255,255,255,.28)}
      .admin-identity-copy{display:grid;gap:1px;min-width:0;line-height:1.1}.admin-identity-name{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-display);font-size:.82rem;font-weight:700}.admin-identity-role{color:var(--identity-accent);font-family:var(--font-mono);font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
      .admin-identity-chevron{width:18px;height:18px;display:grid;place-items:center;color:var(--identity-accent);font-size:.8rem;transition:transform .16s ease}.admin-identity[aria-expanded="true"] .admin-identity-chevron{transform:rotate(180deg)}
      .admin-identity-popover{position:absolute;top:calc(100% + 10px);right:0;width:min(340px,calc(100vw - 24px));display:none;padding:16px;background:var(--bg);color:var(--ink);border:1px solid var(--line-strong);box-shadow:0 18px 50px rgba(0,0,0,.16)}.admin-identity-popover.open{display:block;animation:adminIdentityIn .14s ease-out}@keyframes adminIdentityIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
      .admin-identity-popover::before{content:'';position:absolute;top:-6px;right:28px;width:10px;height:10px;background:var(--bg);border-left:1px solid var(--line-strong);border-top:1px solid var(--line-strong);transform:rotate(45deg)}
      .admin-identity-profile{display:grid;grid-template-columns:44px 1fr;gap:11px;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--line)}.admin-identity-profile .admin-identity-avatar{width:44px;height:44px;font-size:.9rem}.admin-identity-profile strong{display:block;font-family:var(--font-display);font-size:1rem;line-height:1.2}.admin-identity-email{display:block;margin-top:3px;color:var(--ink-soft);font-size:.73rem;overflow-wrap:anywhere}
      .admin-identity-access{padding:14px 0;border-bottom:1px solid var(--line)}.admin-identity-access-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}.admin-identity-role-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;background:var(--identity-soft);color:var(--identity-accent);border:1px solid var(--identity-accent);font-family:var(--font-mono);font-size:.64rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.admin-identity-role-pill::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--identity-accent)}.admin-identity-live{display:inline-flex;align-items:center;gap:6px;color:var(--ink-soft);font-size:.7rem;white-space:nowrap}.admin-identity-live::before{content:'';width:7px;height:7px;border-radius:50%;background:#1d9c58;box-shadow:0 0 0 3px rgba(29,156,88,.12)}.admin-identity-access p{margin:0;color:var(--ink-soft);font-size:.76rem;line-height:1.5}
      .admin-identity-actions{display:flex;gap:8px;padding-top:14px}.admin-identity-actions button{flex:1;min-height:38px;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);cursor:pointer;font-family:var(--font-mono);font-size:.68rem;letter-spacing:.04em;text-transform:uppercase;transition:.16s ease}.admin-identity-actions button:hover,.admin-identity-actions button:focus-visible{border-color:var(--identity-accent);color:var(--identity-accent);outline:none;background:var(--identity-soft)}.admin-identity-actions .admin-identity-logout:hover,.admin-identity-actions .admin-identity-logout:focus-visible{background:#fff1f1;border-color:#b71f25;color:#b71f25}
      html.reloja-dark .admin-identity,html.reloja-dark .admin-identity-popover,html.reloja-dark .admin-identity-popover::before,html.reloja-dark .admin-identity-actions button{background:var(--bg-soft)!important;color:var(--ink)!important}html.reloja-dark .admin-identity:hover,html.reloja-dark .admin-identity:focus-visible,html.reloja-dark .admin-identity[aria-expanded="true"],html.reloja-dark .admin-identity-actions button:hover{background:var(--paper)!important}html.reloja-dark .admin-identity-wrap{--identity-soft:var(--paper)!important}
      html.reloja-high-contrast .admin-identity,html.reloja-high-contrast .admin-identity-popover,html.reloja-high-contrast .admin-identity-actions button,html.reloja-high-contrast .admin-identity-role-pill{background:#fff!important;color:#000!important;border:2px solid #000!important;box-shadow:none!important}html.reloja-high-contrast .admin-identity-avatar{background:#000!important;color:#fff!important;box-shadow:none!important}html.reloja-high-contrast .admin-identity-role,html.reloja-high-contrast .admin-identity-chevron,html.reloja-high-contrast .admin-identity-email,html.reloja-high-contrast .admin-identity-access p,html.reloja-high-contrast .admin-identity-live{color:#000!important}
      @media(max-width:760px){.admin-identity-wrap{margin-right:6px}.admin-identity{min-height:42px;padding-right:7px}.admin-identity-avatar{width:30px;height:30px;font-size:.68rem}.admin-identity-copy,.admin-identity-chevron{display:none}.admin-identity-popover{position:fixed;top:74px;right:12px;width:min(340px,calc(100vw - 24px))}.admin-identity-popover::before{display:none}}
      @media(max-width:480px){.admin-identity-actions{flex-direction:column}}
    `;
    document.head.appendChild(style);
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
        <span class="admin-identity-avatar" data-id-avatar>AD</span><span class="admin-identity-copy"><strong class="admin-identity-name" data-id-name>Administrador</strong><small class="admin-identity-role" data-id-role>Acesso</small></span><span class="admin-identity-chevron" aria-hidden="true">⌄</span>
      </button>
      <div id="admin-identity-popover" class="admin-identity-popover" role="dialog" aria-label="Informações do usuário administrativo">
        <div class="admin-identity-profile"><span class="admin-identity-avatar" data-id-pop-avatar>AD</span><div><strong data-id-pop-name>Administrador</strong><span class="admin-identity-email" data-id-email></span></div></div>
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
    const avatar = initials(admin.name, admin.email);
    wrap.hidden = false;
    wrap.style.setProperty('--identity-accent', role.color);
    wrap.style.setProperty('--identity-soft', role.soft);
    wrap.querySelector('[data-id-avatar]').textContent = avatar;
    wrap.querySelector('[data-id-pop-avatar]').textContent = avatar;
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
