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

var ABA_RDO      = 'RDO';
var ABA_DIARIO   = 'Diario';
var ABA_EQUIP    = 'Equipamentos';
var ABA_LOCADORA = 'Locadoras';
var ABA_APONT    = 'ApontEquip';
// abas de equipamentos são criadas automaticamente com estes cabeçalhos se faltarem
var HEADERS = {
  'Equipamentos': ['nome','tipo','vinculo','locadora','obra','ativo'],
  'Locadoras':    ['nome','observacoes','obra'],
  'ApontEquip':   ['carimbo','obra','data','turno','equipamento','operador','inicio','fim','horas','paradas','horimIni','horimFim','combustivel','situacao','observacoes','assinatura','clientId']
};

function doGet(e)  { return rotear(e); }
function doPost(e) { return rotear(e); }

function rotear(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var action = p.action || '';
  var resp;
  try {
    var PROTEGIDAS = ['addBatchRDO', 'deleteRDO', 'updateRDO',
                      'addDiario', 'updateDiario', 'deleteDiario',
                      'equipCadastrar', 'equipDesativar', 'locadoraCadastrar', 'equipApontar', 'equipApagar'];
    if (PROTEGIDAS.indexOf(action) !== -1) {
      var falha = exigirTokenSeAtivo(p.token);
      if (falha) return responder(falha, p.callback);
    }
    switch (action) {
      case 'ping':         resp = { ok: true, pong: true, abas: [ABA_RDO, ABA_DIARIO] }; break;
      case 'login':        resp = loginUsuario(p.usuario, p.senha); break;
      case 'addBatchRDO':  resp = addBatchRDO(p.batch, p.clientId); break;
      case 'deleteRDO':    resp = deleteLinhaPorId(ABA_RDO, p.id); break;
      case 'updateRDO':    resp = updateLinha(ABA_RDO, p.payload); break;
      case 'addDiario':    resp = upsertDiario(p, false); break;
      case 'updateDiario': resp = upsertDiario(p, true); break;
      case 'deleteDiario': resp = deleteLinhaPorId(ABA_DIARIO, p.id); break;
      case 'equipListar':      resp = equipListar(p.obra); break;
      case 'equipCadastrar':   resp = equipCadastrar(p); break;
      case 'equipDesativar':   resp = equipDesativar(p.obra, p.nome); break;
      case 'locadoraCadastrar':resp = locadoraCadastrar(p.obra, p.nome, p.observacoes); break;
      case 'equipApontar':     resp = equipApontar(p); break;
      case 'equipApagar':      resp = deleteLinhaPorId(ABA_APONT, p.carimbo, 'carimbo'); break;
      case 'equipApontamentos':resp = equipApontamentos(p.obra, p.mes); break;
      default:
        resp = { ok: false, error: 'Ação desconhecida: "' + action + '"' };
    }
  } catch (err) {
    resp = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return responder(resp, p.callback);
}

// -------------------- LOGIN + TOKEN --------------------
function loginUsuario(usuario, senha) {
  var raw = PropertiesService.getScriptProperties().getProperty('USUARIOS');
  if (!raw) return { ok: false, error: 'LOGIN_NAO_CONFIGURADO' };
  var usuarios;
  try { usuarios = JSON.parse(raw); }
  catch (e) { return { ok: false, error: 'Propriedade USUARIOS não é um JSON válido' }; }
  var u = String(usuario || '').trim();
  if (!u || !senha || String(usuarios[u]) !== String(senha)) {
    Utilities.sleep(500);
    return { ok: false, error: 'CREDENCIAIS_INVALIDAS' };
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, u, 21600); // 6 h
  return { ok: true, usuario: u, token: token, expiraEmSegundos: 21600 };
}
function usuarioDoToken(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var u = cache.get('tok_' + String(token));
  if (u) cache.put('tok_' + String(token), u, 21600);
  return u;
}
function exigirTokenSeAtivo(token) {
  var exigir = PropertiesService.getScriptProperties().getProperty('EXIGIR_TOKEN');
  if (String(exigir).toLowerCase() !== 'true') return null;
  if (usuarioDoToken(token)) return null;
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

// -------------------- HELPERS DE PLANILHA --------------------
function aba(nome) {
  var a = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!a) throw new Error('Aba "' + nome + '" não encontrada');
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

// -------------------- RDO: gravar lote (dedup por clientId) --------------------
function addBatchRDO(batchJson, clientId) {
  var batch;
  try { batch = JSON.parse(batchJson || '[]'); }
  catch (e) { return { ok: false, error: 'batch inválido' }; }
  if (!batch.length) return { ok: false, error: 'batch vazio' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var a = aba(ABA_RDO);
    var cab = cabecalho(a);
    var iClient = idxCol(cab, 'clientid');
    if (iClient === -1) {
      a.getRange(1, a.getLastColumn() + 1).setValue('clientId');
      cab = cabecalho(a); iClient = idxCol(cab, 'clientid');
    }
    // Dedup: se o clientId já existe, considera salvo.
    if (clientId && iClient !== -1) {
      var dados = a.getDataRange().getValues();
      for (var r = 1; r < dados.length; r++) {
        if (String(dados[r][iClient]).trim() === String(clientId).trim()) {
          return { ok: true, duplicate: true, inserted: 0 };
        }
      }
    }
    var agora = new Date();
    var linhas = batch.map(function (item, k) {
      var reg = {};
      Object.keys(item).forEach(function (c) { reg[c.toLowerCase()] = item[c]; });
      reg['id'] = reg['id'] || gerarId(agora, k);
      reg['clientid'] = clientId || '';
      reg['timestamp'] = reg['timestamp'] || agora;
      return cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
    });
    a.getRange(a.getLastRow() + 1, 1, linhas.length, cab.length).setValues(linhas);
    return { ok: true, inserted: linhas.length };
  } finally { lock.releaseLock(); }
}

// -------------------- DIÁRIO: upsert por obra + data --------------------
function upsertDiario(p, deveExistir) {
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
    if (linha !== -1) {
      if (iId !== -1 && !reg['id']) {
        var atual = String(dados[linha - 1][iId] == null ? '' : dados[linha - 1][iId]).trim();
        if (!atual) reg['id'] = gerarIdDiario(dados, iId);
      }
      cab.forEach(function (nc, idx) {
        if (reg.hasOwnProperty(nc)) a.getRange(linha, idx + 1).setValue(reg[nc]);
      });
      return { ok: true, updated: true, id: reg['id'] || undefined };
    } else {
      if (iId !== -1 && !reg['id']) reg['id'] = gerarIdDiario(dados, iId);
      var nova = cab.map(function (nc) { return reg.hasOwnProperty(nc) ? reg[nc] : ''; });
      a.getRange(a.getLastRow() + 1, 1, 1, cab.length).setValues([nova]);
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

// -------------------- Apagar / atualizar por ID --------------------
function deleteLinhaPorId(nomeAba, id, colName) {
  if (!id) return { ok: false, error: 'ID não informado' };
  var a = aba(nomeAba);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var dados = a.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxCol(cab, colName || 'id');
    if (iId === -1) return { ok: false, error: 'Coluna ' + (colName || 'ID') + ' não encontrada' };
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim() === String(id).trim()) {
        a.deleteRow(i + 1);
        return { ok: true, deleted: id };
      }
    }
    return { ok: false, error: 'ID não encontrado: ' + id };
  } finally { lock.releaseLock(); }
}
function updateLinha(nomeAba, payloadJson) {
  var payload;
  try { payload = JSON.parse(payloadJson || '{}'); }
  catch (e) { return { ok: false, error: 'payload inválido' }; }
  var id = payload.id || payload.ID;
  if (!id) return { ok: false, error: 'ID não informado' };
  var a = aba(nomeAba);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var dados = a.getDataRange().getValues();
    var cab = dados[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = idxCol(cab, 'id');
    if (iId === -1) return { ok: false, error: 'Coluna ID não encontrada' };
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][iId]).trim() === String(id).trim()) {
        Object.keys(payload).forEach(function (c) {
          var col = idxCol(cab, c.toLowerCase());
          if (col !== -1 && col !== iId) a.getRange(i + 1, col + 1).setValue(payload[c]);
        });
        return { ok: true, updated: id };
      }
    }
    return { ok: false, error: 'ID não encontrado: ' + id };
  } finally { lock.releaseLock(); }
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
    // assinatura em base64 (data:image/png;base64,...) -> salva no Drive e guarda a URL
    var assin = String(p.assinatura || '');
    if (assin.indexOf('data:image') === 0) {
      try {
        var b64 = assin.split(',')[1];
        var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'assinatura_' + (p.carimbo || Date.now()) + '.png');
        var pasta = DriveApp.getFoldersByName('Assinaturas Gestor Obras');
        pasta = pasta.hasNext() ? pasta.next() : DriveApp.createFolder('Assinaturas Gestor Obras');
        var f = pasta.createFile(blob); f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        assin = 'https://drive.google.com/uc?id=' + f.getId();
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

// -------------------- BACKUP DIÁRIO (opcional) --------------------
// Rode configurarGatilhos() UMA vez no editor para agendar o backup 02h.
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
