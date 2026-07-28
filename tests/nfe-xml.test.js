// Testa o parser do XML da NF-e do Code.gs, simulando XmlService do Apps Script.
const assert = require('assert'), fs = require('fs'), vm = require('vm');

// XmlService mínimo em cima de um parser XML escrito à mão (sem dependência externa)
function parseXML(txt) {
  let i = 0;
  function no(nome, attrs) { return { nome, attrs, filhos: [], texto: '' }; }
  function parseEl() {
    while (txt[i] !== '<') i++;
    if (txt.startsWith('<?', i) || txt.startsWith('<!', i)) { i = txt.indexOf('>', i) + 1; return parseEl(); }
    i++;
    let fim = i; while (!/[\s/>]/.test(txt[fim])) fim++;
    const nomeCompleto = txt.slice(i, fim);
    const nome = nomeCompleto.includes(':') ? nomeCompleto.split(':')[1] : nomeCompleto;
    i = fim;
    const attrs = {};
    while (txt[i] !== '>' && txt[i] !== '/') {
      if (/\s/.test(txt[i])) { i++; continue; }
      let ki = i; while (txt[i] !== '=' && txt[i] !== '>' && txt[i] !== '/') i++;
      if (txt[i] !== '=') break;
      const k = txt.slice(ki, i).trim(); i++;
      const q = txt[i]; i++;
      let vi = i; while (txt[i] !== q) i++;
      attrs[k] = txt.slice(vi, i); i++;
    }
    const el = no(nome, attrs);
    if (txt[i] === '/') { i += 2; return el; }
    i++;
    while (true) {
      const prox = txt.indexOf('<', i);
      const entre = txt.slice(i, prox);
      if (entre.trim()) el.texto += entre.trim();
      i = prox;
      if (txt.startsWith('</', i)) { i = txt.indexOf('>', i) + 1; return el; }
      el.filhos.push(parseEl());
    }
  }
  return parseEl();
}
function envolver(n) {
  return {
    getName: () => n.nome,
    getText: () => n.texto,
    getChildren: () => n.filhos.map(envolver),
    getAttribute: k => (n.attrs[k] != null ? { getValue: () => n.attrs[k] } : null)
  };
}
const ctx = {
  console, Logger: { log: () => {} },
  XmlService: { parse: t => ({ getRootElement: () => envolver(parseXML(t)) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', getKeys: () => [] }) },
  // o consultadanfe devolve o XML autorizado em base64 (xml_base64)
  Utilities: {
    base64Decode: v => Array.from(Buffer.from(String(v), 'base64')),
    newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') })
  },
  UrlFetchApp: {}, SpreadsheetApp: {}, DriveApp: {}, CacheService: {}, Session: {}, ScriptApp: {}
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
 <NFe><infNFe Id="NFe35260761304455000195550010000184201001289406" versao="4.00">
  <ide><cUF>35</cUF><nNF>18420</nNF><serie>1</serie><dhEmi>2026-07-15T10:32:00-03:00</dhEmi><dhSaiEnt>2026-07-16T08:00:00-03:00</dhSaiEnt></ide>
  <emit><CNPJ>61304455000195</CNPJ><xNome>CONCRETEIRA PAULISTA LTDA</xNome><xFant>Concreteira Paulista</xFant>
   <enderEmit><xLgr>Rua A</xLgr><xMun>Sao Paulo</xMun><UF>SP</UF></enderEmit></emit>
  <dest><CNPJ>11222333000181</CNPJ><xNome>GESTOR ENGENHARIA LTDA</xNome></dest>
  <det nItem="1"><prod><cProd>P101</cProd><xProd>CONCRETO USINADO FCK 25 MPA</xProd><uCom>M3</uCom><qCom>30.0000</qCom><vUnCom>480.0000</vUnCom><vProd>14400.00</vProd></prod></det>
  <det nItem="2"><prod><cProd>P102</cProd><xProd>BRITA 1 GRADUADA</xProd><uCom>M3</uCom><qCom>12.5000</qCom><vUnCom>118.0000</vUnCom><vProd>1475.00</vProd></prod></det>
  <total><ICMSTot><vBC>15875.00</vBC><vICMS>2857.50</vICMS><vProd>15875.00</vProd><vFrete>396.88</vFrete><vNF>16271.88</vNF></ICMSTot></total>
 </infNFe></NFe>
</nfeProc>`;

console.log('🧪 Parser do XML oficial da NF-e…');
const d = ctx.nfeDoXML(xml);
assert.strictEqual(d.numero, '18420', 'número da nota');
assert.strictEqual(d.serie, '1', 'série');
assert.strictEqual(d.chave, '35260761304455000195550010000184201001289406', 'chave sem o prefixo NFe');
assert.strictEqual(d.dataEmissao, '2026-07-15', 'data de emissão');
assert.strictEqual(d.dataEntrada, '2026-07-16', 'data de saída/entrada');
assert.strictEqual(d.cnpj, '61304455000195', 'CNPJ do EMITENTE, não do destinatário');
assert.strictEqual(d.razaoSocial, 'CONCRETEIRA PAULISTA LTDA', 'razão social do emitente');
assert.strictEqual(d.municipio, 'Sao Paulo', 'município');
assert.strictEqual(d.uf, 'SP', 'UF');
assert.strictEqual(d.vProd, 15875, 'valor dos produtos');
assert.strictEqual(d.vFrete, 396.88, 'frete');
assert.strictEqual(d.vTotal, 16271.88, 'valor total da nota');
assert.strictEqual(d.vICMS, 2857.5, 'ICMS');
assert.strictEqual(d.itens.length, 2, 'dois itens');
assert.strictEqual(d.itens[0].descricao, 'CONCRETO USINADO FCK 25 MPA', 'descrição do item');
assert.strictEqual(d.itens[0].qtd, 30, 'quantidade');
assert.strictEqual(d.itens[1].vTotal, 1475, 'valor do segundo item');
console.log('  ✓ todos os campos saem certos do XML');

// XML embrulhado num JSON, como alguns serviços devolvem
const dentroJSON = JSON.stringify({ status: 'ok', dados: { arquivo: { conteudo: xml } } });
assert.ok(ctx.nfeAcharXML(dentroJSON).includes('<infNFe'), 'acha o XML dentro do JSON');
assert.strictEqual(ctx.nfeAcharXML('{"erro":"nao encontrado"}'), '', 'JSON sem XML devolve vazio');
assert.ok(ctx.nfeAcharXML(xml).includes('<infNFe'), 'XML puro passa direto');
console.log('  ✓ acha o XML tanto puro quanto embrulhado em JSON');

// resposta real do consultadanfe: XML autorizado em base64 + DANFE em PDF
const respostaAPI = JSON.stringify({
  status: 'ok',
  chave: '35260761304455000195550010000184201001289406',
  tipo: 'nfe',
  pdf_base64: Buffer.from('%PDF-1.4 fingindo ser um DANFE'.repeat(8)).toString('base64'),
  xml_base64: Buffer.from(xml, 'utf8').toString('base64')
});
const xmlDaAPI = ctx.nfeAcharXML(respostaAPI);
assert.ok(xmlDaAPI.includes('<infNFe'), 'decodifica o xml_base64 da resposta');
const dAPI = ctx.nfeDoXML(xmlDaAPI);
assert.strictEqual(dAPI.numero, '18420', 'lê a nota vinda em base64');
assert.strictEqual(dAPI.itens.length, 2, 'itens vêm completos da resposta da API');
assert.ok(ctx.nfeAcharPDF(respostaAPI).length > 100, 'separa o PDF oficial do DANFE');
assert.strictEqual(ctx.nfeAcharPDF('{"status":"ok"}'), '', 'sem PDF na resposta devolve vazio');
console.log('  ✓ resposta do consultadanfe: XML em base64 + PDF oficial');
console.log('\n✅ Parser da NF-e: tudo certo.');
