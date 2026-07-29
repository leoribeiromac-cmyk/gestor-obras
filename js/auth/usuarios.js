/* ============================================================
   GERENCIAR USUÁRIOS — tela do administrador
   ------------------------------------------------------------
   Cadastra, altera e remove quem entra no sistema, direto no app.
   Antes era preciso mexer na propriedade USUARIOS do Apps Script E
   na lista do index.html — duas coisas, em dois lugares.

   O que está aqui é só a tela. Toda a regra vale no Code.gs:
   só admin, senha guardada com hash, senha nunca volta para o app,
   ninguém se exclui e o sistema nunca fica sem administrador.
   ============================================================ */
'use strict';

var USUARIOS_ESTADO = { lista: [], eu: '', carregando: false, erro: '' };

function usuariosAbrir() {
  if (!ehAdmin()) { toast('Só o administrador gerencia usuários'); return; }
  if (!BACKEND) {
    abrirModal('Usuários', `<div class="nf-alerta nf-alerta-ylw">O app está sem servidor configurado.
      O cadastro de usuários vive no Apps Script, então precisa do backend ligado.</div>`, 560);
    return;
  }
  USUARIOS_ESTADO.erro = '';
  abrirModal('Usuários e permissões', `<div id="usBox"><div class="empty">${ic('ampulheta')}Carregando…</div></div>`, 680);
  usuariosCarregarLista();
}

async function usuariosCarregarLista() {
  USUARIOS_ESTADO.carregando = true;
  try {
    const r = await postAcao({ action: 'usuariosListar' });
    if (r && r.ok) {
      USUARIOS_ESTADO.lista = r.usuarios || [];
      USUARIOS_ESTADO.eu = r.eu || usuarioAtual();
      USUARIOS_ESTADO.erro = '';
      // guarda os nomes para o campo de login sugerir, sem expor nada no servidor
      try { localStorage.setItem('gestor:nomes', JSON.stringify(USUARIOS_ESTADO.lista.map(u => u.nome))); } catch (e) {}
    } else {
      USUARIOS_ESTADO.erro = (r && (r.mensagem || r.error)) || 'Não consegui ler a lista.';
    }
  } catch (e) {
    USUARIOS_ESTADO.erro = 'Sem conexão com o servidor.';
  }
  USUARIOS_ESTADO.carregando = false;
  usuariosRender();
}

function usuariosRender() {
  const box = el('usBox'); if (!box) return;
  if (USUARIOS_ESTADO.erro) {
    box.innerHTML = `<div class="nf-alerta nf-alerta-red">${esc(USUARIOS_ESTADO.erro)}</div>
      ${/EXIGIR_TOKEN/i.test(USUARIOS_ESTADO.erro) ? `<div style="font-size:13.5px;line-height:1.7">
        <b>Como resolver:</b><br>
        1. Planilha → <b>Extensões ▸ Apps Script</b><br>
        2. <b>⚙ Configurações do projeto ▸ Propriedades do script</b><br>
        3. Acrescente <b>EXIGIR_TOKEN</b> com o valor <b>true</b></div>` : ''}
      <button class="btn" style="width:100%;justify-content:center;margin-top:12px" onclick="usuariosCarregarLista()">Tentar de novo</button>`;
    return;
  }

  const lista = USUARIOS_ESTADO.lista;
  const antigos = lista.filter(u => u.formatoAntigo).length;
  const linhas = lista.map(u => {
    const eu = u.nome === USUARIOS_ESTADO.eu;
    return `<div class="us-item">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px">${esc(u.nome)}${eu ? ' <span class="chip" style="padding:1px 8px;font-size:10.5px">você</span>' : ''}</div>
        <div class="kpi-s">${esc((PERFIS[u.perfil] || {}).nome || u.perfil)} · ${esc((PERFIS[u.perfil] || {}).desc || '')}</div>
        ${u.formatoAntigo ? `<div class="kpi-s" style="color:var(--amarelo)">senha ainda em texto puro — troque para proteger</div>` : ''}
      </div>
      <button class="btn btn-sm btn-ghost" onclick="usuariosForm('${esc(u.nome)}')" title="Editar">${ic('editar')}</button>
      ${eu ? '' : `<button class="btn btn-sm btn-ghost" onclick="usuariosExcluir('${esc(u.nome)}')" title="Excluir">${ic('fechar')}</button>`}
    </div>`;
  }).join('');

  box.innerHTML = `
    ${antigos ? `<div class="nf-alerta nf-alerta-ylw">${antigos} usuário(s) com a senha guardada em texto puro na planilha,
      do formato antigo. Edite e defina uma senha nova — a partir daí ela fica embaralhada.</div>` : ''}
    <div style="margin-bottom:12px">${linhas || '<div class="empty">Nenhum usuário cadastrado.</div>'}</div>
    <button class="btn btn-pri" style="width:100%;justify-content:center" onclick="usuariosForm('')">${ic('mais')} Novo usuário</button>
    <div class="kpi-s" style="margin-top:12px;line-height:1.6">
      Quem entra vê só o que o perfil dele permite. Apagar lançamento continua sendo
      coisa de administrador ou de quem lançou.</div>`;
}

/* formulário de um usuário — vazio para criar, com nome para editar */
function usuariosForm(nome) {
  const u = USUARIOS_ESTADO.lista.find(x => x.nome === nome) || { nome: '', perfil: 'campo' };
  const novo = !nome;
  const opcoes = Object.keys(PERFIS).map(k =>
    `<option value="${k}" ${u.perfil === k ? 'selected' : ''}>${esc(PERFIS[k].nome)} — ${esc(PERFIS[k].desc)}</option>`).join('');

  abrirModal(novo ? 'Novo usuário' : 'Editar ' + esc(nome), `
    <input type="hidden" id="us_antigo" value="${esc(nome)}">
    <div class="field"><label class="fl">Nome de usuário</label>
      <input id="us_nome" value="${esc(u.nome)}" placeholder="Como a pessoa vai entrar" autocomplete="off"></div>
    <div class="field"><label class="fl">Nível de acesso</label>
      <select id="us_perfil">${opcoes}</select></div>
    <div class="field"><label class="fl">Senha ${novo ? '' : '<span class="kpi-s" style="text-transform:none;letter-spacing:0">— deixe em branco para manter a atual</span>'}</label>
      <input type="password" id="us_senha" autocomplete="new-password" placeholder="${novo ? 'Mínimo de 4 caracteres' : '••••••••'}"></div>
    <div id="us_erro" class="kpi-s" style="color:var(--vermelho);min-height:16px;margin:-6px 0 10px"></div>
    <div style="display:flex;gap:9px">
      <button class="btn" style="flex:1;justify-content:center" onclick="usuariosAbrir()">Voltar</button>
      <button class="btn btn-pri" style="flex:2;justify-content:center" onclick="usuariosGravar()">Salvar</button></div>`, 520);
}

async function usuariosGravar() {
  const nome = (el('us_nome') || {}).value || '';
  const perfil = (el('us_perfil') || {}).value || '';
  const senha = (el('us_senha') || {}).value || '';
  const antigo = (el('us_antigo') || {}).value || '';
  const erro = el('us_erro');
  if (!nome.trim()) { if (erro) erro.textContent = 'Informe o nome.'; return; }
  if (erro) erro.textContent = 'Salvando…';
  try {
    const r = await postAcao({ action: 'usuarioSalvar', nome: nome.trim(), perfil: perfil, senha: senha, nomeAntigo: antigo });
    if (r && r.ok) { toast('Usuário salvo'); usuariosAbrir(); }
    else if (erro) erro.textContent = (r && (r.mensagem || r.error)) || 'Não consegui salvar.';
  } catch (e) {
    if (erro) erro.textContent = 'Sem conexão com o servidor.';
  }
}

async function usuariosExcluir(nome) {
  if (!confirm('Excluir o usuário ' + nome + '?\n\nEle deixa de conseguir entrar. Os lançamentos que ele fez continuam no sistema.')) return;
  try {
    const r = await postAcao({ action: 'usuarioExcluir', nome: nome });
    if (r && r.ok) { toast('Usuário excluído'); usuariosCarregarLista(); }
    else toast((r && (r.mensagem || r.error)) || 'Não consegui excluir');
  } catch (e) { toast('Sem conexão com o servidor'); }
}

/* nomes conhecidos para o campo de login sugerir. Vem do CONFIG (o que
   está no código) mais o que foi visto da última vez — assim usuário novo
   entra sem precisar mexer no index.html. */
function usuariosSugeridos() {
  let salvos = [];
  try { salvos = JSON.parse(localStorage.getItem('gestor:nomes') || '[]'); } catch (e) { salvos = []; }
  const base = (typeof CONFIG !== 'undefined' && CONFIG.usuarios) ? CONFIG.usuarios : [];
  return [...new Set([].concat(salvos, base).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

if (typeof window !== 'undefined') {
  window.usuariosAbrir = usuariosAbrir; window.usuariosForm = usuariosForm;
  window.usuariosGravar = usuariosGravar; window.usuariosExcluir = usuariosExcluir;
  window.usuariosCarregarLista = usuariosCarregarLista; window.usuariosSugeridos = usuariosSugeridos;
}
