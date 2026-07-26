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
var ABA_PENDENCIAS = 'Pendencias';

var HEADERS = {
  'Equipamentos': ['nome','tipo','vinculo','locadora','obra','ativo'],
  'Locadoras':    ['nome','observacoes','obra'],
  'ApontEquip':   ['carimbo','obra','data','turno','equipamento','operador','inicio','fim','horas','paradas','horimIni','horimFim','combustivel','situacao','observacoes','assinatura','clientId'],
  'Auditoria':    ['carimbo','usuario','perfil','acao','obra','registroId','detalhesAnteriores','detalhesNovos'],
  'Pendencias':   ['id','carimbo','obra','ruaEstaca','servico','responsavel','prazo','status','descricao','fotoUrl','usuario']
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
      'obterFoto', 'aprovarRDO', 'fecharMedicao', 'cadastrarPendencia', 'listarPendencias', 'atualizarPendencia'
    ];
    if (PROTEGIDAS.indexOf(action) !== -1) {
      var falha = exigirTokenSeAtivo(p.token);
      if (falha) return responder(falha, p.callback);
    }
    switch (action) {
      case 'ping':              resp = { ok: true, pong: true, abas: [ABA_RDO, ABA_DIARIO, ABA_EQUIP, ABA_PENDENCIAS] }; break;
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
      case 'aprovarRDO':        resp = aprovarRDO(p.id, p.statusAprovacao, p.token); break;
      case 'cadastrarPendencia':resp = cadastrarPendencia(p); break;
      case 'listarPendencias':  resp = listarPendencias(p.obra); break;
      case 'atualizarPendencia':resp = atualizarPendencia(p); break;
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
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim() === String(id).trim()) {
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
function aprovarRDO(id, statusAprovacao, token) {
  var sess = sessaoDoToken(token);
  if (!sess || (sess.perfil !== 'admin' && sess.perfil !== 'engenheiro')) {
    return { ok: false, error: 'PERMISSAO_NEGADA', mensagem: 'Apenas engenheiros ou admins podem aprovar RDOs.' };
  }
  return updateLinha(ABA_RDO, JSON.stringify({ id: id, statusAprovacao: statusAprovacao || 'Aprovado' }), token);
}

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
function cadastrarPendencia(p) {
  var sess = sessaoDoToken(p.token) || { usuario: 'anonimo' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var id = 'PEND_' + Date.now();
    appendObj(ABA_PENDENCIAS, {
      id: id,
      carimbo: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      obra: p.obra || '',
      ruaEstaca: p.ruaEstaca || '',
      servico: p.servico || '',
      responsavel: p.responsavel || '',
      prazo: p.prazo || '',
      status: p.status || 'Aberto',
      descricao: p.descricao || '',
      fotoUrl: p.fotoUrl || '',
      usuario: sess.usuario
    });
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function listarPendencias(obra) {
  var list = linhasObj(ABA_PENDENCIAS, obra);
  return { ok: true, pendencias: list };
}

function atualizarPendencia(p) {
  return updateLinha(ABA_PENDENCIAS, JSON.stringify(p), p.token);
}

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
