// GESTOR OBRAS — MÓDULO DE GALERIA FOTOGRÁFICA E COMPARATIVO ANTES/DEPOIS

(function () {
  const PhotoGalleryScreen = {
    fotoAntes: null,
    fotoDepois: null,

    // Retorna o ID da obra ativa de forma resiliente
    getObraIdAtiva() {
      if (typeof estado !== 'undefined' && estado && estado.obraId) return estado.obraId;
      if (window.estado && window.estado.obraId) return window.estado.obraId;
      if (window.OBRAS) {
        const ids = Object.keys(window.OBRAS);
        for (const id of ids) {
          if (typeof getLanc === 'function' && getLanc(id).length) return id;
        }
        return ids[0];
      }
      return null;
    },

    // Extrai todas as fotos dos lançamentos da obra ativa
    getTodasFotos(obraId) {
      const idFinal = obraId || this.getObraIdAtiva();
      if (!idFinal || typeof getLanc !== 'function') return [];
      
      const lancs = getLanc(idFinal) || [];
      const fotosList = [];

      lancs.forEach(l => {
        if (l.fotos && Array.isArray(l.fotos)) {
          l.fotos.forEach((f, idx) => {
            const url = f.url || f.thumb || (typeof f === 'string' ? f : '');
            if (url) {
              fotosList.push({
                id: `foto_${l.id}_${idx}`,
                lancId: l.id,
                rua: l.rua || 'Geral',
                estaca: typeof estacaTxt === 'function' ? estacaTxt(l) : (l.estIni ? `${l.estIni} a ${l.estFim}` : ''),
                servico: l.servico || 'Execução Físico-Operacional',
                dataISO: l.dataISO || new Date().toISOString().slice(0, 10),
                url,
                criadoEm: l.criadoEm || Date.now()
              });
            }
          });
        }
      });

      return fotosList.sort((a, b) => b.dataISO.localeCompare(a.dataISO));
    },

    // Renderiza a tela principal da Galeria
    render(obra) {
      const o = obra || (window.OBRAS ? window.OBRAS[this.getObraIdAtiva()] : null);
      if (!o) return '<div class="empty">Selecione uma obra para visualizar o acervo fotográfico.</div>';

      const fotos = this.getTodasFotos(o.id);
      const ruas = o.ruas || [];

      return `
        <div style="display:flex;flex-direction:column;gap:20px;">
          <!-- Topo da Galeria com Ações -->
          <div class="card" style="padding:18px 22px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
              <div>
                <h2 style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;">
                  ${typeof icon === 'function' ? icon('galeria', 22, 'var(--accent)') : ''} Galeria de Evidências & Antes x Depois
                </h2>
                <p style="font-size:12.5px;color:var(--muted);margin-top:2px;">
                  Acervo fotográfico georreferenciado e auditável da obra <strong>${o.nome}</strong>.
                </p>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn" style="display:inline-flex;align-items:center;gap:6px;" onclick="GestorPhotoGallery.abrirModalAntesDepois('${o.id}')">
                  ${typeof icon === 'function' ? icon('compare', 16) : ''} Comparador Antes x Depois
                </button>
              </div>
            </div>

            <!-- Filtros de busca -->
            <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;align-items:center;">
              <div style="flex:1;min-width:180px;display:flex;align-items:center;gap:8px;">
                ${typeof icon === 'function' ? icon('filter', 16, 'var(--muted)') : ''}
                <select id="galeriaFiltroRua" onchange="GestorPhotoGallery.filtrarGrid('${o.id}')" style="padding:8px 12px;font-size:13px;flex:1;">
                  <option value="">Todas as Ruas (${ruas.length})</option>
                  ${ruas.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
              </div>
              <div style="font-size:12.5px;color:var(--muted);margin-left:auto;">
                Total de fotos: <strong id="galeriaTotalFotos">${fotos.length}</strong>
              </div>
            </div>
          </div>

          <!-- Grid de fotos -->
          <div id="galeriaGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(270px, 1fr));gap:16px;">
            ${this.renderGridFotos(fotos)}
          </div>
        </div>
      `;
    },

    renderGridFotos(fotos) {
      if (!fotos || !fotos.length) {
        return `
          <div class="empty" style="grid-column:1/-1;padding:50px 20px;">
            <div class="ic">${typeof icon === 'function' ? icon('camera', 36, 'var(--muted)') : '📷'}</div>
            <p style="font-weight:600;font-size:15px;margin-top:8px;">Nenhuma foto anexada aos lançamentos de RDO desta obra ainda.</p>
            <p style="font-size:12.5px;color:var(--muted);margin-top:4px;">
              Anexe fotos ao cadastrar um serviço em <strong>"Lançar serviços"</strong> para formar o acervo.
            </p>
          </div>
        `;
      }

      return fotos.map(f => `
        <div class="card" style="overflow:hidden;display:flex;flex-direction:column;transition:transform .2s;" onmouseenter="this.style.transform='translateY(-3px)'" onmouseleave="this.style.transform='none'">
          <div style="position:relative;height:170px;background:#14120e;cursor:pointer;" onclick="GestorPhotoGallery.ampliarFoto('${f.id}')">
            <img src="${f.url}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
            <span class="pill pill-grn" style="position:absolute;top:10px;left:10px;box-shadow:0 2px 8px rgba(0,0,0,.4);display:inline-flex;align-items:center;gap:4px;">
              ${typeof icon === 'function' ? icon('mapPin', 13, '#ffffff') : ''} ${f.rua} ${f.estaca ? '• ' + f.estaca : ''}
            </span>
          </div>
          <div style="padding:12px 14px;display:flex;flex-direction:column;gap:6px;background:var(--surface);">
            <div style="font-size:13px;font-weight:700;color:var(--text);">${f.servico}</div>
            <div style="font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="display:inline-flex;align-items:center;gap:4px;">
                ${typeof icon === 'function' ? icon('calendar', 13, 'var(--muted)') : ''} ${f.dataISO}
              </span>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-sm btn-ghost" style="padding:3px 8px;display:inline-flex;align-items:center;gap:4px;" onclick="GestorPhotoGallery.baixarFotoPorId('${f.id}')" title="Baixar foto com marca d'água técnica">
                  ${typeof icon === 'function' ? icon('download', 14) : ''} Baixar
                </button>
                <button class="btn btn-sm btn-ghost" style="padding:3px 8px;display:inline-flex;align-items:center;gap:4px;" onclick="GestorPhotoGallery.selecionarParaComparativo('${f.id}', '${f.url}', '${f.rua}')">
                  ${typeof icon === 'function' ? icon('compare', 14) : ''} Antes/Depois
                </button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    },

    // Filtra grid dinamicamente
    filtrarGrid(obraId) {
      const idFinal = obraId || this.getObraIdAtiva();
      const ruaSel = (document.getElementById('galeriaFiltroRua')?.value || '').trim();
      let fotos = this.getTodasFotos(idFinal);

      if (ruaSel) {
        fotos = fotos.filter(f => f.rua === ruaSel);
      }

      const gridEl = document.getElementById('galeriaGrid');
      const totalEl = document.getElementById('galeriaTotalFotos');

      if (gridEl) gridEl.innerHTML = this.renderGridFotos(fotos);
      if (totalEl) totalEl.textContent = fotos.length;
    },

    // Baixa foto obrigatoriamente com a marca d'água HD técnica
    async baixarFotoPorId(fotoId) {
      const obraId = this.getObraIdAtiva();
      const fotos = this.getTodasFotos(obraId);
      let f = fotos.find(item => item.id === fotoId);

      if (!f && window.OBRAS) {
        Object.keys(window.OBRAS).forEach(id => {
          const list = this.getTodasFotos(id);
          const found = list.find(item => item.id === fotoId);
          if (found) f = found;
        });
      }

      if (!f) {
        if (typeof toast === 'function') toast('Foto não encontrada para download.');
        return;
      }

      const obra = window.OBRAS ? window.OBRAS[obraId] : null;

      try {
        if (typeof toast === 'function') toast('⏳ Estampando marca d\'água técnica (Obra, Rua, Estaca, Serviço)...');

        const metadata = {
          obraNome: obra ? obra.nome : 'GESTOR ENGENHARIA',
          rua: f.rua || 'Geral',
          estaca: f.estaca || '',
          servico: f.servico || 'Execução Físico-Operacional',
          dataHora: f.dataISO || new Date().toLocaleDateString('pt-BR'),
          operador: (typeof usuarioAtual === 'function' && usuarioAtual() ? usuarioAtual() : (window.GestorAuth && window.GestorAuth.getSession() ? window.GestorAuth.getSession().usuario : 'Engenheiro de Campo'))
        };

        const watermarkedUrl = await window.PhotoWatermark.applyWatermark(f.url, metadata);

        const a = document.createElement('a');
        a.href = watermarkedUrl;
        const nomeArquivo = `evidencia_${(f.rua || 'obra').replace(/\s+/g, '_')}_${(f.estaca || '').replace(/\s+/g, '_')}_${Date.now()}.jpg`;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (typeof toast === 'function') toast('Foto com marca d\'água baixada com sucesso! ✓');
      } catch (err) {
        console.error('Erro ao aplicar marca d\'água na foto:', err);
        alert('Falha ao gerar marca d\'água na imagem: ' + err.message);
      }
    },

    // Amplia foto em modal com botão de download por ID e fechamento garantido
    ampliarFoto(fotoId) {
      const obraId = this.getObraIdAtiva();
      const fotos = this.getTodasFotos(obraId);
      let f = fotos.find(item => item.id === fotoId);

      if (!f && window.OBRAS) {
        Object.keys(window.OBRAS).forEach(id => {
          const list = this.getTodasFotos(id);
          const found = list.find(item => item.id === fotoId);
          if (found) f = found;
        });
      }

      if (!f) return;

      if (typeof fecharModal === 'function') fecharModal();

      const html = `
        <div class="modal-bg" onclick="fecharModal()">
          <div class="modal" style="max-width:850px;background:#0d0b08;color:#fff;" onclick="event.stopPropagation()">
            <div class="modal-h" style="background:#14120e;border-color:rgba(255,255,255,.1);">
              <div>
                <strong style="color:#fff;display:inline-flex;align-items:center;gap:6px;">
                  ${typeof icon === 'function' ? icon('mapPin', 16, '#38bdf8') : ''} ${f.rua} ${f.estaca ? '• ' + f.estaca : ''}
                </strong>
                <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:2px;">${f.servico} — ${f.dataISO}</div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-sm btn-pri" style="display:inline-flex;align-items:center;gap:6px;" onclick="GestorPhotoGallery.baixarFotoPorId('${f.id}')">
                  ${typeof icon === 'function' ? icon('download', 15) : ''} Baixar Foto (Com Marca d'Água)
                </button>
                <button class="btn btn-sm btn-ghost" style="color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="fecharModal()">
                  ${typeof icon === 'function' ? icon('close', 14) : '✕'} Fechar
                </button>
              </div>
            </div>
            <div style="padding:16px;text-align:center;">
              <img src="${f.url}" style="max-width:100%;max-height:75vh;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.6);">
            </div>
          </div>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.id = 'modalContainer';
      wrap.innerHTML = html;
      document.body.appendChild(wrap);
    },

    // Seleciona foto para o comparador Antes x Depois
    selecionarParaComparativo(id, url, rua) {
      if (!this.fotoAntes) {
        this.fotoAntes = { id, url, rua };
        if (typeof toast === 'function') toast('Foto ANTES selecionada ✓. Agora selecione a foto DEPOIS.');
      } else {
        this.fotoDepois = { id, url, rua };
        if (typeof toast === 'function') toast('Foto DEPOIS selecionada ✓. Abrindo comparador!');
        this.abrirModalAntesDepois(this.getObraIdAtiva());
      }
    },

    // Modal interativo Antes x Depois com slider comparativo
    abrirModalAntesDepois(obraId) {
      const idFinal = obraId || this.getObraIdAtiva();
      const fotos = this.getTodasFotos(idFinal);
      if (fotos.length < 2 && (!this.fotoAntes || !this.fotoDepois)) {
        alert('É necessário ter pelo menos 2 fotos cadastradas na obra para usar o comparador Antes x Depois.');
        return;
      }

      const imgA = this.fotoAntes?.url || fotos[fotos.length - 1]?.url || '';
      const imgB = this.fotoDepois?.url || fotos[0]?.url || '';

      const html = `
        <div class="modal-bg" onclick="fecharModal()">
          <div class="modal" style="max-width:900px;background:#14120e;color:#fff;" onclick="event.stopPropagation()">
            <div class="modal-h" style="background:#1c1813;border-color:rgba(255,255,255,.1);">
              <div>
                <strong style="color:#fff;display:inline-flex;align-items:center;gap:6px;">
                  ${typeof icon === 'function' ? icon('compare', 18, 'var(--accent)') : ''} Comparador de Evolução Física (Antes x Depois)
                </strong>
                <div style="font-size:12px;color:rgba(255,255,255,.6);">Arraste o divisor central para visualizar a transformação da via</div>
              </div>
              <button class="btn btn-sm btn-ghost" style="color:#fff;cursor:pointer;" onclick="fecharModal()">✕ Fechar</button>
            </div>
            
            <div style="padding:20px;">
              <!-- Container do Slider Comparativo -->
              <div id="beforeAfterSliderContainer" style="position:relative;width:100%;height:440px;overflow:hidden;border-radius:12px;border:1px solid rgba(255,255,255,.15);user-select:none;">
                <!-- Imagem DEPOIS (Fundo) -->
                <img src="${imgB}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;">
                <span class="pill pill-grn" style="position:absolute;top:14px;right:14px;z-index:2;box-shadow:0 4px 12px rgba(0,0,0,.5);">DEPOIS (EXECUTADO)</span>

                <!-- Imagem ANTES (Sobreposição cortada) -->
                <div id="beforeImageWrapper" style="position:absolute;top:0;left:0;width:50%;height:100%;overflow:hidden;border-right:3px solid #3fae74;box-shadow:4px 0 15px rgba(0,0,0,.4);">
                  <img src="${imgA}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;">
                  <span class="pill pill-acc" style="position:absolute;top:14px;left:14px;z-index:2;box-shadow:0 4px 12px rgba(0,0,0,.5);">ANTES (TERRA)</span>
                </div>

                <!-- Input Range de Controle -->
                <input type="range" min="0" max="100" value="50" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:ew-resize;z-index:10;" oninput="document.getElementById('beforeImageWrapper').style.width=this.value+'%'">
              </div>

              <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:12.5px;color:rgba(255,255,255,.7);">
                <span>⬅️ Clique e arraste para a esquerda/direita</span>
                <button class="btn btn-sm btn-ghost" style="color:var(--accent-2);" onclick="GestorPhotoGallery.fotoAntes=null;GestorPhotoGallery.fotoDepois=null;fecharModal();">
                  Resetar seleção de fotos
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      const wrap = document.createElement('div');
      wrap.id = 'modalContainer';
      wrap.innerHTML = html;
      document.body.appendChild(wrap);
    }
  };

  window.GestorPhotoGallery = PhotoGalleryScreen;
})();
