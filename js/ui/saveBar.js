// GESTOR OBRAS — COMPONENTE BARRA FIXA DE SALVAMENTO (SAVE BAR)

(function () {
  let saveBarElem = null;

  function createSaveBarElement() {
    if (saveBarElem) return saveBarElem;
    
    const div = document.createElement('div');
    div.id = 'gestor-save-bar';
    div.className = 'save-bar save-bar-synced';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    div.innerHTML = `
      <div class="save-bar-content">
        <span class="save-bar-icon" id="save-bar-icon">🟢</span>
        <span class="save-bar-text" id="save-bar-text">Todos os dados salvos e sincronizados</span>
        <button id="save-bar-btn" class="btn-save-retry" style="display:none;" aria-label="Tentar sincronizar novamente">Sincronizar Agora</button>
      </div>
    `;
    div.style.display = 'none';
    document.body.appendChild(div);
    saveBarElem = div;

    document.getElementById('save-bar-btn').addEventListener('click', () => {
      if (window.outboxFlush) window.outboxFlush();
    });

    return div;
  }

  function updateSaveBarUI(detail) {
    const elem = createSaveBarElement();
    // So aparece quando ha algo a dizer: pendencia, falta de rede ou erro.
    // Em dia (synced) nao ha recado; na demonstracao o aviso ja fica fixo no topo.
    const mudo = !detail.state || detail.state === 'synced' || detail.state === 'demo';
    elem.style.display = mudo ? 'none' : '';
    if (mudo) return;

    const icon = document.getElementById('save-bar-icon');
    const text = document.getElementById('save-bar-text');
    const btn  = document.getElementById('save-bar-btn');
    if (!icon || !text || !btn) return;
    const n = detail.pendingCount || 0;

    if (detail.state === 'syncing') {
      elem.className = 'save-bar save-bar-syncing';
      icon.textContent = '🔄';
      text.textContent = `Enviando ${n} item(ns)…`;
      btn.style.display = 'none';
    } else if (detail.state === 'offline') {
      elem.className = 'save-bar save-bar-pending';
      icon.textContent = '📴';
      text.textContent = `Sem conexão — ${n} item(ns) salvos no aparelho`;
      btn.style.display = 'none';
    } else if (detail.state === 'error') {
      elem.className = 'save-bar save-bar-error';
      icon.textContent = '🔴';
      text.textContent = `Falha ao enviar ${n} item(ns)`;
      btn.style.display = 'inline-block';
      btn.textContent = 'Tentar de novo';
    } else {   // pending
      elem.className = 'save-bar save-bar-pending';
      icon.textContent = '⇅';
      text.textContent = `${n} item(ns) aguardando envio`;
      btn.style.display = 'inline-block';
      btn.textContent = 'Enviar agora';
    }
  }


  window.addEventListener('gestor:syncStateChange', (e) => {
    updateSaveBarUI(e.detail || {});
  });

  document.addEventListener('DOMContentLoaded', () => {
    createSaveBarElement();
  });
})();
