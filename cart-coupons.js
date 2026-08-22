(() => {
  const CART_KEY = 'reloja_carrinho';
  const SESSION_KEY = 'reloja_sessao';
  const SHIPPING_KEY = 'reloja_frete_selecionado';
  const COUPON_KEY = 'reloja_cupom_frete';
  let applied = null;

  const brl = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function readStorage(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function cart() { const v = readStorage(localStorage, CART_KEY, []); return Array.isArray(v) ? v : []; }
  function user() { return readStorage(localStorage, SESSION_KEY, null); }
  function shipping() { return readStorage(sessionStorage, SHIPPING_KEY, null); }
  function subtotal() { return cart().reduce((s, i) => s + Number(i.preco || 0) * Number(i.qtd || 1), 0); }
  function cartSignature() { return cart().map(i => `${Number(i.id)}:${Number(i.qtd || 1)}`).sort().join('|'); }
  function pixSelected() { return document.querySelector('input[name="pagamento"]:checked')?.value === 'pix'; }

  function currentContext() {
    const s = shipping();
    return `${cartSignature()}|${s?.service_id || ''}|${s?.postal_code || ''}|${Number(s?.price || 0).toFixed(2)}`;
  }

  function ensureUi() {
    const form = document.getElementById('payment-form');
    if (!form || document.getElementById('coupon-box')) return;
    const box = document.createElement('div');
    box.id = 'coupon-box';
    box.className = 'coupon-box';
    box.innerHTML = `
      <div class="coupon-box__title">Cupom de frete grátis</div>
      <div class="coupon-form">
        <input id="coupon-code" maxlength="32" autocomplete="off" placeholder="Digite seu cupom" aria-label="Cupom de frete grátis">
        <button id="coupon-apply" type="button">Aplicar</button>
      </div>
      <div id="coupon-message" class="coupon-message"></div>`;
    form.parentNode.insertBefore(box, form);
    document.getElementById('coupon-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/\s+/g, ''); });
    document.getElementById('coupon-code').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });
    document.getElementById('coupon-apply').addEventListener('click', applyCoupon);
  }

  function setMessage(text, type = 'info') {
    const el = document.getElementById('coupon-message');
    if (!el) return;
    el.textContent = text || '';
    el.className = `coupon-message ${type}`;
    el.style.display = text ? 'block' : 'none';
  }

  function saveApplied(value) {
    applied = value || null;
    if (applied) sessionStorage.setItem(COUPON_KEY, JSON.stringify(applied));
    else sessionStorage.removeItem(COUPON_KEY);
  }

  function invalidate(reason) {
    if (!applied) return;
    saveApplied(null);
    const input = document.getElementById('coupon-code');
    if (input) input.value = '';
    if (reason) setMessage(reason, 'info');
    updateSummary();
  }

  async function applyCoupon() {
    const input = document.getElementById('coupon-code');
    const button = document.getElementById('coupon-apply');
    const code = String(input?.value || '').trim().toUpperCase();
    const s = shipping();
    if (!code) return setMessage('Digite o código do cupom.', 'error');
    if (!s?.service_id || s?.price == null) return setMessage('Calcule e selecione o frete antes de aplicar o cupom.', 'error');
    button.disabled = true;
    button.textContent = 'Validando...';
    try {
      const response = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code, subtotal: subtotal(), shipping_cost: Number(s.price || 0), email: user()?.email || '' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.valid) throw new Error(data.error || 'Cupom inválido.');
      saveApplied({ code: data.coupon.code, context: currentContext(), discount: Number(data.shipping_discount || s.price || 0) });
      input.value = data.coupon.code;
      setMessage(`Cupom ${data.coupon.code} aplicado. Seu frete ficou grátis!`, 'success');
      updateSummary();
    } catch (error) {
      saveApplied(null);
      setMessage(error.message || 'Não foi possível aplicar o cupom.', 'error');
      updateSummary();
    } finally {
      button.disabled = false;
      button.textContent = 'Aplicar';
    }
  }

  function updateSummary() {
    if (applied && applied.context !== currentContext()) {
      invalidate('O carrinho ou o frete mudou. Aplique o cupom novamente.');
      return;
    }
    if (!applied) return;
    const sub = subtotal();
    const pixDiscount = pixSelected() ? sub * 0.05 : 0;
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = brl(sub - pixDiscount);
    const shippingEl = document.getElementById('cart-shipping');
    if (shippingEl) shippingEl.innerHTML = `<span class="coupon-old-freight">${brl(applied.discount)}</span> <strong>Grátis</strong>`;
  }

  function restore() {
    const saved = readStorage(sessionStorage, COUPON_KEY, null);
    if (saved?.code && saved?.context === currentContext()) {
      applied = saved;
      const input = document.getElementById('coupon-code');
      if (input) input.value = saved.code;
      setMessage(`Cupom ${saved.code} aplicado. Seu frete está grátis!`, 'success');
      updateSummary();
    } else {
      sessionStorage.removeItem(COUPON_KEY);
    }
  }

  function interceptCheckout() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init = {}) {
      const url = String(input?.url || input || '');
      if (!url.includes('/api/checkout') || String(init.method || 'GET').toUpperCase() !== 'POST' || !applied) return originalFetch(input, init);
      if (applied.context !== currentContext()) {
        invalidate('O carrinho ou o frete mudou. Aplique o cupom novamente.');
        return new Response(JSON.stringify({ error: 'Aplique novamente o cupom de frete grátis.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      try {
        const body = JSON.parse(init.body || '{}');
        body.coupon = applied.code;
        init = { ...init, body: JSON.stringify(body) };
      } catch {}
      return originalFetch(input, init);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureUi();
    interceptCheckout();
    setTimeout(restore, 350);
    document.getElementById('payment-form')?.addEventListener('change', () => setTimeout(updateSummary, 0));
    const target = document.getElementById('shipping-box') || document.getElementById('cart-summary-box');
    if (target) new MutationObserver(() => setTimeout(updateSummary, 0)).observe(target, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener('reloja:precos-sincronizados', () => invalidate('Os preços do carrinho foram atualizados. Aplique o cupom novamente.'));
  });
})();

