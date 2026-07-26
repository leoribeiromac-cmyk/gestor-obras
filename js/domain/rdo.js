// GESTOR OBRAS — DOMÍNIO DE RDO E CÁLCULOS DE AVANÇO / CURVA S

(function () {
  const RDODomain = {
    // Calcula o avanço físico acumulado a partir dos lançamentos
    calcularAvancoFisico(lancamentos, orcamento) {
      if (!lancamentos || !lancamentos.length) return { percentualTotal: 0, porServico: {} };
      
      const totalOrcado = (orcamento || []).reduce((acc, item) => acc + (parseFloat(item.qtdTotal || 0) * parseFloat(item.precoUnitario || 1)), 0);
      let totalExecutado = 0;
      const porServico = {};

      lancamentos.forEach(l => {
        const servico = l.servico || l.Servico || 'Outros';
        const qtd = parseFloat(l.qtd || l.Qtd || 0);
        porServico[servico] = (porServico[servico] || 0) + qtd;
      });

      if (orcamento && orcamento.length) {
        orcamento.forEach(item => {
          const realizado = porServico[item.nome] || 0;
          const valorRealizado = realizado * parseFloat(item.precoUnitario || 1);
          totalExecutado += valorRealizado;
        });
      }

      const percentualTotal = totalOrcado > 0 ? Math.min(100, (totalExecutado / totalOrcado) * 100) : 0;

      return {
        percentualTotal: parseFloat(percentualTotal.toFixed(2)),
        totalExecutado,
        totalOrcado,
        porServico
      };
    },

    // Gera pontos para o gráfico de Curva S (Planejado vs Realizado)
    gerarPontosCurvaS(lancamentos, dataInicio, dataFim) {
      if (!lancamentos || !lancamentos.length) return { datas: [], planejado: [], realizado: [] };

      // Agrupa por data YYYY-MM-DD
      const datasMap = {};
      lancamentos.forEach(l => {
        const d = (l.data || l.Data || '').slice(0, 10);
        if (!d) return;
        const qtd = parseFloat(l.qtd || l.Qtd || 0);
        datasMap[d] = (datasMap[d] || 0) + qtd;
      });

      const datasOrdenadas = Object.keys(datasMap).sort();
      let acumulado = 0;
      const realizado = [];
      const totalGeral = Object.values(datasMap).reduce((a, b) => a + b, 0) || 1;

      datasOrdenadas.forEach(d => {
        acumulado += datasMap[d];
        const pct = parseFloat(((acumulado / totalGeral) * 100).toFixed(1));
        realizado.push(pct);
      });

      // Curva planejada linear simples como baseline
      const step = 100 / (datasOrdenadas.length || 1);
      const planejado = datasOrdenadas.map((_, i) => parseFloat(Math.min(100, (i + 1) * step).toFixed(1)));

      return {
        datas: datasOrdenadas,
        planejado,
        realizado
      };
    },

    // Calcula previsão de término baseada no ritmo médio de produtividade diária
    calcularPrevisaoTermino(lancamentos, qtdTotalMeta) {
      if (!lancamentos || !lancamentos.length || !qtdTotalMeta) {
        return { ritmoDiario: 0, diasRestantes: 0, previsaoData: null, tendenciaAtraso: false };
      }

      const datasMap = {};
      let totalRealizado = 0;
      lancamentos.forEach(l => {
        const d = (l.data || l.Data || '').slice(0, 10);
        if (d) datasMap[d] = true;
        totalRealizado += parseFloat(l.qtd || l.Qtd || 0);
      });

      const diasTrabalhados = Object.keys(datasMap).length || 1;
      const ritmoDiario = totalRealizado / diasTrabalhados;
      const qtdRestante = Math.max(0, qtdTotalMeta - totalRealizado);
      const diasRestantes = ritmoDiario > 0 ? Math.ceil(qtdRestante / ritmoDiario) : 999;

      const previsaoData = new Date();
      previsaoData.setDate(previsaoData.getDate() + diasRestantes);

      return {
        ritmoDiario: parseFloat(ritmoDiario.toFixed(2)),
        diasTrabalhados,
        diasRestantes,
        previsaoData: previsaoData.toISOString().slice(0, 10),
        tendenciaAtraso: diasRestantes > 30
      };
    }
  };

  window.GestorRDODomain = RDODomain;
})();
