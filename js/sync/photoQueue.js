// GESTOR OBRAS — GERENCIADOR DE FILA OFFLINE DE FOTOS & CARREGADOR PRIVADO

(function () {
  const PhotoQueue = {
    // Adiciona uma foto à fila offline com status "pendente"
    async enqueuePhoto(rdoId, obra, fotoBase64, index = 0) {
      const id = `photo_${rdoId}_${index}_${Date.now()}`;
      const item = {
        id,
        rdoId,
        obra,
        idx: index,
        foto: fotoBase64,
        status: 'pendente',
        tentativas: 0,
        ultimoErro: null,
        timestamp: Date.now()
      };
      await window.GestorDB.putItem('photos', item);
      this.triggerSync();
      return item;
    },

    // Retorna todas as fotos pendentes
    async getPendingPhotos() {
      const all = await window.GestorDB.getAll('photos');
      return all.filter(p => p.status === 'pendente' || p.status === 'erro');
    },

    // Processa a fila de envio de fotos
    async processQueue() {
      if (!navigator.onLine) return;
      const pending = await this.getPendingPhotos();
      if (!pending.length) return;

      const token = window.GestorAuth ? window.GestorAuth.getToken() : '';
      const endpoint = window.CONFIG ? window.CONFIG.appsScript : '';

      for (const item of pending) {
        item.status = 'enviando';
        await window.GestorDB.putItem('photos', item);
        try {
          const payload = new URLSearchParams({
            action: 'rdoFoto',
            id: item.rdoId,
            obra: item.obra,
            idx: item.idx,
            foto: item.foto,
            token: token
          });

          const resp = await fetch(endpoint, {
            method: 'POST',
            body: payload
          });

          const res = await resp.json();
          if (res && res.ok) {
            item.status = 'enviado';
            item.url = res.url || '';
            await window.GestorDB.putItem('photos', item);
            window.dispatchEvent(new CustomEvent('gestor:photoSent', { detail: item }));
          } else {
            item.status = 'erro';
            item.tentativas = (item.tentativas || 0) + 1;
            item.ultimoErro = res ? res.error : 'Erro desconhecido';
            await window.GestorDB.putItem('photos', item);
          }
        } catch (err) {
          item.status = 'erro';
          item.tentativas = (item.tentativas || 0) + 1;
          item.ultimoErro = err.message;
          await window.GestorDB.putItem('photos', item);
        }
      }

      window.dispatchEvent(new CustomEvent('gestor:photoQueueUpdated'));
    },

    triggerSync() {
      setTimeout(() => this.processQueue(), 500);
    },

    // Carrega foto privada via endpoint de proxy com token
    async fetchPrivatePhoto(fileIdOrUrl) {
      if (!fileIdOrUrl) return '';
      // Se não for drive_id, retorna a URL diretamente
      if (!fileIdOrUrl.startsWith('drive_id:')) return fileIdOrUrl;

      const fileId = fileIdOrUrl.replace('drive_id:', '').trim();
      const token = window.GestorAuth ? window.GestorAuth.getToken() : '';
      const endpoint = window.CONFIG ? window.CONFIG.appsScript : '';

      try {
        const resp = await fetch(`${endpoint}?action=obterFoto&fileId=${fileId}&token=${token}`);
        const res = await resp.json();
        if (res && res.ok && res.dataUri) {
          return res.dataUri;
        }
      } catch (e) {}
      return '';
    }
  };

  // Processa automaticamente quando a rede voltar
  window.addEventListener('online', () => PhotoQueue.processQueue());

  window.GestorPhotoQueue = PhotoQueue;
})();
