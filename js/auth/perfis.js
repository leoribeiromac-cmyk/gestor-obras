/* ============================================================
   PERFIS DE ACESSO — Gestor, Controle de Obras
   ------------------------------------------------------------
   O backend já devolvia o perfil no login e o js/auth/session.js já
   guardava — só que nenhuma tela consultava. Aqui está a regra.

   Cinco perfis:
     campo          apontador: lança produção, diário, notas e fotos
     administrativo escritório: notas, estoque, equipamentos
     engenharia     tudo da obra, análise e relatórios
     diretoria      só consulta
     admin          tudo, e é o único que apaga registro dos outros

   EXCLUSÃO: quem apaga é o ADMIN ou a PRÓPRIA PESSOA que lançou.
   Nem engenharia nem diretoria apagam lançamento de terceiro.
   (A mesma regra vale no backend — esconder botão não é segurança.)

   SEM BACKEND (CONFIG.appsScript vazio) todo mundo é admin: o app
   local é do próprio usuário e travar tela ali só atrapalharia.
   ============================================================ */
'use strict';

var PERFIS = {
  campo: {
    nome: 'Campo',
    desc: 'Apontador — lança a produção do dia',
    telas: ['servicos', 'rdo', 'diario', 'equip', 'historico', 'notas', 'galeria', 'projetos'],
    pode: ['lancarServico', 'lancarDiario', 'apontarEquip', 'lancarNota', 'anexarFoto', 'saidaEstoque']
  },
  administrativo: {
    nome: 'Administrativo',
    desc: 'Escritório — suprimentos, equipamentos e documentos',
    telas: ['executivo', 'servicos', 'medicao', 'apoio', 'reverso', 'equip', 'historico', 'notas', 'galeria', 'projetos'],
    pode: ['lancarNota', 'apontarEquip', 'cadastrarEquip', 'exportar', 'relatorio', 'saidaEstoque']
  },
  engenharia: {
    nome: 'Engenharia',
    desc: 'Engenheiro da obra — lança, confere e analisa',
    telas: ['executivo', 'servicos', 'medicao', 'apoio', 'reverso', 'ia', 'rdo', 'diario', 'equip', 'historico', 'notas', 'galeria', 'projetos'],
    pode: ['lancarServico', 'lancarDiario', 'apontarEquip', 'cadastrarEquip', 'lancarNota',
           'anexarFoto', 'editar', 'exportar', 'relatorio', 'saidaEstoque', 'analiseIA']
  },
  diretoria: {
    nome: 'Diretoria',
    desc: 'Consulta — acompanha sem lançar',
    telas: ['executivo', 'servicos', 'medicao', 'apoio', 'reverso', 'ia', 'historico', 'notas', 'galeria', 'projetos'],
    pode: ['exportar', 'relatorio', 'analiseIA']
  },
  admin: {
    nome: 'Administrador',
    desc: 'Acesso completo',
    telas: '*',
    pode: '*'
  }
};

/* qual perfil está valendo agora */
function perfilAtual() {
  // app local (sem servidor) não tem login de verdade — não faz sentido travar
  if (typeof BACKEND !== 'undefined' && !BACKEND) return 'admin';
  if (typeof isDemo === 'function' && isDemo()) return 'admin';
  var s = null;
  try { s = window.GestorAuth ? window.GestorAuth.getSession() : null; } catch (e) { s = null; }
  var p = (s && s.perfil) ? String(s.perfil).toLowerCase().trim() : '';
  // apelidos que podem aparecer na propriedade USUARIOS da planilha
  var apelidos = {
    apontador: 'campo', obra: 'campo', canteiro: 'campo',
    admin: 'admin', administrador: 'admin', master: 'admin',
    adm: 'administrativo', escritorio: 'administrativo', suprimentos: 'administrativo',
    engenheiro: 'engenharia', eng: 'engenharia',
    diretor: 'diretoria', gestao: 'diretoria'
  };
  if (apelidos[p]) p = apelidos[p];
  return PERFIS[p] ? p : 'engenharia';   // perfil desconhecido cai no meio-termo
}
function perfilInfo() { return PERFIS[perfilAtual()] || PERFIS.engenharia; }
function perfilNome() { return perfilInfo().nome; }
function ehAdmin() { return perfilAtual() === 'admin'; }

/* pode abrir a tela? */
function podeVer(tela) {
  var t = perfilInfo().telas;
  return t === '*' || t.indexOf(tela) > -1;
}
/* pode fazer a ação? */
function pode(acao) {
  var p = perfilInfo().pode;
  return p === '*' || p.indexOf(acao) > -1;
}
/* pode apagar ESTE registro? admin, ou quem o lançou */
function podeExcluir(reg) {
  if (ehAdmin()) return true;
  var meu = (typeof usuarioAtual === 'function' ? usuarioAtual() : '') || '';
  var dele = (reg && (reg.usuario || reg.responsavel)) || '';
  if (!meu || !dele) return false;          // registro antigo, sem dono: só o admin
  return String(dele).trim().toLowerCase() === String(meu).trim().toLowerCase();
}
/* pode editar ESTE registro? mesma regra da exclusão, mais a engenharia,
   que precisa corrigir dado errado de terceiro para fechar medição */
function podeEditar(reg) {
  return podeExcluir(reg) || pode('editar');
}

/* aviso padrão de tela sem acesso */
function telaBloqueada(tela) {
  var nomes = {
    executivo: 'o Painel Executivo', medicao: 'a Medição Física', rdo: 'o lançamento de serviços',
    diario: 'o Diário de Obra', equip: 'os Equipamentos', notas: 'as Notas Fiscais',
    ia: 'o Analista IA', apoio: 'o Apoio à Medição', reverso: 'o Planejamento reverso'
  };
  return '<div class="empty">' + (typeof ic === 'function' ? ic('chave') : '') +
    'Seu acesso de <b>' + perfilNome() + '</b> não abre ' + (nomes[tela] || 'esta tela') + '.' +
    '<br><span class="kpi-s">Fale com o administrador do sistema se precisar deste acesso.</span></div>';
}

if (typeof window !== 'undefined') {
  window.PERFIS = PERFIS; window.perfilAtual = perfilAtual; window.perfilNome = perfilNome;
  window.perfilInfo = perfilInfo; window.ehAdmin = ehAdmin; window.podeVer = podeVer;
  window.pode = pode; window.podeExcluir = podeExcluir; window.podeEditar = podeEditar;
  window.telaBloqueada = telaBloqueada;
}
