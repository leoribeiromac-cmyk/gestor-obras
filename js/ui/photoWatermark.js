// GESTOR OBRAS — MÓDULO DE MARCA D'ÁGUA TÉCNICA E AUDITÁVEL (PADRÃO ENGENHARIA CIVIL)

(function () {
  const PhotoWatermark = {
    /**
     * Aplica marca d'água técnica executiva sobre a imagem de evidência de campo.
     * Segue rigorosamente os padrões visuais de fiscalização de obras públicas e laudos técnicos.
     * @param {File|Blob|string} imageInput - Imagem em File, Blob ou base64 DataURL
     * @param {Object} metadata - { obraNome, rua, estaca, servico, dataHora, operador }
     * @returns {Promise<string>} Base64 Data URL da imagem processada com marca d'água HD
     */
    async applyWatermark(imageInput, metadata = {}) {
      return new Promise((resolve, reject) => {
        const img = new Image();

        // Evita restrição de CORS em Data URIs locais ou blobs
        if (typeof imageInput === 'string' && (imageInput.startsWith('http://') || imageInput.startsWith('https://'))) {
          img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
          try {
            // Normaliza para alta resolução de exportação (mínimo 1600px de largura para nitidez técnica)
            let width = img.width || 1600;
            let height = img.height || 1066;
            const minWidth = 1600;

            if (width < minWidth) {
              const scale = minWidth / width;
              width = minWidth;
              height = Math.round(height * scale);
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            canvas.width = width;
            canvas.height = height;

            // 1. Desenha a foto de fundo
            ctx.drawImage(img, 0, 0, width, height);

            // 2. Dimensões do Painel Rodapé Executivo (Dark Slate Navy)
            const bannerHeight = Math.max(160, Math.floor(height * 0.18));
            const bannerY = height - bannerHeight;

            // Fundo escuro fosco de alta legibilidade (#0f172a / Slate-900 com 94% de opacidade)
            ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
            ctx.fillRect(0, bannerY, width, bannerHeight);

            // Linha superior de divisão (Borda verde esmeralda #10b981)
            ctx.fillStyle = '#10b981';
            ctx.fillRect(0, bannerY, width, Math.max(4, Math.floor(bannerHeight * 0.025)));

            // 3. Grid de Alinhamento e Tipografia
            const padX = Math.max(24, Math.floor(width * 0.025));
            const rightMargin = width - padX;
            const rowHeight = Math.floor((bannerHeight - 20) / 4);

            // Helper para truncar texto com '...' se exceder a largura máxima informada
            const fitText = (text, fontStr, maxWidth) => {
              ctx.font = fontStr;
              let str = String(text || '').trim();
              if (ctx.measureText(str).width <= maxWidth) return str;
              while (str.length > 3 && ctx.measureText(str + '...').width > maxWidth) {
                str = str.slice(0, -1);
              }
              return str + '...';
            };

            // ---- LINHA 1: Nome da Obra (Esquerda) e Selo de Evidência (Direita) ----
            let y1 = bannerY + Math.floor(rowHeight * 0.95);

            // Selo Direita (LARGURA FIXA RESERVADA)
            const badgeStr = 'GESTOR OBRAS | EVIDÊNCIA OFICIAL';
            const fontBadge = `bold ${Math.max(13, Math.floor(rowHeight * 0.42))}px "Arial", sans-serif`;
            ctx.font = fontBadge;
            const badgeWidth = ctx.measureText(badgeStr).width;
            const maxObraWidth = width - (padX * 3) - badgeWidth;

            // Obra Esquerda
            const fontObra = `bold ${Math.max(16, Math.floor(rowHeight * 0.55))}px "Arial", sans-serif`;
            const obraTxt = fitText(`OBRA: ${(metadata.obraNome || 'GESTOR ENGENHARIA').toUpperCase()}`, fontObra, maxObraWidth);
            ctx.fillStyle = '#ffffff';
            ctx.font = fontObra;
            ctx.fillText(obraTxt, padX, y1);

            // Desenha o Selo Direita em Verde Esmeralda
            ctx.fillStyle = '#34d399';
            ctx.font = fontBadge;
            ctx.fillText(badgeStr, rightMargin - badgeWidth, y1);

            // Divisor sutil entre Linha 1 e Linha 2
            let divY1 = bannerY + Math.floor(rowHeight * 1.25);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(padX, divY1, width - (padX * 2), 1);

            // ---- LINHA 2: Rua / Localização & Estaca ----
            let y2 = bannerY + Math.floor(rowHeight * 2.15);
            const fontLocal = `bold ${Math.max(15, Math.floor(rowHeight * 0.48))}px "Arial", sans-serif`;
            
            const ruaTxt = `LOCAL: ${metadata.rua || 'Geral'}`;
            const estacaTxt = metadata.estaca ? `  |  ESTACA: ${metadata.estaca}` : '';
            const localFull = fitText(ruaTxt + estacaTxt, fontLocal, width - (padX * 2));

            ctx.fillStyle = '#38bdf8'; // Azul Sky-400
            ctx.font = fontLocal;
            ctx.fillText(localFull, padX, y2);

            // ---- LINHA 3: Serviço Técnico Executado ----
            let y3 = bannerY + Math.floor(rowHeight * 3.10);
            const fontServico = `${Math.max(14, Math.floor(rowHeight * 0.45))}px "Arial", sans-serif`;
            const servicoTxt = fitText(`SERVIÇO: ${metadata.servico || 'Execução Físico-Operacional'}`, fontServico, width - (padX * 2));

            ctx.fillStyle = '#fef08a'; // Amarelo Muted / Yellow-200
            ctx.font = fontServico;
            ctx.fillText(servicoTxt, padX, y3);

            // ---- LINHA 4: Data / Hora e Responsável Técnico ----
            let y4 = bannerY + Math.floor(rowHeight * 3.95);
            const fontFooter = `${Math.max(12, Math.floor(rowHeight * 0.38))}px "Courier New", monospace`;
            
            const dataHoraStr = metadata.dataHora || new Date().toLocaleDateString('pt-BR');
            const respStr = metadata.operador ? `   |   RESPONSÁVEL: ${metadata.operador}` : '';
            const footerTxt = fitText(`DATA: ${dataHoraStr}${respStr}`, fontFooter, width - (padX * 2));

            ctx.fillStyle = '#94a3b8'; // Cinza Slate-400
            ctx.font = fontFooter;
            ctx.fillText(footerTxt, padX, y4);

            // Retorna Base64 da imagem final com padrão executivo
            resolve(canvas.toDataURL('image/jpeg', 0.92));
          } catch (e) {
            console.error('Erro ao renderizar marca d\'água executiva:', e);
            reject(e);
          }
        };

        img.onerror = (err) => {
          console.error('Erro ao carregar foto para marca d\'água:', err);
          reject(err);
        };

        if (typeof imageInput === 'string') {
          img.src = imageInput;
        } else if (imageInput instanceof File || imageInput instanceof Blob) {
          const reader = new FileReader();
          reader.onload = (e) => { img.src = e.target.result; };
          reader.readAsDataURL(imageInput);
        } else {
          reject(new Error('Formato de imagem inválido'));
        }
      });
    }
  };

  window.PhotoWatermark = PhotoWatermark;
})();
