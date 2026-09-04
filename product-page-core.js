(() => {
  'use strict';

  const CART_KEY = 'reloja_carrinho';
  const SESSION_KEY = 'reloja_sessao';

  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  }

  function saveCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); }
    catch {}
    updateCartBadge();
  }

  function updateCartBadge() {
    const count = readCart().reduce((sum, item) => sum + Math.max(0, Number(item.qtd) || 0), 0);
    document.querySelectorAll('.cart-badge').forEach(badge => {
      badge.textContent = String(count);
      badge.dataset.zero = count === 0 ? '1' : '0';
    });
  }

  function updateAccountLink() {
    const link = document.getElementById('nav-conta-link');
    if (!link) return;
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (session?.nome) link.textContent = String(session.nome).split(/\s+/)[0] || 'Conta';
    } catch {}
  }

  function addCurrentProduct(id, qty = 1) {
    const product = window.__relogioCurrentProduct;
    if (!product || Number(product.id) !== Number(id)) return false;
    const items = readCart();
    const existing = items.find(item => Number(item.id) === Number(id));
    if (existing) existing.qtd = Math.max(1, Number(existing.qtd) || 0) + Math.max(1, Number(qty) || 1);
    else items.push({
      id: Number(product.id),
      sku: String(product.sku || ''),
      nome: String(product.nome || ''),
      preco: Number(product.preco) || 0,
      marca: String(product.marca || ''),
      foto: (Array.isArray(product.fotos) && product.fotos.find(Boolean)) || product.foto || '',
      qtd: Math.max(1, Number(qty) || 1)
    });
    saveCart(items);
    return true;
  }

  function photoError(img) {
    const wrap = img?.parentElement;
    img?.remove();
    if (wrap && !wrap.querySelector('.card-photo-placeholder,.product-photo-empty')) {
      const span = document.createElement('span');
      span.className = 'product-photo-empty';
      span.textContent = 'Foto em breve';
      wrap.appendChild(span);
    }
  }

  function installMobileMenu() {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    const utility = document.querySelector('.nav-utility');
    const catalog = document.querySelector('.nav-cta');
    if (!toggle || !links) return;

    if (!links.querySelector('.nav-mobile-account')) {
      const accountHref = utility?.querySelector('#nav-conta-link')?.getAttribute('href') || 'conta.html';
      const cartHref = utility?.querySelector('a[href*="carrinho"]')?.getAttribute('href') || 'carrinho.html';
      links.insertAdjacentHTML('beforeend', `
        <li class="nav-mobile-only nav-mobile-account"><a href="${accountHref}">Minha conta</a></li>
        <li class="nav-mobile-only"><a href="${cartHref}">Carrinho <span class="cart-badge" data-zero="1">0</span></a></li>
        <li class="nav-mobile-only"><a href="${catalog?.getAttribute('href') || 'produtos.html'}">Ver catálogo</a></li>`);
    }

    toggle.textContent = 'Mais';
    toggle.setAttribute('aria-label', 'Abrir mais opções');
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.textContent = open ? 'Fechar' : 'Mais';
      toggle.setAttribute('aria-label', open ? 'Fechar mais opções' : 'Abrir mais opções');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', event => {
      if (!event.target.closest('a')) return;
      links.classList.remove('open');
      toggle.textContent = 'Mais';
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  window.adicionarAoCarrinho = addCurrentProduct;
  window.tratarErroFoto = photoError;
  window.formatarPreco = value => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

  const install = () => {
    updateCartBadge();
    updateAccountLink();
    installMobileMenu();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
