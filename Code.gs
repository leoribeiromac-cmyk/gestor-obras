// ============================================================
// BACKEND — Apps Script do "Gestor — Controle de Obras"
// Uma planilha para TODAS as obras. Duas abas:
//   • RDO     -> lançamentos de serviço (produção)
//   • Diario  -> relatório diário de obra
// Cada linha tem a coluna "obra" (id da obra). O app grava/lê filtrando por ela.
//
// COMO USAR:
//   1. Crie a planilha e as duas abas com os cabeçalhos indicados no guia
//      (SETUP-BACKEND.md). A ordem das colunas não importa: o script resolve
//      pelo NOME do cabeçalho.
//   2. Extensões > Apps Script, cole ESTE arquivo em Code.gs, salve.
//   3. Implantar > Nova implantação > App da Web:
//        Executar como: Eu   |   Acesso: Qualquer pessoa
//      Copie a URL /exec e cole em CONFIG.appsScript no index.html.
//   4. Configurações do projeto > Propriedades do script:
//        USUARIOS     = {"Leonardo":"senha1","Wallace":"senha2","Guilherme":"senha3"}
//        EXIGIR_TOKEN = true
// ============================================================

var ABA_RDO        = 'RDO';
var ABA_DIARIO     = 'Diario';
var ABA_EQUIP      = 'Equipamentos';
var ABA_LOCADORA   = 'Locadoras';
var ABA_APONT      = 'ApontEquip';
var ABA_AUDITORIA  = 'Auditoria';
var ABA_NF         = 'NotasFiscais';
var ABA_PEDIDO     = 'Pedidos';

var HEADERS = {
  'Equipamentos': ['nome','tipo','vinculo','locadora','obra','ativo'],
  'Locadoras':    ['nome','observacoes','obra'],
  'ApontEquip':   ['carimbo','obra','data','turno','equipamento','operador','inicio','fim','horas','paradas','horimIni','horimFim','combustivel','situacao','observacoes','assinatura','clientId'],
  'Auditoria':    ['carimbo','usuario','perfil','acao','obra','registroId','detalhesAnteriores','detalhesNovos'],
  'NotasFiscais': ['id','clientId','obra','numero','serie','chave','dataEmissao','dataEntrada','cnpj','razaoSocial','nomeFantasia','municipio','uf','vProd','vFrete','vTotal','vBaseICMS','vICMS','itens','obs','responsavel','status','driveId','driveLink','leitura','historico','usuario','criadoEm','atualizadoEm'],
  'Pedidos':      ['id','obra','numero','data','fornecedor','cnpj','itens','status','usuario','criadoEm']
};

function doGet(e)  { return rotear(e); }
function doPost(e) { return rotear(e); }

function rotear(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var action = p.action || '';
  var resp;
  try {
    var PROTEGIDAS = [
      'obterRDO', 'obterDiario', 'addBatchRDO', 'deleteRDO', 'updateRDO', 'rdoFoto',
      'addDiario', 'updateDiario', 'deleteDiario',
      'equipListar', 'equipCadastrar', 'equipDesativar', 'locadoraCadastrar', 'equipApontar', 'equipApagar', 'equipApontamentos',
      'obterFoto',
      'nfListar', 'nfSalvar', 'nfExcluir', 'nfImagem', 'nfLerIA', 'nfDiag', 'nfConsultarChave', 'pedidoSalvar', 'pedidoExcluir',
      'usuariosListar', 'usuarioSalvar', 'usuarioExcluir'
    ];
    if (PROTEGIDAS.indexOf(action) !== -1) {
      var falha = exigirTokenSeAtivo(p.token);
      if (falha) return responder(falha, p.callback);
    }
    switch (action) {
      case 'ping':              resp = { ok: true, pong: true, abas: [ABA_RDO, ABA_DIARIO, ABA_EQUIP] }; break;
      case 'login':             resp = loginUsuario(p.usuario, p.senha); break;
      case 'obterRDO':          resp = obterRDO(p.obra); break;
      case 'obterDiario':       resp = obterDiario(p.obra); break;
      case 'addBatchRDO':       resp = addBatchRDO(p.batch, p.clientId, p.token); break;
      case 'deleteRDO':         resp = deleteLinhaPorId(ABA_RDO, p.id, 'id', p.token); break;
      case 'updateRDO':         resp = updateLinha(ABA_RDO, p.payload, p.token); break;
      case 'rdoFoto':           resp = rdoFoto(p); break;
      case 'obterFoto':         resp = obterFotoPrivada(p.fileId); break;
      case 'addDiario':         resp = upsertDiario(p, false); break;
      case 'updateDiario':      resp = upsertDiario(p, true); break;
      case 'deleteDiario':      resp = deleteLinhaPorId(ABA_DIARIO, p.id, 'id', p.token); break;
      case 'equipListar':       resp = equipListar(p.obra); break;
      case 'equipCadastrar':    resp = equipCadastrar(p); break;
      case 'equipDesativar':    resp = equipDesativar(p.obra, p.nome); break;
      case 'locadoraCadastrar': resp = locadoraCadastrar(p.obra, p.nome, p.observacoes); break;
      case 'equipApontar':      resp = equipApontar(p); break;
      case 'equipApagar':       resp = deleteLinhaPorId(ABA_APONT, p.carimbo, 'carimbo', p.token); break;
      case 'equipApontamentos': resp = equipApontamentos(p.obra, p.mes); break;
      case 'nfListar':          resp = nfListar(p.obra); break;
      case 'nfSalvar':          resp = nfSalvar(p); break;
      case 'nfExcluir':         resp = nfExcluir(p.obra, p.id, p.token); break;
      case 'nfImagem':          resp = nfImagem(p); break;
      case 'nfLerIA':           resp = nfLerIA(p); break;
      case 'nfDiag':            resp = nfDiag(); break;
      case 'nfConsultarChave':  resp = nfConsultarChave(p); break;
      case 'pedidoSalvar':      resp = pedidoSalvar(p); break;
      case 'pedidoExcluir':     resp = pedidoExcluir(p.obra, p.id, p.token); break;
      case 'usuariosListar':    resp = usuariosListar(p.token); break;
      case 'usuarioSalvar':     resp = usuarioSalvar(p); break;
      case 'usuarioExcluir':    resp = usuarioExcluir(p); break;
      default:
        resp = { ok: false, error: 'Ação desconhecida: "' + action + '"' };
    }
  } catch (err) {
    resp = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return responder(resp, p.callback);
}

// -------------------- LOGIN + TOKEN + HASHING + RATE-LIMITING --------------------
function hashSenha(senha) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(senha) + '_gestor_salt_2026');
  var out = '';
  for (var i = 0; i < raw.length; i++) {
    var byteVal = raw[i];
    if (byteVal < 0) byteVal += 256;
    var byteStr = byteVal.toString(16);
    if (byteStr.length === 1) byteStr = '0' + byteStr;
    out += byteStr;
  }
  return out;
}

function loginUsuario(usuario, senha) {
  var u = String(usuario || '').trim();
  if (!u || !senha) return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };

  var cache = CacheService.getScriptCache();
  var KeyErros = 'fail_u_' + u.toLowerCase();
  var erros = parseInt(cache.get(KeyErros) || '0', 10);
  if (erros >= 5) {
    return { ok: false, error: 'MUITAS_TENTATIVAS', mensagem: 'Conta temporariamente bloqueada (15 min) por excesso de tentativas.' };
  }

  var raw = PropertiesService.getScriptProperties().getProperty('USUARIOS');
  if (!raw) return { ok: false, error: 'LOGIN_NAO_CONFIGURADO' };
  
  var usuariosConfig;
  try { usuariosConfig = JSON.parse(raw); }
  catch (e) { return { ok: false, error: 'Propriedade USUARIOS inválida' }; }

  var conf = usuariosConfig[u] || usuariosConfig[u.toLowerCase()];
  if (!conf) {
    cache.put(KeyErros, String(erros + 1), 900);
    Utilities.sleep(500);
    return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };
  }

  var senhaEsperada = (typeof conf === 'object') ? conf.senha : String(conf);
  var perfil = (typeof conf === 'object' && conf.perfil) ? conf.perfil : (u.toLowerCase() === 'leonardo' ? 'admin' : 'engenheiro');
  var hashInformada = hashSenha(senha);

  var valida = (String(senhaEsperada) === String(senha)) || (String(senhaEsperada) === hashInformada);
  if (!valida) {
    cache.put(KeyErros, String(erros + 1), 900);
    Utilities.sleep(500);
    return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };
  }

  cache.remove(KeyErros);
  var token = Utilities.getUuid();
  var sessaoObj = JSON.stringify({ usuario: u, perfil: perfil });
  cache.put('tok_' + token, sessaoObj, 21600); // 6 horas

  registrarAuditoria(u, perfil, 'LOGIN', 'GLOBAL', '-', '', 'Login efetuado com sucesso');
  return { ok: true, usuario: u, perfil: perfil, token: token, expiraEmSegundos: 21600 };
}

function sessaoDoToken(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('tok_' + String(token));
  if (!raw) return null;
  cache.put('tok_' + String(token), raw, 21600);
  try { return JSON.parse(raw); } catch(e) { return { usuario: raw, perfil: 'engenheiro' }; }
}

function usuarioDoToken(token) {
  var s = sessaoDoToken(token);
  return s ? s.usuario : null;
}

// ---- Quem pode apagar: o ADMIN, ou a propria pessoa que lancou. ----
// Esconder o botao no app nao adianta: quem souber a URL manda o pedido
// direto. A regra vale aqui, que e onde o dado mora.
function perfilDoToken(token) {
  var s = sessaoDoToken(token);
  var p = s && s.perfil ? String(s.perfil).toLowerCase().trim() : '';
  var apelidos = { administrador: 'admin', master: 'admin' };
  return apelidos[p] || p;
}
function ehAdminToken(token) {
  // sem EXIGIR_TOKEN o backend esta aberto de proposito (modo de implantacao):
  // nesse caso nao ha perfil para checar
  var exigir = PropertiesService.getScriptProperties().getProperty('EXIGIR_TOKEN');
  if (String(exigir).toLowerCase() !== 'true') return true;
  return perfilDoToken(token) === 'admin';
}
function podeApagarLinha(token, donoDaLinha) {
  if (ehAdminToken(token)) return true;
  var meu = usuarioDoToken(token) || '';
  var dele = String(donoDaLinha == null ? '' : donoDaLinha).trim();
  if (!meu || !dele) return false;          // registro sem dono: so o admin
  return dele.toLowerCase() === String(meu).trim().toLowerCase();
}

function exigirTokenSeAtivo(token) {
  var exigir = PropertiesService.getScriptProperties().getProperty('EXIGIR_TOKEN');
  if (String(exigir).toLowerCase() !== 'true') return null;
  if (sessaoDoToken(token)) return null;
  return { ok: false, error: 'TOKEN_INVALIDO' };
}

function responder(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// -------------------- HELPERS DE PLANILHA & AUDITORIA --------------------
function aba(nome) {
  var a = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!a) {
    if (HEADERS[nome]) return getOrCreate(nome);
    throw new Error('Aba "' + nome + '" não encontrada');
  }
  return a;
}

function cabecalho(a) {
  var head = a.getRange(1, 1, 1, a.getLastColumn()).getValues()[0];
  return head.map(function (h) { return String(h).trim().toLowerCase(); });
}

function idxCol(cab, nome) {
  var n = String(nome).trim().toLowerCase();
  var i = cab.indexOf(n);
  return i !== -1 ? i : cab.findIndex(function (h) { return h.indexOf(n) !== -1; });
}

function gerarId(data, k) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), 'yyyyMMddHHmmss') +
         '_' + k + '_' + Math.floor(Math.random() * 9000 + 1000);
}

function normData(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v).trim();
  if (s.indexOf('/') !== -1) {
    var p = s.split('/');
    if (p.length === 3) return p[2].slice(0, 4) + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2);
  }
  return s.slice(0, 10);
}

function registrarAuditoria(usuario, perfil, acao, obra, registroId, antes, depois) {
  try {
    var a = getOrCreate(ABA_AUDITORIA);
    var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    a.appendRow([agora, usuario || 'sistema', perfil || 'sistema', acao, obra || 'global', registroId || '', String(antes || ''), String(depois || '')]);
  } catch(e) {}
}

// -------------------- LEITURA AUTENTICADA DE DADOS (Substitui CSV Público) --------------------
function obterRDO(obra) {
  var a = aba(ABA_RDO);
  var dados = a.getDataRange().getValues();
  if (dados.length <= 1) return { ok: true, rdo: [] };
  var cab = dados[0].map(function (h) { return String(h).trim(); });
  var iObra = idxCol(cab, 'obra');
  var out = [];
  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    if (obra && iObra !== -1 && String(row[iObra]).trim() !== String(obra).trim()) continue;
    var o = {};
    for (var c = 0; c < cab.length; c++) o[cab[c]] = row[c];
    out.push(o);
  }
  return { ok: true, rdo: out };
}

function obterDiario(obra) {
  var a = aba(ABA_DIARIO);
  var dados = a.getDataRange().getValues();
  if (dados.length <= 1) return { ok: true, diario: [] };
  var cab = dados[0].map(function (h) { return String(h).trim(); });
  var iObra = idxCol(cab, 'obra');
  var out = [];
  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    if (obra && iObra !== -1 && String(row[iObra]).trim() !== String(obra).trim()) continue;
    var o = {};
    for (var c = 0; c < cab.length; c++) o[cab[c]] = row[c];
    out.push(o);
  }
  return { ok: true, diario: out };
}

// -------------------- RDO: GRAVAR LOTE --------------------
function addBatchRDO(batchJson, clientId, token) {
  var batch;
  try { batch = JSON.parse(batchJson || '[]'); }
  catch (e) { return { ok: false, error: 'batch inválido' }; }
  if (!batch.length) return { ok: false, error: 'batch vazio' };

  var sess = sessaoDoToken(token) || { usuario: 'anonimo', perfil: 'apontador' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var a = aba(ABA_RDO);
    var cab = cabecalho(a);
    ['clientId', 'usuario', 'fotos', 'statusAprovacao'].forEach(function (nome) {
      if (idxCol(cabecalho(a), nome.toLowerCase()) === -1) {
        a.getRange(1, a.getLastColumn() + 1).setValue(nome);
      }
    });
    cab = cabecalho(a);
    var iClient = idxCol(cab, 'clientid');
    if (clientId && iClient !== -1) {
      var dados = a.getDataRange().getValues();
      for (var r = 1; r < dados.length; r++) {
        if (String(dados[r][iClient]).trim() === String(clientId).trim()) {
          return { ok: true, duplicate: true, inserted: 0 };
        }
      }
    }
    var agora = new Date();
    var obraItem = batch[0] ? (batch[0].obra || batch[0].Obra || '') : '';
    var linhas = batch.map(function (item, k) {
      var reg = {};
      Object.keys(item).forEach(function (c) { reg[c.toLowerCase()] = item[c]; });
      reg['id'] = reg['id'] || gerarId(agora, k);
      reg['clientid'] = clientId || '';
      reg['usuario'] = sess.usuario;
      reg['statusaprovacao'] = reg['statusaprovacao'] || 'Submetido';
      reg['timestamp'] = reg['timestamp'] || agora;
      return cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
    });
    a.getRange(a.getLastRow() + 1, 1, linhas.length, cab.length).setValues(linhas);
    registrarAuditoria(sess.usuario, sess.perfil, 'INSERIR_BATCH_RDO', obraItem, clientId, '-', linhas.length + ' lançamentos');
    return { ok: true, inserted: linhas.length };
  } finally { lock.releaseLock(); }
}

// -------------------- RDO & EQUIP: FOTOS E DRIVE PRIVADO --------------------
function rdoFoto(p) {
  var b64 = String(p.foto || '');
  if (b64.indexOf('data:image') !== 0) return { ok: false, error: 'Foto inválida' };
  var nome = 'rdo_' + (p.obra || 'obra') + '_' + (p.id || Date.now()) + '_' + (p.idx || 0) + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(b64.split(',')[1]), 'image/jpeg', nome);
  var pastas = DriveApp.getFoldersByName('Fotos RDO Gestor Obras (Privado)');
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder('Fotos RDO Gestor Obras (Privado)');
  var f = pasta.createFile(blob);
  f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  
  var fileId = f.getId();
  var urlProxy = 'drive_id:' + fileId;

  try {
    var a = aba(ABA_RDO);
    var dados = a.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxCol(cab, 'id'), iFotos = idxCol(cab, 'fotos');
    if (iFotos === -1) {
      a.getRange(1, a.getLastColumn() + 1).setValue('fotos');
      iFotos = a.getLastColumn() - 1;
    }
    if (iId !== -1) {
      for (var i = 1; i < dados.length; i++) {
        if (String(dados[i][iId]).trim() === String(p.id || '').trim()) {
          var atual = String(dados[i][iFotos] == null ? '' : dados[i][iFotos]).trim();
          a.getRange(i + 1, iFotos + 1).setValue(atual ? atual + ' ' + urlProxy : urlProxy);
          break;
        }
      }
    }
  } catch (e) {}
  return { ok: true, url: urlProxy, fileId: fileId };
}

function obterFotoPrivada(fileId) {
  if (!fileId) return { ok: false, error: 'ID do arquivo não informado' };
  try {
    var f = DriveApp.getFileById(fileId);
    var blob = f.getBlob();
    var b64 = Utilities.base64Encode(blob.getBytes());
    var mime = blob.getContentType() || 'image/jpeg';
    return { ok: true, dataUri: 'data:' + mime + ';base64,' + b64 };
  } catch (e) {
    return { ok: false, error: 'Não foi possível carregar a imagem privada: ' + e.message };
  }
}

// -------------------- DIÁRIO: UPSERT --------------------
function upsertDiario(p, deveExistir) {
  var sess = sessaoDoToken(p.token) || { usuario: 'anonimo', perfil: 'apontador' };
  var a = aba(ABA_DIARIO);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cab = cabecalho(a);
    var iObra = idxCol(cab, 'obra');
    var iData = idxCol(cab, 'data');
    var iId   = idxCol(cab, 'id');
    var dados = a.getDataRange().getValues();

    var obraAlvo = String(p.obra || '').trim().toLowerCase();
    var dataAlvo = normData(p.data);

    var linha = -1;
    for (var i = 1; i < dados.length; i++) {
      var mObra = (iObra === -1) || String(dados[i][iObra]).trim().toLowerCase() === obraAlvo;
      var mData = dataAlvo !== '' && iData !== -1 && normData(dados[i][iData]) === dataAlvo;
      if (mObra && mData) { linha = i + 1; break; }
    }
    var reg = {};
    Object.keys(p).forEach(function (c) {
      if (c === 'action' || c === 'callback' || c === 'token') return;
      reg[c.toLowerCase()] = p[c];
    });
    reg['usuario'] = sess.usuario;

    if (linha !== -1) {
      if (iId !== -1 && !reg['id']) {
        var atual = String(dados[linha - 1][iId] == null ? '' : dados[linha - 1][iId]).trim();
        if (!atual) reg['id'] = gerarIdDiario(dados, iId);
      }
      cab.forEach(function (nc, idx) {
        if (reg.hasOwnProperty(nc)) a.getRange(linha, idx + 1).setValue(reg[nc]);
      });
      registrarAuditoria(sess.usuario, sess.perfil, 'ATUALIZAR_DIARIO', p.obra, reg['id'], '-', 'Diário atualizado ' + dataAlvo);
      return { ok: true, updated: true, id: reg['id'] || undefined };
    } else {
      if (iId !== -1 && !reg['id']) reg['id'] = gerarIdDiario(dados, iId);
      var nova = cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
      a.getRange(a.getLastRow() + 1, 1, 1, cab.length).setValues([nova]);
      registrarAuditoria(sess.usuario, sess.perfil, 'INSERIR_DIARIO', p.obra, reg['id'], '-', 'Diário inserido ' + dataAlvo);
      return { ok: true, inserted: true, id: reg['id'] || '' };
    }
  } finally { lock.releaseLock(); }
}

function gerarIdDiario(dados, iId) {
  var max = 0;
  for (var i = 1; i < dados.length; i++) {
    var v = String(dados[i][iId] == null ? '' : dados[i][iId]).trim();
    var m = v.match(/(\d+)/);
    if (m) { var n = parseInt(m[1], 10); if (!isNaN(n) && n > max) max = n; }
  }
  return 'D' + ('0000' + (max + 1)).slice(-4);
}

// -------------------- APAGAR / ATUALIZAR POR ID --------------------
function deleteLinhaPorId(nomeAba, id, colName, token) {
  if (!id) return { ok: false, error: 'ID não informado' };
  var sess = sessaoDoToken(token) || { usuario: 'anonimo', perfil: 'admin' };
  var a = aba(nomeAba);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var dados = a.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxCol(cab, colName || 'id');
    var iObra = idxCol(cab, 'obra');
    if (iId === -1) return { ok: false, error: 'Coluna ' + (colName || 'ID') + ' não encontrada' };
    var iUsu = idxCol(cab, 'usuario');
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim() === String(id).trim()) {
        if (!podeApagarLinha(token, iUsu !== -1 ? dados[i][iUsu] : '')) {
          registrarAuditoria(sess.usuario, sess.perfil, 'EXCLUSAO_NEGADA', nomeAba, id, '', 'sem permissao');
          return { ok: false, error: 'SEM_PERMISSAO', mensagem: 'Só quem lançou ou o administrador pode excluir este registro.' };
        }
        var obraVal = iObra !== -1 ? dados[i][iObra] : '';
        var contAntes = JSON.stringify(dados[i]);
        a.deleteRow(i + 1);
        registrarAuditoria(sess.usuario, sess.perfil, 'DELETAR_' + nomeAba.toUpperCase(), obraVal, id, contAntes, 'DELETADO');
        return { ok: true, deleted: id };
      }
    }
    return { ok: false, error: 'ID não encontrado: ' + id };
  } finally { lock.releaseLock(); }
}

function updateLinha(nomeAba, payloadJson, token) {
  var payload;
  try { payload = JSON.parse(payloadJson || '{}'); }
  catch (e) { return { ok: false, error: 'payload inválido' }; }
  var id = payload.id || payload.ID;
  if (!id) return { ok: false, error: 'ID não informado' };
  var sess = sessaoDoToken(token) || { usuario: 'anonimo', perfil: 'engenheiro' };
  var a = aba(nomeAba);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var dados = a.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxCol(cab, 'id');
    var iObra = idxCol(cab, 'obra');
    if (iId === -1) return { ok: false, error: 'Coluna ID não encontrada' };
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim() === String(id).trim()) {
        var obraVal = iObra !== -1 ? dados[i][iObra] : '';
        var contAntes = JSON.stringify(dados[i]);
        Object.keys(payload).forEach(function (c) {
          var col = idxCol(cab, c.toLowerCase());
          if (col !== -1 && col !== iId) a.getRange(i + 1, col + 1).setValue(payload[c]);
        });
        registrarAuditoria(sess.usuario, sess.perfil, 'ATUALIZAR_' + nomeAba.toUpperCase(), obraVal, id, contAntes, payloadJson);
        return { ok: true, updated: id };
      }
    }
    return { ok: false, error: 'ID não encontrado: ' + id };
  } finally { lock.releaseLock(); }
}

// -------------------- FLUXO DE APROVAÇÃO & MEDIÇÃO --------------------

// ==================== EQUIPAMENTOS ====================
function getOrCreate(nomeAba) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var a = ss.getSheetByName(nomeAba);
  if (!a) {
    a = ss.insertSheet(nomeAba);
    var h = HEADERS[nomeAba];
    if (h) a.getRange(1, 1, 1, h.length).setValues([h]);
  }
  return a;
}

function linhasObj(nomeAba, obra) {
  var a = getOrCreate(nomeAba);
  var dados = a.getDataRange().getValues();
  if (dados.length <= 1) return [];
  var cab = dados[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < dados.length; i++) {
    var o = {}; for (var c = 0; c < cab.length; c++) o[cab[c]] = dados[i][c];
    if (obra && String(o.obra).trim() !== String(obra).trim()) continue;
    out.push(o);
  }
  return out;
}

function appendObj(nomeAba, obj) {
  var a = getOrCreate(nomeAba);
  var cab = cabecalho(a);
  var reg = {}; Object.keys(obj).forEach(function (k) { reg[k.toLowerCase()] = obj[k]; });
  var linha = cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
  a.getRange(a.getLastRow() + 1, 1, 1, cab.length).setValues([linha]);
}

function equipListar(obra) {
  var eqs = linhasObj(ABA_EQUIP, obra).filter(function (e) { return String(e.ativo).toLowerCase() !== 'false'; });
  var locs = linhasObj(ABA_LOCADORA, obra);
  return { ok: true, equipamentos: eqs, locadoras: locs };
}

function equipCadastrar(p) {
  var nome = String(p.nome || '').trim(); if (!nome) return { ok: false, error: 'Nome vazio' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var jaTem = linhasObj(ABA_EQUIP, p.obra).some(function (e) { return String(e.nome).trim().toLowerCase() === nome.toLowerCase() && String(e.ativo).toLowerCase() !== 'false'; });
    if (!jaTem) appendObj(ABA_EQUIP, { nome: nome, tipo: p.tipo || 'Outros', vinculo: p.vinculo || 'Próprio', locadora: p.locadora || '', obra: p.obra || '', ativo: 'true' });
    return equipListar(p.obra);
  } finally { lock.releaseLock(); }
}

function equipDesativar(obra, nome) {
  var a = getOrCreate(ABA_EQUIP);
  var dados = a.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iN = idxCol(cab, 'nome'), iO = idxCol(cab, 'obra'), iA = idxCol(cab, 'ativo');
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][iN]).trim().toLowerCase() === String(nome).trim().toLowerCase() &&
        (iO === -1 || String(dados[i][iO]).trim() === String(obra).trim())) {
      if (iA !== -1) a.getRange(i + 1, iA + 1).setValue('false');
    }
  }
  return equipListar(obra);
}

function locadoraCadastrar(obra, nome, obs) {
  nome = String(nome || '').trim(); if (!nome) return { ok: false, error: 'Nome vazio' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var jaTem = linhasObj(ABA_LOCADORA, obra).some(function (l) { return String(l.nome).trim().toLowerCase() === nome.toLowerCase(); });
    if (!jaTem) appendObj(ABA_LOCADORA, { nome: nome, observacoes: obs || '', obra: obra || '' });
    return { ok: true, locadoras: linhasObj(ABA_LOCADORA, obra) };
  } finally { lock.releaseLock(); }
}

function equipApontar(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var a = getOrCreate(ABA_APONT);
    var cab = cabecalho(a);
    var iCli = idxCol(cab, 'clientid');
    if (p.clientId && iCli !== -1) {
      var d = a.getDataRange().getValues();
      for (var r = 1; r < d.length; r++) if (String(d[r][iCli]).trim() === String(p.clientId).trim()) return { ok: true, duplicate: true };
    }
    var assin = String(p.assinatura || '');
    if (assin.indexOf('data:image') === 0) {
      try {
        var b64 = assin.split(',')[1];
        var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'assinatura_' + (p.carimbo || Date.now()) + '.png');
        var pasta = DriveApp.getFoldersByName('Assinaturas Gestor Obras (Privado)');
        pasta = pasta.hasNext() ? pasta.next() : DriveApp.createFolder('Assinaturas Gestor Obras (Privado)');
        var f = pasta.createFile(blob);
        f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
        assin = 'drive_id:' + f.getId();
      } catch (e) { assin = ''; }
    }
    appendObj(ABA_APONT, {
      carimbo: p.carimbo || String(Date.now()), obra: p.obra || '', data: p.data || '', turno: p.turno || '',
      equipamento: p.equipamento || '', operador: p.operador || '', inicio: p.inicio || '', fim: p.fim || '',
      horas: p.horas || '', paradas: p.paradas || '', horimIni: p.horimIni || '', horimFim: p.horimFim || '',
      combustivel: p.combustivel || '', situacao: p.situacao || '', observacoes: p.observacoes || '',
      assinatura: assin, clientId: p.clientId || ''
    });
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function equipApontamentos(obra, mes) {
  var arr = linhasObj(ABA_APONT, obra);
  if (mes) arr = arr.filter(function (x) { return normData(x.data).slice(0, 7) === mes; });
  arr.sort(function (x, y) { return String(y.data).localeCompare(String(x.data)); });
  return { ok: true, apontamentos: arr };
}

// -------------------- MÓDULO DE PENDÊNCIAS (SNAG LIST) --------------------



// -------------------- BACKUP DIÁRIO --------------------
function configurarGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupDiario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(2).create();
  return { ok: true };
}

function backupDiario() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var arquivo = DriveApp.getFileById(ss.getId());
  var pastas = DriveApp.getFoldersByName('Backups Gestor Obras');
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder('Backups Gestor Obras');
  var nome = 'BACKUP ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ' — ' + ss.getName();
  arquivo.makeCopy(nome, pasta);
  var copias = [], it = pasta.getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf('BACKUP ') === 0) copias.push(f); }
  copias.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = 14; i < copias.length; i++) copias[i].setTrashed(true);
  return { ok: true, backup: nome };
}

// ============================================================
// NOTAS FISCAIS (DANFE) — armazenamento, imagem no Drive e leitura por IA
// ============================================================

// Pasta no Drive: Notas Fiscais Gestor Obras (Privado) / <obra> / <ano> / <mes>
var NF_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function nfPastaRaiz() {
  var nome = 'Notas Fiscais Gestor Obras (Privado)';
  var it = DriveApp.getFoldersByName(nome);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nome);
}

function nfSubpasta(pai, nome) {
  var it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

// competencia no formato YYYY-MM; devolve a pasta do mes daquela obra
function nfPastaDaNota(obra, competencia) {
  var comp = String(competencia || '');
  if (!/^\d{4}-\d{2}$/.test(comp)) {
    comp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  }
  var ano = comp.slice(0, 4);
  var mes = NF_MESES[parseInt(comp.slice(5, 7), 10) - 1] || comp.slice(5, 7);
  var pObra = nfSubpasta(nfPastaRaiz(), String(obra || 'obra'));
  return nfSubpasta(nfSubpasta(pObra, ano), mes);
}

function nfListar(obra) {
  var notas = linhasObj(ABA_NF, obra).map(function (n) {
    n.dataEmissao = normData(n.dataEmissao);
    n.dataEntrada = normData(n.dataEntrada);
    return n;
  });
  var pedidos = linhasObj(ABA_PEDIDO, obra).map(function (p) {
    p.data = normData(p.data);
    return p;
  });
  return { ok: true, notas: notas, pedidos: pedidos };
}

// upsert pelo clientId — reenviar a mesma nota nunca duplica a linha
function nfSalvar(p) {
  var a = getOrCreate(ABA_NF);
  var cab = cabecalho(a);
  var dados = a.getDataRange().getValues();
  var iCli = idxCol(cab, 'clientid');
  var clientId = String(p.clientId || p.id || '').trim();
  if (!clientId) return { ok: false, error: 'clientId não informado' };

  var reg = {
    id: p.id || clientId,
    clientid: clientId,
    obra: p.obra || '',
    numero: p.numero || '',
    serie: p.serie || '',
    chave: "'" + String(p.chave || ''),          // apóstrofo: a planilha não converte 44 dígitos em notação científica
    dataemissao: normData(p.dataemissao),
    dataentrada: normData(p.dataentrada),
    cnpj: "'" + String(p.cnpj || ''),
    razaosocial: p.razaosocial || '',
    nomefantasia: p.nomefantasia || '',
    municipio: p.municipio || '',
    uf: p.uf || '',
    vprod: Number(p.vprod || 0),
    vfrete: Number(p.vfrete || 0),
    vtotal: Number(p.vtotal || 0),
    vbaseicms: Number(p.vbaseicms || 0),
    vicms: Number(p.vicms || 0),
    itens: p.itens || '[]',
    obs: p.obs || '',
    responsavel: p.responsavel || '',
    status: p.status || 'Recebida',
    driveid: p.driveid || '',
    drivelink: p.drivelink || '',
    leitura: p.leitura || '{}',
    historico: p.historico || '[]',
    usuario: p.usuario || usuarioDoToken(p.token) || '',
    criadoem: p.criadoem || Date.now(),
    atualizadoem: Date.now()
  };

  var linha = cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
  var achou = -1;
  if (iCli !== -1) {
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iCli]).trim() === clientId) { achou = i; break; }
    }
  }
  if (achou > -1) {
    // preserva o arquivo do Drive quando o app reenvia a nota sem essa informação
    var iDid = idxCol(cab, 'driveid'), iDlk = idxCol(cab, 'drivelink');
    if (iDid !== -1 && !reg.driveid) linha[iDid] = dados[achou][iDid];
    if (iDlk !== -1 && !reg.drivelink) linha[iDlk] = dados[achou][iDlk];
    a.getRange(achou + 1, 1, 1, cab.length).setValues([linha]);
  } else {
    a.getRange(a.getLastRow() + 1, 1, 1, cab.length).setValues([linha]);
  }
  registrarAuditoria(reg.usuario, 'app', achou > -1 ? 'nfAlterar' : 'nfCadastrar', reg.obra, clientId, '', 'NF ' + reg.numero + ' · ' + reg.status + ' · R$ ' + reg.vtotal);
  return { ok: true, id: reg.id, clientId: clientId, atualizado: achou > -1 };
}

function nfExcluir(obra, id, token) {
  var a = getOrCreate(ABA_NF);
  var dados = a.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = idxCol(cab, 'id'), iCli = idxCol(cab, 'clientid');
  for (var i = dados.length - 1; i >= 1; i--) {
    var bate = (iId !== -1 && String(dados[i][iId]).trim() === String(id).trim()) ||
               (iCli !== -1 && String(dados[i][iCli]).trim() === String(id).trim());
    if (bate) {
      var iUsu = idxCol(cab, 'usuario');
      if (!podeApagarLinha(token, iUsu !== -1 ? dados[i][iUsu] : '')) {
        registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'EXCLUSAO_NEGADA', obra, id, '', 'nota fiscal');
        return { ok: false, error: 'SEM_PERMISSAO', mensagem: 'Só quem lançou ou o administrador pode excluir esta nota.' };
      }
      a.deleteRow(i + 1);
      registrarAuditoria(usuarioDoToken(token), perfilDoToken(token), 'nfExcluir', obra, id, '', '');
      return { ok: true, removido: true };
    }
  }
  return { ok: true, removido: false };
}

// guarda a imagem da nota no Drive, organizada por Obra -> Ano -> Mes
function nfImagem(p) {
  var b64 = String(p.foto || '');
  if (b64.indexOf('data:image') !== 0) return { ok: false, error: 'Imagem inválida' };
  var nome = 'NF-' + (p.numero || p.id || Date.now()) + '_' + (p.id || '') + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(b64.split(',')[1]), 'image/jpeg', nome);
  var pasta = nfPastaDaNota(p.obra, p.competencia);

  // se a mesma nota ja tem arquivo, substitui em vez de acumular copias
  var antigos = pasta.getFilesByName(nome);
  while (antigos.hasNext()) { try { antigos.next().setTrashed(true); } catch (e) {} }

  var f = pasta.createFile(blob);
  f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  var fileId = f.getId();

  // grava o arquivo na linha da nota, se ela ja existir
  try {
    var a = getOrCreate(ABA_NF);
    var dados = a.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxCol(cab, 'id'), iCli = idxCol(cab, 'clientid');
    var iDid = idxCol(cab, 'driveid'), iDlk = idxCol(cab, 'drivelink');
    for (var i = 1; i < dados.length; i++) {
      var bate = (iId !== -1 && String(dados[i][iId]).trim() === String(p.id || '').trim()) ||
                 (iCli !== -1 && String(dados[i][iCli]).trim() === String(p.id || '').trim());
      if (bate) {
        if (iDid !== -1) a.getRange(i + 1, iDid + 1).setValue(fileId);
        if (iDlk !== -1) a.getRange(i + 1, iDlk + 1).setValue(f.getUrl());
        break;
      }
    }
  } catch (e) {}

  return { ok: true, fileId: fileId, link: f.getUrl(), pasta: pasta.getName() };
}

// ------------------------------------------------------------
// LEITURA DA IMAGEM DA NOTA (OCR + interpretação) via Gemini
//
// Escolhido por ser o que encaixa nesta arquitetura sem obra nova:
// o backend ja e Google (Apps Script/Sheets/Drive) e basta uma
// chave de API nas Propriedades do script — sem conta de servico,
// sem projeto no GCP, sem biblioteca externa.
//
// Propriedades do script:
//   GEMINI_API_KEY = <chave da API>            (obrigatoria)
//   GEMINI_MODEL   = gemini-2.5-flash          (opcional)
//
// Sem a chave, o app continua funcionando: cai na chave de acesso
// lida do codigo de barras e na digitacao.
// ------------------------------------------------------------
function nfLerIA(p) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, motivo: 'sem_ia' };

  var b64 = String(p.foto || '');
  var texto = String(p.texto || '');
  // O PDF da DANFE quase sempre traz o texto embutido. Quando o app consegue
  // extrair esse texto, ele manda o texto em vez da imagem: nao ha OCR no meio,
  // entao nao ha erro de leitura de caractere — e sai bem mais barato.
  if (!texto && b64.indexOf('data:image') !== 0) return { ok: false, motivo: 'imagem_invalida' };
  var modelo = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';

  var prompt =
    (texto
      ? 'Abaixo está o TEXTO extraído do PDF de uma DANFE (Documento Auxiliar da Nota Fiscal Eletrônica) brasileira, '
      : 'Você está lendo a IMAGEM de uma DANFE (Documento Auxiliar da Nota Fiscal Eletrônica) brasileira, ') +
    'recebida por uma construtora de obras públicas.\n' +
    'Extraia os campos abaixo e responda SOMENTE com um objeto JSON, sem texto em volta e sem cercas de código.\n\n' +
    'Formato exigido:\n' +
    '{\n' +
    '  "dados": {\n' +
    '    "numero": "", "serie": "", "chave": "", "dataEmissao": "AAAA-MM-DD", "dataEntrada": "AAAA-MM-DD",\n' +
    '    "cnpj": "", "razaoSocial": "", "nomeFantasia": "", "municipio": "", "uf": "",\n' +
    '    "vProd": 0, "vFrete": 0, "vTotal": 0, "vBaseICMS": 0, "vICMS": 0,\n' +
    '    "itens": [{"codigo":"","descricao":"","qtd":0,"un":"","vUnit":0,"vTotal":0}]\n' +
    '  },\n' +
    '  "confianca": { "numero":0.0, "serie":0.0, "chave":0.0, "dataEmissao":0.0, "cnpj":0.0, "razaoSocial":0.0, "vTotal":0.0, "itens":0.0 },\n' +
    '  "confiancaGeral": 0.0\n' +
    '}\n\n' +
    'Regras:\n' +
    '- Emitente é quem VENDEU (o fornecedor), não o destinatário. Use o CNPJ e a razão social do emitente.\n' +
    '- Valores numéricos em ponto decimal, sem "R$" e sem separador de milhar. 1.234,56 vira 1234.56.\n' +
    '- Datas sempre em AAAA-MM-DD. Se só houver dia/mês/ano na imagem, converta.\n' +
    '- Campo que você não conseguir ler: string vazia "" ou número 0, e confiança 0.\n' +
    '- NUNCA invente número, valor ou CNPJ. Prefira deixar vazio a chutar.\n' +
    '- Confiança de 0 a 1 por campo, refletindo o quanto o texto estava legível.\n' +
    '\nOnde procurar na DANFE:\n' +
    '- "NF-e Nº" e "SÉRIE" ficam no quadro superior, ao lado do código de barras.\n' +
    '- O emitente é o bloco do topo à esquerda, junto do logotipo; o DESTINATÁRIO/REMETENTE é outro bloco, mais abaixo — não confunda.\n' +
    '- "CÁLCULO DO IMPOSTO" traz BASE DE CÁLCULO DO ICMS, VALOR DO ICMS, VALOR DO FRETE, VALOR TOTAL DOS PRODUTOS e VALOR TOTAL DA NOTA.\n' +
    '- "DADOS DO PRODUTO / SERVIÇO" é a tabela dos itens: CÓDIGO, DESCRIÇÃO, UNID, QUANT, VALOR UNITÁRIO e VALOR TOTAL. Traga uma linha por item, na ordem em que aparecem.\n' +
    '- Ignore o quadro "DADOS ADICIONAIS" e os textos de informações complementares.\n' +
    (p.chave ? '- A chave de acesso já foi lida do código de barras e é: ' + String(p.chave).replace(/\D/g, '') + '. Use-a e mantenha coerência com número, série e CNPJ dela.\n' : '');

  var partes = [{ text: prompt }];
  if (texto) {
    partes.push({ text: '\n--- TEXTO EXTRAIDO DO PDF DA NOTA ---\n' + texto.slice(0, 24000) });
  } else {
    partes.push({ inline_data: { mime_type: 'image/jpeg', data: b64.split(',')[1] } });
  }

  var payload = {
    contents: [{ role: 'user', parts: partes }],
    // O 2.5 "pensa" antes de responder e esse raciocínio consome o mesmo teto de
    // tokens da resposta. Numa DANFE cheia isso estourava o limite e voltava vazio.
    // Aqui a tarefa é copiar campo de imagem, não raciocinar: desliga o pensamento
    // e sobra teto para o JSON inteiro.
    generationConfig: {
      temperature: 0, maxOutputTokens: 8192, responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  var resp = nfChamarGemini(modelo, key, payload);
  if (!resp.ok) return resp;

  var j = resp.json;
  var cand = (j.candidates && j.candidates[0]) || null;
  var motivoFim = cand ? String(cand.finishReason || '') : '';

  // resposta bloqueada ou cortada: dizer o que houve, não um "não consegui" seco
  if (!cand && j.promptFeedback && j.promptFeedback.blockReason) {
    return { ok: false, motivo: 'bloqueado', detalhe: String(j.promptFeedback.blockReason) };
  }
  if (motivoFim === 'MAX_TOKENS') {
    return { ok: false, motivo: 'longa', detalhe: 'A nota tem itens demais para uma leitura só.' };
  }
  if (motivoFim === 'SAFETY' || motivoFim === 'PROHIBITED_CONTENT') {
    return { ok: false, motivo: 'bloqueado', detalhe: motivoFim };
  }

  var partes = cand && cand.content && cand.content.parts;
  var txt = (partes || []).map(function (x) { return x.text || ''; }).join('');
  txt = String(txt).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  if (!txt) return { ok: false, motivo: 'vazia', detalhe: motivoFim || 'o modelo não devolveu texto' };

  var out;
  try { out = JSON.parse(txt); } catch (e) {
    var mm = txt.match(/\{[\s\S]*\}/);
    if (!mm) return { ok: false, motivo: 'resposta', detalhe: txt.slice(0, 160) };
    try { out = JSON.parse(mm[0]); } catch (e2) { return { ok: false, motivo: 'resposta', detalhe: txt.slice(0, 160) }; }
  }
  if (!out || !out.dados) return { ok: false, motivo: 'resposta', detalhe: 'veio JSON sem o campo "dados"' };

  registrarAuditoria(usuarioDoToken(p.token), 'app', 'nfLeituraIA', p.obra || '', String(out.dados.numero || ''), modelo,
    'confiança ' + (out.confiancaGeral == null ? '?' : out.confiancaGeral));

  return {
    ok: true, modelo: modelo,
    dados: out.dados,
    confianca: out.confianca || {},
    confiancaGeral: typeof out.confiancaGeral === 'number' ? out.confiancaGeral : 0.6
  };
}

// -------------------- PEDIDOS DE COMPRA --------------------
function pedidoSalvar(p) {
  var a = getOrCreate(ABA_PEDIDO);
  var cab = cabecalho(a);
  var dados = a.getDataRange().getValues();
  var iId = idxCol(cab, 'id');
  var reg = {
    id: p.id || gerarId(new Date(), 'pd'),
    obra: p.obra || '',
    numero: p.numero || '',
    data: normData(p.data),
    fornecedor: p.fornecedor || '',
    cnpj: "'" + String(p.cnpj || ''),
    itens: p.itens || '[]',
    status: p.status || 'Em aberto',
    usuario: p.usuario || usuarioDoToken(p.token) || '',
    criadoem: p.criadoem || Date.now()
  };
  var linha = cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
  var achou = -1;
  if (iId !== -1) {
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim() === String(reg.id).trim()) { achou = i; break; }
    }
  }
  if (achou > -1) a.getRange(achou + 1, 1, 1, cab.length).setValues([linha]);
  else a.getRange(a.getLastRow() + 1, 1, 1, cab.length).setValues([linha]);
  registrarAuditoria(reg.usuario, 'app', achou > -1 ? 'pedidoAlterar' : 'pedidoCadastrar', reg.obra, reg.id, '', 'Pedido ' + reg.numero);
  return { ok: true, id: reg.id };
}

function pedidoExcluir(obra, id, token) {
  var a = getOrCreate(ABA_PEDIDO);
  var dados = a.getDataRange().getValues();
  var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = idxCol(cab, 'id');
  for (var i = dados.length - 1; i >= 1; i--) {
    if (iId !== -1 && String(dados[i][iId]).trim() === String(id).trim()) {
      a.deleteRow(i + 1);
      registrarAuditoria(usuarioDoToken(token), 'app', 'pedidoExcluir', obra, id, '', '');
      return { ok: true, removido: true };
    }
  }
  return { ok: true, removido: false };
}

// Chamada ao Gemini isolada: trata a falta de autorizacao do Apps Script para
// acessar a internet, e refaz o pedido sem "thinkingConfig" caso o modelo
// escolhido nao aceite esse ajuste (modelos anteriores ao 2.5).
function nfChamarGemini(modelo, key, payload) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            encodeURIComponent(modelo) + ':generateContent?key=' + encodeURIComponent(key);
  var opts = { method: 'post', contentType: 'application/json', muteHttpExceptions: true };

  function tentar(corpo) {
    opts.payload = JSON.stringify(corpo);
    try {
      return { res: UrlFetchApp.fetch(url, opts) };
    } catch (e) {
      var msg = String(e && e.message ? e.message : e);
      // scope novo (script.external_request): a implantacao antiga nao tem
      if (/permission|autoriza|authoriz|scope/i.test(msg)) {
        return { erro: { ok: false, motivo: 'autorizacao', detalhe: msg.slice(0, 200) } };
      }
      return { erro: { ok: false, motivo: 'rede', detalhe: msg.slice(0, 200) } };
    }
  }

  var t = tentar(payload);
  if (t.erro) return t.erro;
  var res = t.res;

  if (res.getResponseCode() === 400 && payload.generationConfig && payload.generationConfig.thinkingConfig) {
    var copia = JSON.parse(JSON.stringify(payload));
    delete copia.generationConfig.thinkingConfig;
    var t2 = tentar(copia);
    if (t2.erro) return t2.erro;
    res = t2.res;
  }

  var codigo = res.getResponseCode();
  var corpo = String(res.getContentText());
  if (codigo !== 200) {
    var detalhe = corpo.slice(0, 300);
    try {
      var e = JSON.parse(corpo);
      if (e && e.error && e.error.message) detalhe = e.error.message;
    } catch (ex) {}
    var motivo = 'api';
    if (codigo === 400 && /API key not valid|API_KEY_INVALID/i.test(detalhe)) motivo = 'chave_invalida';
    else if (codigo === 403) motivo = 'chave_sem_acesso';
    else if (codigo === 404) motivo = 'modelo';
    else if (codigo === 429) motivo = 'limite';
    return { ok: false, motivo: motivo, codigo: codigo, detalhe: detalhe };
  }

  try {
    return { ok: true, json: JSON.parse(corpo) };
  } catch (e2) {
    return { ok: false, motivo: 'resposta', detalhe: corpo.slice(0, 200) };
  }
}

// Diagnostico da leitura automatica: diz em bom portugues o que esta faltando.
// Nunca devolve a chave da API, so se ela existe e se a chamada funciona.
// Rode ESTA função uma vez pelo editor do Apps Script para o Google pedir a
// permissão de acesso à internet. Ela não faz mais nada — existe só para
// disparar a autorização. O nfDiag não serve para isso: se a chave não estiver
// cadastrada ele volta antes de tocar na internet e o Google não pergunta nada.
function autorizarInternet() {
  var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models', { muteHttpExceptions: true });
  Logger.log('Autorização de internet OK. O servidor respondeu com o código ' + r.getResponseCode() +
             ' (401/403 aqui é normal: a chamada foi feita sem chave, o que importa é ter saído).');
  return true;
}

function nfDiag() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  var modelo = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
  var out = {
    ok: true,
    versaoBackend: 'notas-fiscais-2',
    chaveConfigurada: !!key,
    tamanhoChave: key ? String(key).length : 0,
    modelo: modelo,
    propriedades: props.getKeys().sort().join(', '),
    consultaChaveConfigurada: !!nfeApiConfig().url
  };
  // o próprio Apps Script sabe dizer se ainda falta autorização — e devolve o
  // endereço para autorizar, que é melhor do que explicar o caminho do menu
  try {
    var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    out.precisaAutorizar = (info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED);
    if (out.precisaAutorizar) out.autorizacaoUrl = info.getAuthorizationUrl();
  } catch (e) { out.precisaAutorizar = null; }

  if (!key) {
    out.leituraOk = false;
    out.motivo = 'sem_ia';
    out.mensagem = 'A propriedade GEMINI_API_KEY não está no script' +
      (out.propriedades ? ' (as que estão lá: ' + out.propriedades + ')' : ' (não há nenhuma propriedade cadastrada)') +
      '. Confira se salvou na mesma planilha e se o nome está exatamente GEMINI_API_KEY.';
    return out;
  }
  var r = nfChamarGemini(modelo, key, {
    contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } }
  });
  out.leituraOk = !!r.ok;
  if (r.ok) {
    out.mensagem = 'Leitura automática funcionando. O modelo ' + modelo + ' respondeu normalmente.';
  } else {
    out.motivo = r.motivo;
    out.detalhe = r.detalhe || '';
    out.mensagem = ({
      autorizacao: 'O Apps Script ainda não tem permissão para acessar a internet. Abra o editor do script, rode qualquer função pelo botão "Executar" e aceite a autorização que aparecer. Depois republique.',
      chave_invalida: 'A GEMINI_API_KEY foi recusada. Confira se copiou a chave inteira, sem espaço no começo ou no fim.',
      chave_sem_acesso: 'A chave existe mas não tem acesso à API. Gere uma nova em aistudio.google.com/apikey.',
      modelo: 'O modelo "' + modelo + '" não existe para esta chave. Apague a propriedade GEMINI_MODEL para usar o padrão.',
      limite: 'A cota da chave estourou. Tente de novo daqui a pouco.',
      rede: 'Não consegui falar com o servidor da IA.'
    })[r.motivo] || ('A chamada à IA falhou: ' + (r.detalhe || r.motivo));
  }
  return out;
}

// ============================================================
// CONSULTA DA NOTA PELA CHAVE DE ACESSO
// ------------------------------------------------------------
// Servicos como consultadanfe.com, meudanfe.com.br e nfe.io tem o
// certificado digital e devolvem a nota a partir da chave. Isso e melhor
// do que qualquer OCR: os dados vem do XML oficial, exatamente como o
// fornecedor emitiu.
//
// O endereco e o token ficam nas Propriedades do script, porque cada
// servico tem o seu contrato:
//   NFE_API_URL     = https://.../consulta?chave={chave}   ({chave} e trocado)
//   NFE_API_TOKEN   = seu token             (opcional)
//   NFE_API_HEADER  = Authorization         (opcional, padrao Authorization)
//   NFE_API_PREFIXO = "Bearer "             (opcional, padrao "Bearer ")
//   NFE_API_METODO  = GET | POST            (opcional, padrao GET)
//   NFE_API_CAMPO   = chave                 (opcional, nome do campo no POST)
//
// A resposta pode vir como XML da NF-e ou como JSON. O XML e o caminho
// bom: o layout e padronizado pela Receita, entao a leitura e exata.
// ============================================================
// Vem ligado no consultadanfe.com, que e gratuito e nao pede cadastro:
//   POST /api/v1/consulta  com  {"chave": "..."}
// Para usar outro servico, basta trocar as propriedades. Para desligar a
// consulta, ponha NFE_API_URL = off.
var NFE_API_PADRAO = 'https://consultadanfe.com/api/v1/consulta';

function nfeApiConfig() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('NFE_API_URL');
  if (url == null || url === '') url = NFE_API_PADRAO;
  if (String(url).toLowerCase() === 'off' || String(url).toLowerCase() === 'nao') url = '';
  return {
    url: url,
    padrao: url === NFE_API_PADRAO,
    token: p.getProperty('NFE_API_TOKEN') || '',
    header: p.getProperty('NFE_API_HEADER') || 'Authorization',
    prefixo: p.getProperty('NFE_API_PREFIXO') == null ? 'Bearer ' : p.getProperty('NFE_API_PREFIXO'),
    metodo: (p.getProperty('NFE_API_METODO') || (url === NFE_API_PADRAO ? 'POST' : 'GET')).toUpperCase(),
    campo: p.getProperty('NFE_API_CAMPO') || 'chave'
  };
}

function nfConsultarChave(p) {
  var chave = String(p.chave || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (chave.length !== 44) return { ok: false, motivo: 'chave_invalida' };

  var cfg = nfeApiConfig();
  if (!cfg.url) return { ok: false, motivo: 'sem_api' };

  var url = cfg.url.indexOf('{chave}') !== -1
    ? cfg.url.replace('{chave}', encodeURIComponent(chave))
    : cfg.url;
  var opts = { muteHttpExceptions: true, headers: {} };
  if (cfg.token) opts.headers[cfg.header] = cfg.prefixo + cfg.token;
  if (cfg.metodo === 'POST') {
    opts.method = 'post';
    opts.contentType = 'application/json';
    var corpo = {};
    corpo[cfg.campo] = chave;
    opts.payload = JSON.stringify(corpo);
  } else {
    opts.method = 'get';
    if (cfg.url.indexOf('{chave}') === -1) {
      url += (url.indexOf('?') === -1 ? '?' : '&') + encodeURIComponent(cfg.campo) + '=' + encodeURIComponent(chave);
    }
  }

  var res;
  try {
    res = UrlFetchApp.fetch(url, opts);
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    if (/permission|autoriza|authoriz|scope/i.test(msg)) return { ok: false, motivo: 'autorizacao', detalhe: msg.slice(0, 200) };
    return { ok: false, motivo: 'rede', detalhe: msg.slice(0, 200) };
  }
  var codigo = res.getResponseCode();
  var corpoTxt = String(res.getContentText());
  if (codigo !== 200) {
    // erros do consultadanfe (e da maioria dos servicos) em bom portugues
    var motivoCod = ({
      202: 'pendente',      // NF-e em contingencia, ainda nao disponivel
      400: 'chave_recusada',
      401: 'token', 403: 'token',
      404: 'nao_encontrada', // nao autorizada na SEFAZ ou fora da janela de datas
      429: 'limite',
      503: 'sefaz'
    })[codigo] || 'api';
    var detErro = corpoTxt.slice(0, 300);
    try {
      var je = JSON.parse(corpoTxt);
      if (je && (je.message || je.erro || je.error)) detErro = je.message || je.erro || je.error;
    } catch (ex) {}
    var cabErro = '';
    try { cabErro = res.getHeaders()['X-Error-Code'] || res.getAllHeaders()['X-Error-Code'] || ''; } catch (ex2) {}
    return { ok: false, motivo: motivoCod, codigo: codigo, erroCod: cabErro, detalhe: detErro };
  }

  var pdf = nfeAcharPDF(corpoTxt);
  var xml = nfeAcharXML(corpoTxt);
  if (!xml) return { ok: false, motivo: 'sem_xml', detalhe: corpoTxt.slice(0, 300), pdf: pdf };

  var dados;
  try {
    dados = nfeDoXML(xml);
  } catch (e2) {
    return { ok: false, motivo: 'xml_invalido', detalhe: String(e2 && e2.message ? e2.message : e2).slice(0, 200) };
  }
  if (!dados) return { ok: false, motivo: 'xml_invalido' };

  registrarAuditoria(usuarioDoToken(p.token), 'app', 'nfConsultaChave', p.obra || '', dados.numero || '', chave, 'NF-e obtida pela chave');
  // o PDF oficial vem junto: vale mais como arquivo da nota do que a foto
  return { ok: true, fonte: 'xml', dados: dados, confiancaGeral: 1, pdf: pdf };
}

// alguns servicos devolvem o PDF do DANFE junto, em base64
function nfeAcharPDF(txt) {
  try {
    var j = JSON.parse(String(txt));
    var v = j.pdf_base64 || j.pdfBase64 || j.pdf || '';
    v = String(v || '');
    // 3 MB de base64 ja e um DANFE enorme; acima disso nao vale trafegar
    return (v.length > 100 && v.length < 3000000) ? v : '';
  } catch (e) { return ''; }
}

// A resposta pode ser o XML puro, ou um JSON com o XML dentro de algum campo.
function nfeDeBase64(v) {
  try {
    var bytes = Utilities.base64Decode(String(v));
    return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  } catch (e) { return ''; }
}

function nfeAcharXML(txt) {
  var t = String(txt || '');
  if (t.indexOf('<infNFe') !== -1) return t;
  var j = null;
  try { j = JSON.parse(t); } catch (e) { return ''; }
  var achado = '';
  function varrer(v, prof) {
    if (achado || prof > 6 || v == null) return;
    if (typeof v === 'string') {
      if (v.indexOf('<infNFe') !== -1) { achado = v; return; }
      // o consultadanfe manda o XML autorizado em base64 (xml_base64)
      if (v.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(v)) {
        var d = nfeDeBase64(v);
        if (d && d.indexOf('<infNFe') !== -1) achado = d;
      }
      return;
    }
    if (typeof v === 'object') {
      var ks = Object.keys(v);
      for (var i = 0; i < ks.length && !achado; i++) varrer(v[ks[i]], prof + 1);
    }
  }
  varrer(j, 0);
  return achado;
}

// ---- leitura do XML da NF-e (layout da Receita, sem depender do namespace) ----
function nfeFilho(el, nome) {
  if (!el) return null;
  var fs = el.getChildren();
  for (var i = 0; i < fs.length; i++) if (fs[i].getName() === nome) return fs[i];
  return null;
}
function nfeFilhos(el, nome) {
  var out = [];
  if (!el) return out;
  var fs = el.getChildren();
  for (var i = 0; i < fs.length; i++) if (fs[i].getName() === nome) out.push(fs[i]);
  return out;
}
function nfeTxt(el, nome) {
  var f = nfeFilho(el, nome);
  return f ? String(f.getText()).trim() : '';
}
function nfeNum(el, nome) {
  var v = nfeTxt(el, nome);
  var n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
// procura infNFe em qualquer profundidade (nfeProc > NFe > infNFe, ou direto)
function nfeAcharInf(el, prof) {
  if (!el || prof > 6) return null;
  if (el.getName() === 'infNFe') return el;
  var fs = el.getChildren();
  for (var i = 0; i < fs.length; i++) {
    var r = nfeAcharInf(fs[i], prof + 1);
    if (r) return r;
  }
  return null;
}

function nfeDoXML(xml) {
  var doc = XmlService.parse(String(xml).replace(/^﻿/, '').trim());
  var inf = nfeAcharInf(doc.getRootElement(), 0);
  if (!inf) return null;

  var ide = nfeFilho(inf, 'ide');
  var emit = nfeFilho(inf, 'emit');
  var ender = emit ? nfeFilho(emit, 'enderEmit') : null;
  var total = nfeFilho(inf, 'total');
  var icmsTot = total ? nfeFilho(total, 'ICMSTot') : null;

  var chave = '';
  try { chave = String(inf.getAttribute('Id').getValue()).replace(/^NFe/i, ''); } catch (e) {}

  var emissao = nfeTxt(ide, 'dhEmi') || nfeTxt(ide, 'dEmi');
  var entrada = nfeTxt(ide, 'dhSaiEnt') || nfeTxt(ide, 'dSaiEnt');

  var itens = [];
  var dets = nfeFilhos(inf, 'det');
  for (var i = 0; i < dets.length && i < 200; i++) {
    var prod = nfeFilho(dets[i], 'prod');
    if (!prod) continue;
    itens.push({
      codigo: nfeTxt(prod, 'cProd'),
      descricao: nfeTxt(prod, 'xProd'),
      qtd: nfeNum(prod, 'qCom'),
      un: nfeTxt(prod, 'uCom'),
      vUnit: nfeNum(prod, 'vUnCom'),
      vTotal: nfeNum(prod, 'vProd')
    });
  }

  return {
    chave: chave,
    numero: nfeTxt(ide, 'nNF'),
    serie: nfeTxt(ide, 'serie'),
    dataEmissao: String(emissao).slice(0, 10),
    dataEntrada: String(entrada).slice(0, 10),
    cnpj: nfeTxt(emit, 'CNPJ') || nfeTxt(emit, 'CPF'),
    razaoSocial: nfeTxt(emit, 'xNome'),
    nomeFantasia: nfeTxt(emit, 'xFant'),
    municipio: nfeTxt(ender, 'xMun'),
    uf: nfeTxt(ender, 'UF'),
    vProd: nfeNum(icmsTot, 'vProd'),
    vFrete: nfeNum(icmsTot, 'vFrete'),
    vTotal: nfeNum(icmsTot, 'vNF'),
    vBaseICMS: nfeNum(icmsTot, 'vBC'),
    vICMS: nfeNum(icmsTot, 'vICMS'),
    itens: itens
  };
}

// ============================================================
// USUARIOS — cadastro pelo proprio app, so para o administrador
// ------------------------------------------------------------
// Mexe na propriedade USUARIOS do script, a mesma que o login le.
// Regras que valem AQUI, nao no app:
//   • so o perfil admin entra;
//   • so funciona com EXIGIR_TOKEN=true — sem token o backend esta
//     aberto, e deixar isso reescrever a lista de senhas seria dar a
//     chave da casa para qualquer um que descubra a URL;
//   • senha sai daqui HASHEADA e nunca volta para o app;
//   • ninguem se exclui, e o sistema nao pode ficar sem admin.
// ============================================================
var NF_PERFIS_VALIDOS = ['campo', 'administrativo', 'engenharia', 'diretoria', 'admin'];

function usuariosCarregar() {
  var raw = PropertiesService.getScriptProperties().getProperty('USUARIOS');
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}
function usuariosGravar(mapa) {
  PropertiesService.getScriptProperties().setProperty('USUARIOS', JSON.stringify(mapa));
}
// perfil de uma entrada, aceitando o formato antigo ("Nome": "senha")
function usuarioPerfilDe(nome, conf) {
  if (conf && typeof conf === 'object' && conf.perfil) return String(conf.perfil).toLowerCase();
  return String(nome).toLowerCase() === 'leonardo' ? 'admin' : 'engenharia';
}
function usuarioSenhaDe(conf) {
  if (conf && typeof conf === 'object') return conf.senha || '';
  return conf || '';
}
function contarAdmins(mapa, ignorar) {
  var n = 0;
  Object.keys(mapa).forEach(function (k) {
    if (ignorar && k === ignorar) return;
    if (usuarioPerfilDe(k, mapa[k]) === 'admin') n++;
  });
  return n;
}

function exigirAdmin(token) {
  var props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('EXIGIR_TOKEN')).toLowerCase() !== 'true') {
    return { ok: false, error: 'ADMIN_REQUER_TOKEN',
      mensagem: 'Para gerenciar usuários, a propriedade EXIGIR_TOKEN precisa estar como true. Sem ela o backend fica aberto.' };
  }
  if (!sessaoDoToken(token)) return { ok: false, error: 'TOKEN_INVALIDO' };
  if (perfilDoToken(token) !== 'admin') {
    return { ok: false, error: 'SEM_PERMISSAO', mensagem: 'Só o administrador gerencia usuários.' };
  }
  return null;
}

function usuariosListar(token) {
  var falha = exigirAdmin(token); if (falha) return falha;
  var mapa = usuariosCarregar();
  var lista = Object.keys(mapa).sort(function (a, b) { return a.localeCompare(b); }).map(function (nome) {
    return {
      nome: nome,
      perfil: usuarioPerfilDe(nome, mapa[nome]),
      // "formatoAntigo" = senha ainda em texto puro na planilha
      formatoAntigo: typeof mapa[nome] !== 'object',
      temSenha: !!usuarioSenhaDe(mapa[nome])
    };
  });
  return { ok: true, usuarios: lista, eu: usuarioDoToken(token) };
}

function usuarioSalvar(p) {
  var falha = exigirAdmin(p.token); if (falha) return falha;
  var nome = String(p.nome || '').trim();
  var perfil = String(p.perfil || '').toLowerCase().trim();
  var senha = String(p.senha || '');
  var nomeAntigo = String(p.nomeAntigo || '').trim();

  if (!nome) return { ok: false, error: 'NOME_OBRIGATORIO', mensagem: 'Informe o nome do usuário.' };
  if (nome.length > 40) return { ok: false, error: 'NOME_LONGO', mensagem: 'Nome muito longo.' };
  if (NF_PERFIS_VALIDOS.indexOf(perfil) === -1) {
    return { ok: false, error: 'PERFIL_INVALIDO', mensagem: 'Perfil desconhecido: ' + perfil };
  }

  var mapa = usuariosCarregar();
  var eu = usuarioDoToken(p.token);
  var editando = nomeAntigo && mapa[nomeAntigo];

  if (!editando && mapa[nome]) {
    return { ok: false, error: 'JA_EXISTE', mensagem: 'Já existe um usuário com esse nome.' };
  }
  if (editando && nomeAntigo !== nome && mapa[nome]) {
    return { ok: false, error: 'JA_EXISTE', mensagem: 'Já existe um usuário com esse nome.' };
  }

  var senhaFinal = senha ? hashSenha(senha) : (editando ? usuarioSenhaDe(mapa[nomeAntigo]) : '');
  if (!senhaFinal) return { ok: false, error: 'SENHA_OBRIGATORIA', mensagem: 'Defina uma senha para o usuário novo.' };
  if (senha && senha.length < 4) return { ok: false, error: 'SENHA_CURTA', mensagem: 'A senha precisa de pelo menos 4 caracteres.' };

  // o sistema nao pode ficar sem nenhum administrador
  var perfilAnterior = editando ? usuarioPerfilDe(nomeAntigo, mapa[nomeAntigo]) : '';
  if (editando && perfilAnterior === 'admin' && perfil !== 'admin' && contarAdmins(mapa, nomeAntigo) === 0) {
    return { ok: false, error: 'SEM_ADMIN', mensagem: 'Este é o único administrador. Promova outra pessoa antes de rebaixá-lo.' };
  }
  if (editando && nomeAntigo === eu && perfil !== 'admin') {
    return { ok: false, error: 'AUTO_REBAIXA', mensagem: 'Você não pode tirar o seu próprio acesso de administrador.' };
  }

  if (editando && nomeAntigo !== nome) delete mapa[nomeAntigo];
  mapa[nome] = { senha: senhaFinal, perfil: perfil };
  usuariosGravar(mapa);

  registrarAuditoria(eu, 'admin', editando ? 'usuarioAlterar' : 'usuarioCriar', 'GLOBAL', nome,
    editando ? (nomeAntigo + ' · ' + perfilAnterior) : '', nome + ' · ' + perfil + (senha ? ' · senha trocada' : ''));
  return { ok: true, nome: nome, perfil: perfil };
}

function usuarioExcluir(p) {
  var falha = exigirAdmin(p.token); if (falha) return falha;
  var nome = String(p.nome || '').trim();
  var mapa = usuariosCarregar();
  if (!mapa[nome]) return { ok: false, error: 'NAO_ENCONTRADO', mensagem: 'Usuário não encontrado.' };

  var eu = usuarioDoToken(p.token);
  if (nome === eu) return { ok: false, error: 'AUTO_EXCLUSAO', mensagem: 'Você não pode excluir o seu próprio usuário.' };
  if (usuarioPerfilDe(nome, mapa[nome]) === 'admin' && contarAdmins(mapa, nome) === 0) {
    return { ok: false, error: 'SEM_ADMIN', mensagem: 'Não dá para excluir o único administrador.' };
  }

  delete mapa[nome];
  usuariosGravar(mapa);
  registrarAuditoria(eu, 'admin', 'usuarioExcluir', 'GLOBAL', nome, '', '');
  return { ok: true, removido: true };
}
