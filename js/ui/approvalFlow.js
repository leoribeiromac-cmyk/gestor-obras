// GESTOR OBRAS — COMPONENTE E FLUXO DE APROVAÇÃO (RBAC)

(function () {
  const ApprovalFlow = {
    // Renderiza o badge de status de aprovação
    renderBadge(status = 'Submetido') {
      const st = String(status || 'Submetido').trim();
      if (st === 'Aprovado') return `<span class="pill pill-grn" title="Aprovado pelo Engenheiro">✓ Aprovado</span>`;
      if (st === 'Fechado') return `<span class="pill pill-acc" title="Medição Fechada pelo Admin">🔒 Medição Fechada</span>`;
      return `<span class="pill pill-ylw" title="Aguardando validação da Engenharia">⏳ Submetido</span>`;
    },

    // Renderiza botões de ação com base na permissão (RBAC)
    renderActions(rdoId, currentStatus) {
      const sess = window.GestorAuth ? window.GestorAuth.getSession() : null;
      if (!sess) return '';

      const canApprove = sess.perfil === 'admin' || sess.perfil === 'engenheiro';
      if (!canApprove) return '';

      if (currentStatus === 'Aprovado' || currentStatus === 'Fechado') {
        return `<span class="txt-muted" style="font-size:12px;">Validado</span>`;
      }

      return `
        <button class="btn btn-sm btn-success" onclick="window.GestorApprovalFlow.aprovar('${rdoId}', 'Aprovado')">
          ✓ Aprovar RDO
        </button>
      `;
    },

    async aprovar(rdoId, novoStatus) {
      const token = window.GestorAuth ? window.GestorAuth.getToken() : '';
      const endpoint = window.CONFIG ? window.CONFIG.appsScript : '';

      try {
        const payload = new URLSearchParams({
          action: 'aprovarRDO',
          id: rdoId,
          statusAprovacao: novoStatus,
          token: token
        });

        const resp = await fetch(endpoint, { method: 'POST', body: payload });
        const res = await resp.json();

        if (res && res.ok) {
          alert('Status de RDO atualizado para: ' + novoStatus);
          window.dispatchEvent(new CustomEvent('gestor:dataUpdated'));
        } else {
          alert('Erro ao aprovar RDO: ' + (res ? res.error : 'Erro de rede'));
        }
      } catch (err) {
        alert('Falha ao conectar com o servidor: ' + err.message);
      }
    }
  };

  window.GestorApprovalFlow = ApprovalFlow;
})();
