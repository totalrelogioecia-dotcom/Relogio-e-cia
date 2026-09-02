/* RELÓGIO E CIA — histórico e comprovantes de pedidos na conta do cliente */
(function () {
  'use strict';

  const TOKEN_KEY = 'reloja_auth_token';
  let loading = false;
  let scheduled = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  }

  function brl(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function date(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleString('pt-BR'); }
    catch { return ''; }
  }

  function statusLabel(order) {
    if (order?.cancellation?.status === 'refunded') return 'Cancelado pela loja · reembolsado';
    const status = String(order?.payment_status || order?.status || '').toLowerCase();
    if (status === 'approved' || status === 'paid' || status === 'processed') return 'Pagamento aprovado';
    if (status === 'refunded') return 'Reembolsado';
    if (status === 'rejected') return 'Pagamento recusado';
    if (status === 'cancelled' || status === 'canceled' || status === 'cancelled_by_store') return 'Cancelado';
    if (status === 'checkout_error') return 'Falha ao iniciar pagamento';
    return 'Aguardando pagamento';
  }

  function paymentLabel(order) {
    const method = String(order?.metodo || '').toLowerCase();
    if (method === 'pix') return 'PIX';
    if (method === 'cartao') return 'Cartão';
    return method ? method.toUpperCase() : 'Não informado';
  }

  function shippingLabel(order) {
    const shipping = order?.shipping;
    if (!shipping) return 'Não informado';
    if (String(shipping.mode || '').toLowerCase() === 'pickup') return 'Retirada na loja';
    return [shipping.company_name, shipping.service_name].filter(Boolean).join(' · ') || 'Entrega';
  }

  function addressLabel(address) {
    if (!address) return '';
    const street = [address.street_name, address.street_number].filter(Boolean).join(', ');
    const complement = address.complement ? ` · ${address.complement}` : '';
    const city = [address.neighborhood, address.city_name, address.state_code].filter(Boolean).join(' · ');
    const zip = String(address.zip_code || '').replace(/\D/g, '');
    const cep = zip.length === 8 ? `CEP ${zip.slice(0, 5)}-${zip.slice(5)}` : '';
    return [street ? `${street}${complement}` : '', city, cep].filter(Boolean).join(' · ');
  }

  function ensureStyle() {
    if (document.getElementById('account-orders-style')) return;
    const style = document.createElement('style');
    style.id = 'account-orders-style';
    style.textContent = `
      .account-orders-panel{margin-top:28px;padding-top:22px;border-top:1px solid rgba(0,0,0,.12)}
      .account-orders-panel h3{margin:0 0 14px;font-family:var(--font-display)}
      .account-order-card{border:1px solid rgba(0,0,0,.14);padding:14px;margin:0 0 10px;background:var(--paper,#fff)}
      .account-order-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.account-order-head strong{font-family:var(--font-mono);font-size:.78rem}
      .account-order-status{font-size:.75rem;font-weight:600}.account-order-items{margin:10px 0 0;padding:0;list-style:none;font-size:.78rem;line-height:1.5;color:var(--ink-soft)}
      .account-order-cancel{margin-top:12px;padding:11px 12px;background:#fff4e8;border-left:3px solid #b44b21;font-size:.78rem;line-height:1.5}
      .account-order-meta{font-size:.72rem;color:var(--ink-soft);margin-top:5px}
      .account-order-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}
      .account-order-actions button{appearance:none;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);padding:8px 10px;font:600 .68rem/1.2 var(--font-mono);cursor:pointer}
      .account-order-actions button:hover{border-color:var(--ink)}
      .account-order-actions button:focus-visible{outline:3px solid currentColor;outline-offset:2px}
      .account-order-receipt{margin-top:13px;padding:16px;border:1px solid var(--line-strong);background:var(--bg);font-size:.78rem;line-height:1.5}
      .account-order-receipt[hidden]{display:none!important}
      .account-order-receipt h4{margin:0 0 3px;font-family:var(--font-display);font-size:1rem}
      .account-order-receipt .receipt-company{padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--line)}
      .account-order-receipt .receipt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;margin-bottom:12px}
      .account-order-receipt .receipt-grid span{display:block;color:var(--ink-soft);font-size:.68rem;text-transform:uppercase;letter-spacing:.08em}
      .account-order-receipt .receipt-items{margin:10px 0;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
      .account-order-receipt .receipt-items div{display:flex;justify-content:space-between;gap:12px;margin:4px 0}
      .account-order-receipt .receipt-totals{margin-left:auto;max-width:300px}
      .account-order-receipt .receipt-row{display:flex;justify-content:space-between;gap:12px;margin:4px 0}
      .account-order-receipt .receipt-total{font-weight:700;font-size:.9rem;padding-top:6px;border-top:1px solid var(--line-strong)}
      .account-order-receipt .receipt-note{margin-top:12px;color:var(--ink-soft);font-size:.7rem}
      @media(max-width:620px){.account-order-receipt .receipt-grid{grid-template-columns:1fr}.account-order-receipt .receipt-items div{display:block;margin:8px 0}}
      @media print{
        body *{visibility:hidden!important}
        .account-order-receipt.is-printing,.account-order-receipt.is-printing *{visibility:visible!important}
        .account-order-receipt.is-printing{display:block!important;position:absolute;inset:0 auto auto 0;width:100%;margin:0;padding:20px;border:0;background:#fff;color:#000}
        .account-order-receipt.is-printing .receipt-print-hide{display:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function receiptTotals(order) {
    const subtotal = Number(order?.subtotal || 0);
    const pixDiscount = Number(order?.desconto_pix || 0);
    const shipping = Number(order?.shipping?.price || 0);
    const couponDiscount = Number(order?.coupon?.discount || 0);
    return { subtotal, pixDiscount, shipping, couponDiscount };
  }

  function receiptMarkup(order, index) {
    const totals = receiptTotals(order);
    const items = (order.items || []).map(item => {
      const quantity = Number(item.quantidade || 1);
      const lineTotal = Number(item.unit_price || 0) * quantity;
      return `<div><span>${quantity}× ${esc(item.nome)}${item.sku ? ` <small>(${esc(item.sku)})</small>` : ''}</span><strong>${brl(lineTotal)}</strong></div>`;
    }).join('');
    const address = addressLabel(order.delivery_address);
    const deliveryTime = Number.isFinite(Number(order?.shipping?.delivery_time)) && Number(order.shipping.delivery_time) > 0
      ? `${Number(order.shipping.delivery_time)} dia(s) úteis após a postagem/preparação, conforme serviço selecionado`
      : '';
    const shippingValue = totals.couponDiscount > 0 && Number.isFinite(Number(order?.shipping?.original_price))
      ? `<span><s>${brl(order.shipping.original_price)}</s> ${brl(totals.shipping)}</span>`
      : `<span>${brl(totals.shipping)}</span>`;
    const pixRow = totals.pixDiscount > 0
      ? `<div class="receipt-row"><span>Desconto PIX</span><span>− ${brl(totals.pixDiscount)}</span></div>`
      : '';

    return `<div class="account-order-receipt" id="receipt-${index}" hidden>
      <div class="receipt-company"><h4>Relógio &amp; Cia</h4><div>Albernard Comércio de Relógios Ltda · CNPJ 05.583.329/0001-46</div><div>Av. Cristóvão Colombo, 545 — Independência, Porto Alegre - RS · CEP 90560-003</div><div>Telefone: (51) 3737-7267 · WhatsApp: (51) 9631-1864</div></div>
      <div class="receipt-grid">
        <div><span>Pedido</span><strong>${esc(order.id)}</strong></div>
        <div><span>Data</span><strong>${esc(date(order.created_at))}</strong></div>
        <div><span>Status</span><strong>${esc(statusLabel(order))}</strong></div>
        <div><span>Pagamento</span><strong>${esc(paymentLabel(order))}</strong></div>
        <div><span>Entrega</span><strong>${esc(shippingLabel(order))}</strong></div>
        ${deliveryTime ? `<div><span>Prazo informado</span><strong>${esc(deliveryTime)}</strong></div>` : ''}
      </div>
      ${address ? `<div><strong>Endereço de entrega</strong><br>${esc(address)}</div>` : ''}
      <div class="receipt-items"><strong>Itens do pedido</strong>${items}</div>
      <div class="receipt-totals">
        <div class="receipt-row"><span>Subtotal</span><span>${brl(totals.subtotal)}</span></div>
        ${pixRow}
        <div class="receipt-row"><span>${String(order?.shipping?.mode || '').toLowerCase() === 'pickup' ? 'Retirada' : `Frete${order.coupon?.code ? ` · cupom ${esc(order.coupon.code)}` : ''}`}</span>${shippingValue}</div>
        <div class="receipt-row receipt-total"><span>Total</span><span>${brl(order.total)}</span></div>
      </div>
      <p class="receipt-note">Este comprovante resume as informações registradas no pedido e não substitui a nota fiscal. Aplicam-se os Termos de Uso e Compra e os direitos previstos na legislação de defesa do consumidor.</p>
      <div class="account-order-actions receipt-print-hide"><button type="button" data-print-receipt="${index}">Imprimir / salvar em PDF</button></div>
    </div>`;
  }

  function receiptText(order) {
    const totals = receiptTotals(order);
    const lines = [
      'RELÓGIO & CIA — COMPROVANTE DO PEDIDO',
      `Pedido: ${order.id}`,
      `Data: ${date(order.created_at)}`,
      `Status: ${statusLabel(order)}`,
      `Pagamento: ${paymentLabel(order)}`,
      '',
      'Itens:'
    ];
    (order.items || []).forEach(item => {
      const quantity = Number(item.quantidade || 1);
      lines.push(`${quantity}x ${item.nome} — ${brl(Number(item.unit_price || 0) * quantity)}`);
    });
    lines.push('', `Subtotal: ${brl(totals.subtotal)}`);
    if (totals.pixDiscount > 0) lines.push(`Desconto PIX: - ${brl(totals.pixDiscount)}`);
    const shippingText = totals.couponDiscount > 0
      ? `${brl(totals.shipping)} (cupom${order.coupon?.code ? ` ${order.coupon.code}` : ''}; economia no frete: ${brl(totals.couponDiscount)})`
      : brl(totals.shipping);
    lines.push(`${String(order?.shipping?.mode || '').toLowerCase() === 'pickup' ? 'Retirada' : 'Frete'}: ${shippingText}`);
    lines.push(`Total: ${brl(order.total)}`, '', `${shippingLabel(order)}`);
    lines.push('', 'Albernard Comércio de Relógios Ltda', 'CNPJ 05.583.329/0001-46', 'Telefone: (51) 3737-7267 · WhatsApp: (51) 9631-1864');
    return lines.join('\n');
  }

  function bindReceiptActions(panel, orders) {
    panel.querySelectorAll('[data-toggle-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.toggleReceipt);
        const receipt = document.getElementById(`receipt-${index}`);
        if (!receipt) return;
        const willOpen = receipt.hidden;
        receipt.hidden = !willOpen;
        button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        button.textContent = willOpen ? 'Ocultar comprovante' : 'Ver comprovante';
      });
    });

    panel.querySelectorAll('[data-whatsapp-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.whatsappReceipt);
        const order = orders[index];
        if (!order) return;
        const url = `https://wa.me/?text=${encodeURIComponent(receiptText(order))}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    });

    panel.querySelectorAll('[data-print-receipt]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.printReceipt);
        const receipt = document.getElementById(`receipt-${index}`);
        if (!receipt) return;
        document.querySelectorAll('.account-order-receipt').forEach(item => item.classList.remove('is-printing'));
        receipt.classList.add('is-printing');
        receipt.hidden = false;
        window.print();
        setTimeout(() => receipt.classList.remove('is-printing'), 300);
      });
    });
  }

  function render(orders) {
    ensureStyle();
    const box = document.getElementById('account-box');
    if (!box) return;
    let panel = document.getElementById('account-orders-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'account-orders-panel';
      panel.className = 'account-orders-panel';
      box.appendChild(panel);
    }

    if (!orders.length) {
      panel.innerHTML = '<h3>Meus pedidos</h3><p class="form-note">Você ainda não possui pedidos vinculados a esta conta.</p>';
      return;
    }

    panel.innerHTML = `<h3>Meus pedidos</h3>${orders.map((order, index) => {
      const cancellation = order.cancellation;
      const cancelBox = cancellation?.status === 'refunded'
        ? `<div class="account-order-cancel"><strong>Pedido cancelado pela loja</strong><br>O reembolso integral foi confirmado pelo Mercado Pago.<br><strong>Motivo:</strong> ${esc(cancellation.reason_label || 'Impossibilidade de prosseguir com o pedido')}${cancellation.details ? `<br>${esc(cancellation.details)}` : ''}${cancellation.refunded_at ? `<div class="account-order-meta">Reembolso registrado em ${esc(date(cancellation.refunded_at))}</div>` : ''}</div>`
        : '';
      const items = (order.items || []).map(item => `<li>${Number(item.quantidade || 1)}× ${esc(item.nome)} · ${brl(Number(item.unit_price || 0) * Number(item.quantidade || 1))}</li>`).join('');
      return `<article class="account-order-card"><div class="account-order-head"><div><strong>${esc(order.id)}</strong><div class="account-order-meta">${esc(date(order.created_at))}</div></div><div style="text-align:right"><div class="account-order-status">${esc(statusLabel(order))}</div><strong>${brl(order.total)}</strong></div></div><ul class="account-order-items">${items}</ul>${cancelBox}<div class="account-order-actions"><button type="button" data-toggle-receipt="${index}" aria-controls="receipt-${index}" aria-expanded="false">Ver comprovante</button><button type="button" data-whatsapp-receipt="${index}">Compartilhar no WhatsApp</button></div>${receiptMarkup(order, index)}</article>`;
    }).join('')}`;
    bindReceiptActions(panel, orders);
  }

  async function loadOrders() {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const box = document.getElementById('account-box');
    if (!box) return;
    if (!token) {
      document.getElementById('account-orders-panel')?.remove();
      return;
    }
    if (loading) return;
    loading = true;
    try {
      const response = await fetch('/api/auth/orders', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (response.status === 401) {
        document.getElementById('account-orders-panel')?.remove();
        return;
      }
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      render(Array.isArray(data.orders) ? data.orders : []);
    } finally {
      loading = false;
    }
  }

  function scheduleLoad() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; loadOrders().catch(() => {}); }, 80);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('account-box');
    if (box) {
      new MutationObserver(mutations => {
        const externalMutation = mutations.some(mutation => !mutation.target.closest?.('#account-orders-panel'));
        if (externalMutation) scheduleLoad();
      }).observe(box, { childList: true, subtree: true });
    }
    setTimeout(scheduleLoad, 250);
    window.addEventListener('storage', event => { if (event.key === TOKEN_KEY) scheduleLoad(); });
  });
})();
