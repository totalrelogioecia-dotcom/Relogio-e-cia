/* =========================================================
   RELÓGIO E CIA — motivos de recusa no painel administrativo
   Exibe o status_detail salvo pelo webhook do Mercado Pago.
   ========================================================= */
(function () {
  const TOKEN_KEY = 'reloja_admin_token';
  const ORDERS_LIST = '#orders-list';

  const REASONS = {
    accredited: {
      label: 'Pagamento aprovado',
      kind: 'ok',
      help: 'Pagamento aprovado e confirmado pelo Mercado Pago.'
    },
    cc_rejected_bad_filled_card_number: {
      label: 'Número do cartão incorreto',
      kind: 'error',
      help: 'O número do cartão precisa ser conferido pelo comprador.'
    },
    cc_rejected_bad_filled_date: {
      label: 'Validade do cartão incorreta',
      kind: 'error',
      help: 'A data de validade informada não foi aceita.'
    },
    cc_rejected_bad_filled_other: {
      label: 'Dados do cartão incorretos',
      kind: 'error',
      help: 'Há algum dado do cartão que precisa ser conferido.'
    },
    cc_rejected_bad_filled_security_code: {
      label: 'Código de segurança incorreto',
      kind: 'error',
      help: 'O CVV/código de segurança informado não foi aceito.'
    },
    cc_rejected_call_for_authorize: {
      label: 'Autorização do banco necessária',
      kind: 'warning',
      help: 'O titular deve falar com o banco emissor para autorizar a compra.'
    },
    cc_rejected_card_disabled: {
      label: 'Cartão desabilitado',
      kind: 'warning',
      help: 'O cartão pode estar bloqueado ou desabilitado para compras online.'
    },
    cc_rejected_duplicated_payment: {
      label: 'Pagamento duplicado',
      kind: 'warning',
      help: 'O Mercado Pago identificou uma cobrança semelhante feita recentemente.'
    },
    cc_rejected_insufficient_amount: {
      label: 'Limite ou saldo insuficiente',
      kind: 'warning',
      help: 'O banco informou que não há limite ou saldo suficiente para concluir a compra.'
    },
    cc_rejected_invalid_installments: {
      label: 'Parcelamento não permitido',
      kind: 'warning',
      help: 'A quantidade de parcelas escolhida não foi aceita pelo emissor.'
    },
    cc_rejected_max_attempts: {
      label: 'Muitas tentativas',
      kind: 'warning',
      help: 'O limite de tentativas para esse pagamento/cartão foi atingido. Evite repetir imediatamente.'
    },
    cc_rejected_blacklist: {
      label: 'Recusado por segurança',
      kind: 'risk',
      help: 'O pagamento foi recusado pelos controles de segurança/antifraude.'
    },
    cc_rejected_high_risk: {
      label: 'Risco elevado / antifraude',
      kind: 'risk',
      help: 'O Mercado Pago identificou risco elevado. Evite novas tentativas imediatas com os mesmos dados.'
    },
    cc_rejected_other_reason: {
      label: 'Recusado pelo emissor',
      kind: 'risk',
      help: 'O emissor recusou a compra sem informar um motivo específico. Pode ser necessário usar outro meio de pagamento ou falar com o banco.'
    }
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function statusDetail(order) {
    return String(
      order?.payment_detail?.status_detail ||
      order?.status_detail ||
      ''
    ).trim();
  }

  function paymentStatus(order) {
    return String(order?.payment_status || order?.status || '').trim().toLowerCase();
  }

  function reasonFor(order) {
    const detail = statusDetail(order);
    if (detail && REASONS[detail]) return { ...REASONS[detail], code: detail };

    const status = paymentStatus(order);
    if (status === 'approved' || status === 'paid') {
      return { label: 'Pagamento aprovado', kind: 'ok', help: 'Pagamento confirmado.', code: detail || 'approved' };
    }
    if (status === 'rejected') {
      return {
        label: 'Pagamento recusado',
        kind: 'error',
        help: detail ? 'O Mercado Pago devolveu um motivo técnico ainda não traduzido pelo painel.' : 'A recusa foi registrada, mas o motivo técnico ainda não foi recebido.',
        code: detail || 'sem status_detail'
      };
    }
    if (status === 'cancelled' || status === 'cancelled_by_collector') {
      return { label: 'Pagamento cancelado', kind: 'muted', help: 'A operação foi cancelada.', code: detail || status };
    }
    return {
      label: 'Aguardando resultado',
      kind: 'muted',
      help: 'O pagamento ainda não tem um resultado final.',
      code: detail || status || 'pending'
    };
  }

  async function fetchOrders() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return [];
    const response = await fetch('/api/admin/orders', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json().catch(() => []);
  }

  function renderReasonCell(order) {
    const reason = reasonFor(order);
    const paymentId = order?.payment_id ? String(order.payment_id) : '';
    const technical = reason.code ? `<code>${escapeHtml(reason.code)}</code>` : '';
    const operation = paymentId ? `<small>Operação ${escapeHtml(paymentId)}</small>` : '';
    return `
      <div class="payment-reason payment-reason--${escapeHtml(reason.kind)}">
        <strong>${escapeHtml(reason.label)}</strong>
        <span>${escapeHtml(reason.help)}</span>
        ${technical}
        ${operation}
      </div>`;
  }

  async function enhanceOrdersTable() {
    const host = document.querySelector(ORDERS_LIST);
    const table = host?.querySelector('table');
    if (!table || table.dataset.reasonsEnhanced === '1') return;

    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    const headerRow = table.querySelector('thead tr');
    if (!headerRow || !bodyRows.length) return;

    table.dataset.reasonsEnhanced = '1';

    const orders = await fetchOrders();
    const byId = new Map((Array.isArray(orders) ? orders : []).map(o => [String(o.id), o]));

    const header = document.createElement('th');
    header.className = 'payment-reason-col';
    header.textContent = 'Motivo / diagnóstico';

    // Coloca o diagnóstico logo depois da coluna Pagamento.
    const paymentHeader = Array.from(headerRow.children).find(th => th.textContent.trim().toLowerCase() === 'pagamento');
    if (paymentHeader?.nextSibling) headerRow.insertBefore(header, paymentHeader.nextSibling);
    else headerRow.appendChild(header);

    bodyRows.forEach(row => {
      const firstCell = row.querySelector('td');
      if (!firstCell) return;

      // Linha de "Nenhum pedido".
      if (firstCell.hasAttribute('colspan')) {
        firstCell.colSpan = Number(firstCell.colSpan || 1) + 1;
        return;
      }

      const orderId = firstCell.textContent.trim();
      const order = byId.get(orderId);
      const cell = document.createElement('td');
      cell.className = 'payment-reason-col';
      cell.innerHTML = order
        ? renderReasonCell(order)
        : '<div class="payment-reason payment-reason--muted"><strong>Sem diagnóstico</strong><span>Não foi possível relacionar este pedido aos dados do pagamento.</span></div>';

      const paymentCell = Array.from(row.children)[3];
      if (paymentCell?.nextSibling) row.insertBefore(cell, paymentCell.nextSibling);
      else row.appendChild(cell);
    });
  }

  let scheduled = false;
  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      enhanceOrdersTable().catch(() => {});
    }, 30);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector(ORDERS_LIST);
    if (!host) return;
    new MutationObserver(scheduleEnhance).observe(host, { childList: true, subtree: true });
    scheduleEnhance();
  });
})();

