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
    document.body.appendChild(div);
    saveBarElem = div;

    document.getElementById('save-bar-btn').addEventListener('click', () => {
      if (window.GestorOutbox) {
        window.GestorOutbox.sync();
      }
    });

    return div;
  }

  function updateSaveBarUI(detail) {
    const elem = createSaveBarElement();
    const icon = document.getElementById('save-bar-icon');
    const text = document.getElementById('save-bar-text');
    const btn = document.getElementById('save-bar-btn');

    if (!elem || !icon || !text || !btn) return;

    if (detail.state === 'syncing') {
      elem.className = 'save-bar save-bar-syncing';
      icon.textContent = '🔄';
      text.textContent = `Sincronizando ${detail.pendingCount} item(ns)...`;
      btn.style.display = 'none';
    } else if (detail.state === 'pending') {
      elem.className = 'save-bar save-bar-pending';
      icon.textContent = '🟡';
      text.textContent = `Salvo na fila offline (${detail.pendingCount} pendente(s))`;
      btn.style.display = 'inline-block';
      btn.textContent = 'Forçar Sync';
    } else if (detail.state === 'error') {
      elem.className = 'save-bar save-bar-error';
      icon.textContent = '🔴';
      text.textContent = `Erro ao sincronizar ${detail.pendingCount} item(ns)`;
      btn.style.display = 'inline-block';
      btn.textContent = 'Reenviar';
    } else {
      elem.className = 'save-bar save-bar-synced';
      icon.textContent = '🟢';
      text.textContent = 'Todos os dados salvos e sincronizados';
      btn.style.display = 'none';
    }
  }

  window.addEventListener('gestor:syncStateChange', (e) => {
    updateSaveBarUI(e.detail || {});
  });

  document.addEventListener('DOMContentLoaded', () => {
    createSaveBarElement();
  });
})();
