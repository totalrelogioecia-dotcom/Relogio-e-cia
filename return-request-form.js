(() => {
  const MAX_FILES = 3;
  const MAX_EDGE = 1200;
  const MAX_BYTES = 1_500_000;
  let attachments = [];

  const $ = s => document.querySelector(s);

  function sessionEmail() {
    try { return JSON.parse(localStorage.getItem('reloja_sessao') || 'null')?.email || ''; }
    catch { return ''; }
  }

  function statusLabel(value) {
    return ({
      recebida: 'Recebida',
      em_analise: 'Em análise',
      aguardando_cliente: 'Aguardando cliente',
      aprovada: 'Aprovada',
      concluida: 'Concluída',
      recusada: 'Não aprovada'
    })[value] || value || 'Recebida';
  }

  function typeLabel(value) {
    return ({ troca:'Troca', devolucao:'Devolução', estorno:'Estorno/cancelamento', garantia:'Garantia/defeito', outro:'Outro' })[value] || value;
  }

  function renderFiles() {
    const host = $('#return-files-list');
    if (!host) return;
    host.innerHTML = attachments.map((item, index) => `<span>${item.name}<button type="button" data-remove-file="${index}" aria-label="Remover ${item.name}">×</button></span>`).join('');
    host.querySelectorAll('[data-remove-file]').forEach(button => {
      button.onclick = () => {
        attachments.splice(Number(button.dataset.removeFile), 1);
        renderFiles();
      };
    });
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error(`${file.name} não é uma imagem.`));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error(`Não foi possível processar ${file.name}.`));
        image.onload = () => {
          const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          let data = canvas.toDataURL('image/webp', .78);
          if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', .78);
          const bytes = Math.floor(((data.split(',')[1] || '').length) * .75);
          if (bytes > MAX_BYTES) return reject(new Error(`${file.name} ficou grande demais. Escolha uma imagem menor.`));
          resolve({ name: file.name.slice(0, 120), data });
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files) {
    const incoming = Array.from(files || []);
    const message = $('#return-form-message');
    if (attachments.length + incoming.length > MAX_FILES) {
      message.textContent = `Você pode anexar no máximo ${MAX_FILES} imagens.`;
      message.className = 'return-feedback error';
      return;
    }
    try {
      for (const file of incoming) attachments.push(await fileToImage(file));
      renderFiles();
      message.textContent = '';
      message.className = 'return-feedback';
    } catch (error) {
      message.textContent = error.message;
      message.className = 'return-feedback error';
    }
  }

  async function submitRequest(event) {
    event.preventDefault();
    const button = $('#return-submit');
    const feedback = $('#return-form-message');
    button.disabled = true;
    button.textContent = 'Enviando...';
    feedback.textContent = '';

    try {
      const body = {
        order_id: $('#return-order').value.trim(),
        email: $('#return-email').value.trim(),
        type: $('#return-type').value,
        reason: $('#return-reason').value.trim(),
        message: $('#return-message').value.trim(),
        attachments
      };
      const response = await fetch('/api/return-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível enviar a solicitação.'), { data });

      const request = data.request;
      feedback.innerHTML = `<strong>Solicitação registrada.</strong><br>Seu protocolo é <strong>${request.protocol}</strong>. Guarde esse número para acompanhar o atendimento.`;
      feedback.className = 'return-feedback success';
      $('#return-protocol').value = request.protocol;
      $('#return-status-email').value = body.email;
      $('#return-request-form').reset();
      $('#return-email').value = sessionEmail();
      attachments = [];
      renderFiles();
    } catch (error) {
      const protocol = error.data?.protocol;
      feedback.innerHTML = protocol ? `${error.message}<br>Protocolo: <strong>${protocol}</strong>` : error.message;
      feedback.className = 'return-feedback error';
    } finally {
      button.disabled = false;
      button.textContent = 'Enviar solicitação';
    }
  }

  async function checkStatus(event) {
    event.preventDefault();
    const protocol = $('#return-protocol').value.trim();
    const email = $('#return-status-email').value.trim();
    const feedback = $('#return-status-result');
    feedback.textContent = 'Consultando...';
    feedback.className = 'return-status-result';
    try {
      const response = await fetch(`/api/return-requests/status?protocol=${encodeURIComponent(protocol)}&email=${encodeURIComponent(email)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o protocolo.');
      const request = data.request;
      feedback.innerHTML = `<strong>${request.protocol}</strong><br>Pedido: ${request.order_id}<br>Tipo: ${typeLabel(request.type)}<br>Status: <strong>${statusLabel(request.status)}</strong>${request.admin_note ? `<br>Observação: ${request.admin_note}` : ''}`;
      feedback.className = 'return-status-result success';
    } catch (error) {
      feedback.textContent = error.message;
      feedback.className = 'return-status-result error';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const email = sessionEmail();
    if (email) {
      $('#return-email').value = email;
      $('#return-status-email').value = email;
    }
    $('#return-request-form')?.addEventListener('submit', submitRequest);
    $('#return-status-form')?.addEventListener('submit', checkStatus);
    $('#return-files')?.addEventListener('change', event => {
      addFiles(event.target.files);
      event.target.value = '';
    });
  });
})();
