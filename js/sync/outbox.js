// GESTOR OBRAS — MÓDULO DE SINCRONIZAÇÃO E OUTBOX RESILIENTE

(function () {
  const OutboxEngine = {
    // Adiciona um item à outbox offline
    async enqueue(action, data, clientId = null) {
      const id = clientId || `cli_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const item = {
        clientId: id,
        action,
        payload: data,
        status: 'pendente',
        timestamp: Date.now()
      };
      await window.GestorDB.putItem('outbox', item);
      this.updateState();
      this.triggerSync();
      return item;
    },

    // Retorna todos os itens pendentes na outbox
    async getPending() {
      const all = await window.GestorDB.getAll('outbox');
      return all.filter(x => x.status === 'pendente' || x.status === 'erro');
    },

    // Executa a sincronização com o Apps Script
    async sync() {
      if (!navigator.onLine) {
        this.updateState();
        return;
      }

      const pending = await this.getPending();
      if (!pending.length) {
        this.updateState();
        return;
      }

      const endpoint = window.CONFIG ? window.CONFIG.appsScript : '';
      const token = window.GestorAuth ? window.GestorAuth.getToken() : '';

      window.dispatchEvent(new CustomEvent('gestor:syncStateChange', { detail: { state: 'syncing', pendingCount: pending.length } }));

      for (const item of pending) {
        try {
          let bodyPayload = new URLSearchParams();
          bodyPayload.append('action', item.action);
          bodyPayload.append('token', token);

          if (item.action === 'addBatchRDO') {
            bodyPayload.append('batch', JSON.stringify(item.payload));
            bodyPayload.append('clientId', item.clientId);
          } else {
            Object.keys(item.payload || {}).forEach(k => {
              bodyPayload.append(k, item.payload[k]);
            });
          }

          const response = await fetch(endpoint, {
            method: 'POST',
            body: bodyPayload
          });

          const result = await response.json();

          if (result && (result.ok || result.duplicate)) {
            await window.GestorDB.deleteItem('outbox', item.clientId);
          } else {
            item.status = 'erro';
            item.erroMsg = result ? result.error : 'Falha na resposta';
            await window.GestorDB.putItem('outbox', item);
          }
        } catch (err) {
          item.status = 'erro';
          item.erroMsg = err.message;
          await window.GestorDB.putItem('outbox', item);
        }
      }

      // Também processa a fila de fotos se houver
      if (window.GestorPhotoQueue) {
        await window.GestorPhotoQueue.processQueue();
      }

      this.updateState();
    },

    async updateState() {
      const pendingOutbox = await this.getPending();
      let pendingPhotos = [];
      if (window.GestorPhotoQueue) {
        pendingPhotos = await window.GestorPhotoQueue.getPendingPhotos();
      }

      const totalPending = pendingOutbox.length + pendingPhotos.length;
      const hasError = pendingOutbox.some(x => x.status === 'erro') || pendingPhotos.some(x => x.status === 'erro');

      let statusStr = 'saved'; // 'saved' | 'pending' | 'error'
      if (hasError) statusStr = 'error';
      else if (totalPending > 0) statusStr = 'pending';

      window.dispatchEvent(new CustomEvent('gestor:syncStateChange', {
        detail: {
          state: statusStr,
          pendingCount: totalPending,
          outboxCount: pendingOutbox.length,
          photoCount: pendingPhotos.length
        }
      }));
    },

    triggerSync() {
      setTimeout(() => this.sync(), 600);
    }
  };

  window.addEventListener('online', () => OutboxEngine.sync());

  window.GestorOutbox = OutboxEngine;
})();
