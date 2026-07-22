/* ============================================================
   Abertura cinematográfica — ROTEIRO (3 cenas reais, geradas no
   Higgsfield/Cinema Studio 3.0 a partir de uma única imagem-mestre,
   em cadeia de continuidade — cada vídeo começa no último quadro
   real do anterior). Os textos usam a nomenclatura real do sistema
   (NAV/TITULOS do index.html). Os arquivos ficam em intro/media/.
   ============================================================ */
window.INTRO_SCENES = [
  {
    id: 'obra', video: 'media/scene-01.mp4', label: 'A obra',
    kicker: 'GESTOR ENGENHARIA',
    h: 'Gestor — Controle de Obras',
    p: 'Acompanhamento físico de obras públicas: painel executivo, serviços, RDO de campo, diário de obra, medição física e histórico.',
    chips: [],
    pos: 'center'
  },
  {
    id: 'painel', video: 'media/scene-02.mp4', label: 'Painel Executivo',
    kicker: 'ANÁLISE',
    h: 'Painel Executivo',
    p: 'Avanço físico médio, prazo decorrido, desvio contra o previsto e a Curva S — cronograma × realizado, mês a mês.',
    chips: [],
    pos: 'left'
  },
  {
    id: 'login', video: 'media/scene-03.mp4', label: 'Entrar',
    kicker: 'GESTOR — CONTROLE DE OBRAS',
    h: 'Entre para acompanhar e lançar',
    p: '',
    chips: [],
    pos: 'login'
  }
];
