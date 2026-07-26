// GESTOR OBRAS — MÓDULO DE DOMÍNIO DE PENDÊNCIAS (SNAG LIST)

(function () {
  const PendenciasDomain = {
    // Normaliza e valida um registro de pendência
    criarPendencia(d) {
      return {
        id: d.id || `PEND_${Date.now()}`,
        carimbo: d.carimbo || new Date().toISOString().replace('T', ' ').slice(0, 16),
        obra: d.obra || '',
        ruaEstaca: d.ruaEstaca || '',
        servico: d.servico || '',
        responsavel: d.responsavel || 'Engenharia',
        prazo: d.prazo || '',
        status: d.status || 'Aberto', // 'Aberto' | 'Em Tratativa' | 'Concluído'
        descricao: d.descricao || '',
        fotoUrl: d.fotoUrl || '',
        usuario: d.usuario || ''
      };
    },

    // Filtra pendências por obra e status
    filtrar(lista, obra, statusFilter = 'TODOS') {
      if (!lista || !Array.isArray(lista)) return [];
      return lista.filter(item => {
        const mObra = !obra || String(item.obra).trim() === String(obra).trim();
        const mStatus = statusFilter === 'TODOS' || item.status === statusFilter;
        return mObra && mStatus;
      });
    },

    // Resumo estático por obra
    obterResumo(lista, obra) {
      const filtrados = this.filtrar(lista, obra, 'TODOS');
      const abertos = filtrados.filter(x => x.status === 'Aberto').length;
      const emTratativa = filtrados.filter(x => x.status === 'Em Tratativa').length;
      const concluidos = filtrados.filter(x => x.status === 'Concluído').length;

      return {
        total: filtrados.length,
        abertos,
        emTratativa,
        concluidos,
        exigeAtencao: abertos > 0
      };
    }
  };

  window.GestorPendenciasDomain = PendenciasDomain;
})();
