// GESTOR OBRAS — COMPONENTE CENTRAL DE HOJE (DASHBOARD DA HOME)

(function () {
  const CentralHoje = {
    render(containerId, stateData) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const hoje = new Date().toISOString().slice(0, 10);
      const obra = stateData.obraAtiva || 'Todas as Obras';

      const rdoHoje = (stateData.rdo || []).filter(x => (x.data || x.Data || '').slice(0, 10) === hoje);
      const diarioHoje = (stateData.diario || []).filter(x => (x.data || x.Data || '').slice(0, 10) === hoje);
      const equipSemApont = (stateData.equipamentos || []).length;
      const pendenciasAbertas = (stateData.pendencias || []).filter(x => x.status === 'Aberto').length;

      const html = `
        <section class="central-hoje-card" aria-label="Central de Hoje">
          <div class="central-hoje-header">
            <div>
              <span class="pill pill-acc">Central de Campo • ${hoje.split('-').reverse().join('/')}</span>
              <h2 class="central-hoje-title">Obra Selecionada: <strong>${obra}</strong></h2>
            </div>
            <button id="btn-central-lancar" class="btn btn-primary btn-lg" onclick="window.navPara && window.navPara('rdo-form')">
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

            <div class="central-kpi-box ${pendenciasAbertas > 0 ? 'kpi-alert' : 'kpi-ok'}">
              <span class="kpi-icon">⚠️</span>
              <div class="kpi-info">
                <span class="kpi-label">Pendências Abertas</span>
                <span class="kpi-val">${pendenciasAbertas} item(ns) exigem atenção</span>
              </div>
            </div>

            <div class="central-kpi-box kpi-info-box">
              <span class="kpi-icon">🚜</span>
              <div class="kpi-info">
                <span class="kpi-label">Equipamentos em Campo</span>
                <span class="kpi-val">${equipSemApont} máquina(s) ativas</span>
              </div>
            </div>
          </div>

          <!-- Pares de Alertas Acionáveis -->
          ${pendenciasAbertas > 0 || !rdoHoje.length ? `
            <div class="central-alert-banner">
              <strong>🔔 Alerta do Canteiro:</strong>
              ${!rdoHoje.length ? '<span>• Nenhum lançamento de produção registrado hoje.</span> ' : ''}
              ${pendenciasAbertas > 0 ? `<span>• Há ${pendenciasAbertas} pendência(s) de campo não resolvidas.</span>` : ''}
            </div>
          ` : ''}
        </section>
      `;

      container.innerHTML = html;
    }
  };

  window.GestorCentralHoje = CentralHoje;
})();
