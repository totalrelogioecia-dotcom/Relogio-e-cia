(() => {
  'use strict';

  const SECTIONS = [
    {
      id:'primeiros-passos', icon:'⌂', title:'Primeiros passos', tags:'inicio painel visão geral atualizar',
      intro:'Use a Visão geral para identificar pendências antes de começar a operação.',
      steps:[
        'Entre no painel com seu usuário administrativo e confira o nome e o nível de acesso exibidos no cabeçalho.',
        'Abra Visão geral e use “Atualizar painel” para consultar indicadores, pendências operacionais, pedidos recentes e resumo operacional.',
        'Clique nas pendências para abrir diretamente o módulo relacionado.',
        'Antes de uma ação sensível, confirme o pedido, cliente, valor e status exibidos na tela.'
      ],
      notes:['As opções do menu respeitam o nível de acesso do usuário. Se um módulo não aparecer, não tente contornar a permissão.']
    },
    {
      id:'produtos', icon:'□', title:'Produtos e estoque', tab:'produtos', tags:'produto cadastrar adicionar editar fotos estoque sku referencia pronta entrega encomenda confirmação ocultar',
      intro:'Cadastro, fotos, preço, estoque, disponibilidade e ficha técnica do relógio.',
      steps:[
        'Abra Produtos e clique em “+ Novo produto”.',
        'Preencha Nome, Marca, Categoria, SKU / Referência, Preço e Estoque.',
        'Escreva a descrição e adicione as fotos. O editor aceita até 8 imagens; também existe alternativa por URLs, uma por linha.',
        'Em Disponibilidade, escolha Pronta entrega, Sob encomenda ou Pedido mediante confirmação. Para Sob encomenda, informe o prazo de preparação; o painel aplica mínimo de 15 dias úteis.',
        'Preencha a ficha técnica apenas nos campos aplicáveis: movimento, materiais, cor, diâmetro, resistência à água, vidro, garantia e conteúdo da embalagem.',
        'Revise a configuração de frete do produto quando os campos de envio estiverem disponíveis.',
        'Marque “Produto visível na loja” somente quando o cadastro estiver pronto e clique em “Salvar produto”.',
        'Para localizar um item depois, use Pesquisa de estoque por referência, nome ou marca; também é possível filtrar itens em estoque, sem estoque e ocultos.'
      ],
      notes:['Pronta entrega usa o estoque físico cadastrado.','Pedido mediante confirmação impede o pagamento antes do contato/liberação da loja.','Campos vazios da ficha técnica não aparecem para o cliente.']
    },
    {
      id:'pedidos', icon:'▤', title:'Pedidos', tab:'pedidos', tags:'pedido pagamento cliente estoque atualizar',
      intro:'Acompanhe pagamento, nota fiscal, envio, documentos e ações de cada pedido.',
      steps:[
        'Abra Pedidos e clique em “Atualizar” para buscar o estado mais recente.',
        'Localize o pedido pelo número e confira cliente, total, pagamento, nota fiscal e data.',
        'Não avance para faturamento enquanto o pagamento não estiver confirmado.',
        'Se aparecer “Estoque insuficiente — revisar antes de faturar”, resolva o conflito de estoque ou siga o fluxo de cancelamento/estorno.',
        'Use as ações da própria linha do pedido para NF-e, envio, arquivos fiscais ou cancelamento quando estiverem disponíveis.'
      ],
      notes:['O botão de NF-e fica indisponível enquanto o pagamento não estiver confirmado ou houver conflito de estoque.']
    },
    {
      id:'nfe', icon:'▧', title:'NF-e e arquivos fiscais', tab:'pedidos', tags:'nota fiscal nfe danfe xml chave 44 digitos emitida cancelada',
      intro:'O painel registra os dados e arquivos da nota; a emissão fiscal continua no sistema fiscal da empresa.',
      steps:[
        'Em Pedidos, clique em “Registrar NF-e” ou “Editar NF-e”.',
        'Escolha Pendente, Emitida ou Cancelada.',
        'Para marcar como Emitida, informe o número da NF-e e a chave de acesso com exatamente 44 dígitos.',
        'Clique em “Salvar NF-e”.',
        'Quando necessário, use “Arquivos NF-e” para anexar o DANFE em PDF, o XML da NF-e ou ambos e clique em “Salvar arquivos”.'
      ],
      notes:['Arquivos já enviados por e-mail não podem ser recolhidos ao remover o arquivo do armazenamento.']
    },
    {
      id:'envio', icon:'→', title:'Envio e retirada', tab:'pedidos', tags:'frete envio rastreamento transportadora retirada cliente resend melhor envio',
      intro:'Registre o despacho ou deixe o pedido pronto para retirada.',
      steps:[
        'Na ação de envio do pedido, abra “Registrar envio”.',
        'Escolha “Pedido enviado” ou “Pronto para retirada na loja”.',
        'Para envio, informe Transportadora / serviço e, se houver, Código e Link de rastreamento.',
        'Informe a previsão comunicada ao cliente.',
        'Clique em “Salvar e avisar cliente”.'
      ],
      notes:['O e-mail automático depende da configuração do Resend/domínio.','A integração do Melhor Envio deve ser considerada operacional somente quando o painel indicar a conta autorizada e a configuração necessária concluída.']
    },
    {
      id:'cancelamento-estorno', icon:'×', title:'Cancelamento e estorno', tab:'pedidos', tags:'cancelar estorno reembolso refund mercado pago pagamento falha pendente',
      intro:'Fluxo sensível: o cancelamento pela loja solicita estorno integral do pagamento.',
      steps:[
        'Abra Pedidos, confira o pedido e confirme que ele está pago antes de iniciar.',
        'Clique em “Cancelar pedido”.',
        'Escolha o motivo. Se selecionar “Outro motivo”, descreva o motivo com detalhes.',
        'Leia a confirmação e marque “Confirmo que a loja não conseguirá cumprir este pedido e quero solicitar o estorno integral ao cliente.”',
        'Clique em “Cancelar e estornar”. O sistema solicita o estorno ao Mercado Pago.',
        'Considere concluído somente quando o painel mostrar “Reembolso integral confirmado”.',
        'Se aparecer “Estorno não confirmado” ou “Estorno pendente”, não trate como concluído: use “Tentar estorno” / “Tentar estorno novamente” e confira o retorno.'
      ],
      notes:['Se a NF-e já tiver sido emitida, observe o aviso fiscal exibido pelo painel e trate o cancelamento fiscal no processo adequado da empresa.','Não prometa estorno concluído ao cliente enquanto o painel não confirmar o reembolso.']
    },
    {
      id:'confirmacoes', icon:'✓', title:'Confirmações de disponibilidade', tab:'confirmacoes', tags:'confirmar disponibilidade liberar compra revogar autorização solicitação',
      intro:'Use esta área para solicitações de produtos que dependem de confirmação da loja.',
      steps:[
        'Abra Confirmações e localize a solicitação do cliente.',
        'Revise produto, quantidade e informações registradas antes de alterar o status.',
        'Atualize a solicitação conforme o atendimento realizado.',
        'Quando a opção estiver disponível para seu nível de acesso, use a ação de liberar compra somente após confirmar a disponibilidade real.',
        'Se a autorização deixar de ser válida, use a ação de revogar a liberação.'
      ],
      notes:['A liberação de compra é uma ação gerencial; o próprio painel restringe essa ação conforme o nível de acesso.']
    },
    {
      id:'pos-venda', icon:'↩', title:'Pós-venda', tab:'trocas', tags:'troca devolução garantia protocolo status solicitação',
      intro:'Acompanhe solicitações de troca, devolução e garantia.',
      steps:[
        'Abra Pós-venda e localize a solicitação/protocolo.',
        'Leia os dados do cliente, pedido e motivo antes de alterar qualquer status.',
        'Selecione o novo status de acordo com o andamento real do atendimento.',
        'Clique em “Salvar status”.',
        'Mantenha o status alinhado ao que foi efetivamente combinado com o cliente.'
      ],
      notes:['Não marque uma etapa como concluída antes da ação correspondente realmente acontecer.']
    },
    {
      id:'avaliacoes', icon:'☆', title:'Avaliações', tab:'reviews', tags:'avaliação review aprovar rejeitar moderação comprador verificado',
      intro:'Modere avaliações enviadas por compradores verificados.',
      steps:[
        'Abra Avaliações e use o filtro de Status para ver Todas, Pendentes, Aprovadas ou Rejeitadas.',
        'Leia a avaliação antes de moderar.',
        'Aprove quando estiver adequada para publicação ou rejeite quando não deva ser publicada, usando as ações disponíveis no painel.',
        'Atualize a lista para confirmar o status final.'
      ],
      notes:['O sistema restringe o envio de avaliação a clientes com compra paga daquele produto; a publicação depende da moderação da loja.']
    },
    {
      id:'cupons', icon:'%', title:'Cupons', tab:'cupons', tags:'cupom frete grátis código compra mínima usos validade cliente',
      intro:'Crie e mantenha cupons de frete grátis.',
      steps:[
        'Abra Cupons e inicie um novo cupom.',
        'Defina o código, valor mínimo da compra, limite total de usos, limite por cliente, início e expiração quando aplicável.',
        'Deixe o cupom ativo somente durante o período em que ele deve ser aceito.',
        'Salve e confira o status: Ativo, Inativo, Agendado, Expirado ou Esgotado.',
        'Para alterar uma regra, use “Editar”. Para remover definitivamente, use “Excluir” e confirme.'
      ],
      notes:['Excluir é diferente de apenas deixar o cupom inativo. Para preservar o cadastro, prefira desativar quando fizer sentido.']
    },
    {
      id:'carrossel', icon:'▣', title:'Carrossel da Home', tab:'home-carousel', owner:true, tags:'banner home carrossel slide imagem pc mobile claro escuro link autoplay',
      intro:'Área exclusiva do Proprietário para organizar os destaques da página inicial.',
      steps:[
        'Abra Carrossel da Home e use “+ Adicionar slide”. O limite atual é de 5 slides.',
        'Dê um Nome do post para organização interna do Admin.',
        'Cadastre a imagem principal. O padrão recomendado é 1920 × 600 px no computador e 1000 × 1000 px no celular.',
        'Quando houver versões específicas, adicione também imagens para modo escuro e para celular.',
        'Preencha texto alternativo e link quando o banner precisar levar o visitante para outra página.',
        'Organize a ordem, ative/desative os posts e revise as configurações exibidas pelo editor.',
        'Clique em “Salvar carrossel”. Nada novo é publicado antes de salvar.',
        'Use “Ver a home” para conferir o resultado.'
      ],
      notes:['As versões mobile e escuras são opcionais; quando faltam, o site usa a imagem clara disponível.','Use JPG, PNG ou WebP.']
    },
    {
      id:'usuarios', icon:'♙', title:'Usuários do Admin', tab:'usuarios-admin', owner:true, tags:'usuario proprietário gerente atendimento senha permissão bloquear excluir',
      intro:'Área exclusiva do Proprietário para criar e administrar acessos separados.',
      steps:[
        'Abra Usuários do Admin e clique em “+ Novo usuário”.',
        'Informe Nome, E-mail, Nível de acesso e uma senha com no mínimo 10 caracteres.',
        'Escolha Proprietário para acesso completo e gestão de usuários; Gerente para operação sem gestão de usuários; Atendimento para acesso focado em atendimento e pós-venda.',
        'Clique em “Salvar usuário”.',
        'Para alterar um acesso, edite o usuário. Preencha a senha somente quando quiser redefini-la.',
        'Use bloqueio/reativação quando quiser suspender ou devolver acesso sem apagar o cadastro.',
        'Use exclusão somente quando a remoção permanente for realmente necessária.'
      ],
      notes:['O usuário logado não pode excluir a própria conta por essa área.','O sistema protege a permanência de pelo menos um Proprietário ativo.']
    },
    {
      id:'auditoria', icon:'≡', title:'Auditoria e segurança', tab:'audit', tags:'auditoria segurança histórico ações senha sessão acesso',
      intro:'Consulte o histórico das principais ações administrativas e preserve a rastreabilidade.',
      steps:[
        'Abra Auditoria quando precisar conferir uma ação administrativa relevante.',
        'Use usuários individuais; não compartilhe uma única conta entre várias pessoas.',
        'Ao trocar a senha ou bloquear um usuário, considere as sessões antigas revogadas pelo sistema.',
        'Nunca use exclusão de usuários, produtos ou pedidos como solução para um problema visual do painel.',
        'Em ações financeiras, confirme o retorno do sistema antes de considerar a operação concluída.'
      ],
      notes:['As senhas administrativas são armazenadas de forma protegida; o painel não deve exibi-las em texto puro.']
    }
  ];

  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentIdentity=null;

  function sourceButton(tab){ return document.querySelector(`.admin-tabs button[data-tab="${CSS.escape(tab)}"]`); }
  function canOpen(section){
    if(!section.tab) return false;
    const button=sourceButton(section.tab);
    return !!button && getComputedStyle(button).display!=='none' && !button.hidden;
  }
  function openTab(tab){
    const button=sourceButton(tab);
    if(button && getComputedStyle(button).display!=='none' && !button.hidden) button.click();
  }

  function ensure(){
    const tabs=document.querySelector('.admin-tabs'), dashboard=document.getElementById('dashboard');
    if(!tabs||!dashboard) return;
    let tab=tabs.querySelector('[data-tab="manual"]');
    if(!tab){
      tab=document.createElement('button'); tab.type='button'; tab.dataset.tab='manual'; tab.textContent='Manual do Admin'; tabs.appendChild(tab);
      tab.addEventListener('click',()=>{
        dashboard.querySelectorAll(':scope > [id^="tab-"]').forEach(p=>p.style.display=p.id==='tab-manual'?'block':'none');
        tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===tab));
        render();
      });
      tabs.addEventListener('click',e=>{const other=e.target.closest('button[data-tab]');if(other&&other.dataset.tab!=='manual')document.getElementById('tab-manual')?.style.setProperty('display','none');});
    }
    if(!document.getElementById('tab-manual')){
      const panel=document.createElement('section'); panel.id='tab-manual'; panel.className='admin-module-panel admin-manual'; panel.style.display='none';
      panel.innerHTML=`
        <div class="admin-manual-head"><div><p class="eyebrow">Ajuda operacional</p><h2>Manual do Admin</h2><p>Procedimentos do painel Relógio e Cia, organizados para consulta rápida.</p></div><span class="admin-manual-version">Manual interno</span></div>
        <div class="admin-manual-search"><label for="admin-manual-query">O que você precisa fazer?</label><input id="admin-manual-query" type="search" autocomplete="off" placeholder="Ex.: adicionar produto, estorno, NF-e, envio..."><p id="admin-manual-count" aria-live="polite"></p></div>
        <div class="admin-manual-layout"><nav id="admin-manual-index" aria-label="Assuntos do manual"></nav><div id="admin-manual-content"></div></div>`;
      dashboard.appendChild(panel);
      panel.querySelector('#admin-manual-query').addEventListener('input',render);
    }
    render();
  }

  function render(){
    const host=document.getElementById('admin-manual-content'), index=document.getElementById('admin-manual-index'), input=document.getElementById('admin-manual-query');
    if(!host||!index) return;
    const q=String(input?.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const visible=SECTIONS.filter(s=>!q || `${s.title} ${s.tags} ${s.intro} ${s.steps.join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
    const count=document.getElementById('admin-manual-count'); if(count) count.textContent=q?`${visible.length} assunto(s) encontrado(s)`:`${SECTIONS.length} assuntos no manual`;
    index.innerHTML=visible.map(s=>`<a href="#manual-${s.id}"><span>${esc(s.icon)}</span>${esc(s.title)}</a>`).join('') || '<p>Nenhum assunto encontrado.</p>';
    host.innerHTML=visible.map((s,i)=>{
      const restricted=s.owner?'<span class="manual-badge">Somente Proprietário</span>':'';
      const action=s.tab && canOpen(s)?`<button type="button" class="btn btn-outline manual-open-module" data-manual-tab="${esc(s.tab)}">Abrir módulo</button>`:'';
      return `<details class="admin-manual-topic" id="manual-${s.id}" ${q||i===0?'open':''}><summary><span class="manual-topic-icon">${esc(s.icon)}</span><span><strong>${esc(s.title)}</strong><small>${esc(s.intro)}</small></span><span class="manual-topic-meta">${restricted}<b aria-hidden="true">⌄</b></span></summary><div class="admin-manual-body"><ol>${s.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>${s.notes?.length?`<div class="manual-notes"><strong>Atenção</strong>${s.notes.map(n=>`<p>${esc(n)}</p>`).join('')}</div>`:''}${action}</div></details>`;
    }).join('');
    host.querySelectorAll('[data-manual-tab]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.manualTab)));
  }

  window.addEventListener('reloja:admin-session',e=>{currentIdentity=e.detail?.admin||null;requestAnimationFrame(ensure);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();