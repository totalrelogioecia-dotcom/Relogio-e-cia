/* RELÓGIO E CIA — recuperação real de senha por e-mail */
(function () {
  function escaparHtml(valor) { return String(valor ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  async function api(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem('reloja_auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const resposta = await fetch(url, { ...options, headers });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir a operação.');
    return dados;
  }
  function mostrarTelaRecuperacao() {
    const tab = document.getElementById('tab-login'); if (!tab) return;
    const emailAtual = document.getElementById('login-email')?.value?.trim() || '';
    tab.dataset.loginAnterior = tab.innerHTML;
    tab.innerHTML = `<div class="password-recovery" style="margin-top:8px;"><p class="eyebrow">Recuperar acesso</p><h2 style="font-family:var(--font-display);font-size:1.35rem;margin:0 0 8px;">Esqueci minha senha</h2><p class="form-note">Informe o e-mail cadastrado e enviaremos um link seguro para criar uma nova senha.</p><p class="form-error" id="erro-recuperacao" style="display:none;"></p><div class="form-field"><label for="recuperacao-email">E-mail</label><input type="email" id="recuperacao-email" autocomplete="email" value="${escaparHtml(emailAtual)}" required></div><button class="btn btn-primary" type="button" id="btn-solicitar-recuperacao" style="width:100%;justify-content:center;">Enviar link de recuperação</button><button class="btn btn-outline" type="button" id="btn-voltar-login" style="width:100%;justify-content:center;margin-top:10px;">Voltar para entrar</button></div>`;
    document.getElementById('btn-voltar-login')?.addEventListener('click', () => { tab.innerHTML = tab.dataset.loginAnterior || ''; delete tab.dataset.loginAnterior; instalarBotao(); });
    document.getElementById('btn-solicitar-recuperacao')?.addEventListener('click', async () => {
      const email = document.getElementById('recuperacao-email')?.value.trim().toLowerCase() || '';
      const aviso = document.getElementById('erro-recuperacao'); if (!email) { aviso.textContent='Informe seu e-mail.'; aviso.className='form-error'; aviso.style.display='block'; return; }
      const botao = document.getElementById('btn-solicitar-recuperacao'); botao.disabled = true; botao.textContent = 'Enviando…';
      try { const dados = await api('/api/auth/forgot-password', { method:'POST', body:JSON.stringify({email}) }); aviso.className='form-note'; aviso.textContent=dados.message; aviso.style.display='block'; botao.textContent='Link solicitado'; }
      catch (erro) { aviso.className='form-error'; aviso.textContent=erro.message; aviso.style.display='block'; botao.disabled=false; botao.textContent='Enviar link de recuperação'; }
    });
  }
  function instalarBotao() { const tab=document.getElementById('tab-login'); if(!tab||document.getElementById('btn-esqueci-senha'))return; const loginButton=document.getElementById('btn-login'); if(!loginButton)return; const botao=document.createElement('button'); botao.type='button'; botao.id='btn-esqueci-senha'; botao.className='btn btn-outline'; botao.style.cssText='width:100%;justify-content:center;margin-top:10px;'; botao.textContent='Esqueci minha senha'; botao.addEventListener('click',mostrarTelaRecuperacao); loginButton.insertAdjacentElement('afterend',botao); }
  function iniciar() { const box=document.getElementById('account-box'); if(!box)return; instalarBotao(); new MutationObserver(instalarBotao).observe(box,{childList:true,subtree:true}); }
  document.addEventListener('DOMContentLoaded',iniciar);
})();
