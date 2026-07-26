// GESTOR OBRAS — TELA DE PENDÊNCIAS DE CAMPO (SNAG LIST)

(function () {
  const PendenciasScreen = {
    render(containerId, pendenciasList, obraAtiva) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const filtrados = window.GestorPendenciasDomain
        ? window.GestorPendenciasDomain.filtrar(pendenciasList, obraAtiva)
        : pendenciasList;

      const html = `
        <div class="card" aria-label="Módulo de Pendências">
          <div class="card-header flex-between">
            <div>
              <h3 class="card-title">⚠️ Pendências & Não-Conformidades de Campo</h3>
              <p class="card-sub">Gestão visual com responsáveis, prazos, fotos e estaca/serviço</p>
            </div>
            <button class="btn btn-primary" onclick="window.GestorPendenciasScreen.abrirModalNovo('${obraAtiva}')">
              + Nova Pendência
            </button>
          </div>

          <div class="card-body">
            ${!filtrados || !filtrados.length ? `
              <div class="empty">
                <div class="ic">🎉</div>
                Nenhuma pendência aberta nesta obra. Tudo limpo!
              </div>
            ` : `
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Estaca / Local</th>
                      <th>Serviço</th>
                      <th>Descrição</th>
                      <th>Responsável</th>
                      <th>Prazo</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filtrados.map(p => `
                      <tr>
                        <td class="font-mono">${p.carimbo || '-'}</td>
                        <td><strong>${p.ruaEstaca || '-'}</strong></td>
                        <td>${p.servico || '-'}</td>
                        <td>${p.descricao || '-'}</td>
                        <td><span class="pill pill-acc">${p.responsavel || 'Equipe'}</span></td>
                        <td class="font-mono">${p.prazo || '-'}</td>
                        <td>
                          <span class="pill ${p.status === 'Concluído' ? 'pill-grn' : (p.status === 'Em Tratativa' ? 'pill-ylw' : 'pill-red')}">
                            ${p.status}
                          </span>
                        </td>
                        <td>
                          ${p.status !== 'Concluído' ? `
                            <button class="btn btn-sm btn-secondary" onclick="window.GestorPendenciasScreen.concluir('${p.id}')">
                              ✓ Concluir
                            </button>
                          ` : '✓ Fechado'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      `;

      container.innerHTML = html;
    },

    abrirModalNovo(obra) {
      const rua = prompt('Rua / Estaca do problema:');
      if (!rua) return;
      const desc = prompt('Descrição detalhada do problema:');
      if (!desc) return;
      const resp = prompt('Responsável pela resolução:', 'Engenharia de Campo');
      const prazo = prompt('Prazo (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));

      const nova = {
        obra,
        ruaEstaca: rua,
        servico: 'Ocorrência de Campo',
        descricao: desc,
        responsavel: resp || 'Engenharia',
        prazo: prazo || '',
        status: 'Aberto'
      };

      if (window.GestorOutbox) {
        window.GestorOutbox.enqueue('cadastrarPendencia', nova);
        alert('Pendência registrada e colocada na fila de sincronização!');
        window.dispatchEvent(new CustomEvent('gestor:dataUpdated'));
      }
    },

    async concluir(id) {
      if (!confirm('Confirmar conclusão desta pendência?')) return;
      if (window.GestorOutbox) {
        window.GestorOutbox.enqueue('atualizarPendencia', { id, status: 'Concluído' });
        alert('Status de pendência atualizado para Concluído!');
        window.dispatchEvent(new CustomEvent('gestor:dataUpdated'));
      }
    }
  };

  window.GestorPendenciasScreen = PendenciasScreen;
})();
