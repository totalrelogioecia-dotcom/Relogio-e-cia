(() => {
  'use strict';

  const ROLE_META = {
    owner: {
      label: 'Proprietário',
      hint: 'Acesso completo',
      description: 'Controle total do painel, configurações e usuários administrativos.'
    },
    manager: {
      label: 'Gerente',
      hint: 'Operação da loja',
      description: 'Acesso à operação da loja, com algumas ações críticas reservadas ao proprietário.'
    },
    atendimento: {
      label: 'Atendimento',
      hint: 'Atendimento e pós-venda',
      description: 'Acesso focado em clientes, pedidos, avaliações, pós-venda e andamento de envios.'
    }
  };

  let currentAdmin = null;
  let open = false;

  function roleMeta(level) {
    return ROLE_META[level] || ROLE_META.atendimento;
  }

  function initials(name, email) {
    const source = String(name || '').trim();
    if (source) {
      const parts = source.split(/\s+/).filter(Boolean);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
    }
    return String(email || 'AD').slice(0, 2).toUpperCase();
  }

  function addStyles() {
    if (document.getElementById('admin-header-identity-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-header-identity-style';
    style.textContent = `
      .admin-identity-wrap{
        --identity-accent:#e31e24;
        --identity-soft:#fff2f3;
        position:relative;
        margin-left:auto;
        margin-right:10px;
        z-index:80;
      }
      .admin-identity-wrap.role-manager{--identity-accent:#2367c9;--identity-soft:#eef5ff}
      .admin-identity-wrap.role-atendimento{--identity-accent:#16804a;--identity-soft:#edf9f2}
      .admin-identity{
        appearance:none;
        border:1px solid var(--line-strong);
        background:var(--bg);
        color:var(--ink);
        min-height:46px;
        padding:5px 10px 5px 6px;
        display:flex;
        align-items:center;
        gap:9px;
        cursor:pointer;
        font:inherit;
        text-align:left;
        transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,background .16s ease;
      }
      .admin-identity:hover,
      .admin-identity:focus-visible,
      .admin-identity[aria-expanded="true"]{
        border-color:var(--identity-accent);
        background:var(--identity-soft);
        box-shadow:0 8px 24px rgba(0,0,0,.08);
        outline:none;
        transform:translateY(-1px);
      }
      .admin-identity-avatar{
        width:34px;height:34px;border-radius:50%;
        display:grid;place-items:center;
        flex:0 0 auto;
        background:var(--identity-accent);
        color:#fff;
        font-family:var(--font-display);
        font-size:.78rem;
        font-weight:800;
        letter-spacing:.02em;
        box-shadow:inset 0 0 0 2px rgba(255,255,255,.28);
      }
      .admin-identity-copy{display:grid;gap:1px;min-width:0;line-height:1.1}
      .admin-identity-name{
        max-width:150px;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        font-family:var(--font-display);
        font-size:.82rem;
        font-weight:700;
      }
      .admin-identity-role{
        color:var(--identity-accent);
        font-family:var(--font-mono);
        font-size:.62rem;
        letter-spacing:.06em;
        text-transform:uppercase;
        white-space:nowrap;
      }
      .admin-identity-chevron{
        width:18px;height:18px;
        display:grid;place-items:center;
        color:var(--identity-accent);
        font-size:.8rem;
        transition:transform .16s ease;
      }
      .admin-identity[aria-expanded="true"] .admin-identity-chevron{transform:rotate(180deg)}
      .admin-identity-popover{
        position:absolute;
        top:calc(100% + 10px);
        right:0;
        width:min(340px,calc(100vw - 24px));
        background:var(--bg);
        color:var(--ink);
        border:1px solid var(--line-strong);
        box-shadow:0 18px 50px rgba(0,0,0,.16);
        padding:16px;
        display:none;
      }
      .admin-identity-popover.open{display:block;animation:adminIdentityIn .14s ease-out}
      @keyframes adminIdentityIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
      .admin-identity-popover::before{
        content:'';
        position:absolute;
        top:-6px;right:28px;
        width:10px;height:10px;
        background:var(--bg);
        border-left:1px solid var(--line-strong);
        border-top:1px solid var(--line-strong);
        transform:rotate(45deg);
      }
      .admin-identity-profile{display:grid;grid-template-columns:44px 1fr;gap:11px;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--line)}
      .admin-identity-profile .admin-identity-avatar{width:44px;height:44px;font-size:.9rem}
      .admin-identity-profile strong{display:block;font-family:var(--font-display);font-size:1rem;line-height:1.2}
      .admin-identity-email{display:block;color:var(--ink-soft);font-size:.73rem;overflow-wrap:anywhere;margin-top:3px}
      .admin-identity-access{padding:14px 0;border-bottom:1px solid var(--line)}
      .admin-identity-access-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}
      .admin-identity-role-pill{
        display:inline-flex;align-items:center;gap:6px;
        background:var(--identity-soft);
        color:var(--identity-accent);
        border:1px solid var(--identity-accent);
        padding:5px 8px;
        font-family:var(--font-mono);
        font-size:.64rem;
        font-weight:700;
        letter-spacing:.04em;
        text-transform:uppercase;
      }
      .admin-identity-role-pill::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--identity-accent);box-shadow:0 0 0 3px var(--identity-soft)}
      .admin-identity-live{display:inline-flex;align-items:center;gap:6px;color:var(--ink-soft);font-size:.7rem;white-space:nowrap}
      .admin-identity-live::before{content:'';width:7px;height:7px;border-radius:50%;background:#1d9c58;box-shadow:0 0 0 3px rgba(29,156,88,.12)}
      .admin-identity-access p{margin:0;color:var(--ink-soft);font-size:.76rem;line-height:1.5}
      .admin-identity-actions{display:flex;gap:8px;padding-top:14px}
      .admin-identity-actions button{
        flex:1;
        min-height:38px;
        border:1px solid var(--line-strong);
        background:var(--bg);
        color:var(--ink);
        cursor:pointer;
        font-family:var(--font-mono);
        font-size:.68rem;
        letter-spacing:.04em;
        text-transform:uppercase;
        transition:.16s ease;
      }
      .admin-identity-actions button:hover,.admin-identity-actions button:focus-visible{border-color:var(--identity-accent);color:var(--identity-accent);outline:none;background:var(--identity-soft)}
      .admin-identity-actions .admin-identity-logout:hover,.admin-identity-actions .admin-identity-logout:focus-visible{background:#fff1f1;border-color:#b71f25;color:#b71f25}
      html.reloja-dark .admin-identity,
      html.reloja-dark .admin-identity-popover,
      html.reloja-dark .admin-identity-popover::before,
      html.reloja-dark .admin-identity-actions button{background:var(--bg-soft)!important;color:var(--ink)!important}
      html.reloja-dark .admin-identity:hover,
      html.reloja-dark .admin-identity:focus-visible,
      html.reloja-dark .admin-identity[aria-expanded="true"],
      html.reloja-dark .admin-identity-actions button:hover,
      html.reloja-dark .admin-identity-actions button:focus-visible{background:var(--paper)!important}
      html.reloja-dark .admin-identity-wrap{--identity-soft:var(--paper)}
      html.reloja-high-contrast .admin-identity,
      html.reloja-high-contrast .admin-identity-popover,
      html.reloja-high-contrast .admin-identity-actions button,
      html.reloja-high-contrast .admin-identity-role-pill{background:#fff!important;color:#000!important;border:2px solid #000!important;box-shadow:none!important}
      html.reloja-high-contrast .admin-identity-avatar{background:#000!important;color:#fff!important;box-shadow:none!important}
      html.reloja-high-contrast .admin-identity-role,
      html.reloja-high-contrast .admin-identity-chevron,
      html.reloja-high-contrast .admin-identity-email,
      html.reloja-high-contrast .admin-identity-access p,
      html.reloja-high-contrast .admin-identity-live{color:#000!important}
      @media(max-width:760px){
        .admin-identity-wrap{margin-right:6px}
        .admin-identity{padding-right:7px;min-height:42px}
        .admin-identity-avatar{width:30px;height:30px;font-size:.68rem}
        .admin-identity-copy{display:none}
        .admin-identity-chevron{display:none}
        .admin-identity-popover{position:fixed;top:74px;right:12px;width:min(340px,calc(100vw - 24px))}
        .admin-identity-popover::before{display:none}
      }
      @media(max-width:480px){
        .admin-identity-wrap{margin-left:auto}
        .admin-identity-actions{flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureShell() {
    const nav = document.querySelector('.site-header .nav');
    if (!nav) return null;

    const legacy = document.getElementById('admin-user-badge');
    if (legacy && legacy.dataset.identityEnhanced === '1') return legacy.closest('.admin-identity-wrap');
    if (legacy) legacy.remove();

    let wrap = document.querySelector('.admin-identity-wrap');
    if (wrap) return wrap;

    wrap = document.createElement('div');
    wrap.className = 'admin-identity-wrap role-owner';
    wrap.hidden = true;
    wrap.innerHTML = `
      <button id="admin-user-badge" class="admin-identity" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="admin-identity-popover" data-identity-enhanced="1">
        <span class="admin-identity-avatar" data-identity-avatar>AD</span>
        <span class="admin-identity-copy">
          <strong class="admin-identity-name" data-identity-name>Administrador</strong>
          <small class="admin-identity-role" data-identity-role>Acesso</small>
        </span>
        <span class="admin-identity-chevron" aria-hidden="true">⌄</span>
      </button>
      <div id="admin-identity-popover" class="admin-identity-popover" role="dialog" aria-label="Informações do usuário administrativo">
        <div class="admin-identity-profile">
          <span class="admin-identity-avatar" data-popover-avatar>AD</span>
          <div><strong data-popover-name>Administrador</strong><span class="admin-identity-email" data-popover-email></span></div>
        </div>
        <div class="admin-identity-access">
          <div class="admin-identity-access-top"><span class="admin-identity-role-pill" data-popover-role>Acesso</span><span class="admin-identity-live">Sessão ativa</span></div>
          <p data-popover-description></p>
        </div>
        <div class="admin-identity-actions">
          <button type="button" data-admin-users-shortcut style="display:none">Gerenciar usuários</button>
          <button type="button" class="admin-identity-logout" data-admin-logout-shortcut>Sair</button>
        </div>
      </div>`;

    const cta = nav.querySelector('.nav-cta');
    if (cta) nav.insertBefore(wrap, cta);
    else nav.appendChild(wrap);

    const button = wrap.querySelector('.admin-identity');
    button.addEventListener('click', event => {
      event.stopPropagation();
      setOpen(!open);
    });
    wrap.querySelector('.admin-identity-popover').addEventListener('click', event => event.stopPropagation());
    wrap.querySelector('[data-admin-logout-shortcut]').addEventListener('click', () => {
      setOpen(false);
      document.getElementById('logout-btn')?.click();
    });
    wrap.querySelector('[data-admin-users-shortcut]').addEventListener('click', () => {
      setOpen(false);
      const usersTab = document.querySelector('.admin-tabs [data-tab="usuarios-admin"]');
      if (usersTab) usersTab.click();
    });
    return wrap;
  }

  function setOpen(value) {
    open = Boolean(value);
    const wrap = document.querySelector('.admin-identity-wrap');
    if (!wrap) return;
    const button = wrap.querySelector('.admin-identity');
    const popover = wrap.querySelector('.admin-identity-popover');
    button?.setAttribute('aria-expanded', open ? 'true' : 'false');
    popover?.classList.toggle('open', open);
  }

  function render(admin) {
    currentAdmin = admin;
    const wrap = ensureShell();
    if (!wrap || !admin) return;
    const meta = roleMeta(admin.access_level);
    const avatar = initials(admin.name, admin.email);
    wrap.hidden = false;
    wrap.classList.remove('role-owner', 'role-manager', 'role-atendimento');
    wrap.classList.add(`role-${ROLE_META[admin.access_level] ? admin.access_level : 'atendimento'}`);
    wrap.querySelectorAll('[data-identity-avatar],[data-popover-avatar]').forEach(el => { el.textContent = avatar; });
    wrap.querySelector('[data-identity-name]').textContent = admin.name || admin.email || 'Administrador';
    wrap.querySelector('[data-identity-role]').textContent = meta.label;
    wrap.querySelector('[data-popover-name]').textContent = admin.name || 'Administrador';
    wrap.querySelector('[data-popover-email]').textContent = admin.email || '';
    wrap.querySelector('[data-popover-role]').textContent = `${meta.label} · ${meta.hint}`;
    wrap.querySelector('[data-popover-description]').textContent = meta.description;
    const usersShortcut = wrap.querySelector('[data-admin-users-shortcut]');
    if (usersShortcut) usersShortcut.style.display = admin.access_level === 'owner' ? '' : 'none';
  }

  async function syncIdentity() {
    const wrap = ensureShell();
    if (!wrap) return;
    try {
      const response = await fetch('/api/admin/session', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authenticated || !data.admin) {
        wrap.hidden = true;
        setOpen(false);
        return;
      }
      render(data.admin);
    } catch {
      if (!currentAdmin) wrap.hidden = true;
    }
  }

  document.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      document.querySelector('.admin-identity')?.focus();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    addStyles();
    ensureShell();
    syncIdentity();
    const loginButton = document.getElementById('login-btn');
    if (loginButton) loginButton.addEventListener('click', () => setTimeout(syncIdentity, 500));
  });
})();
