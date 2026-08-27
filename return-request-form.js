(() => {
  const MAX_FILES = 3;
  const MAX_EDGE = 1200;
  const MAX_BYTES = 1_500_000;
  let attachments = [];

  const $ = s => document.querySelector(s);

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
    return ({ troca:'Troca', devolucao:'Devolução / arrependimento', estorno:'Estorno/cancelamento', garantia:'Garantia/defeito', outro:'Outro' })[value] || value;
  }

  function loadLegalFooter() {
    if (document.querySelector('script[data-legal-footer-loader]') || document.querySelector('.footer-company-identity')) return;
    const script = document.createElement('script');
    script.src = 'legal-footer.js';
    script.defer = true;
    script.setAttribute('data-legal-footer-loader', '1');
    document.head.appendChild(script);
  }

  function enhanceConsumerRights() {
    const formCard = document.querySelector('#solicitar');
    if (formCard && !document.querySelector('#direito-arrependimento')) {
      const card = document.createElement('section');
      card.className = 'policy-card';
      card.id = 'direito-arrependimento';
      card.innerHTML = `
        <p class="policy-kicker">Compra pela internet</p>
        <h2>Direito de arrependimento: 7 dias</h2>
        <p>Nas compras realizadas pela internet, o consumidor pode exercer o direito de arrependimento no prazo de <strong>7 dias corridos</strong>, contado da assinatura do contrato ou do recebimento do produto, conforme aplicável, nos termos do art. 49 do Código de Defesa do Consumidor.</p>
        <p>Não é necessário apresentar defeito no produto nem justificar a desistência. O exercício do direito não gera ônus ao consumidor. A Relógio e Cia fornecerá as orientações necessárias para a devolução e providenciará o cancelamento ou a restituição dos valores pagos conforme a legislação e o meio de pagamento utilizado.</p>
        <div class="policy-note"><strong>Como exercer:</strong> use o formulário abaixo e escolha “Devolução / arrependimento (compra online)”. O protocolo gerado pelo próprio site confirma imediatamente o recebimento da solicitação. Você também pode utilizar nosso e-mail ou telefone.</div>`;
      formCard.parentNode.insertBefore(card, formCard);
    }

    const intro = document.querySelector('.policy-hero .intro');
    if (intro) intro.textContent = 'Se alguma coisa não saiu como esperado, fale com a gente. Nesta página você pode exercer o direito de arrependimento de uma compra online e também solicitar troca, devolução, garantia, cancelamento ou estorno.';

    const type = $('#return-type');
    const returnOption = type?.querySelector('option[value="devolucao"]');
    if (returnOption) returnOption.textContent = 'Devolução / arrependimento (compra online)';

    const reason = $('#return-reason');
    if (reason) reason.placeholder = 'Ex.: direito de arrependimento da compra online';

    const fileHelp = $('#return-files')?.parentElement?.querySelector('small');
    if (fileHelp) fileHelp.textContent = 'Até 3 imagens. Para exercer o direito de arrependimento, fotos não são obrigatórias.';

    const sections = Array.from(document.querySelectorAll('.policy-card'));
    const rules = sections.find(section => /Regras principais/i.test(section.querySelector('h2')?.textContent || ''));
    if (rules) {
      const heading = Array.from(rules.querySelectorAll('h3')).find(h => /Desistência de compra online/i.test(h.textContent || ''));
      const paragraph = heading?.nextElementSibling;
      if (paragraph?.tagName === 'P') {
        paragraph.innerHTML = 'Para compras realizadas pela internet, o direito de arrependimento pode ser exercido em <strong>7 dias corridos</strong>, contado da assinatura do contrato ou do recebimento do produto, conforme aplicável. A solicitação pode ser feita por este site, por e-mail ou telefone e não depende de defeito ou justificativa.';
      }
    }

    const faq = sections.find(section => /Dúvidas frequentes/i.test(section.querySelector('h2')?.textContent || ''));
    if (faq) {
      const responseHeading = Array.from(faq.querySelectorAll('h3')).find(h => /Em quanto tempo vocês respondem/i.test(h.textContent || ''));
      const responseParagraph = responseHeading?.nextElementSibling;
      if (responseParagraph?.tagName === 'P') {
        responseParagraph.textContent = 'O formulário gera imediatamente um protocolo confirmando o recebimento. A manifestação da loja sobre a demanda será encaminhada em até 5 dias, sem prejuízo de providências que devam ocorrer antes por força da legislação aplicável.';
      }
    }
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
      feedback.innerHTML = `<strong>Solicitação registrada e recebida.</strong><br>Seu protocolo é <strong>${request.protocol}</strong>. Guarde esse número para acompanhar o atendimento.`;
      feedback.className = 'return-feedback success';
      $('#return-protocol').value = request.protocol;
      $('#return-status-email').value = body.email;
      $('#return-request-form').reset();
      $('#return-email').value = '';
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
    loadLegalFooter();
    enhanceConsumerRights();
    $('#return-request-form')?.addEventListener('submit', submitRequest);
    $('#return-status-form')?.addEventListener('submit', checkStatus);
    $('#return-files')?.addEventListener('change', event => {
      addFiles(event.target.files);
      event.target.value = '';
    });
  });
})();