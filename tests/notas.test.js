// TESTES DO MÓDULO DE NOTAS FISCAIS (DANFE)
// Roda em Node puro: carrega js/nf/notas.js num contexto com o mínimo de
// navegador que ele precisa e exercita a parte de cálculo/leitura.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'js', 'nf', 'notas.js'), 'utf8');

// ------- ambiente mínimo (o módulo só usa isso dentro de funções de UI) -------
const guardado = {};
const ctx = {
  window: {},
  console,
  localStorage: {
    getItem: k => (k in guardado ? guardado[k] : null),
    setItem: (k, v) => { guardado[k] = String(v); },
    removeItem: k => { delete guardado[k]; }
  },
  document: { createElement: () => ({ getContext: () => ({}), toDataURL: () => '' }) },
  // do index.html
  uid: () => Math.random().toString(36).slice(2, 9),
  hoje: () => '2026-07-28',
  usuarioAtual: () => 'Teste',
  isDemo: () => false,
  BACKEND: false,
  OBRAS: {}, ORDEM: [],
  estado: {}
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fonte, ctx, { filename: 'notas.js' });

console.log('🧪 Testes do módulo de Notas Fiscais…');

// ------------------------------------------------------------------
// 1. Chave de acesso da NF-e: dígito verificador e decomposição
// ------------------------------------------------------------------
// Chave montada com os campos conhecidos: SP(35), 07/2026, CNPJ, mod 55,
// série 1, nº 18420. O DV é calculado pela própria regra do módulo 11.
const base43 = '35' + '2607' + '61304455000195' + '55' + '001' + '000018420' + '1' + '00012345';
assert.strictEqual(base43.length, 43, 'a base da chave tem 43 dígitos');
const chave = base43 + ctx.nfDVchave(base43);

assert.strictEqual(chave.length, 44, 'a chave completa tem 44 dígitos');
assert.ok(ctx.nfChaveValida(chave), 'chave montada deve ser válida');
assert.ok(!ctx.nfChaveValida(chave.slice(0, 43) + ((+chave[43] + 1) % 10)), 'DV trocado deve invalidar');
assert.ok(!ctx.nfChaveValida('123'), 'chave curta é inválida');

const d = ctx.nfDaChave(chave);
assert.strictEqual(d.uf, 'SP', 'UF vem do código 35');
assert.strictEqual(d.cnpj, '61304455000195', 'CNPJ do emitente sai da chave');
assert.strictEqual(d.serie, '1', 'série sem zeros à esquerda');
assert.strictEqual(d.numero, '18420', 'número da nota sem zeros à esquerda');
assert.strictEqual(d.competencia, '2026-07', 'competência AAAA-MM');
assert.ok(d.valida, 'decomposição confirma o DV');
console.log('  ✓ chave de acesso: DV, UF, CNPJ, série, número e competência');

// ------------------------------------------------------------------
// 2. Achar a chave no meio de texto (QR da DANFE / OCR com espaços)
// ------------------------------------------------------------------
const qr = 'https://www.nfce.fazenda.sp.gov.br/qrcode?p=' + chave + '|2|1|1|A1B2C3';
assert.strictEqual(ctx.nfChaveDeTexto(qr), chave, 'extrai a chave da URL do QR Code');

const espacado = chave.replace(/(\d{4})(?=\d)/g, '$1 ');
assert.strictEqual(ctx.nfChaveDeTexto('CHAVE DE ACESSO ' + espacado), chave, 'extrai a chave impressa de 4 em 4');
assert.strictEqual(ctx.nfChaveDeTexto('nota 12345'), '', 'texto sem chave devolve vazio');

// texto longo, como o de um PDF de DANFE de verdade: a chave não pode se
// perder por causa de onde o texto foi cortado
const enchimento = 'DADOS DO PRODUTO SERVICO CODIGO DESCRICAO NCM CFOP UNID QUANT VALOR UNITARIO ';
const textoLongo = enchimento.repeat(6) + 'CHAVE DE ACESSO ' + espacado + ' ' + enchimento.repeat(6);
assert.ok(textoLongo.length > 900, 'o texto de teste é mesmo longo');
assert.strictEqual(ctx.nfChaveDeTexto(textoLongo), chave, 'acha a chave em texto longo de PDF');

// e no meio de outros números soltos, que é o caso da DANFE
const comNumeros = 'NF-e No 018.420 SERIE 001 EMISSAO 15/07/2026 CNPJ 61.304.455/0001-95 ' +
  'CHAVE DE ACESSO ' + espacado + ' PROTOCOLO 135260012345678 12/07/2026 09:15:22';
assert.strictEqual(ctx.nfChaveDeTexto(comNumeros), chave, 'acha a chave cercada de outros números');
console.log('  ✓ leitura da chave em QR Code, OCR e texto longo de PDF');

// ------------------------------------------------------------------
// 3. CNPJ
// ------------------------------------------------------------------
assert.ok(ctx.nfCNPJvalido('61.304.455/0001-95'), 'CNPJ formatado válido');
assert.ok(!ctx.nfCNPJvalido('61304455000196'), 'DV errado reprova');
assert.ok(!ctx.nfCNPJvalido('11111111111111'), 'dígitos repetidos reprovam');
assert.strictEqual(ctx.nfCNPJfmt('61304455000195'), '61.304.455/0001-95', 'formatação do CNPJ');
console.log('  ✓ validação e formatação de CNPJ');

// ------------------------------------------------------------------
// 4. Números e datas no padrão brasileiro
// ------------------------------------------------------------------
assert.strictEqual(ctx.nfNum('R$ 1.234,56'), 1234.56, 'moeda BR com milhar');
assert.strictEqual(ctx.nfNum('1234.56'), 1234.56, 'ponto decimal simples');
assert.strictEqual(ctx.nfNum('12.500'), 12500, 'ponto como separador de milhar');
assert.strictEqual(ctx.nfNum('1.234.567,89'), 1234567.89, 'milhar e decimal juntos');
assert.strictEqual(ctx.nfNum(''), 0, 'vazio vira zero');
assert.strictEqual(ctx.nfISO('28/07/2026'), '2026-07-28', 'data BR para ISO');
assert.strictEqual(ctx.nfISO('2026-07-28'), '2026-07-28', 'data já em ISO');
console.log('  ✓ conversão de valores e datas');

// ------------------------------------------------------------------
// 5. Associação inteligente de materiais
// ------------------------------------------------------------------
assert.strictEqual(ctx.nfSim('BRITA 1 GRADUADA', 'brita 1 graduada'), 1, 'texto igual = 1');
assert.ok(ctx.nfSim('TUBO DE CONCRETO PA-1 DN 400MM', 'TUBO CONCRETO PA1 DN400 MM') > 0.6,
  'mesma descrição escrita de outro jeito deve casar');
assert.ok(ctx.nfSim('TUBO DE CONCRETO DN 400MM', 'TUBO DE CONCRETO DN 600MM') < 0.6,
  'bitolas diferentes NÃO podem ser tratadas como o mesmo material');
assert.ok(ctx.nfSim('CONCRETO USINADO FCK 25 MPA', 'VERGALHAO CA-50 10,0MM') < 0.3,
  'materiais distintos não casam');
console.log('  ✓ comparação de descrições de material (inclusive bitola)');

// ------------------------------------------------------------------
// 6. Mesclagem: a chave de acesso ganha da IA
// ------------------------------------------------------------------
const vazia = {
  numero: '', serie: '', chave: '', dataEmissao: '', cnpj: '', uf: '',
  vProd: 0, vFrete: 0, vTotal: 0, itens: []
};
const daIA = {
  ok: true, confiancaGeral: 0.7,
  dados: {
    numero: '18421',                       // a IA leu errado de propósito
    serie: '2', cnpj: '00000000000000',
    razaoSocial: 'Concreteira Paulista Ltda',
    dataEmissao: '15/07/2026', vProd: 1000, vFrete: 50, vTotal: 1050,
    itens: [{ descricao: 'BRITA 1', qtd: 10, un: 'M3', vUnit: 100, vTotal: 1000 }]
  },
  confianca: { numero: 0.4, razaoSocial: 0.9 }
};
const m = ctx.nfMesclarLeitura(vazia, ctx.nfDaChave(chave), daIA);
assert.strictEqual(m.numero, '18420', 'número vem da chave, não da IA');
assert.strictEqual(m.serie, '1', 'série vem da chave');
assert.strictEqual(m.cnpj, '61304455000195', 'CNPJ vem da chave');
assert.strictEqual(m.uf, 'SP', 'UF vem da chave');
assert.strictEqual(m.razaoSocial, 'Concreteira Paulista Ltda', 'razão social vem da IA');
assert.strictEqual(m.dataEmissao, '2026-07-15', 'data exata da IA é mantida');
assert.strictEqual(m.itens.length, 1, 'itens vêm da IA');
assert.strictEqual(m.leituraConf.numero, 1, 'campo vindo da chave tem confiança total');
assert.ok(m.leituraConf.razaoSocial >= 0.9, 'confiança da IA é preservada');

// campo com confiança baixa fica sinalizado para conferência
const baixa = ctx.nfMesclarLeitura(vazia, null, {
  ok: true, confiancaGeral: 0.5, dados: { numero: '999', vTotal: 10 }, confianca: { numero: 0.5 }
});
assert.ok(ctx.nfConfBaixa(baixa, 'numero'), 'confiança 0.5 marca o campo para conferir');
assert.ok(!ctx.nfConfBaixa(m, 'numero'), 'confiança 1 não marca');
console.log('  ✓ mesclagem chave × IA e sinalização de baixa confiança');

// ------------------------------------------------------------------
// 7. Total calculado quando a nota traz só parte dos valores
// ------------------------------------------------------------------
const soProd = ctx.nfMesclarLeitura(vazia, null, {
  ok: true, dados: { vProd: 1000, vFrete: 80 }, confianca: {}
});
assert.strictEqual(soProd.vTotal, 1080, 'total = produtos + frete quando falta o total');
console.log('  ✓ complemento de valores faltantes');

// ------------------------------------------------------------------
// 8. Estoque: entrada, lote, saldo e não-duplicidade
// ------------------------------------------------------------------
const nota = {
  id: 'nf1', numero: '18420', serie: '1', cnpj: '61304455000195',
  razaoSocial: 'CONCRETEIRA PAULISTA LTDA', dataEntrada: '2026-07-20',
  itens: [
    { descricao: 'BRITA 1 GRADUADA', qtd: 30, un: 'M3', vUnit: 118, vTotal: 3540 },
    { descricao: 'AREIA MEDIA LAVADA', qtd: 20, un: 'M3', vUnit: 92, vTotal: 1840 }
  ]
};
assert.strictEqual(ctx.nfIntegrarEstoque('obra-teste', nota), 2, 'dois materiais entram no estoque');
ctx.nfIntegrarEstoque('obra-teste', nota);   // reprocessar a MESMA nota
assert.strictEqual(ctx.nfMovGet('obra-teste').length, 2, 'reprocessar a nota não duplica a entrada');

const saldos = ctx.nfSaldos('obra-teste');
const brita = saldos.find(s => s.descricao === 'BRITA 1 GRADUADA');
assert.strictEqual(brita.entradas, 30, 'quantidade entrou no saldo');
assert.strictEqual(brita.saldo, 30, 'saldo = entradas - saídas');
assert.strictEqual(brita.lotes[0], 'NF 18420/1', 'lote aponta para a nota de origem');
assert.strictEqual(ctx.nfMovGet('obra-teste')[0].notaId, 'nf1', 'rastreabilidade até a nota');

ctx.nfDesfazerEstoque('obra-teste', 'nf1');
assert.strictEqual(ctx.nfMovGet('obra-teste').length, 0, 'cancelar a nota remove a entrada');
console.log('  ✓ entrada no estoque: lote, saldo, rastreabilidade e sem duplicidade');

// ------------------------------------------------------------------
// 9. Baixa de pedido de compra
// ------------------------------------------------------------------
ctx.nfPedSet('obra-teste', [{
  id: 'pd1', numero: 'PC-2026-011', cnpj: '61304455000195', status: 'Em aberto',
  itens: [{ id: 'pi1', descricao: 'BRITA 1 GRADUADA', qtd: 100, un: 'M3', qtdAtendida: 0, entregas: [] }]
}]);
const comVinculo = JSON.parse(JSON.stringify(nota));
comVinculo.itens[0].pedidoItemId = 'pi1';
assert.strictEqual(ctx.nfBaixarPedidos('obra-teste', comVinculo), 1, 'um item baixado');
let ped = ctx.nfPedGet('obra-teste')[0];
assert.strictEqual(ped.itens[0].qtdAtendida, 30, 'quantidade entregue registrada');
assert.strictEqual(ped.status, 'Parcial', 'pedido fica parcial');

ctx.nfBaixarPedidos('obra-teste', comVinculo);   // mesma nota de novo
ped = ctx.nfPedGet('obra-teste')[0];
assert.strictEqual(ped.itens[0].qtdAtendida, 30, 'reenviar a nota não baixa em dobro');

// sugestão de vínculo pelo texto do item
const sug = ctx.nfSugerirPedidoItem('obra-teste', { descricao: 'BRITA 1 GRADUADA' }, '61304455000195');
assert.ok(sug.length && sug[0].item.id === 'pi1', 'sugere o item de pedido compatível');
console.log('  ✓ baixa de pedido de compra, sem duplicar, com sugestão automática');

// ------------------------------------------------------------------
// 10. Divergências que a conferência precisa apontar
// ------------------------------------------------------------------
assert.ok(/não fecham/.test(ctx.nfDivergencia({
  numero: '1', vTotal: 5000, vFrete: 0, itens: [{ vTotal: 3540 }]
})), 'itens que não somam o total viram divergência');
assert.ok(/CNPJ/.test(ctx.nfDivergencia({ numero: '1', cnpj: '11111111111111', itens: [] })), 'CNPJ inválido acusa');
assert.ok(/Chave/.test(ctx.nfDivergencia({ numero: '1', chave: '1'.repeat(44), itens: [] })), 'chave inválida acusa');
assert.strictEqual(ctx.nfDivergencia({
  numero: '18420', cnpj: '61304455000195', chave: chave, vTotal: 3540, vFrete: 0, itens: [{ vTotal: 3540 }]
}), '', 'nota consistente não acusa nada');
console.log('  ✓ detecção de divergência na conferência');


// ------------------------------------------------------------------
// 11. CNPJ alfanumérico e chave com letras (Nota Técnica 2026.004)
//     O dígito verificador passou a converter cada caractere por
//     ASCII menos 48. Para chave só de números tem de dar o MESMO
//     resultado de antes — a regra nova engloba a antiga.
// ------------------------------------------------------------------
assert.ok(ctx.nfChaveValida(chave), 'chave numérica continua válida com a regra nova');
assert.ok(ctx.nfCNPJvalido('61304455000195'), 'CNPJ numérico continua válido');

// monta uma chave com letras no miolo do CNPJ e calcula o DV pela regra nova
const cnpjAlfa = 'A1B2C3D4E5F6';                       // 12 posições alfanuméricas
const dvCNPJ = (() => {
  const val = c => c.charCodeAt(0) - 48;
  const calc = pesos => {
    let s = 0;
    for (let i = 0; i < pesos.length; i++) s += val(cnpjAlfa[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const a = calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const b = (() => {
    const base = cnpjAlfa + a;
    let s = 0;
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (let i = 0; i < pesos.length; i++) s += val(base[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  })();
  return '' + a + b;
})();
const cnpjCompleto = cnpjAlfa + dvCNPJ;
assert.ok(ctx.nfCNPJvalido(cnpjCompleto), 'CNPJ alfanumérico com DV certo é aceito');
assert.ok(!ctx.nfCNPJvalido(cnpjAlfa + '00'), 'CNPJ alfanumérico com DV errado é recusado');

const baseAlfa43 = '35' + '2607' + cnpjCompleto + '55' + '001' + '000018420' + '1' + '00012345';
assert.strictEqual(baseAlfa43.length, 43, 'base alfanumérica tem 43 caracteres');
const chaveAlfa = baseAlfa43 + ctx.nfDVchave(baseAlfa43);
assert.ok(ctx.nfChaveValida(chaveAlfa), 'chave com letras no CNPJ é aceita');

const dAlfa = ctx.nfDaChave(chaveAlfa);
assert.strictEqual(dAlfa.cnpj, cnpjCompleto, 'o CNPJ alfanumérico sai inteiro da chave');
assert.strictEqual(dAlfa.numero, '18420', 'número continua saindo certo');
assert.strictEqual(dAlfa.uf, 'SP', 'UF continua saindo certa');

// letra fora do miolo do CNPJ não pode passar
assert.ok(!ctx.nfChaveValida('A' + chave.slice(1)), 'letra nos 6 primeiros é recusada');
assert.ok(!ctx.nfChaveValida(chave.slice(0, 43) + 'X'), 'letra no dígito verificador é recusada');

// e a chave com letras também é encontrada dentro de um texto
assert.strictEqual(ctx.nfChaveDeTexto('CHAVE DE ACESSO ' + chaveAlfa), chaveAlfa,
  'acha a chave alfanumérica no meio do texto');
console.log('  ✓ chave e CNPJ alfanuméricos (NT 2026.004), sem quebrar os numéricos');

console.log('\n✅ Notas Fiscais: todos os testes passaram.');
