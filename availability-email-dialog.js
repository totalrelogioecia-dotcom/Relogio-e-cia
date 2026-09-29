/* RELÓGIO E CIA — consulta de disponibilidade sem conta */
(() => {
  'use strict';
  let active = false;

  function ensureDialog() {
    let dialog = document.getElementById('availability-email-dialog');
    if (dialog) return dialog;
    const style = document.createElement('style');
    style.textContent = `
      #availability-email-dialog{width:min(460px,calc(100% - 28px));max-height:calc(100vh - 28px);padding:0;border:1px solid var(--ink,#161616);background:var(--paper,#f5f3ef);color:var(--ink,#161616);box-shadow:0 28px 85px rgba(0,0,0,.34)}
      #availability-email-dialog::backdrop{background:rgba(13,13,13,.66)}
      #availability-email-dialog form{padding:30px;display:grid;gap:14px}
      #availability-email-dialog h2{font:700 1.6rem/1.15 var(--font-display,sans-serif);margin:0}
      #availability-email-dialog p{margin:0;color:var(--ink-soft,#4d4d4d);line-height:1.5}
      #availability-email-dialog label{display:grid;gap:7px;font-weight:600}
      #availability-email-dialog input{width:100%;min-height:46px;padding:10px 12px;font:inherit;border:1px solid var(--line-strong,#777);background:var(--bg,#fff);color:var(--ink,#161616)}
      #availability-email-dialog .availability-email-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      #availability-email-dialog .availability-email-actions button{min-height:44px}
    `;
    document.head.appendChild(style);
    dialog = document.createElement('dialog');
    dialog.id = 'availability-email-dialog';
    dialog.setAttribute('aria-labelledby', 'availability-email-title');
    dialog.innerHTML = `<form novalidate><h2 id="availability-email-title">Consultar disponibilidade</h2><p>Informe seu e-mail para a loja responder à sua consulta. A solicitação não reserva nem libera a compra do produto.</p><label for="availability-email-input">Seu e-mail<input id="availability-email-input" type="email" name="email" autocomplete="email" maxlength="180" required placeholder="seuemail@exemplo.com"></label><div class="availability-email-actions"><button type="button" class="btn btn-outline" data-cancelar>Cancelar</button><button type="submit" class="btn btn-primary">Enviar consulta</button></div></form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function promptEmail() {
    if (active) return Promise.resolve(null);
    const dialog = ensureDialog();
    const form = dialog.querySelector('form');
    const input = form.elements.email;
    input.value = '';
    active = true;
    return new Promise(resolve => {
      const finish = value => {
        dialog.close();
        active = false;
        form.removeEventListener('submit', submit);
        dialog.removeEventListener('cancel', cancel);
        dialog.querySelector('[data-cancelar]').removeEventListener('click', cancel);
        resolve(value);
      };
      const submit = event => {
        event.preventDefault();
        if (!input.reportValidity()) return;
        finish(input.value.trim().toLowerCase());
      };
      const cancel = event => {
        event.preventDefault();
        finish(null);
      };
      form.addEventListener('submit', submit);
      dialog.addEventListener('cancel', cancel);
      dialog.querySelector('[data-cancelar]').addEventListener('click', cancel);
      dialog.showModal();
      input.focus();
    });
  }

  window.RelogioAvailabilityEmail = { promptEmail };
})();
