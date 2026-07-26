// GESTOR OBRAS — DESIGN SYSTEM TEOTÔNIO VILELA & COMPONENTES SEMÂNTICOS

(function () {
  const DesignSystem = {
    // Injeta a Bottom Navbar Mobile se a tela for menor que 768px
    initMobileNav() {
      if (document.getElementById('gestor-bottom-nav')) return;

      const nav = document.createElement('nav');
      nav.id = 'gestor-bottom-nav';
      nav.className = 'bottom-nav-mobile';
      nav.setAttribute('aria-label', 'Navegação Principal Mobile');
      nav.innerHTML = `
        <button class="bottom-nav-item active" data-tab="inicio" onclick="window.navPara && window.navPara('home')">
          <span class="nav-icon">🏠</span>
          <span class="nav-label">Início</span>
        </button>
        <button class="bottom-nav-item" data-tab="rdo" onclick="window.navPara && window.navPara('rdo-list')">
          <span class="nav-icon">📋</span>
          <span class="nav-label">RDO</span>
        </button>
        <button class="bottom-nav-item" data-tab="diario" onclick="window.navPara && window.navPara('diario')">
          <span class="nav-icon">📖</span>
          <span class="nav-label">Diário</span>
        </button>
        <button class="bottom-nav-item" data-tab="pendencias" onclick="window.navPara && window.navPara('pendencias')">
          <span class="nav-icon">⚠️</span>
          <span class="nav-label">Pendências</span>
        </button>
      `;
      document.body.appendChild(nav);
    },

    // Retorna badge semântico com cor apropriada
    statusPill(text, variant = 'grn') {
      // variants: 'grn' (sucesso/verde), 'ylw' (atenção/amarelo), 'red' (perigo/vermelho), 'acc' (destaque/terracota)
      return `<span class="pill pill-${variant}">${text}</span>`;
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    DesignSystem.initMobileNav();
  });

  window.GestorDesignSystem = DesignSystem;
})();
