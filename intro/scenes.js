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
    kicker: 'SISTEMA DE CONTROLE DE OBRAS PÚBLICAS',
    h: 'Gestão Completa de Obras e Infraestrutura',
    p: 'Plataforma para acompanhamento físico e operacional de contratos públicos, conectando o canteiro de obras à gestão executiva.',
    features: [
      { icon: '📝', title: 'Diário de Obra Digital (RDO)', desc: 'Apontamento diário de serviços, efetivo por função, fotos e clima' },
      { icon: '🚜', title: 'Módulo Equipamentos', desc: 'Horímetro, consumo de combustível, manutenções e locadoras' },
      { icon: '📑', title: 'Relatórios & Exportação', desc: 'Geração automática de RDOs e boletins em PDF e Excel' }
    ],
    pos: 'center'
  },
  {
    id: 'painel', video: 'media/scene-02.mp4', label: 'Painel Executivo',
    kicker: 'INDICADORES & ENGENHARIA DE CAMPO',
    h: 'Painel Executivo e Curva S em Tempo Real',
    p: 'Monitore prazos, volumes físicos e desvios operacionais com dados sincronizados do canteiro de obras.',
    features: [
      { icon: '📈', title: 'Curva S Cronograma × Realizado', desc: 'Análise mensal de avanço acumulado e desvio físico' },
      { icon: '📐', title: 'Medição Física por Estacas', desc: 'Controle de serviços por trecho em m³, m², metros e unidades' },
      { icon: '🔍', title: 'Histórico & Rastreabilidade', desc: 'Consulta auditável por data com edição e segurança de dados' }
    ],
    pos: 'left'
  },
  {
    id: 'login', video: 'media/scene-03.mp4', label: 'Entrar',
    kicker: 'GESTOR — CONTROLE DE OBRAS',
    h: 'Entre para acompanhar e lançar',
    p: '',
    features: [],
    pos: 'login'
  }
];

