/* ============================================================
   NOTAS FISCAIS (DANFE) — Gestor, Controle de Obras
   ------------------------------------------------------------
   Registro das notas de material recebido na obra. O apontador
   fotografa a DANFE e o sistema tenta preencher tudo sozinho,
   nesta ordem:

     1. CODIGO DE BARRAS / QR da propria DANFE  -> chave de acesso
     2. CHAVE DE ACESSO (44 digitos)            -> numero, serie,
        CNPJ do emitente, UF e mes de emissao, sem nenhuma duvida
     3. LEITURA DA IMAGEM (OCR + IA no backend) -> o resto dos campos
     4. DIGITACAO                               -> sempre disponivel

   Nada aqui bloqueia o cadastro: se a leitura falhar, o apontador
   digita e salva do mesmo jeito.

   Este arquivo depende de funcoes do index.html (esc, toast, obra,
   postAcao, comprimirImg, abrirModal...). Ele so as chama em tempo
   de execucao, por isso pode ser carregado antes.
   ============================================================ */
'use strict';

/* ---------- constantes ---------- */
const NF_STATUS = ['Recebida', 'Em análise', 'Conferida', 'Divergência encontrada', 'Integrada ao estoque', 'Integrada ao pedido de compra', 'Cancelada'];
const NF_STATUS_COR = {
  'Recebida': 'pill-blu', 'Em análise': 'pill-ylw', 'Conferida': 'pill-grn',
  'Divergência encontrada': 'pill-red', 'Integrada ao estoque': 'pill-grn',
  'Integrada ao pedido de compra': 'pill-grn', 'Cancelada': 'pill-red'
};
const NF_UF = {11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'};
const NF_UN = ['UN','PC','CX','SC','KG','TON','M','M2','M3','L','MIL','CJ','BR','RL','GL','PAR'];
const NF_MAX_LADO = 1600;    // resolucao guardada da nota (o OCR precisa enxergar)
const NF_PAGINA = 24;        // quantas notas a lista mostra por vez

/* ---------- armazenamento local ---------- */
function nfKey(obraId) { return 'gestor:nf:' + obraId; }
function nfGet(obraId) { try { return JSON.parse(localStorage.getItem(nfKey(obraId)) || '[]'); } catch (e) { return []; } }
function nfSet(obraId, arr) { localStorage.setItem(nfKey(obraId), JSON.stringify(arr)); }
function nfMovGet(obraId) { try { return JSON.parse(localStorage.getItem('gestor:nfmov:' + obraId) || '[]'); } catch (e) { return []; } }
function nfMovSet(obraId, arr) { localStorage.setItem('gestor:nfmov:' + obraId, JSON.stringify(arr)); }
function nfPedGet(obraId) { try { return JSON.parse(localStorage.getItem('gestor:pedidos:' + obraId) || '[]'); } catch (e) { return []; } }
function nfPedSet(obraId, arr) { localStorage.setItem('gestor:pedidos:' + obraId, JSON.stringify(arr)); }
function nfPorId(obraId, id) { return nfGet(obraId).find(n => n.id === id) || null; }

/* imagem em resolucao cheia: mesmo IndexedDB das fotos do RDO */
function nfImgChave(obraId, id) { return 'nf:' + obraId + ':' + id; }

/* ---------- numeros, datas e documentos ---------- */
function nfNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  let s = String(v).replace(/[^\d,.-]/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    // tem os dois: o que vier por ultimo e o separador decimal
    s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lc > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ld > -1 && /\.\d{3}$/.test(s)) {
    // so ponto e o ultimo grupo com 3 digitos: e milhar, nao decimal.
    // "1.500" digitado aqui e mil e quinhentos, nao um e meio.
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function nfDigitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function nfISO(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (!m) return '';
  const a = m[3].length === 2 ? '20' + m[3] : m[3];
  return a + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}
function nfDataBR(iso) { return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—'; }
function nfCNPJfmt(c) {
  const d = nfDigitos(c);
  if (d.length !== 14) return c || '';
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
}
function nfCNPJvalido(c) {
  const d = nfDigitos(c);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base, pesos) => {
    let s = 0;
    for (let i = 0; i < pesos.length; i++) s += (+base[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === +d[12] && d2 === +d[13];
}

/* ---------- chave de acesso da NF-e (44 digitos) ----------
   cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
   O digito verificador e modulo 11, entao da para saber se a leitura
   do codigo de barras veio certa antes de preencher qualquer campo.  */
function nfDVchave(ch43) {
  let p = 2, s = 0;
  for (let i = 42; i >= 0; i--) { s += (+ch43[i]) * p; p = p === 9 ? 2 : p + 1; }
  const r = s % 11;
  return (r === 0 || r === 1) ? 0 : 11 - r;
}
function nfChaveValida(ch) {
  const d = nfDigitos(ch);
  return d.length === 44 && nfDVchave(d.slice(0, 43)) === +d[43];
}
function nfDaChave(ch) {
  const d = nfDigitos(ch);
  if (d.length !== 44) return null;
  const uf = NF_UF[+d.slice(0, 2)] || '';
  const ano = '20' + d.slice(2, 4), mes = d.slice(4, 6);
  return {
    chave: d, uf: uf,
    cnpj: d.slice(6, 20),
    modelo: d.slice(20, 22),
    serie: String(+d.slice(22, 25)),
    numero: String(+d.slice(25, 34)),
    competencia: ano + '-' + mes,
    dataEmissao: ano + '-' + mes + '-01',   // a chave so garante mes/ano
    valida: nfDVchave(d.slice(0, 43)) === +d[43]
  };
}
function nfChaveDeTexto(txt) {
  const s = String(txt || '');
  // a chave costuma vir com espacos de 4 em 4 na DANFE impressa
  const candidatos = (s.replace(/[^\d\s]/g, ' ').match(/[\d\s]{44,80}/g) || []).map(t => nfDigitos(t));
  for (const c of candidatos) {
    for (let i = 0; i + 44 <= c.length; i++) {
      const ch = c.slice(i, i + 44);
      if (nfChaveValida(ch)) return ch;
    }
  }
  const direto = s.match(/\d{44}/);
  return (direto && nfChaveValida(direto[0])) ? direto[0] : '';
}

/* ============================================================
   1) LEITURA DO CODIGO DE BARRAS / QR
   Usa o BarcodeDetector do proprio navegador (Chrome/Android, que e
   o aparelho do campo). Sem biblioteca externa, sem download.
   ============================================================ */
function nfTemLeitorCodigo() { return typeof window !== 'undefined' && 'BarcodeDetector' in window; }

async function nfLerCodigos(fonte) {
  const res = { chave: '', codigos: [], suportado: nfTemLeitorCodigo() };
  if (!res.suportado) return res;
  try {
    let formatos = ['qr_code', 'code_128', 'itf', 'data_matrix', 'pdf417', 'code_39'];
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      if (sup && sup.length) formatos = formatos.filter(f => sup.indexOf(f) > -1);
    } catch (e) { /* alguns navegadores nao expoem a lista */ }
    if (!formatos.length) return res;
    const det = new window.BarcodeDetector({ formats: formatos });

    // 1a tentativa na imagem original; 2a numa versao reduzida (detector
    // costuma falhar em foto de 12 MP e acertar na mesma foto menor)
    const fontes = [fonte];
    try { fontes.push(await nfBitmapReduzido(fonte, 1400)); } catch (e) { /* segue com a original */ }

    for (const f of fontes) {
      if (!f) continue;
      let achados = [];
      try { achados = await det.detect(f); } catch (e) { achados = []; }
      for (const c of achados) {
        const valor = String(c.rawValue || '');
        res.codigos.push(valor);
        const ch = nfChaveDeTexto(valor);
        if (ch) { res.chave = ch; break; }
      }
      if (res.chave) break;
    }
  } catch (e) { /* sem leitor: segue para a leitura por imagem */ }
  return res;
}
function nfBitmapReduzido(fonte, maxLado) {
  return new Promise((res, rej) => {
    const desenhar = img => {
      let w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      const m = Math.max(w, h);
      if (m > maxLado) { const k = maxLado / m; w = Math.round(w * k); h = Math.round(h * k); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      res(c);
    };
    if (fonte instanceof Blob) {
      const img = new Image();
      img.onload = () => desenhar(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(fonte);
    } else if (typeof fonte === 'string') {
      const img = new Image(); img.onload = () => desenhar(img); img.onerror = rej; img.src = fonte;
    } else { desenhar(fonte); }
  });
}

/* ============================================================
   2) LEITURA DA IMAGEM (OCR + IA) — roda no backend
   A chave da IA fica nas propriedades do Apps Script, nunca no app.
   ============================================================ */
async function nfLerImagemIA(dataUrl, chave) {
  if (!BACKEND || isDemo()) return { ok: false, motivo: 'local' };
  try {
    const r = await postAcao({ action: 'nfLerIA', foto: dataUrl, chave: chave || '' });
    return r || { ok: false, motivo: 'sem_resposta' };
  } catch (e) {
    return { ok: false, motivo: 'rede' };
  }
}

/* junta o que veio da chave com o que veio da IA.
   A chave sempre ganha: ela e matematicamente verificavel. */
function nfMesclarLeitura(base, daChave, daIA) {
  const n = Object.assign({}, base);
  const conf = {};
  const por = (campo, valor, c) => {
    if (valor === '' || valor == null) return;
    if (typeof valor === 'number' && !valor && n[campo]) return;
    n[campo] = valor; conf[campo] = c;
  };
  if (daIA && daIA.ok && daIA.dados) {
    const d = daIA.dados, cIA = daIA.confianca || {};
    const c = k => (typeof cIA[k] === 'number' ? cIA[k] : (typeof daIA.confiancaGeral === 'number' ? daIA.confiancaGeral : 0.6));
    por('numero', String(d.numero || '').trim(), c('numero'));
    por('serie', String(d.serie || '').trim(), c('serie'));
    por('dataEmissao', nfISO(d.dataEmissao), c('dataEmissao'));
    por('dataEntrada', nfISO(d.dataEntrada), c('dataEntrada'));
    por('cnpj', nfDigitos(d.cnpj), c('cnpj'));
    por('razaoSocial', String(d.razaoSocial || '').trim(), c('razaoSocial'));
    por('nomeFantasia', String(d.nomeFantasia || '').trim(), c('nomeFantasia'));
    por('municipio', String(d.municipio || '').trim(), c('municipio'));
    por('uf', String(d.uf || '').trim().toUpperCase().slice(0, 2), c('uf'));
    por('vProd', nfNum(d.vProd), c('vProd'));
    por('vFrete', nfNum(d.vFrete), c('vFrete'));
    por('vTotal', nfNum(d.vTotal), c('vTotal'));
    por('vBaseICMS', nfNum(d.vBaseICMS), c('vBaseICMS'));
    por('vICMS', nfNum(d.vICMS), c('vICMS'));
    if (Array.isArray(d.itens) && d.itens.length) {
      n.itens = d.itens.slice(0, 60).map(it => ({
        codigo: String(it.codigo || '').trim(),
        descricao: String(it.descricao || '').trim(),
        qtd: nfNum(it.qtd),
        un: String(it.un || 'UN').trim().toUpperCase().slice(0, 6),
        vUnit: nfNum(it.vUnit),
        vTotal: nfNum(it.vTotal) || (nfNum(it.qtd) * nfNum(it.vUnit)),
        materialId: '', pedidoItemId: ''
      })).filter(it => it.descricao);
      conf.itens = c('itens');
    }
    if (!nfChaveValida(n.chave)) por('chave', nfDigitos(d.chave).slice(0, 44), c('chave'));
  }
  // a chave por ultimo, para sobrepor a IA
  if (daChave && daChave.valida) {
    n.chave = daChave.chave;
    n.numero = daChave.numero; conf.numero = 1;
    n.serie = daChave.serie; conf.serie = 1;
    n.cnpj = daChave.cnpj; conf.cnpj = 1;
    n.uf = daChave.uf; conf.uf = 1;
    conf.chave = 1;
    // so completa o mes/ano se a IA nao tiver achado a data exata
    if (!n.dataEmissao || n.dataEmissao.slice(0, 7) !== daChave.competencia) {
      if (!n.dataEmissao) { n.dataEmissao = daChave.dataEmissao; conf.dataEmissao = 0.5; }
    }
  }
  if (nfNum(n.vTotal) && !nfNum(n.vProd)) n.vProd = nfNum(n.vTotal) - nfNum(n.vFrete);
  if (!nfNum(n.vTotal) && nfNum(n.vProd)) n.vTotal = nfNum(n.vProd) + nfNum(n.vFrete);
  n.leituraConf = conf;
  return n;
}
function nfConfBaixa(nota, campo) {
  const c = (nota && nota.leituraConf) ? nota.leituraConf[campo] : undefined;
  return typeof c === 'number' && c < 0.8;
}

/* ============================================================
   ASSOCIACAO INTELIGENTE
   Nao existe cadastro previo de material nesta obra, entao o
   catalogo e aprendido: cada item conferido vira referencia para
   as proximas notas. E o que da para fazer sem obrigar ninguem a
   cadastrar 300 materiais antes de usar.
   ============================================================ */
const NF_RUIDO = ['de', 'da', 'do', 'com', 'para', 'em', 'un', 'und', 'unid', 'pc', 'pct', 'cx', 'kg', 'mm', 'cm', 'ref'];
function nfNorm(s) {
  return String(s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    // separa letra de numero: cada fornecedor escreve de um jeito e
    // "DN400MM", "DN 400 MM" e "DN400 MM" sao o mesmo tubo
    .replace(/([A-Z])(\d)/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ').trim();
}
// numero de um digito conta (BRITA 1 nao e BRITA 2); letra solta, nao
function nfTokens(s) {
  return nfNorm(s).split(' ')
    .filter(t => (t.length > 1 || /\d/.test(t)) && NF_RUIDO.indexOf(t.toLowerCase()) === -1);
}
function nfSim(a, b) {
  const A = nfTokens(a), B = nfTokens(b);
  if (!A.length || !B.length) return 0;
  if (nfNorm(a) === nfNorm(b)) return 1;
  const sb = new Set(B);
  let inter = 0;
  A.forEach(t => { if (sb.has(t)) inter++; });
  const dice = (2 * inter) / (A.length + B.length);
  // numeros iguais (bitola, diametro) valem bonus: "TUBO PVC 100" x "TUBO PVC 150"
  const nA = A.filter(t => /\d/.test(t)), nB = B.filter(t => /\d/.test(t));
  if (nA.length && nB.length) {
    const igual = nA.filter(t => nB.indexOf(t) > -1).length;
    if (!igual) return dice * 0.55;
  }
  return dice;
}
/* catalogo aprendido das notas ja conferidas */
function nfMateriais(obraId) {
  const cat = {};
  nfGet(obraId).forEach(n => {
    if (n.status === 'Cancelada') return;
    (n.itens || []).forEach(it => {
      const k = it.materialId || nfNorm(it.descricao);
      if (!k) return;
      const m = cat[k] || (cat[k] = { id: k, descricao: it.descricao, un: it.un, notas: 0, qtd: 0, valor: 0, ultUnit: 0, fornecedores: {} });
      m.notas++; m.qtd += nfNum(it.qtd); m.valor += nfNum(it.vTotal);
      if (nfNum(it.vUnit)) m.ultUnit = nfNum(it.vUnit);
      if (n.cnpj) m.fornecedores[n.cnpj] = (n.razaoSocial || n.cnpj);
    });
  });
  return Object.values(cat).sort((a, b) => b.valor - a.valor);
}
function nfSugerirMaterial(desc, obraId) {
  return nfMateriais(obraId)
    .map(m => ({ material: m, score: nfSim(desc, m.descricao) }))
    .filter(x => x.score >= 0.62)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
function nfFornecedores(obraId) {
  const f = {};
  nfGet(obraId).forEach(n => {
    if (!n.cnpj || n.status === 'Cancelada') return;
    const x = f[n.cnpj] || (f[n.cnpj] = { cnpj: n.cnpj, nome: n.razaoSocial || n.nomeFantasia || nfCNPJfmt(n.cnpj), fantasia: n.nomeFantasia || '', municipio: n.municipio || '', uf: n.uf || '', notas: 0, valor: 0, ultima: '' });
    x.notas++; x.valor += nfNum(n.vTotal);
    if (n.razaoSocial && !x.nome) x.nome = n.razaoSocial;
    if (!x.ultima || (n.dataEmissao || '') > x.ultima) x.ultima = n.dataEmissao || '';
  });
  return Object.values(f).sort((a, b) => b.valor - a.valor);
}
/* fornecedor ja conhecido pelo CNPJ — evita cadastrar o mesmo duas vezes */
function nfFornecedorConhecido(obraId, cnpj) {
  const d = nfDigitos(cnpj);
  if (d.length !== 14) return null;
  return nfFornecedores(obraId).find(f => f.cnpj === d) || null;
}
/* itens de pedido de compra compativeis com um item da nota */
function nfSugerirPedidoItem(obraId, item, cnpj) {
  const out = [];
  nfPedGet(obraId).forEach(p => {
    if (p.status === 'Cancelado') return;
    if (cnpj && p.cnpj && nfDigitos(p.cnpj) !== nfDigitos(cnpj)) return;
    (p.itens || []).forEach(pi => {
      const falta = nfNum(pi.qtd) - nfNum(pi.qtdAtendida);
      if (falta <= 0.0001) return;
      const s = nfSim(item.descricao, pi.descricao);
      if (s >= 0.62) out.push({ pedido: p, item: pi, score: s, falta: falta });
    });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

/* ============================================================
   ESTOQUE — entrada gerada a partir da nota confirmada
   ============================================================ */
function nfIntegrarEstoque(obraId, nota) {
  const movs = nfMovGet(obraId).filter(m => m.notaId !== nota.id);   // regrava, nunca duplica
  const lote = 'NF ' + (nota.numero || '?') + (nota.serie ? '/' + nota.serie : '');
  (nota.itens || []).forEach((it, i) => {
    if (!it.descricao || !nfNum(it.qtd)) return;
    movs.push({
      id: 'mv' + uid(), notaId: nota.id, itemIdx: i, tipo: 'entrada', lote: lote,
      materialId: it.materialId || nfNorm(it.descricao),
      descricao: it.descricao, un: it.un || 'UN',
      qtd: nfNum(it.qtd), vUnit: nfNum(it.vUnit), vTotal: nfNum(it.vTotal),
      cnpj: nota.cnpj || '', fornecedor: nota.razaoSocial || '',
      dataISO: nota.dataEntrada || nota.dataEmissao || hoje(),
      usuario: usuarioAtual(), criadoEm: Date.now()
    });
  });
  nfMovSet(obraId, movs);
  return movs.filter(m => m.notaId === nota.id).length;
}
function nfDesfazerEstoque(obraId, notaId) {
  nfMovSet(obraId, nfMovGet(obraId).filter(m => m.notaId !== notaId));
}
function nfSaldos(obraId) {
  const s = {};
  nfMovGet(obraId).forEach(m => {
    const k = m.materialId || nfNorm(m.descricao);
    const x = s[k] || (s[k] = { id: k, descricao: m.descricao, un: m.un, entradas: 0, saidas: 0, valor: 0, lotes: [], ultima: '' });
    if (m.tipo === 'saida') x.saidas += nfNum(m.qtd);
    else { x.entradas += nfNum(m.qtd); x.valor += nfNum(m.vTotal); }
    if (x.lotes.indexOf(m.lote) === -1) x.lotes.push(m.lote);
    if (!x.ultima || (m.dataISO || '') > x.ultima) x.ultima = m.dataISO || '';
  });
  return Object.values(s).map(x => { x.saldo = x.entradas - x.saidas; return x; })
    .sort((a, b) => b.valor - a.valor);
}
/* baixa dos itens de pedido vinculados */
function nfBaixarPedidos(obraId, nota) {
  const peds = nfPedGet(obraId);
  let baixados = 0;
  (nota.itens || []).forEach(it => {
    if (!it.pedidoItemId) return;
    peds.forEach(p => (p.itens || []).forEach(pi => {
      if (pi.id !== it.pedidoItemId) return;
      const jaDesta = (pi.entregas || []).find(e => e.notaId === nota.id);
      pi.entregas = (pi.entregas || []).filter(e => e.notaId !== nota.id);
      pi.entregas.push({ notaId: nota.id, numero: nota.numero, qtd: nfNum(it.qtd), dataISO: nota.dataEntrada || nota.dataEmissao || hoje() });
      pi.qtdAtendida = pi.entregas.reduce((a, e) => a + nfNum(e.qtd), 0);
      if (!jaDesta) baixados++;
      const completo = (p.itens || []).every(x => nfNum(x.qtdAtendida) >= nfNum(x.qtd) - 0.0001);
      p.status = completo ? 'Atendido' : 'Parcial';
    }));
  });
  if (baixados) nfPedSet(obraId, peds);
  return baixados;
}

/* ============================================================
   SINCRONIZACAO — mesma fila/outbox do resto do app
   ============================================================ */
function nfEnfileirar(obraId, nota) {
  if (!BACKEND || isDemo()) return;
  const payload = {
    action: 'nfSalvar', obra: obraId, clientId: nota.clientId || nota.id, id: nota.id,
    numero: nota.numero || '', serie: nota.serie || '', chave: nota.chave || '',
    dataemissao: nota.dataEmissao || '', dataentrada: nota.dataEntrada || '',
    cnpj: nota.cnpj || '', razaosocial: nota.razaoSocial || '', nomefantasia: nota.nomeFantasia || '',
    municipio: nota.municipio || '', uf: nota.uf || '',
    vprod: nfNum(nota.vProd), vfrete: nfNum(nota.vFrete), vtotal: nfNum(nota.vTotal),
    vbaseicms: nfNum(nota.vBaseICMS), vicms: nfNum(nota.vICMS),
    itens: JSON.stringify(nota.itens || []), obs: nota.obs || '',
    responsavel: nota.responsavel || '', status: nota.status || 'Recebida',
    driveid: (nota.drive && nota.drive.fileId) || '', drivelink: (nota.drive && nota.drive.link) || '',
    leitura: JSON.stringify(nota.leitura || {}), historico: JSON.stringify((nota.historico || []).slice(-30)),
    usuario: nota.usuario || usuarioAtual(), criadoem: nota.criadoEm || Date.now()
  };
  outboxAdd({ id: 'ob' + uid(), obra: obraId, tipo: 'nf', clientId: payload.clientId, params: payload });
  outboxFlush();
}
function nfEnfileirarExcluir(obraId, id) {
  if (!BACKEND || isDemo()) return;
  outboxAdd({ id: 'ob' + uid(), obra: obraId, tipo: 'nfDel', params: { action: 'nfExcluir', obra: obraId, id: id } });
  outboxFlush();
}
/* envia a imagem depois que a nota ja existe (mesma regra das fotos do RDO) */
function nfEnviarImagem(obraId, nota, dataUrl) {
  if (!BACKEND || isDemo() || !dataUrl) return Promise.resolve(null);
  const comp = (nota.dataEntrada || nota.dataEmissao || hoje()).slice(0, 7);
  return postAcao({ action: 'nfImagem', obra: obraId, id: nota.id, competencia: comp, numero: nota.numero || '', foto: dataUrl })
    .then(r => {
      if (r && r.ok && r.fileId) {
        const arr = nfGet(obraId), n = arr.find(x => x.id === nota.id);
        if (n) {
          n.drive = { fileId: r.fileId, link: r.link || '', pasta: r.pasta || '', enviadoEm: Date.now() };
          nfSet(obraId, arr);
          nfEnfileirar(obraId, n);
        }
      }
      return r;
    })
    .catch(() => null);
}

/* ---------- auditoria ---------- */
function nfRegistrar(nota, acao, detalhe) {
  nota.historico = nota.historico || [];
  nota.historico.push({ quando: Date.now(), usuario: usuarioAtual() || '—', acao: acao, detalhe: detalhe || '' });
  nota.atualizadoEm = Date.now();
}
function nfDiff(antes, depois) {
  const campos = ['numero', 'serie', 'chave', 'dataEmissao', 'dataEntrada', 'cnpj', 'razaoSocial', 'vProd', 'vFrete', 'vTotal', 'vBaseICMS', 'vICMS', 'status', 'responsavel', 'obs'];
  const mud = [];
  campos.forEach(c => {
    const a = antes ? (antes[c] == null ? '' : String(antes[c])) : '';
    const b = depois[c] == null ? '' : String(depois[c]);
    if (a !== b) mud.push(c + ': "' + a + '" → "' + b + '"');
  });
  const ia = (antes && (antes.itens || []).length) || 0, ib = (depois.itens || []).length;
  if (ia !== ib) mud.push('itens: ' + ia + ' → ' + ib);
  return mud.join(' · ');
}

/* ============================================================
   FLUXO DO APONTADOR — fotografar e pronto
   ============================================================ */
let _nfRascunho = null;    // nota em conferencia
let _nfFull = '';          // imagem em resolucao cheia da nota em conferencia

function nfNovaVazia(obraId) {
  return {
    id: 'nf' + uid(), clientId: 'nf' + uid(), obraId: obraId,
    numero: '', serie: '', chave: '', dataEmissao: '', dataEntrada: hoje(),
    cnpj: '', razaoSocial: '', nomeFantasia: '', municipio: '', uf: '',
    vProd: 0, vFrete: 0, vTotal: 0, vBaseICMS: 0, vICMS: 0,
    itens: [], obs: '', responsavel: usuarioAtual() || '', status: 'Recebida',
    drive: null, thumb: '', leitura: { metodo: 'manual', quando: Date.now() }, leituraConf: {},
    historico: [], usuario: usuarioAtual() || '', criadoEm: Date.now(), atualizadoEm: Date.now()
  };
}

function nfAbrirNova() {
  const o = obra(); if (!o) return;
  _nfRascunho = nfNovaVazia(o.id); _nfFull = '';
  abrirModal('Nova nota fiscal', `
    <div id="nfPasso">
      <div class="empty" style="padding:14px 6px 18px">
        <div class="ic">🧾</div>
        <div style="font-size:14px;color:var(--text-2);line-height:1.5">Fotografe a DANFE inteira, de frente e sem sombra.<br>
        O sistema lê o código de barras, a chave de acesso e o restante dos dados sozinho.</div>
      </div>
      <label class="btn btn-pri" style="width:100%;justify-content:center;margin-bottom:9px;cursor:pointer">📷 Fotografar a nota
        <input type="file" accept="image/*" capture="environment" onchange="nfImagemSelecionada(this)" style="display:none"></label>
      <label class="btn" style="width:100%;justify-content:center;margin-bottom:14px;cursor:pointer">🖼 Escolher da galeria
        <input type="file" accept="image/*" onchange="nfImagemSelecionada(this)" style="display:none"></label>
      <div class="card" style="box-shadow:none"><div class="card-b" style="padding:13px 15px">
        <label class="fl">Não tem a nota em mãos?</label>
        <div class="row" style="gap:8px">
          <input id="nfChaveManual" inputmode="numeric" placeholder="Chave de acesso (44 dígitos)" style="flex:1;min-width:190px">
          <button class="btn" onclick="nfUsarChaveDigitada()">Usar chave</button></div>
        <button class="btn btn-ghost" style="width:100%;justify-content:center;margin-top:8px" onclick="nfConferir()">Preencher tudo à mão</button>
      </div></div>
    </div>`, 620);
}

function nfPassoUI(linhas) {
  const box = el('nfPasso'); if (!box) return;
  box.innerHTML = `<div class="card" style="box-shadow:none"><div class="card-b" style="padding:16px 18px">
    ${linhas.map(l => `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;font-size:13.5px">
      <span style="width:20px;text-align:center">${l.ic}</span>
      <span style="flex:1;color:${l.st === 'ok' ? 'var(--text)' : 'var(--muted)'}">${l.t}</span></div>`).join('')}
    </div></div>`;
}

async function nfImagemSelecionada(inp) {
  const f = (inp.files || [])[0]; inp.value = '';
  if (!f || !/^image\//.test(f.type)) { toast('Selecione uma imagem da nota'); return; }
  const o = obra(); if (!o) return;
  const passos = [
    { ic: '⏳', t: 'Preparando a imagem…', st: '' },
    { ic: '·', t: 'Procurando o código de barras da DANFE', st: '' },
    { ic: '·', t: 'Lendo os dados da nota', st: '' }
  ];
  nfPassoUI(passos);

  let thumb = '', full = '';
  try {
    const r = await Promise.all([comprimirImg(f, 320, .55), comprimirImg(f, NF_MAX_LADO, .82)]);
    thumb = r[0]; full = r[1];
  } catch (e) { toast('Não consegui ler essa imagem'); nfAbrirNova(); return; }
  passos[0] = { ic: '✓', t: 'Imagem pronta', st: 'ok' };
  passos[1].ic = '⏳'; nfPassoUI(passos);

  _nfRascunho.thumb = thumb; _nfFull = full;

  // 1) codigo de barras / QR — offline, instantaneo e exato
  const cod = await nfLerCodigos(f);
  const daChave = cod.chave ? nfDaChave(cod.chave) : null;
  passos[1] = daChave
    ? { ic: '✓', t: 'Chave de acesso lida do código de barras', st: 'ok' }
    : { ic: '—', t: cod.suportado ? 'Sem código legível na foto' : 'Este aparelho não lê código de barras', st: '' };
  passos[2].ic = '⏳'; nfPassoUI(passos);

  // 2) imagem -> OCR/IA no backend
  const ia = await nfLerImagemIA(full, daChave ? daChave.chave : '');
  if (ia && ia.ok) passos[2] = { ic: '✓', t: 'Dados extraídos da imagem', st: 'ok' };
  else if (ia && ia.motivo === 'sem_ia') passos[2] = { ic: '—', t: 'Leitura por imagem não configurada no servidor', st: '' };
  else if (ia && ia.motivo === 'local') passos[2] = { ic: '—', t: 'Sem servidor: confira os campos abaixo', st: '' };
  else passos[2] = { ic: '—', t: 'Não consegui ler a imagem — confira os campos', st: '' };
  nfPassoUI(passos);

  let nota = nfMesclarLeitura(_nfRascunho, daChave, ia);
  nota.leitura = {
    metodo: daChave ? (ia && ia.ok ? 'codigo+ia' : 'codigo') : (ia && ia.ok ? 'ia' : 'manual'),
    codigos: (cod.codigos || []).slice(0, 3),
    quando: Date.now(),
    modelo: (ia && ia.modelo) || '',
    confiancaGeral: (ia && ia.confiancaGeral) || (daChave ? 1 : 0)
  };
  if (!nota.dataEntrada) nota.dataEntrada = hoje();
  nfRegistrar(nota, 'leitura automática', nota.leitura.metodo);
  nfAutoVincular(o.id, nota);
  _nfRascunho = nota;
  setTimeout(() => nfConferir(), 450);
}

function nfUsarChaveDigitada() {
  const v = el('nfChaveManual') ? el('nfChaveManual').value : '';
  const ch = nfDigitos(v);
  if (ch.length !== 44) { toast('A chave tem 44 números'); return; }
  if (!nfChaveValida(ch)) { toast('Chave inválida — confira os números'); return; }
  _nfRascunho = nfMesclarLeitura(_nfRascunho, nfDaChave(ch), null);
  _nfRascunho.leitura = { metodo: 'chave', quando: Date.now(), confiancaGeral: 1 };
  nfRegistrar(_nfRascunho, 'chave digitada', ch);
  nfAutoVincular(obra().id, _nfRascunho);
  nfConferir();
}

/* preenche fornecedor conhecido e vincula itens com alta compatibilidade */
function nfAutoVincular(obraId, nota) {
  const forn = nfFornecedorConhecido(obraId, nota.cnpj);
  if (forn) {
    if (!nota.razaoSocial) nota.razaoSocial = forn.nome;
    if (!nota.nomeFantasia) nota.nomeFantasia = forn.fantasia;
    if (!nota.municipio) nota.municipio = forn.municipio;
    if (!nota.uf) nota.uf = forn.uf;
  }
  (nota.itens || []).forEach(it => {
    if (!it.materialId) {
      const s = nfSugerirMaterial(it.descricao, obraId);
      if (s.length && s[0].score >= 0.85 && (s.length === 1 || s[0].score - s[1].score > 0.12)) it.materialId = s[0].material.id;
    }
    if (!it.pedidoItemId) {
      const p = nfSugerirPedidoItem(obraId, it, nota.cnpj);
      if (p.length && p[0].score >= 0.85 && (p.length === 1 || p[0].score - p[1].score > 0.12)) it.pedidoItemId = p[0].item.id;
    }
  });
}

/* ---------- tela de conferência ---------- */
function nfConferir() {
  const o = obra(); if (!o || !_nfRascunho) return;
  const n = _nfRascunho;
  const dup = nfGet(o.id).find(x => x.id !== n.id && ((n.chave && x.chave === n.chave) ||
    (n.numero && n.cnpj && x.numero === n.numero && x.cnpj === n.cnpj)));
  const marca = c => nfConfBaixa(n, c) ? ' nf-confira' : '';
  const aviso = c => nfConfBaixa(n, c) ? '<span class="nf-tag-confira">confira</span>' : '';
  const totItens = (n.itens || []).reduce((a, it) => a + nfNum(it.vTotal), 0);
  const difer = nfNum(n.vTotal) && Math.abs(nfNum(n.vTotal) - (totItens + nfNum(n.vFrete))) > 0.05;

  abrirModal((n.criadoEm && nfPorId(o.id, n.id) ? 'Editar nota fiscal' : 'Conferir nota fiscal'), `
    ${n.thumb ? `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px">
      <img src="${esc(n.thumb)}" alt="nota fiscal" onclick="nfVerImagem('${n.id}')" style="width:88px;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--border-strong);cursor:zoom-in">
      <div style="flex:1;min-width:0">
        <div class="kpi-s">${nfLeituraTxt(n)}</div>
        ${n.chave ? `<div class="mono" style="font-size:10.5px;word-break:break-all;margin-top:6px;color:var(--text-2)">${esc(n.chave)}</div>` : ''}
        <button class="btn btn-sm btn-ghost" style="margin-top:6px;padding-left:0" onclick="nfVerImagem('${n.id}')">🔍 Ver a nota</button>
      </div></div>` : ''}
    ${dup ? `<div class="nf-alerta nf-alerta-red">Já existe a nota <b>${esc(dup.numero || '—')}</b> deste fornecedor no sistema. Salvar vai criar uma segunda.</div>` : ''}
    ${difer ? `<div class="nf-alerta nf-alerta-ylw">A soma dos itens + frete (${fmtBRL(totItens + nfNum(n.vFrete))}) não bate com o valor total da nota (${fmtBRL(nfNum(n.vTotal))}).</div>` : ''}

    <div class="row"><div class="field"><label class="fl">Número ${aviso('numero')}</label><input id="nf_numero" class="${marca('numero')}" value="${esc(n.numero)}" inputmode="numeric"></div>
      <div class="field" style="max-width:110px"><label class="fl">Série ${aviso('serie')}</label><input id="nf_serie" class="${marca('serie')}" value="${esc(n.serie)}" inputmode="numeric"></div></div>
    <div class="field"><label class="fl">Chave de acesso ${aviso('chave')}</label>
      <input id="nf_chave" class="mono ${marca('chave')}" value="${esc(n.chave)}" inputmode="numeric" placeholder="44 dígitos" onblur="nfChaveNoForm()" style="font-size:12.5px"></div>
    <div class="row"><div class="field"><label class="fl">Emissão ${aviso('dataEmissao')}</label><input type="date" id="nf_dataEmissao" class="${marca('dataEmissao')}" value="${esc(n.dataEmissao)}"></div>
      <div class="field"><label class="fl">Recebimento</label><input type="date" id="nf_dataEntrada" value="${esc(n.dataEntrada || hoje())}"></div></div>

    <div class="nf-sep">Fornecedor</div>
    <div class="field"><label class="fl">CNPJ ${aviso('cnpj')}</label>
      <input id="nf_cnpj" class="mono ${marca('cnpj')}" value="${esc(nfCNPJfmt(n.cnpj))}" inputmode="numeric" onblur="nfCnpjNoForm()"><div id="nf_cnpjMsg" class="kpi-s"></div></div>
    <div class="field"><label class="fl">Razão social ${aviso('razaoSocial')}</label><input id="nf_razaoSocial" class="${marca('razaoSocial')}" value="${esc(n.razaoSocial)}"></div>
    <div class="row"><div class="field"><label class="fl">Nome fantasia</label><input id="nf_nomeFantasia" value="${esc(n.nomeFantasia)}"></div>
      <div class="field"><label class="fl">Município</label><input id="nf_municipio" value="${esc(n.municipio)}"></div>
      <div class="field" style="max-width:88px"><label class="fl">UF</label><input id="nf_uf" value="${esc(n.uf)}" maxlength="2" style="text-transform:uppercase"></div></div>

    <div class="nf-sep">Valores</div>
    <div class="row"><div class="field"><label class="fl">Produtos ${aviso('vProd')}</label><input id="nf_vProd" class="num ${marca('vProd')}" inputmode="decimal" value="${nfNum(n.vProd) ? fmtNum(n.vProd) : ''}" onblur="nfRecalcTotal()"></div>
      <div class="field"><label class="fl">Frete</label><input id="nf_vFrete" class="num" inputmode="decimal" value="${nfNum(n.vFrete) ? fmtNum(n.vFrete) : ''}" onblur="nfRecalcTotal()"></div>
      <div class="field"><label class="fl">Total ${aviso('vTotal')}</label><input id="nf_vTotal" class="num ${marca('vTotal')}" inputmode="decimal" value="${nfNum(n.vTotal) ? fmtNum(n.vTotal) : ''}" style="font-weight:700"></div></div>
    <div class="row"><div class="field"><label class="fl">Base de ICMS</label><input id="nf_vBaseICMS" class="num" inputmode="decimal" value="${nfNum(n.vBaseICMS) ? fmtNum(n.vBaseICMS) : ''}"></div>
      <div class="field"><label class="fl">ICMS</label><input id="nf_vICMS" class="num" inputmode="decimal" value="${nfNum(n.vICMS) ? fmtNum(n.vICMS) : ''}"></div></div>

    <div class="nf-sep" style="display:flex;justify-content:space-between;align-items:center">
      <span>Produtos da nota ${aviso('itens')}</span>
      <button class="btn btn-sm" onclick="nfAddItem()">+ Produto</button></div>
    <div id="nfItens"></div>
    <div class="kpi-s" id="nfItensTot" style="text-align:right;margin:4px 2px 12px"></div>

    <div class="nf-sep">Conferência</div>
    <div class="row"><div class="field"><label class="fl">Status</label><select id="nf_status">${NF_STATUS.map(s => `<option ${n.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label class="fl">Recebido por</label><input id="nf_responsavel" value="${esc(n.responsavel || usuarioAtual())}"></div></div>
    <div class="field"><label class="fl">Observações</label><textarea id="nf_obs" rows="2" placeholder="Divergência, avaria, local de descarga…">${esc(n.obs)}</textarea></div>
    <label style="display:flex;gap:9px;align-items:flex-start;font-size:13.5px;margin-bottom:6px;cursor:pointer">
      <input type="checkbox" id="nf_estoque" style="width:auto;margin-top:3px" checked> <span>Dar entrada dos materiais no estoque ao salvar</span></label>
    <label style="display:flex;gap:9px;align-items:flex-start;font-size:13.5px;margin-bottom:14px;cursor:pointer">
      <input type="checkbox" id="nf_baixa" style="width:auto;margin-top:3px" checked> <span>Baixar os itens vinculados no pedido de compra</span></label>

    <div style="display:flex;gap:9px">
      <button class="btn" style="flex:1;justify-content:center" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-pri" style="flex:2;justify-content:center" onclick="nfSalvarForm()">Salvar nota</button></div>
    ${(n.historico || []).length ? `<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:10px" onclick="nfVerHistorico('${n.id}')">🕘 Histórico de alterações (${n.historico.length})</button>` : ''}
  `, 680);
  nfRenderItens();
  nfCnpjNoForm();
}
function nfLeituraTxt(n) {
  const l = n.leitura || {};
  const m = {
    'codigo+ia': 'Lido do código de barras e da imagem',
    'codigo': 'Lido do código de barras da DANFE',
    'chave': 'Preenchido pela chave de acesso',
    'ia': 'Lido da imagem da nota',
    'manual': 'Preenchido à mão'
  }[l.metodo] || 'Preenchido à mão';
  const c = typeof l.confiancaGeral === 'number' ? Math.round(l.confiancaGeral * 100) : null;
  return esc(m) + (c != null && l.metodo !== 'manual' ? ` · confiança ${c}%` : '');
}

/* ---------- itens ---------- */
function nfRenderItens() {
  const box = el('nfItens'); if (!box || !_nfRascunho) return;
  const o = obra();
  const itens = _nfRascunho.itens || [];
  if (!itens.length) {
    box.innerHTML = `<div class="kpi-s" style="padding:8px 2px 12px">Nenhum produto lido. Use <b>+ Produto</b> se quiser detalhar — não é obrigatório para salvar.</div>`;
  } else {
    box.innerHTML = itens.map((it, i) => {
      const sugM = it.materialId ? [] : nfSugerirMaterial(it.descricao, o.id);
      const sugP = it.pedidoItemId ? [] : nfSugerirPedidoItem(o.id, it, _nfRascunho.cnpj);
      const mat = it.materialId ? nfMateriais(o.id).find(m => m.id === it.materialId) : null;
      const ped = it.pedidoItemId ? nfPedItemPorId(o.id, it.pedidoItemId) : null;
      return `<div class="nf-item">
        <div class="row" style="gap:7px;margin-bottom:6px">
          <div class="field" style="margin:0;flex:3;min-width:150px"><input value="${esc(it.descricao)}" placeholder="Descrição do produto" oninput="nfItemCampo(${i},'descricao',this.value)"></div>
          <div class="field" style="margin:0;max-width:74px"><input class="num" inputmode="decimal" value="${it.qtd ? fmtQtd(it.qtd) : ''}" placeholder="Qtd" oninput="nfItemCampo(${i},'qtd',this.value)"></div>
          <div class="field" style="margin:0;max-width:78px"><input value="${esc(it.un)}" placeholder="Un" oninput="nfItemCampo(${i},'un',this.value)" style="text-transform:uppercase"></div>
          <div class="field" style="margin:0;max-width:96px"><input class="num" inputmode="decimal" value="${it.vUnit ? fmtNum(it.vUnit) : ''}" placeholder="V. unit." oninput="nfItemCampo(${i},'vUnit',this.value)"></div>
          <div class="field" style="margin:0;max-width:104px"><input class="num" inputmode="decimal" value="${it.vTotal ? fmtNum(it.vTotal) : ''}" placeholder="Total" oninput="nfItemCampo(${i},'vTotal',this.value)"></div>
          <button class="btn btn-sm btn-ghost" onclick="nfDelItem(${i})" title="Remover">✕</button></div>
        ${mat ? `<div class="nf-vinc">🔗 Material <b>${esc(mat.descricao)}</b> · ${mat.notas} nota(s) <button class="btn btn-sm btn-ghost" onclick="nfItemCampo(${i},'materialId','');nfRenderItens()">desvincular</button></div>` : ''}
        ${ped ? `<div class="nf-vinc">📦 Pedido <b>${esc(ped.pedido.numero)}</b> · ${esc(ped.item.descricao)} (falta ${fmtQtd(nfNum(ped.item.qtd) - nfNum(ped.item.qtdAtendida))} ${esc(ped.item.un || '')}) <button class="btn btn-sm btn-ghost" onclick="nfItemCampo(${i},'pedidoItemId','');nfRenderItens()">desvincular</button></div>` : ''}
        ${sugM.length ? `<div class="nf-vinc">Material parecido: ${sugM.map(s => `<button class="chip nf-chip-sug" onclick="nfItemCampo(${i},'materialId','${esc(s.material.id).replace(/'/g, '')}');nfRenderItens()">${esc(s.material.descricao)} · ${Math.round(s.score * 100)}%</button>`).join(' ')}</div>` : ''}
        ${sugP.length ? `<div class="nf-vinc">Pedido em aberto: ${sugP.map(s => `<button class="chip nf-chip-sug" onclick="nfItemCampo(${i},'pedidoItemId','${esc(s.item.id)}');nfRenderItens()">${esc(s.pedido.numero)} · ${esc(s.item.descricao)}</button>`).join(' ')}</div>` : ''}
      </div>`;
    }).join('');
  }
  const t = (itens).reduce((a, it) => a + nfNum(it.vTotal), 0);
  const tt = el('nfItensTot');
  if (tt) tt.innerHTML = itens.length ? `Soma dos itens: <b class="mono">${fmtBRL(t)}</b>` : '';
}
function nfPedItemPorId(obraId, itemId) {
  let r = null;
  nfPedGet(obraId).forEach(p => (p.itens || []).forEach(i => { if (i.id === itemId) r = { pedido: p, item: i }; }));
  return r;
}
function nfItemCampo(i, campo, valor) {
  const it = (_nfRascunho.itens || [])[i]; if (!it) return;
  if (campo === 'qtd' || campo === 'vUnit' || campo === 'vTotal') {
    it[campo] = nfNum(valor);
    if (campo !== 'vTotal' && nfNum(it.qtd) && nfNum(it.vUnit)) it.vTotal = +(nfNum(it.qtd) * nfNum(it.vUnit)).toFixed(2);
    const tt = el('nfItensTot');
    if (tt) tt.innerHTML = `Soma dos itens: <b class="mono">${fmtBRL((_nfRascunho.itens || []).reduce((a, x) => a + nfNum(x.vTotal), 0))}</b>`;
  } else if (campo === 'un') it.un = String(valor || '').toUpperCase();
  else it[campo] = valor;
}
function nfAddItem() {
  _nfRascunho.itens = _nfRascunho.itens || [];
  _nfRascunho.itens.push({ codigo: '', descricao: '', qtd: 0, un: 'UN', vUnit: 0, vTotal: 0, materialId: '', pedidoItemId: '' });
  nfRenderItens();
}
function nfDelItem(i) { _nfRascunho.itens.splice(i, 1); nfRenderItens(); }

function nfChaveNoForm() {
  const c = el('nf_chave'); if (!c) return;
  const ch = nfDigitos(c.value);
  if (ch.length !== 44) return;
  if (!nfChaveValida(ch)) { toast('Chave inválida — confira os números'); c.classList.add('nf-confira'); return; }
  c.classList.remove('nf-confira');
  const d = nfDaChave(ch);
  if (el('nf_numero')) el('nf_numero').value = d.numero;
  if (el('nf_serie')) el('nf_serie').value = d.serie;
  if (el('nf_cnpj')) el('nf_cnpj').value = nfCNPJfmt(d.cnpj);
  if (el('nf_uf')) el('nf_uf').value = d.uf;
  ['nf_numero', 'nf_serie', 'nf_cnpj', 'nf_uf'].forEach(id => { const e = el(id); if (e) e.classList.remove('nf-confira'); });
  nfCnpjNoForm();
  toast('Dados preenchidos pela chave de acesso');
}
function nfCnpjNoForm() {
  const c = el('nf_cnpj'), msg = el('nf_cnpjMsg'); if (!c || !msg) return;
  const d = nfDigitos(c.value);
  if (!d) { msg.textContent = ''; return; }
  if (d.length !== 14) { msg.innerHTML = '<span style="color:var(--amarelo)">CNPJ incompleto</span>'; return; }
  c.value = nfCNPJfmt(d);
  if (!nfCNPJvalido(d)) { msg.innerHTML = '<span style="color:var(--vermelho)">CNPJ não confere</span>'; return; }
  const o = obra();
  const f = o ? nfFornecedorConhecido(o.id, d) : null;
  if (f) {
    msg.innerHTML = `<span style="color:var(--accent)">Fornecedor já cadastrado: <b>${esc(f.nome)}</b> · ${f.notas} nota(s)</span>`;
    if (el('nf_razaoSocial') && !el('nf_razaoSocial').value) el('nf_razaoSocial').value = f.nome;
    if (el('nf_municipio') && !el('nf_municipio').value) el('nf_municipio').value = f.municipio;
    if (el('nf_uf') && !el('nf_uf').value) el('nf_uf').value = f.uf;
  } else msg.innerHTML = '<span style="color:var(--muted)">Fornecedor novo — será cadastrado com esta nota</span>';
}
function nfRecalcTotal() {
  const p = nfNum(el('nf_vProd') ? el('nf_vProd').value : 0), f = nfNum(el('nf_vFrete') ? el('nf_vFrete').value : 0);
  const t = el('nf_vTotal');
  if (t && p && !nfNum(t.value)) t.value = fmtNum(p + f);
}

/* ---------- salvar ---------- */
function nfSalvarForm() {
  const o = obra(); if (!o || !_nfRascunho) return;
  const v = id => { const e = el(id); return e ? e.value.trim() : ''; };
  const n = _nfRascunho;
  const antes = nfPorId(o.id, n.id);
  const antesCopia = antes ? JSON.parse(JSON.stringify(antes)) : null;

  n.numero = v('nf_numero'); n.serie = v('nf_serie');
  n.chave = nfDigitos(v('nf_chave')).slice(0, 44);
  n.dataEmissao = v('nf_dataEmissao'); n.dataEntrada = v('nf_dataEntrada') || hoje();
  n.cnpj = nfDigitos(v('nf_cnpj')); n.razaoSocial = v('nf_razaoSocial'); n.nomeFantasia = v('nf_nomeFantasia');
  n.municipio = v('nf_municipio'); n.uf = v('nf_uf').toUpperCase();
  n.vProd = nfNum(v('nf_vProd')); n.vFrete = nfNum(v('nf_vFrete')); n.vTotal = nfNum(v('nf_vTotal'));
  n.vBaseICMS = nfNum(v('nf_vBaseICMS')); n.vICMS = nfNum(v('nf_vICMS'));
  n.status = v('nf_status') || 'Recebida'; n.responsavel = v('nf_responsavel'); n.obs = v('nf_obs');
  n.itens = (n.itens || []).filter(it => String(it.descricao || '').trim());
  n.obraId = o.id;
  if (!n.numero && !n.chave && !n.vTotal) { toast('Informe ao menos o número ou o valor da nota'); return; }

  const paraEstoque = el('nf_estoque') && el('nf_estoque').checked;
  const paraPedido = el('nf_baixa') && el('nf_baixa').checked;

  // item digitado à mão também entra na associação automática
  nfAutoVincular(o.id, n);
  nfRegistrar(n, antes ? 'alterada' : 'cadastrada', antes ? nfDiff(antesCopia, n) : ('nº ' + (n.numero || '—')));

  const arr = nfGet(o.id);
  const i = arr.findIndex(x => x.id === n.id);
  if (i > -1) arr[i] = n; else arr.unshift(n);
  nfSet(o.id, arr);

  let msg = 'Nota salva';
  if (paraEstoque && n.status !== 'Cancelada' && (n.itens || []).length) {
    const q = nfIntegrarEstoque(o.id, n);
    if (q) { msg = q + ' material(is) no estoque'; if (n.status === 'Recebida' || n.status === 'Conferida') n.status = 'Integrada ao estoque'; nfRegistrar(n, 'entrada no estoque', q + ' item(ns)'); }
  } else if (!paraEstoque) nfDesfazerEstoque(o.id, n.id);
  if (paraPedido) {
    const b = nfBaixarPedidos(o.id, n);
    if (b) { msg += ' · ' + b + ' item(ns) baixado(s) no pedido'; if (n.status === 'Recebida') n.status = 'Integrada ao pedido de compra'; nfRegistrar(n, 'baixa em pedido', b + ' item(ns)'); }
  }
  nfSet(o.id, nfGet(o.id).map(x => x.id === n.id ? n : x));

  // imagem em resolucao cheia: IndexedDB local + Drive em segundo plano
  if (_nfFull) {
    try { fotoGuardarFull(nfImgChave(o.id, n.id), _nfFull); } catch (e) { /* segue sem a copia local */ }
    nfEnviarImagem(o.id, n, _nfFull);
  }
  nfEnfileirar(o.id, n);

  _nfRascunho = null; _nfFull = '';
  fecharModal(); toast(msg);
  if (estado.tela === 'notas') render();
}

function nfEditar(id) {
  const o = obra(); if (!o) return;
  const n = nfPorId(o.id, id); if (!n) return;
  _nfRascunho = JSON.parse(JSON.stringify(n));
  _nfFull = '';
  nfConferir();
}
function nfExcluir(id) {
  const o = obra(); const n = nfPorId(o.id, id); if (!n) return;
  if (!confirm('Excluir a nota ' + (n.numero || '') + '? A entrada de estoque gerada por ela também sai.')) return;
  nfDesfazerEstoque(o.id, id);
  nfSet(o.id, nfGet(o.id).filter(x => x.id !== id));
  nfEnfileirarExcluir(o.id, id);
  fecharModal(); toast('Nota excluída'); render();
}
function nfMudarStatus(id, st) {
  const o = obra(); const arr = nfGet(o.id); const n = arr.find(x => x.id === id); if (!n) return;
  const de = n.status; n.status = st;
  nfRegistrar(n, 'status', de + ' → ' + st);
  if (st === 'Cancelada') nfDesfazerEstoque(o.id, id);
  nfSet(o.id, arr); nfEnfileirar(o.id, n);
  toast('Status: ' + st); render();
}

/* ---------- imagem da nota ---------- */
async function nfVerImagem(id) {
  const o = obra();
  const n = (_nfRascunho && _nfRascunho.id === id) ? _nfRascunho : nfPorId(o.id, id);
  if (!n) return;
  let src = '';
  try { src = await fotoLerFull(nfImgChave(o.id, id)); } catch (e) { src = ''; }
  if (!src && _nfFull && _nfRascunho && _nfRascunho.id === id) src = _nfFull;
  if (!src && n.drive && n.drive.fileId && BACKEND && !isDemo()) {
    try { const r = await postAcao({ action: 'obterFoto', fileId: n.drive.fileId }); if (r && r.ok && r.dataUri) src = r.dataUri; } catch (e) { /* fica com a miniatura */ }
  }
  if (!src) src = n.thumb || '';
  abrirModal('Nota fiscal ' + esc(n.numero || ''), `
    ${src ? `<img src="${esc(src)}" alt="nota fiscal" style="width:100%;border-radius:8px">` : '<div class="empty"><div class="ic">🧾</div>Imagem não disponível neste aparelho.</div>'}
    <div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">
      ${n.drive && n.drive.link ? `<a class="btn" href="${esc(n.drive.link)}" target="_blank" rel="noopener">📁 Abrir no Google Drive</a>` : ''}
      ${src ? `<a class="btn" href="${esc(src)}" download="NF-${esc(n.numero || n.id)}.jpg">⬇ Baixar imagem</a>` : ''}
      <button class="btn btn-ghost" onclick="nfEditar('${n.id}')">✎ Editar dados</button></div>`, 720);
}
function nfVerHistorico(id) {
  const o = obra();
  const n = (_nfRascunho && _nfRascunho.id === id) ? _nfRascunho : nfPorId(o.id, id);
  if (!n) return;
  const h = (n.historico || []).slice().reverse();
  abrirModal('Histórico da nota ' + esc(n.numero || ''), h.length ? h.map(x => `
    <div style="padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:13.5px;font-weight:600">${esc(x.acao)}</div>
      <div class="kpi-s">${new Date(x.quando).toLocaleString('pt-BR')} · ${esc(x.usuario || '—')}</div>
      ${x.detalhe ? `<div class="kpi-s" style="color:var(--text-2);word-break:break-word">${esc(x.detalhe)}</div>` : ''}
    </div>`).join('') : '<div class="empty">Sem alterações registradas.</div>', 560);
}

/* ============================================================
   TELAS
   ============================================================ */
function viewNotas(o) {
  const abas = [['notas', '🧾 Notas'], ['estoque', '📦 Estoque'], ['pedidos', '📋 Pedidos'], ['painel', '📊 Painel']];
  const tab = estado.nfTab || 'notas';
  const topo = `<div class="row nf-topo" style="align-items:center;margin-bottom:16px;gap:9px">
    <div style="display:flex;gap:7px;flex-wrap:wrap">${abas.map(a => `<button class="chip ${tab === a[0] ? 'on' : ''}" onclick="nfTab('${a[0]}')">${a[1]}</button>`).join('')}</div>
    <button class="btn btn-pri nf-nova" style="margin-left:auto" onclick="nfAbrirNova()">📷 Nova nota fiscal</button></div>`;
  const corpo = tab === 'estoque' ? nfViewEstoque(o) : tab === 'pedidos' ? nfViewPedidos(o) : tab === 'painel' ? nfViewPainel(o) : nfViewLista(o);
  return topo + corpo;
}
function nfTab(t) { estado.nfTab = t; estado.nfLimite = NF_PAGINA; render(); }

/* ---------- lista de notas + pesquisa ---------- */
function nfFiltrar(o) {
  const q = nfNorm(estado.nfBusca || '');
  const qd = nfDigitos(estado.nfBusca || '');
  const st = estado.nfStatus || 'Todos';
  const mes = estado.nfMes || 'Todos';
  return nfGet(o.id).filter(n => {
    if (st !== 'Todos' && n.status !== st) return false;
    if (mes !== 'Todos' && (n.dataEntrada || n.dataEmissao || '').slice(0, 7) !== mes) return false;
    if (!q) return true;
    const alvo = nfNorm([n.numero, n.serie, n.razaoSocial, n.nomeFantasia, n.municipio, n.uf, n.responsavel, n.status, n.obs,
      (n.itens || []).map(i => i.descricao).join(' ')].join(' '));
    if (alvo.indexOf(q) > -1) return true;
    if (qd && (nfDigitos(n.cnpj).indexOf(qd) > -1 || String(n.chave).indexOf(qd) > -1 || String(n.numero).indexOf(qd) > -1)) return true;
    if (qd && String(Math.round(nfNum(n.vTotal))).indexOf(qd) > -1) return true;
    return false;
  }).sort((a, b) => (b.dataEntrada || b.dataEmissao || '').localeCompare(a.dataEntrada || a.dataEmissao || '') || b.criadoEm - a.criadoEm);
}
function nfViewLista(o) {
  const todas = nfGet(o.id);
  const meses = [...new Set(todas.map(n => (n.dataEntrada || n.dataEmissao || '').slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
  const fs = nfFiltrar(o);
  const lim = estado.nfLimite || NF_PAGINA;
  const mostra = fs.slice(0, lim);
  const filtros = `<div class="card" style="margin-bottom:16px"><div class="card-b" style="padding:12px 15px">
    <div class="row" style="align-items:flex-end;gap:10px">
      <div class="field" style="margin:0;flex:2;min-width:190px"><label class="fl">Pesquisar</label>
        <input id="nfBusca" value="${esc(estado.nfBusca || '')}" placeholder="Nº, fornecedor, CNPJ, material, valor…" oninput="nfSetBusca(this.value)"></div>
      <div class="field" style="margin:0;max-width:200px"><label class="fl">Status</label>
        <select onchange="nfSetFiltro('nfStatus',this.value)"><option>Todos</option>
          ${NF_STATUS.map(s => `<option ${estado.nfStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field" style="margin:0;max-width:170px"><label class="fl">Período</label>
        <select onchange="nfSetFiltro('nfMes',this.value)"><option value="Todos">Todos os meses</option>
          ${meses.map(m => `<option value="${m}" ${estado.nfMes === m ? 'selected' : ''}>${mesLabel(m + '-01')}</option>`).join('')}</select></div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="chip">${fs.length} de ${todas.length}</span>
        <button class="btn btn-sm" onclick="nfExportarCSV()" ${fs.length ? '' : 'disabled'}>⬇ CSV</button></div></div></div></div>`;

  if (!todas.length) return filtros + `<div class="empty"><div class="ic">🧾</div>Nenhuma nota fiscal registrada nesta obra.<br>
    <span class="kpi-s">Toque em <b>Nova nota fiscal</b> e fotografe a DANFE — o resto o sistema preenche.</span></div>`;
  if (!fs.length) return filtros + `<div class="empty"><div class="ic">🔍</div>Nenhuma nota encontrada com esse filtro.</div>`;

  const cards = mostra.map(n => {
    const div = nfDivergencia(n);
    return `<div class="card nf-card">
      <div class="nf-card-img" onclick="nfVerImagem('${n.id}')">
        ${n.thumb ? `<img src="${esc(n.thumb)}" alt="nota ${esc(n.numero)}" loading="lazy">` : `<div class="nf-card-sem">🧾</div>`}
        <span class="pill ${NF_STATUS_COR[n.status] || 'pill-blu'} nf-card-st">${esc(n.status)}</span></div>
      <div class="nf-card-b">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
          <div style="font-weight:700;font-size:14.5px">NF ${esc(n.numero || '—')}${n.serie ? '<span class="kpi-s"> · série ' + esc(n.serie) + '</span>' : ''}</div>
          <div class="mono" style="font-weight:700;font-size:13.5px">${fmtBRL(nfNum(n.vTotal))}</div></div>
        <div style="font-size:13px;font-weight:600;margin-top:3px;line-height:1.3">${esc(n.razaoSocial || n.nomeFantasia || nfCNPJfmt(n.cnpj) || 'Fornecedor não informado')}</div>
        <div class="kpi-s nf-1linha">${nfDataBR(n.dataEntrada || n.dataEmissao)}${n.responsavel ? ' · ' + esc(n.responsavel) : ''} · ${(n.itens || []).length} produto(s)${n.municipio ? ' · ' + esc(n.municipio) + (n.uf ? '/' + esc(n.uf) : '') : ''}</div>
        <div class="kpi-s nf-1linha" title="${esc(o.nome)}">${esc(o.nome)}</div>
        ${div ? `<div class="nf-alerta nf-alerta-ylw" style="margin:8px 0 0;padding:7px 10px;font-size:11.5px">${esc(div)}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="nfEditar('${n.id}')">✎ Conferir</button>
          <button class="btn btn-sm btn-ghost" onclick="nfVerImagem('${n.id}')">🔍 Nota</button>
          ${n.drive && n.drive.link ? `<a class="btn btn-sm btn-ghost" href="${esc(n.drive.link)}" target="_blank" rel="noopener" title="Abrir no Google Drive">📁</a>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="nfExcluir('${n.id}')" title="Excluir">✕</button></div>
      </div></div>`;
  }).join('');

  const mais = fs.length > mostra.length
    ? `<div style="text-align:center;margin-top:18px"><button class="btn" onclick="nfMais()">Mostrar mais ${Math.min(NF_PAGINA, fs.length - mostra.length)} de ${fs.length - mostra.length}</button></div>` : '';
  return filtros + `<div class="grid nf-grid">${cards}</div>${mais}`;
}
function nfDivergencia(n) {
  const itens = (n.itens || []).reduce((a, it) => a + nfNum(it.vTotal), 0);
  if (nfNum(n.vTotal) && itens && Math.abs(nfNum(n.vTotal) - (itens + nfNum(n.vFrete))) > 0.05)
    return 'Itens + frete não fecham com o total da nota';
  if (n.cnpj && !nfCNPJvalido(n.cnpj)) return 'CNPJ do fornecedor não confere';
  if (n.chave && !nfChaveValida(n.chave)) return 'Chave de acesso inválida';
  if (!n.numero) return 'Nota sem número';
  return '';
}
function nfSetBusca(v) {
  estado.nfBusca = v; estado.nfLimite = NF_PAGINA;
  clearTimeout(nfSetBusca._t);
  nfSetBusca._t = setTimeout(() => {
    render();
    const c = el('nfBusca');
    if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
  }, 260);
}
function nfSetFiltro(k, v) { estado[k] = v; estado.nfLimite = NF_PAGINA; render(); }
function nfMais() { estado.nfLimite = (estado.nfLimite || NF_PAGINA) + NF_PAGINA; render(); }

function nfExportarCSV() {
  const o = obra();
  const fs = nfFiltrar(o);
  const cab = ['Numero', 'Serie', 'Chave', 'Emissao', 'Recebimento', 'CNPJ', 'Fornecedor', 'Municipio', 'UF', 'Produtos', 'Frete', 'Total', 'BaseICMS', 'ICMS', 'Status', 'Responsavel', 'Itens'];
  const esc2 = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const linhas = fs.map(n => [n.numero, n.serie, n.chave, n.dataEmissao, n.dataEntrada, nfCNPJfmt(n.cnpj), n.razaoSocial,
    n.municipio, n.uf, nfNum(n.vProd).toFixed(2), nfNum(n.vFrete).toFixed(2), nfNum(n.vTotal).toFixed(2),
    nfNum(n.vBaseICMS).toFixed(2), nfNum(n.vICMS).toFixed(2), n.status, n.responsavel,
    (n.itens || []).map(i => `${i.descricao} (${fmtQtd(i.qtd)} ${i.un})`).join(' | ')].map(esc2).join(';'));
  const csv = '﻿' + cab.map(esc2).join(';') + '\n' + linhas.join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'notas-fiscais-' + o.id + '-' + hoje() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- estoque ---------- */
function nfViewEstoque(o) {
  const saldos = nfSaldos(o.id);
  const movs = nfMovGet(o.id).slice().sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || '') || b.criadoEm - a.criadoEm);
  if (!saldos.length) return `<div class="empty"><div class="ic">📦</div>Nada no estoque ainda.<br>
    <span class="kpi-s">A entrada é gerada quando você salva uma nota com os produtos preenchidos.</span></div>`;
  const total = saldos.reduce((a, s) => a + s.valor, 0);
  const kpis = `<div class="grid g4" style="margin-bottom:18px">
    <div class="kpi"><div class="kpi-l">Materiais</div><div class="kpi-v">${saldos.length}</div><div class="kpi-s">itens distintos recebidos</div></div>
    <div class="kpi"><div class="kpi-l">Entradas</div><div class="kpi-v">${movs.length}</div><div class="kpi-s">movimentos registrados</div></div>
    <div class="kpi"><div class="kpi-l">Valor recebido</div><div class="kpi-v" style="font-size:24px">${fmtBRLc(total)}</div><div class="kpi-s">soma das entradas</div></div>
    <div class="kpi"><div class="kpi-l">Lotes</div><div class="kpi-v">${[...new Set(movs.map(m => m.lote))].length}</div><div class="kpi-s">notas que geraram entrada</div></div></div>`;
  const tab = `<div class="tbl-wrap" style="margin-bottom:20px"><table class="t">
    <thead><tr><th>Material</th><th class="num">Un</th><th class="num">Entradas</th><th class="num">Saldo</th><th class="num">Valor</th><th>Lotes</th><th class="num">Última</th></tr></thead>
    <tbody>${saldos.map(s => `<tr>
      <td style="font-weight:600">${esc(s.descricao)}</td>
      <td class="num">${esc(s.un)}</td>
      <td class="num">${fmtQtd(s.entradas)}</td>
      <td class="num" style="font-weight:700">${fmtQtd(s.saldo)}</td>
      <td class="num">${fmtBRL(s.valor)}</td>
      <td class="kpi-s">${esc(s.lotes.slice(0, 3).join(', '))}${s.lotes.length > 3 ? ' +' + (s.lotes.length - 3) : ''}</td>
      <td class="num kpi-s">${nfDataBR(s.ultima)}</td></tr>`).join('')}</tbody></table></div>`;
  const rastro = `<div class="card"><div class="card-h"><div><div class="card-t">Rastreabilidade das entradas</div>
    <div class="card-st">cada movimento aponta para a nota que o gerou</div></div></div>
    <div class="tbl-wrap" style="border:none"><table class="t">
    <thead><tr><th>Data</th><th>Material</th><th class="num">Qtd</th><th>Lote</th><th>Fornecedor</th><th>Nota</th></tr></thead>
    <tbody>${movs.slice(0, 60).map(m => `<tr>
      <td class="num kpi-s">${nfDataBR(m.dataISO)}</td>
      <td>${esc(m.descricao)}</td>
      <td class="num">${fmtQtd(m.qtd)} ${esc(m.un)}</td>
      <td class="mono" style="font-size:12px">${esc(m.lote)}</td>
      <td class="kpi-s">${esc(m.fornecedor || nfCNPJfmt(m.cnpj))}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="nfEditar('${m.notaId}')">abrir</button></td></tr>`).join('')}</tbody></table></div></div>`;
  return kpis + tab + rastro;
}

/* ---------- pedidos de compra ---------- */
function nfViewPedidos(o) {
  const peds = nfPedGet(o.id).slice().sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''));
  const topo = `<div class="row" style="align-items:center;margin-bottom:16px">
    <div class="kpi-s" style="flex:1;min-width:220px">Cadastre o pedido de compra e o sistema baixa os itens sozinho quando a nota daquele fornecedor chegar.</div>
    <button class="btn" onclick="nfPedidoModal()">+ Pedido de compra</button></div>`;
  if (!peds.length) return topo + `<div class="empty"><div class="ic">📋</div>Nenhum pedido de compra cadastrado.</div>`;
  const cards = peds.map(p => {
    const itens = p.itens || [];
    const at = itens.reduce((a, i) => a + nfNum(i.qtdAtendida), 0), tt = itens.reduce((a, i) => a + nfNum(i.qtd), 0);
    const pct = tt ? Math.min(100, at / tt * 100) : 0;
    return `<div class="card" style="margin-bottom:14px"><div class="card-h">
      <div><div class="card-t">Pedido ${esc(p.numero)}</div>
        <div class="card-st">${esc(p.fornecedor || nfCNPJfmt(p.cnpj) || '—')} · ${nfDataBR(p.dataISO)}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="pill ${p.status === 'Atendido' ? 'pill-grn' : p.status === 'Parcial' ? 'pill-ylw' : 'pill-blu'}">${esc(p.status || 'Em aberto')}</span>
        <button class="btn btn-sm btn-ghost" onclick="nfPedidoExcluir('${p.id}')" title="Excluir">✕</button></div></div>
      <div class="card-b" style="padding:14px 20px">
        <div class="bar" style="margin:0 0 12px"><i style="width:${pct.toFixed(1)}%"></i></div>
        <table class="t" style="font-size:12.5px"><thead><tr><th>Item</th><th class="num">Pedido</th><th class="num">Entregue</th><th class="num">Falta</th></tr></thead>
        <tbody>${itens.map(i => {
      const falta = nfNum(i.qtd) - nfNum(i.qtdAtendida);
      return `<tr><td>${esc(i.descricao)}</td><td class="num">${fmtQtd(i.qtd)} ${esc(i.un || '')}</td>
        <td class="num">${fmtQtd(i.qtdAtendida)}</td>
        <td class="num" style="color:${falta > 0.0001 ? 'var(--amarelo)' : 'var(--accent)'};font-weight:700">${falta > 0.0001 ? fmtQtd(falta) : '✓'}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  }).join('');
  return topo + cards;
}
function nfPedidoModal() {
  const o = obra();
  const forn = nfFornecedores(o.id);
  abrirModal('Novo pedido de compra', `
    <div class="row"><div class="field"><label class="fl">Número do pedido</label><input id="pd_numero" placeholder="ex.: PC-2026-014"></div>
      <div class="field"><label class="fl">Data</label><input type="date" id="pd_data" value="${hoje()}"></div></div>
    <div class="field"><label class="fl">Fornecedor</label><input id="pd_forn" list="pdFornLista" placeholder="Razão social">
      <datalist id="pdFornLista">${forn.map(f => `<option value="${esc(f.nome)}">`).join('')}</datalist></div>
    <div class="field"><label class="fl">CNPJ (opcional)</label><input id="pd_cnpj" class="mono" inputmode="numeric" placeholder="só números"></div>
    <div class="nf-sep" style="display:flex;justify-content:space-between;align-items:center"><span>Itens</span>
      <button class="btn btn-sm" onclick="nfPedAddItem()">+ Item</button></div>
    <div id="pdItens"></div>
    <div style="display:flex;gap:9px;margin-top:14px">
      <button class="btn" style="flex:1;justify-content:center" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-pri" style="flex:2;justify-content:center" onclick="nfPedidoSalvar()">Salvar pedido</button></div>`, 620);
  nfPedAddItem();
}
function nfPedAddItem() {
  const box = el('pdItens'); if (!box) return;
  const row = document.createElement('div');
  row.className = 'pd-row row';
  row.style.cssText = 'gap:6px;margin-bottom:6px;align-items:flex-end';
  row.innerHTML = `<div class="field" style="margin:0;flex:3;min-width:150px"><input class="pd-desc" placeholder="Descrição do material"></div>
    <div class="field" style="margin:0;max-width:88px"><input class="pd-qtd num" inputmode="decimal" placeholder="Qtd"></div>
    <div class="field" style="margin:0;max-width:80px"><input class="pd-un" placeholder="Un" style="text-transform:uppercase"></div>
    <button class="btn btn-sm btn-ghost" onclick="this.closest('.pd-row').remove()">✕</button>`;
  box.appendChild(row);
}
function nfPedidoSalvar() {
  const o = obra();
  const num = (el('pd_numero') || {}).value || '';
  if (!num.trim()) { toast('Informe o número do pedido'); return; }
  const itens = [...document.querySelectorAll('#pdItens .pd-row')].map(r => ({
    id: 'pi' + uid(),
    descricao: r.querySelector('.pd-desc').value.trim(),
    qtd: nfNum(r.querySelector('.pd-qtd').value),
    un: (r.querySelector('.pd-un').value || 'UN').toUpperCase(),
    qtdAtendida: 0, entregas: []
  })).filter(i => i.descricao && i.qtd);
  if (!itens.length) { toast('Adicione ao menos um item'); return; }
  const p = {
    id: 'pd' + uid(), obraId: o.id, numero: num.trim(),
    dataISO: (el('pd_data') || {}).value || hoje(),
    fornecedor: (el('pd_forn') || {}).value || '',
    cnpj: nfDigitos((el('pd_cnpj') || {}).value || ''),
    itens: itens, status: 'Em aberto',
    usuario: usuarioAtual(), criadoEm: Date.now()
  };
  const arr = nfPedGet(o.id); arr.unshift(p); nfPedSet(o.id, arr);
  if (BACKEND && !isDemo()) {
    outboxAdd({ id: 'ob' + uid(), obra: o.id, tipo: 'pedido', params: { action: 'pedidoSalvar', obra: o.id, id: p.id, numero: p.numero, data: p.dataISO, fornecedor: p.fornecedor, cnpj: p.cnpj, itens: JSON.stringify(p.itens), status: p.status, usuario: p.usuario } });
    outboxFlush();
  }
  fecharModal(); toast('Pedido cadastrado'); render();
}
function nfPedidoExcluir(id) {
  const o = obra();
  if (!confirm('Excluir este pedido de compra?')) return;
  nfPedSet(o.id, nfPedGet(o.id).filter(p => p.id !== id));
  if (BACKEND && !isDemo()) { outboxAdd({ id: 'ob' + uid(), obra: o.id, tipo: 'pedidoDel', params: { action: 'pedidoExcluir', obra: o.id, id: id } }); outboxFlush(); }
  toast('Pedido excluído'); render();
}

/* ---------- painel ---------- */
function nfViewPainel(o) {
  const notas = nfGet(o.id).filter(n => n.status !== 'Cancelada');
  if (!notas.length) return `<div class="empty"><div class="ic">📊</div>Sem notas para consolidar ainda.</div>`;
  const total = notas.reduce((a, n) => a + nfNum(n.vTotal), 0);
  const frete = notas.reduce((a, n) => a + nfNum(n.vFrete), 0);
  const pend = notas.filter(n => n.status === 'Recebida' || n.status === 'Em análise').length;
  const diverg = notas.filter(n => n.status === 'Divergência encontrada' || nfDivergencia(n)).length;
  const mat = nfMateriais(o.id);
  const forn = nfFornecedores(o.id);

  // notas por obra (todas as obras geridas)
  const porObra = ORDEM.map(id => OBRAS[id]).filter(x => x && !x.externo)
    .map(x => ({ nome: x.nome, n: nfGet(x.id).filter(n => n.status !== 'Cancelada').length, v: nfGet(x.id).filter(n => n.status !== 'Cancelada').reduce((a, n) => a + nfNum(n.vTotal), 0) }))
    .filter(x => x.n).sort((a, b) => b.v - a.v);

  // evolução mensal
  const porMes = {};
  notas.forEach(n => {
    const m = (n.dataEntrada || n.dataEmissao || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    const x = porMes[m] || (porMes[m] = { mes: m, n: 0, v: 0 });
    x.n++; x.v += nfNum(n.vTotal);
  });
  const meses = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);

  const kpis = `<div class="grid g4" style="margin-bottom:18px">
    <div class="kpi kpi-hero"><div class="kpi-l">Valor recebido</div><div class="kpi-v">${fmtBRLc(total)}</div><div class="kpi-s">${notas.length} nota(s) · frete ${fmtBRLc(frete)}</div></div>
    <div class="kpi"><div class="kpi-l">Notas</div><div class="kpi-v">${notas.length}</div><div class="kpi-s">${pend} aguardando conferência</div></div>
    <div class="kpi"><div class="kpi-l">Fornecedores</div><div class="kpi-v">${forn.length}</div><div class="kpi-s">${mat.length} materiais distintos</div></div>
    <div class="kpi"><div class="kpi-l">Divergências</div><div class="kpi-v" style="color:${diverg ? 'var(--vermelho)' : 'var(--accent)'}">${diverg}</div><div class="kpi-s">${diverg ? 'notas para revisar' : 'nenhuma pendência'}</div></div></div>`;

  const evolucao = meses.length ? `<div class="card" style="margin-bottom:18px"><div class="card-h">
      <div><div class="card-t">Evolução mensal dos recebimentos</div><div class="card-st">valor das notas por mês de recebimento</div></div></div>
    <div class="card-b">${nfBarrasSVG(meses)}</div></div>` : '';

  const listaTop = (titulo, sub, linhas) => `<div class="card"><div class="card-h"><div><div class="card-t">${titulo}</div><div class="card-st">${sub}</div></div></div>
    <div class="card-b" style="padding:8px 20px 16px">${linhas || '<div class="kpi-s" style="padding:10px 0">Sem dados.</div>'}</div></div>`;
  const barra = (nome, det, v, max) => `<div style="padding:9px 0;border-bottom:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;gap:10px;font-size:13.5px"><span style="font-weight:600;flex:1;min-width:0">${esc(nome)}</span>
      <span class="mono" style="font-weight:700;white-space:nowrap">${fmtBRL(v)}</span></div>
    <div class="kpi-s">${esc(det)}</div>
    <div class="bar" style="margin-top:6px"><i style="width:${max ? (v / max * 100).toFixed(1) : 0}%"></i></div></div>`;

  const maxF = Math.max(1, ...forn.map(f => f.valor));
  const maxM = Math.max(1, ...mat.map(m => m.valor));
  const maxO = Math.max(1, ...porObra.map(x => x.v));

  return kpis + evolucao + `<div class="grid g2" style="align-items:start;margin-bottom:18px">
    ${listaTop('Principais fornecedores', forn.length + ' no total', forn.slice(0, 6).map(f => barra(f.nome, f.notas + ' nota(s) · ' + (f.municipio ? f.municipio + '/' + f.uf : nfCNPJfmt(f.cnpj)), f.valor, maxF)).join(''))}
    ${listaTop('Materiais mais recebidos', mat.length + ' materiais', mat.slice(0, 6).map(m => barra(m.descricao, fmtQtd(m.qtd) + ' ' + m.un + ' · ' + m.notas + ' nota(s)', m.valor, maxM)).join(''))}
  </div>
  <div class="grid g2" style="align-items:start">
    ${listaTop('Notas por obra', 'todas as obras geridas no app', porObra.map(x => barra(x.nome, x.n + ' nota(s)', x.v, maxO)).join(''))}
    ${listaTop('Situação das notas', 'fluxo de conferência', NF_STATUS.map(s => {
      const q = nfGet(o.id).filter(n => n.status === s).length;
      if (!q) return '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
        <span class="pill ${NF_STATUS_COR[s]}">${s}</span><span class="mono" style="font-weight:700">${q}</span></div>`;
    }).join(''))}
  </div>`;
}
function nfBarrasSVG(meses) {
  const W = 620, H = 190, pad = 34, pw = W - pad * 2, ph = H - pad * 2;
  const max = Math.max(1, ...meses.map(m => m.v));
  const n = meses.length;
  const lw = Math.min(46, pw / Math.max(n, 1) * 0.62);
  const barras = meses.map((m, i) => {
    const x = pad + (pw / n) * (i + 0.5) - lw / 2;
    const h = Math.max(2, (m.v / max) * ph);
    const y = pad + ph - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${lw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="var(--accent)" opacity=".85"><title>${esc(mesLabel(m.mes + '-01'))}: ${fmtBRL(m.v)} em ${m.n} nota(s)</title></rect>
      <text x="${(x + lw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono,monospace" fill="var(--text-2)">${fmtBRLc(m.v).replace('R$ ', '')}</text>
      <text x="${(x + lw / 2).toFixed(1)}" y="${H - pad + 15}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(mesLabel(m.mes + '-01'))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Evolução mensal dos recebimentos">
    <line x1="${pad}" y1="${pad + ph}" x2="${W - pad}" y2="${pad + ph}" stroke="var(--border)"/>${barras}</svg>`;
}

/* ---------- carga do servidor ---------- */
let _nfCarregando = false;
async function nfCarregar(obraId) {
  if (!BACKEND || isDemo() || _nfCarregando || !getToken()) return;
  _nfCarregando = true;
  try {
    const r = await postAcao({ action: 'nfListar', obra: obraId });
    if (r && r.ok && Array.isArray(r.notas)) {
      const locais = nfGet(obraId);
      const pend = new Set(outboxLer().filter(it => it.tipo === 'nf').map(it => it.clientId));
      const naoConf = locais.filter(l => pend.has(l.clientId || l.id));
      const mapa = {};
      r.notas.forEach(s => { mapa[s.clientId || s.id] = nfDoServidor(s, obraId, locais); });
      naoConf.forEach(l => { mapa[l.clientId || l.id] = l; });
      nfSet(obraId, Object.values(mapa).sort((a, b) => (b.dataEntrada || '').localeCompare(a.dataEntrada || '')));
    }
    if (r && r.ok && Array.isArray(r.pedidos)) nfPedSet(obraId, r.pedidos.map(nfPedidoDoServidor));
    if (estado.tela === 'notas' && estado.obraId === obraId) render();
  } catch (e) { /* offline: fica com o que ja esta no aparelho */ }
  finally { _nfCarregando = false; }
}
function nfDoServidor(s, obraId, locais) {
  const local = locais.find(l => (l.clientId || l.id) === (s.clientId || s.id));
  let itens = []; try { itens = JSON.parse(s.itens || '[]'); } catch (e) { itens = []; }
  let hist = []; try { hist = JSON.parse(s.historico || '[]'); } catch (e) { hist = []; }
  let leitura = {}; try { leitura = JSON.parse(s.leitura || '{}'); } catch (e) { leitura = {}; }
  return {
    id: s.id, clientId: s.clientId || s.id, obraId: obraId,
    numero: String(s.numero || ''), serie: String(s.serie || ''), chave: nfDigitos(s.chave),
    dataEmissao: nfISO(s.dataEmissao), dataEntrada: nfISO(s.dataEntrada),
    cnpj: nfDigitos(s.cnpj), razaoSocial: s.razaoSocial || '', nomeFantasia: s.nomeFantasia || '',
    municipio: s.municipio || '', uf: s.uf || '',
    vProd: nfNum(s.vProd), vFrete: nfNum(s.vFrete), vTotal: nfNum(s.vTotal),
    vBaseICMS: nfNum(s.vBaseICMS), vICMS: nfNum(s.vICMS),
    itens: itens, obs: s.obs || '', responsavel: s.responsavel || '',
    status: NF_STATUS.indexOf(s.status) > -1 ? s.status : 'Recebida',
    drive: s.driveId ? { fileId: s.driveId, link: s.driveLink || '' } : null,
    thumb: (local && local.thumb) || '',
    leitura: leitura, leituraConf: (local && local.leituraConf) || {},
    historico: hist, usuario: s.usuario || '',
    criadoEm: nfNum(s.criadoEm) || Date.now(), atualizadoEm: Date.now()
  };
}
function nfPedidoDoServidor(p) {
  let itens = []; try { itens = JSON.parse(p.itens || '[]'); } catch (e) { itens = []; }
  return { id: p.id, obraId: p.obra, numero: p.numero, dataISO: nfISO(p.data), fornecedor: p.fornecedor || '', cnpj: nfDigitos(p.cnpj), itens: itens, status: p.status || 'Em aberto', usuario: p.usuario || '', criadoEm: nfNum(p.criadoEm) || Date.now() };
}

/* quantas notas a obra tem — usado no badge da navegação */
function nfTotal(obraId) { return nfGet(obraId).length; }

/* ============================================================
   MODO DEMONSTRACAO — notas ficticias, so neste navegador
   Nada aqui vai para o servidor (o app inteiro checa isDemo()).
   ============================================================ */
function _nfDemoCNPJ(base12) {
  const calc = (b, pesos) => { let s = 0; for (let i = 0; i < pesos.length; i++) s += (+b[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}
function _nfDemoChave(cUF, aamm, cnpj, serie, numero) {
  const b = String(cUF) + aamm + cnpj + '55' +
    ('000' + serie).slice(-3) + ('00000000' + numero).slice(-9) + '1' + ('0000000' + (numero * 7 % 99999999)).slice(-8);
  return b + nfDVchave(b);
}
/* miniatura de uma DANFE desenhada no proprio navegador (nenhum arquivo externo) */
function _nfDemoImagem(numero, fornecedor, valor) {
  const c = document.createElement('canvas'); c.width = 330; c.height = 430;
  const x = c.getContext('2d');
  x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, 330, 430);
  x.fillStyle = '#fff'; x.fillRect(12, 12, 306, 406);
  x.strokeStyle = '#111'; x.lineWidth = 1.4; x.strokeRect(20, 20, 290, 390);
  x.fillStyle = '#111';
  x.font = 'bold 15px sans-serif'; x.fillText('DANFE', 30, 44);
  x.font = '7.5px sans-serif';
  x.fillText('Documento Auxiliar da', 30, 56); x.fillText('Nota Fiscal Eletrônica', 30, 65);
  x.font = 'bold 9px monospace';
  x.fillText('Nº ' + numero, 232, 44); x.fillText('SÉRIE 1', 232, 56);
  // codigo de barras decorativo
  let px = 30;
  for (let i = 0; i < 88; i++) { const w = 1 + (i * 7 % 3); x.fillStyle = i % 2 ? '#fff' : '#111'; x.fillRect(px, 76, w, 26); px += w; if (px > 296) break; }
  x.fillStyle = '#111'; x.font = '6px monospace';
  x.fillText('CHAVE DE ACESSO', 30, 112);
  x.strokeStyle = '#111'; x.beginPath(); x.moveTo(20, 120); x.lineTo(310, 120); x.stroke();
  x.font = 'bold 9px sans-serif';
  x.fillText(String(fornecedor).slice(0, 34), 30, 136);
  x.font = '7.5px sans-serif'; x.fillStyle = '#444';
  x.fillText('EMITENTE · SÃO PAULO / SP', 30, 147);
  x.strokeStyle = '#999'; x.beginPath(); x.moveTo(20, 156); x.lineTo(310, 156); x.stroke();
  x.fillStyle = '#111'; x.font = 'bold 7px sans-serif';
  x.fillText('DADOS DOS PRODUTOS / SERVIÇOS', 30, 170);
  x.fillStyle = '#666'; x.font = '7px sans-serif';
  for (let i = 0; i < 12; i++) {
    const y = 184 + i * 15;
    x.fillStyle = i % 2 ? '#fafafa' : '#fff'; x.fillRect(24, y - 9, 282, 14);
    x.fillStyle = '#555';
    x.fillRect(30, y - 3, 120 + (i * 23 % 70), 2.2);
    x.fillRect(210, y - 3, 26, 2.2);
    x.fillRect(258, y - 3, 42, 2.2);
  }
  x.strokeStyle = '#111'; x.strokeRect(24, 372, 282, 30);
  x.fillStyle = '#111'; x.font = 'bold 8px sans-serif'; x.fillText('VALOR TOTAL DA NOTA', 32, 385);
  x.font = 'bold 13px monospace'; x.fillText('R$ ' + valor.toFixed(2).replace('.', ','), 32, 399);
  return c.toDataURL('image/jpeg', 0.72);
}
function _nfDemoSeed(o) {
  let seed = 20260728; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const isoAdd = (b, d) => { const x = new Date(b + 'T00:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  const forn = [
    { cnpj: _nfDemoCNPJ('613044550001'), nome: 'CONCRETEIRA PAULISTA LTDA', fant: 'Concreteira Paulista', mun: 'São Paulo', uf: 'SP' },
    { cnpj: _nfDemoCNPJ('204119870001'), nome: 'TUBOS E ARTEFATOS SÃO JORGE LTDA', fant: 'Tubos São Jorge', mun: 'Guarulhos', uf: 'SP' },
    { cnpj: _nfDemoCNPJ('331508220001'), nome: 'PEDREIRA VALE DO TIETÊ S/A', fant: 'Pedreira Vale', mun: 'Santana de Parnaíba', uf: 'SP' },
    { cnpj: _nfDemoCNPJ('478290110001'), nome: 'AÇO FORTE COMÉRCIO DE FERRO LTDA', fant: 'Aço Forte', mun: 'Osasco', uf: 'SP' }
  ];
  const catalogo = [
    [0, 'CONCRETO USINADO FCK 25 MPA', 'M3', 480], [0, 'CONCRETO USINADO FCK 30 MPA', 'M3', 512],
    [1, 'TUBO DE CONCRETO PA-1 DN 400MM', 'M', 96], [1, 'TUBO DE CONCRETO PA-1 DN 600MM', 'M', 168],
    [1, 'ARO E TAMPA DE FERRO FUNDIDO D400', 'UN', 640],
    [2, 'BRITA 1 GRADUADA', 'M3', 118], [2, 'PEDRISCO', 'M3', 104], [2, 'AREIA MEDIA LAVADA', 'M3', 92],
    [3, 'VERGALHAO CA-50 10,0MM', 'KG', 8.4], [3, 'VERGALHAO CA-60 5,0MM', 'KG', 9.1],
    [3, 'TELA SOLDADA Q-196', 'M2', 27.5]
  ];
  // datas contadas de hoje para tras: numa apresentacao, nota com data
  // no futuro entrega na hora que os dados sao ficticios
  const base = hoje();
  const notas = [];
  const status = ['Integrada ao estoque', 'Conferida', 'Integrada ao estoque', 'Em análise', 'Recebida', 'Divergência encontrada', 'Integrada ao estoque', 'Conferida', 'Integrada ao pedido de compra'];
  for (let i = 0; i < 9; i++) {
    const f = forn[i % forn.length];
    const dia = isoAdd(base, -(6 + i * 11 + Math.floor(rnd() * 6)));
    const numero = 18420 + i * 37;
    const meus = catalogo.filter(c => c[0] === (i % forn.length));
    const qtos = 1 + Math.floor(rnd() * Math.min(3, meus.length));
    const itens = [];
    for (let k = 0; k < qtos; k++) {
      const c = meus[(k + i) % meus.length];
      const q = +(c[2] === 'KG' ? 300 + rnd() * 900 : 8 + rnd() * 40).toFixed(2);
      const vu = +(c[3] * (0.94 + rnd() * 0.12)).toFixed(2);
      itens.push({ codigo: 'P' + (100 + k + i * 3), descricao: c[1], qtd: q, un: c[2], vUnit: vu, vTotal: +(q * vu).toFixed(2), materialId: '', pedidoItemId: '' });
    }
    const vProd = +itens.reduce((a, it) => a + it.vTotal, 0).toFixed(2);
    const vFrete = +(vProd * 0.025).toFixed(2);
    const st = status[i];
    // uma nota fica de proposito com o total fora, para o alerta de divergencia aparecer
    const vTotal = st === 'Divergência encontrada' ? +(vProd + vFrete - 412.9).toFixed(2) : +(vProd + vFrete).toFixed(2);
    const chave = _nfDemoChave(35, dia.slice(2, 4) + dia.slice(5, 7), f.cnpj, 1, numero);
    notas.push({
      id: 'nfd' + i + '_' + o.id, clientId: 'nfd' + i + '_' + o.id, obraId: o.id,
      numero: String(numero), serie: '1', chave: chave,
      dataEmissao: dia, dataEntrada: isoAdd(dia, rnd() > 0.6 ? 1 : 0),
      cnpj: f.cnpj, razaoSocial: f.nome, nomeFantasia: f.fant, municipio: f.mun, uf: f.uf,
      vProd: vProd, vFrete: vFrete, vTotal: vTotal,
      vBaseICMS: vProd, vICMS: +(vProd * 0.18).toFixed(2),
      itens: itens, obs: st === 'Divergência encontrada' ? 'Faltou 1 peça na descarga — aguardando carta de correção.' : '',
      responsavel: ['Wallace', 'Guilherme', 'Leonardo'][i % 3], status: st,
      drive: null, thumb: _nfDemoImagem(numero, f.fant, vTotal),
      leitura: { metodo: i % 3 === 2 ? 'codigo+ia' : (i % 3 === 1 ? 'codigo' : 'ia'), quando: Date.now() - i * 86400000, confiancaGeral: i % 3 === 0 ? 0.82 : 1 },
      leituraConf: {},
      historico: [{ quando: Date.now() - i * 86400000, usuario: ['Wallace', 'Guilherme', 'Leonardo'][i % 3], acao: 'cadastrada', detalhe: 'nº ' + numero }],
      usuario: ['Wallace', 'Guilherme', 'Leonardo'][i % 3], criadoEm: Date.now() - i * 86400000, atualizadoEm: Date.now() - i * 86400000
    });
  }
  // pedidos de compra: um atendido em parte pelas notas acima
  const pedidos = [
    {
      id: 'pdd1_' + o.id, obraId: o.id, numero: 'PC-2026-011', dataISO: isoAdd(base, -70),
      fornecedor: forn[1].nome, cnpj: forn[1].cnpj, status: 'Parcial', usuario: 'Leonardo', criadoEm: Date.now(),
      itens: [
        { id: 'pid1_' + o.id, descricao: 'TUBO DE CONCRETO PA-1 DN 400MM', qtd: 120, un: 'M', qtdAtendida: 0, entregas: [] },
        { id: 'pid2_' + o.id, descricao: 'ARO E TAMPA DE FERRO FUNDIDO D400', qtd: 18, un: 'UN', qtdAtendida: 0, entregas: [] }
      ]
    },
    {
      id: 'pdd2_' + o.id, obraId: o.id, numero: 'PC-2026-019', dataISO: isoAdd(base, -20),
      fornecedor: forn[3].nome, cnpj: forn[3].cnpj, status: 'Em aberto', usuario: 'Leonardo', criadoEm: Date.now(),
      itens: [{ id: 'pid3_' + o.id, descricao: 'VERGALHAO CA-50 10,0MM', qtd: 2500, un: 'KG', qtdAtendida: 0, entregas: [] }]
    }
  ];
  return { notas: notas, pedidos: pedidos };
}
/* grava a demo das notas e ja gera estoque e baixa de pedido, para as
   abas Estoque, Pedidos e Painel abrirem com conteudo na apresentacao */
function nfDemoCarregar(o) {
  const d = _nfDemoSeed(o);
  nfSet(o.id, d.notas);
  nfPedSet(o.id, d.pedidos);
  nfMovSet(o.id, []);
  d.notas.forEach(n => {
    nfAutoVincular(o.id, n);
    if (n.status !== 'Cancelada' && n.status !== 'Recebida') nfIntegrarEstoque(o.id, n);
    nfBaixarPedidos(o.id, n);
  });
  nfSet(o.id, d.notas);
}
function nfDemoLimpar(o) {
  localStorage.removeItem(nfKey(o.id));
  localStorage.removeItem('gestor:nfmov:' + o.id);
  localStorage.removeItem('gestor:pedidos:' + o.id);
}
