// TESTES DO AVANÇO FÍSICO — o coração do sistema
// ---------------------------------------------------------------
// São as contas que alimentam o painel executivo, a curva S, a medição
// e os alertas de desvio. Se uma delas erra, a obra é medida errado.
//
// O teste NÃO tem cópia do código: ele lê as funções direto do index.html
// e roda num Node isolado. Assim, se alguém mexer na conta lá, o teste
// acusa aqui — nunca fica testando uma versão velha.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ---------- recorta uma função do index.html contando as chaves ----------
function fimDaFuncao(txt, ini) {
  let i = txt.indexOf('{', ini), nivel = 0, aspas = '';
  for (; i < txt.length && i > -1; i++) {
    const c = txt[i];
    if (aspas) { if (c === '\\') { i++; continue; } if (c === aspas) aspas = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { aspas = c; continue; }
    if (c === '/' && txt[i + 1] === '/') { i = txt.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (!nivel) return i + 1; }
  }
  throw new Error('chaves desbalanceadas a partir de ' + ini);
}

function recortar(nomes) {
  return nomes.map(nome => {
    const m = new RegExp('\\nfunction ' + nome + '\\s*\\(').exec(html);
    assert.ok(m, 'não encontrei function ' + nome + '() no index.html');
    const ini = m.index + 1;
    return html.slice(ini, fimDaFuncao(html, ini));
  }).join('\n');
}

// MESES é uma constante solta, não uma função
const linhaMeses = /^const MESES = \[.*\];$/m.exec(html);
assert.ok(linhaMeses, 'não encontrei a constante MESES no index.html');

const linhaPrevMax = /^const PREV_MAX_MESES=.*$/m.exec(html);
assert.ok(linhaPrevMax, 'não encontrei a constante PREV_MAX_MESES no index.html');

// hoje() fica de fora de propósito: no teste ele precisa ser uma data fixa,
// senão o resultado muda conforme o dia em que a bateria roda.
const fonte = linhaMeses[0] + '\n' + linhaPrevMax[0] + '\n' + recortar([
  'mesLabel', 'addMeses', 'clamp', 'keyL', 'getLanc',
  'skey', 'skeyS', 'avancoServ', 'pctServ', 'mediaPct',
  'pontos', 'curvaPrev', 'curvaReal', 'mesIdxHoje', 'frenteStats', 'nivelDesvio',
  'ritmoDesdeInicio', 'ritmoRecente', 'previsaoTermino'
]);

// ---------- ambiente mínimo ----------
const guardado = {};
const ctx = {
  console,
  _hoje: '2026-03-15',
  localStorage: {
    getItem: k => (k in guardado ? guardado[k] : null),
    setItem: (k, v) => { guardado[k] = String(v); },
    removeItem: k => { delete guardado[k]; }
  }
};
ctx.hoje = () => ctx._hoje;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fonte, ctx, { filename: 'index.html (avanço físico)' });

// arrays criados dentro do sandbox têm outro prototype: normaliza antes de comparar
const lista = x => Array.from(x);
const perto = (a, b, msg, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, msg + ' — esperado ' + b + ', veio ' + a);

console.log('🧪 Testes do avanço físico (painel, curva S, medição e desvios)…');

// ==================================================================
// Obra A — a obra "normal", com 3 frentes e 4 serviços
// ==================================================================
const obraA = {
  id: 'OBRA-A', inicioISO: '2026-01-01', prazoMeses: 4,
  frentes: [{ id: 1, nome: 'Drenagem' }, { id: 2, nome: 'Pavimentação' }, { id: 3, nome: 'Sinalização' }],
  servicos: [
    { rua: 'Rua A', capId: 1, servico: 'Escavação', un: 'm3', qtdPrev: 100 },
    { rua: 'Rua A', capId: 1, servico: 'Tubo DN400', un: 'm', qtdPrev: 200 },
    { rua: 'Rua B', capId: 2, servico: 'Base', un: 'm2', qtdPrev: 50 },
    { rua: 'Rua C', capId: 3, servico: 'Placas', un: 'un', qtdPrev: 10 }
  ],
  cronograma: [
    { frenteId: 1, pctMes: [25, 25, 25, 25] },
    { frenteId: 2, pctMes: [0, 50, 50, 0] },
    { frenteId: 3, pctMes: [0, 0, 50, 50] }
  ]
};

guardado['gestor:rdo:OBRA-A'] = JSON.stringify([
  { dataISO: '2026-01-20', rua: 'Rua A', capId: 1, servico: 'Escavação', qtd: 40 },
  { dataISO: '2026-02-10', rua: 'Rua A', capId: 1, servico: 'Escavação', qtd: 30 },
  { dataISO: '2026-02-15', rua: 'Rua A', capId: 1, servico: 'Tubo DN400', qtd: 240 }, // passou do previsto
  { dataISO: '2026-03-05', rua: 'Rua B', capId: 2, servico: 'Base', qtd: 10 },
  // avulso comum: fora de frente, não conta em lugar nenhum
  { dataISO: '2026-03-06', rua: 'Área externa', capId: null, servico: 'Limpeza de canteiro', qtd: 1, avulso: true },
  // avulso "colado" num serviço de contrato (só acontece se editarem na mão):
  // mesmo assim não pode entrar na conta do avanço nem da curva
  { dataISO: '2026-03-07', rua: 'Rua A', capId: 1, servico: 'Escavação', qtd: 999, avulso: true }
]);

// ------------------------------------------------------------------
// 1. Quantidade acumulada por serviço
// ------------------------------------------------------------------
const av = ctx.avancoServ(obraA);
perto(av['Rua A§1§Escavação'], 70, 'escavação soma os dois dias (40 + 30)');
perto(av['Rua A§1§Tubo DN400'], 240, 'tubo acumula o que foi lançado');
perto(av['Rua B§2§Base'], 10, 'base acumula o lançamento de março');
assert.strictEqual(av['Rua C§3§Placas'], undefined, 'serviço sem lançamento não aparece');
assert.ok(!Object.keys(av).some(k => /Limpeza/.test(k)), 'avulso não vira serviço do contrato');
console.log('  ✓ acumulado por serviço soma certo e ignora serviço avulso');

// ------------------------------------------------------------------
// 2. Percentual de cada serviço
// ------------------------------------------------------------------
perto(ctx.pctServ(obraA.servicos[0], av), 70, 'escavação 70 de 100 = 70%');
perto(ctx.pctServ(obraA.servicos[1], av), 120, 'tubo 240 de 200 = 120% (o bruto passa de 100)');
perto(ctx.pctServ(obraA.servicos[3], av), 0, 'serviço sem lançamento = 0%');
perto(ctx.pctServ({ rua: 'X', capId: 9, servico: 'Y', qtdPrev: 0 }, av), 0, 'previsto zero não divide por zero');
console.log('  ✓ percentual por serviço, inclusive previsto zerado');

// ------------------------------------------------------------------
// 3. Média de avanço — teto de 100% por serviço
// ------------------------------------------------------------------
// (70 + 100 + 20 + 0) / 4 — o tubo entra como 100, não como 120,
// senão um serviço que passou do previsto mascararia o atraso dos outros.
perto(ctx.mediaPct(obraA.servicos, av), 47.5, 'média dos 4 serviços com teto de 100');
perto(ctx.mediaPct([], av), 0, 'obra sem serviço não quebra a média');
console.log('  ✓ média de avanço limita cada serviço a 100%');

// ------------------------------------------------------------------
// 4. Malha de meses da obra
// ------------------------------------------------------------------
const pts = ctx.pontos(obraA);
assert.strictEqual(pts.length, 4, 'a malha tem um ponto por mês de prazo');
assert.deepStrictEqual(lista(pts.map(p => p.mes)), ['2026-01', '2026-02', '2026-03', '2026-04'], 'meses em sequência');
assert.deepStrictEqual(lista(pts.map(p => p.label)), ['jan/26', 'fev/26', 'mar/26', 'abr/26'], 'rótulos em português');

// vira o ano sem errar
const ptsVirada = ctx.pontos({ inicioISO: '2025-11-01', prazoMeses: 4, cronograma: [] });
assert.deepStrictEqual(lista(ptsVirada.map(p => p.label)), ['nov/25', 'dez/25', 'jan/26', 'fev/26'], 'a malha vira o ano');

// obra que começa dia 31: nenhum mês pode sumir nem repetir
const pts31 = ctx.pontos({ inicioISO: '2026-01-31', prazoMeses: 5, cronograma: [] });
assert.deepStrictEqual(lista(pts31.map(p => p.mes)),
  ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'],
  'obra iniciada dia 31 mantém um mês de cada');
assert.strictEqual(new Set(pts31.map(p => p.mes)).size, 5, 'nenhum mês repetido');
assert.strictEqual(ctx.addMeses('2026-01-31', 1), '2026-02-28', '31/01 + 1 mês = 28/02');
assert.strictEqual(ctx.addMeses('2024-01-31', 1), '2024-02-29', 'ano bissexto: 31/01 + 1 = 29/02');
assert.strictEqual(ctx.addMeses('2026-03-31', 1), '2026-04-30', '31/03 + 1 mês = 30/04');
assert.strictEqual(ctx.addMeses('2026-12-15', 1), '2027-01-15', 'dezembro + 1 mês vira o ano');
assert.strictEqual(ctx.addMeses('2026-05-10', 0), '2026-05-10', 'somar zero mês devolve a mesma data');
console.log('  ✓ malha de meses: sequência, virada de ano e obra iniciada dia 31');

// ------------------------------------------------------------------
// 5. Curva prevista (o que o cronograma promete)
// ------------------------------------------------------------------
const prev = ctx.curvaPrev(obraA, pts);
perto(prev[0], 25 / 3, 'mês 1: só a drenagem andou no cronograma');
perto(prev[1], 100 / 3, 'mês 2: drenagem 50 + pavimentação 50');
perto(prev[2], 75, 'mês 3: 75 + 100 + 50 dividido por 3 frentes');
perto(prev[3], 100, 'no fim do prazo o previsto fecha em 100%');
for (let i = 1; i < prev.length; i++) {
  assert.ok(prev[i] >= prev[i - 1] - 1e-9, 'a curva prevista nunca cai (mês ' + i + ')');
}

// cronograma somando mais de 100% numa frente não estoura a curva
const prevTeto = ctx.curvaPrev(
  { cronograma: [{ frenteId: 1, pctMes: [60, 60] }] },
  ctx.pontos({ inicioISO: '2026-01-01', prazoMeses: 2, cronograma: [] })
);
assert.deepStrictEqual(lista(prevTeto), [60, 100], 'cronograma somando 120% é limitado a 100%');
console.log('  ✓ curva prevista: acumulado por frente, sempre subindo, com teto de 100%');

// ------------------------------------------------------------------
// 6. Curva realizada (o que a obra entregou)
// ------------------------------------------------------------------
const real = ctx.curvaReal(obraA, pts);
perto(real[0], 10, 'jan: só 40 m³ de escavação → 40% de 1 dos 4 serviços');
perto(real[1], 42.5, 'fev: escavação 70% + tubo no teto de 100%');
perto(real[2], 47.5, 'mar: entra a base com 20%');
perto(real[3], 47.5, 'abr sem lançamento: a curva se mantém');
for (let i = 1; i < real.length; i++) {
  assert.ok(real[i] >= real[i - 1] - 1e-9, 'a curva realizada nunca cai (mês ' + i + ')');
}
// o último ponto da curva tem que bater com o número grande do painel
perto(real[real.length - 1], ctx.mediaPct(obraA.servicos, av),
  'fim da curva realizada = avanço do painel');
console.log('  ✓ curva realizada: acumula por mês, ignora avulso e fecha igual ao painel');

// ------------------------------------------------------------------
// 7. Em que mês a obra está hoje
// ------------------------------------------------------------------
assert.strictEqual(ctx.mesIdxHoje(obraA), 2, 'em 15/03 a obra está no 3º mês (índice 2)');
ctx._hoje = '2025-12-01';
assert.strictEqual(ctx.mesIdxHoje(obraA), 0, 'antes de começar, fica no primeiro mês (nunca negativo)');
ctx._hoje = '2030-01-01';
assert.strictEqual(ctx.mesIdxHoje(obraA), 3, 'depois do prazo, para no último mês da malha');
ctx._hoje = '2026-03-15';
console.log('  ✓ mês corrente da obra: antes do início, durante e depois do prazo');

// ------------------------------------------------------------------
// 8. Desvio por frente — o que gera os alertas
// ------------------------------------------------------------------
const fs1 = ctx.frenteStats(obraA);
assert.strictEqual(fs1.length, 3, 'as 3 frentes com serviço aparecem');

const f1 = fs1.find(f => f.id === 1);
perto(f1.real, 85, 'drenagem: média de 70% e 100%');
perto(f1.prev, 75, 'drenagem: 25+25+25 acumulado até março');
perto(f1.desvio, 10, 'drenagem adiantada em 10 pontos');
assert.strictEqual(f1.n, 2, 'drenagem tem 2 serviços');
assert.strictEqual(f1.concl, 1, 'só o tubo está concluído');

const f2 = fs1.find(f => f.id === 2);
perto(f2.prev, 100, 'pavimentação deveria estar pronta em março');
perto(f2.desvio, -80, 'pavimentação com 80 pontos de atraso');
assert.strictEqual(f2.concl, 0, 'nada concluído na pavimentação');

perto(fs1.find(f => f.id === 3).desvio, -50, 'sinalização com 50 pontos de atraso');
console.log('  ✓ desvio por frente: realizado, previsto, atraso e serviços concluídos');

// ------------------------------------------------------------------
// 9. Classificação do desvio (a cor do alerta)
// ------------------------------------------------------------------
assert.strictEqual(ctx.nivelDesvio(null), 'na', 'sem cronograma não classifica');
assert.strictEqual(ctx.nivelDesvio(-80), 'crit', '80 pontos atrás = crítico');
assert.strictEqual(ctx.nivelDesvio(-15), 'crit', '-15 já é crítico (limite)');
assert.strictEqual(ctx.nivelDesvio(-14.99), 'aten', 'um pouco acima de -15 é atenção');
assert.strictEqual(ctx.nivelDesvio(-5), 'aten', '-5 é atenção (limite)');
assert.strictEqual(ctx.nivelDesvio(-4.99), 'ok', 'até -5 está dentro do previsto');
assert.strictEqual(ctx.nivelDesvio(0), 'ok', 'em dia');
assert.strictEqual(ctx.nivelDesvio(4.99), 'ok', 'menos de 5 na frente ainda é "em dia"');
assert.strictEqual(ctx.nivelDesvio(5), 'bom', '+5 já conta como adiantado');
assert.strictEqual(ctx.nivelDesvio(60), 'bom', 'bem adiantado');
console.log('  ✓ faixas do alerta: crítico, atenção, em dia e adiantado');

// ==================================================================
// Obra B — obra nova, sem lançamento e com cadastro incompleto
// ==================================================================
const obraB = {
  id: 'OBRA-B', inicioISO: '2026-06-01', prazoMeses: 3,
  frentes: [{ id: 1, nome: 'Terraplanagem' }, { id: 2, nome: 'Frente ainda sem serviço' }],
  servicos: [
    { rua: 'Rua Z', capId: 1, servico: 'Corte', un: 'm3', qtdPrev: 0 },
    { rua: 'Rua Z', capId: 1, servico: 'Aterro', un: 'm3', qtdPrev: 500 }
  ],
  cronograma: []
};

const ptsB = ctx.pontos(obraB);
assert.deepStrictEqual(lista(ctx.curvaPrev(obraB, ptsB)), [0, 0, 0], 'obra sem cronograma: previsto zerado');
assert.deepStrictEqual(lista(ctx.curvaReal(obraB, ptsB)), [0, 0, 0], 'obra sem lançamento: realizado zerado');
assert.strictEqual(ctx.mesIdxHoje(obraB), 0, 'obra que ainda não começou fica no mês 1');

const fsB = ctx.frenteStats(obraB);
assert.strictEqual(fsB.length, 1, 'frente sem serviço não entra na lista de desvios');
assert.strictEqual(fsB[0].prev, null, 'frente sem cronograma fica sem previsto');
assert.strictEqual(fsB[0].desvio, null, 'sem previsto não existe desvio');
assert.strictEqual(ctx.nivelDesvio(fsB[0].desvio), 'na', 'e o alerta não classifica essa frente');
console.log('  ✓ obra nova / cadastro incompleto não quebra e não inventa desvio');

// ==================================================================
// Obra C — só uma frente, para conferir a obra 100% concluída
// ==================================================================
const obraC = {
  id: 'OBRA-C', inicioISO: '2026-01-01', prazoMeses: 2,
  frentes: [{ id: 1, nome: 'Única' }],
  servicos: [{ rua: 'R', capId: 1, servico: 'S', un: 'un', qtdPrev: 10 }],
  cronograma: [{ frenteId: 1, pctMes: [50, 50] }]
};
guardado['gestor:rdo:OBRA-C'] = JSON.stringify([
  { dataISO: '2026-01-10', rua: 'R', capId: 1, servico: 'S', qtd: 10 }
]);
ctx._hoje = '2026-01-20';   // ainda no 1º mês do prazo
const avC = ctx.avancoServ(obraC);
perto(ctx.mediaPct(obraC.servicos, avC), 100, 'serviço todo executado = 100%');
const fsC = ctx.frenteStats(obraC)[0];
assert.strictEqual(fsC.concl, 1, 'o serviço aparece como concluído');
perto(fsC.desvio, 50, 'terminou no 1º mês, previsto era 50% → 50 pontos adiantado');
assert.strictEqual(ctx.nivelDesvio(fsC.desvio), 'bom', 'e o alerta mostra adiantado');
console.log('  ✓ obra concluída: 100%, serviço contado como concluído e adiantada');

// ==================================================================
// Obra D — previsão de término pelo ritmo realizado
// ==================================================================
// 4 serviços iguais, um por mês: o avanço sobe 25 pontos por mês.
const obraD = {
  id: 'OBRA-D', inicioISO: '2026-01-01', prazoMeses: 6,
  frentes: [{ id: 1, nome: 'Única' }],
  servicos: [1, 2, 3, 4].map(i => ({ rua: 'R', capId: 1, servico: 'S' + i, un: 'un', qtdPrev: 10 })),
  cronograma: [{ frenteId: 1, pctMes: [17, 17, 17, 17, 16, 16] }]
};
guardado['gestor:rdo:OBRA-D'] = JSON.stringify([
  { dataISO: '2026-01-15', rua: 'R', capId: 1, servico: 'S1', qtd: 10 },
  { dataISO: '2026-02-15', rua: 'R', capId: 1, servico: 'S2', qtd: 10 }
]);
ctx._hoje = '2026-02-20';   // 2 meses decorridos, 50% feito

let pv = ctx.previsaoTermino(obraD);
perto(pv.atual, 50, 'metade dos serviços concluídos = 50%');
assert.strictEqual(pv.mesesDecorridos, 2, 'dois meses decorridos');
assert.strictEqual(pv.fimContratoMes, '2026-06', 'prazo de 6 meses termina em jun/26');
perto(pv.desdeInicio.ritmo, 25, 'ritmo desde o início: 50% em 2 meses = 25 por mês');
assert.strictEqual(pv.desdeInicio.meses, 2, 'faltam 50 pontos a 25 por mês = 2 meses');
assert.strictEqual(pv.desdeInicio.mes, '2026-04', 'termina em abr/26');
assert.strictEqual(pv.desdeInicio.atraso, -2, 'dois meses antes do prazo de contrato');
assert.ok(!pv.concluida && !pv.parada, 'obra em andamento tem projeção');
console.log('  ✓ previsão: ritmo, meses restantes, mês final e folga sobre o prazo');

// obra parada há 3 meses: o ritmo recente cai a zero, o desde-o-início não
ctx._hoje = '2026-05-20';
pv = ctx.previsaoTermino(obraD);
assert.strictEqual(pv.mesesDecorridos, 5, 'cinco meses decorridos');
perto(pv.desdeInicio.ritmo, 10, 'ritmo desde o início cai para 50/5 = 10 por mês');
assert.strictEqual(pv.recente, null, 'sem avanço nos últimos 3 meses: não projeta pelo recente');
assert.strictEqual(pv.desdeInicio.meses, 5, 'faltam 50 pontos a 10 por mês');
assert.strictEqual(pv.desdeInicio.mes, '2026-10', 'projeta o término para out/26');
assert.strictEqual(pv.desdeInicio.atraso, 4, 'out/26 é 4 meses depois de jun/26, o fim do contrato');
assert.ok(!pv.parada, 'ainda existe uma das duas leituras');
console.log('  ✓ obra parada: o ritmo recente zera e o atraso aparece');

// obra sem nenhum lançamento: nada a projetar
guardado['gestor:rdo:OBRA-D2'] = JSON.stringify([]);
const obraD2 = Object.assign({}, obraD, { id: 'OBRA-D2' });
const pvZero = ctx.previsaoTermino(obraD2);
assert.strictEqual(pvZero.parada, true, 'sem avanço não há previsão');
assert.strictEqual(pvZero.desdeInicio, null, 'nenhuma das duas leituras projeta');
assert.strictEqual(pvZero.recente, null, 'nem a recente');

// obra concluída
guardado['gestor:rdo:OBRA-D3'] = JSON.stringify(
  [1, 2, 3, 4].map(i => ({ dataISO: '2026-01-15', rua: 'R', capId: 1, servico: 'S' + i, qtd: 10 })));
const pvFim = ctx.previsaoTermino(Object.assign({}, obraD, { id: 'OBRA-D3' }));
assert.strictEqual(pvFim.concluida, true, '100% executado marca como concluída');
perto(pvFim.atual, 100, 'avanço em 100%');

// ritmo muito baixo: não mostra data absurda
guardado['gestor:rdo:OBRA-D4'] = JSON.stringify([
  { dataISO: '2026-01-15', rua: 'R', capId: 1, servico: 'S1', qtd: 0.02 }
]);
ctx._hoje = '2026-02-20';
const pvLento = ctx.previsaoTermino(Object.assign({}, obraD, { id: 'OBRA-D4' }));
assert.strictEqual(pvLento.desdeInicio.longe, true, 'ritmo mínimo não gera data, só o aviso');
assert.strictEqual(pvLento.desdeInicio.mes, '', 'sem mês quando a projeção passa de 20 anos');
console.log('  ✓ casos-limite: obra sem avanço, obra concluída e ritmo desprezível');

// as duas contas de ritmo, isoladas
const curva = [10, 20, 30, 40, 50];
perto(ctx.ritmoDesdeInicio(curva, 4), 10, 'ritmo desde o início = acumulado / meses');
perto(ctx.ritmoRecente(curva, 4, 3), 10, 'ritmo recente = ganho dos 3 últimos / 3');
perto(ctx.ritmoRecente([0, 0, 0, 60, 60], 4, 3), 20, 'ritmo recente pega só a janela');
perto(ctx.ritmoRecente(curva, 0, 3), 0, 'no primeiro mês não existe janela recente');
console.log('  ✓ as duas medidas de ritmo, conferidas separadamente');

ctx._hoje = '2026-03-15';

console.log('\n✅ Avanço físico: todas as contas conferidas.');
