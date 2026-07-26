// TESTES UNITÁRIOS DE CÁLCULO DE AVANÇO FÍSICO E CURVA S

const assert = require('assert');

// Mock simples do ambiente do navegador para testes Node
if (typeof window === 'undefined') {
  global.window = {};
}

// Importa a lógica do domínio RDO
require('../js/domain/rdo.js');

const RDODomain = global.window.GestorRDODomain;

console.log('🧪 Executando suíte de testes de cálculo de avanço e Curva S...');

// 1. Teste de Cálculo de Avanço Físico Acumulado
const lancamentosMock = [
  { servico: 'Escavação', qtd: 500, data: '2026-07-01' },
  { servico: 'Escavação', qtd: 500, data: '2026-07-02' },
  { servico: 'Aterro', qtd: 250, data: '2026-07-03' }
];

const orcamentoMock = [
  { nome: 'Escavação', qtdTotal: 2000, precoUnitario: 10 },
  { nome: 'Aterro', qtdTotal: 1000, precoUnitario: 20 }
];

const resAvanco = RDODomain.calcularAvancoFisico(lancamentosMock, orcamentoMock);
assert.strictEqual(resAvanco.totalExecutado, 15000, 'Total executado deve ser R$ 15.000');
assert.strictEqual(resAvanco.totalOrcado, 40000, 'Total orçado deve ser R$ 40.000');
assert.strictEqual(resAvanco.percentualTotal, 37.5, 'Percentual executado deve ser 37.5%');
console.log('✅ Passou: Cálculo de avanço físico acumulado (37.5%)');

// 2. Teste de Geração de Pontos para Curva S
const resCurva = RDODomain.gerarPontosCurvaS(lancamentosMock, '2026-07-01', '2026-07-31');
assert.strictEqual(resCurva.datas.length, 3, 'Deve haver 3 datas únicas registradas');
assert.strictEqual(resCurva.realizado[resCurva.realizado.length - 1], 100, 'O último ponto do acumulado deve ser 100%');
console.log('✅ Passou: Geração de pontos para Curva S');

// 3. Teste de Previsão de Término
const resPrevisao = RDODomain.calcularPrevisaoTermino(lancamentosMock, 2500);
assert.strictEqual(resPrevisao.diasTrabalhados, 3, 'Deve identificar 3 dias trabalhados');
assert.strictEqual(resPrevisao.ritmoDiario, 416.67, 'Ritmo médio diário deve ser 416.67');
console.log('✅ Passou: Previsão de término e ritmo diário');

console.log('🎉 Todos os testes unitários passaram com sucesso!');
