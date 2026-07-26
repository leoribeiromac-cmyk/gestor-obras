// GESTOR OBRAS — COMPONENTE CENTRAL DE HOJE (DASHBOARD DA OBRA)

(function () {
  const CentralHoje = {
    render(containerId, stateData) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const hoje = new Date().toISOString().slice(0, 10);
      const rdoHoje = (stateData.rdo || []).filter(x => (x.data || x.Data || x.dataISO || '').slice(0, 10) === hoje);
      const diarioHoje = (stateData.diario || []).filter(x => (x.data || x.Data || x.dataISO || '').slice(0, 10) === hoje);
      const numEquip = (stateData.equipamentos || []).length;

      const html = `
        <section class="central-hoje-card" aria-label="Central de Campo">
          <div class="central-hoje-header">
            <div>
              <span class="pill pill-acc">Central de Campo • ${hoje.split('-').reverse().join('/')}</span>
              <h2 class="central-hoje-title">Resumo Operacional do Dia</h2>
            </div>
            <button id="btn-central-lancar" class="btn btn-primary btn-lg" onclick="ir('rdo')">
              🚜 Lançar Serviço
            </button>
          </div>

          <div class="central-hoje-grid">
            <div class="central-kpi-box ${rdoHoje.length ? 'kpi-ok' : 'kpi-warn'}">
              <span class="kpi-icon">📋</span>
              <div class="kpi-info">
                <span class="kpi-label">RDO de Hoje</span>
                <span class="kpi-val">${rdoHoje.length ? `${rdoHoje.length} lançamento(s)` : 'Pendente de preenchimento'}</span>
              </div>
            </div>

            <div class="central-kpi-box ${diarioHoje.length ? 'kpi-ok' : 'kpi-warn'}">
              <span class="kpi-icon">📖</span>
              <div class="kpi-info">
                <span class="kpi-label">Diário de Obra</span>
                <span class="kpi-val">${diarioHoje.length ? 'Preenchido' : 'Pendente de registro'}</span>
              </div>
            </div>

            <div class="central-kpi-box kpi-info-box">
              <span class="kpi-icon">🚜</span>
              <div class="kpi-info">
                <span class="kpi-label">Equipamentos em Campo</span>
                <span class="kpi-val">${numEquip ? `${numEquip} máquina(s) ativas` : 'Acompanhamento de máquinas'}</span>
              </div>
            </div>
          </div>

          ${!rdoHoje.length || !diarioHoje.length ? `
            <div class="central-alert-banner">
              <strong>🔔 Lembrete do Canteiro:</strong>
              ${!rdoHoje.length ? '<span>• Nenhum lançamento de produção registrado hoje nesta obra.</span> ' : ''}
              ${!diarioHoje.length ? '<span>• Diário de obra de hoje pendente.</span>' : ''}
            </div>
          ` : ''}
        </section>
      `;

      container.innerHTML = html;
    }
  };

  window.GestorCentralHoje = CentralHoje;
})();
