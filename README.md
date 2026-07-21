# Gestor — Controle de Obras

Sistema **único e multi-obra** da Gestor Engenharia para acompanhamento **físico** de obras
públicas (SIURB/PMSP): painel executivo, serviços, RDO de campo, **diário de obra**, medição
física e histórico.
O acompanhamento é por **serviço físico** (quantidade × unidade) e **percentual de avanço** —
**sem valores em R$** e **sem itens indiretos** (transporte, taxas, ensaios, mão de obra de
projeto, locações etc. ficam de fora).

É um app **100% estático** (um `index.html` + arquivos de dados). Não precisa de servidor,
banco de dados nem build. Os lançamentos de campo (RDO) ficam salvos no **`localStorage` do
navegador** — ou seja, **por dispositivo** (não sincroniza entre celulares).

Primeira obra cadastrada: **119 — Ruas de Terra** (Agrimensor Sugaya + Astrogildo Pereira,
Ata 079/SMSUB/COGEL).

---

## Estrutura

```
gestor-obras/
  index.html            App completo (telas + lógica)
  dados/
    _index.js           Lista/ordem das obras exibidas
    ruas-de-terra.js    Dados da obra 119 (identidade + frentes + serviços + cronograma)
  assets/               Logo, favicon e ícones
  projetos/             PDFs de projeto por rua (pavimentação, drenagem, terraplenagem)
  vendor/pdfjs/         PDF.js (Mozilla) vendorizado — renderiza os projetos offline
  manifest.json, sw.js  PWA (instalável no celular, com projetos em cache offline)
```

## Rodar localmente

O app usa `<script src>` para carregar os dados, então **não abra o `index.html` por duplo
clique** (o navegador bloqueia por `file://`). Sirva a pasta:

```bash
# dentro da pasta gestor-obras
python -m http.server 8080
# abra http://localhost:8080
```

## Publicar no GitHub Pages

1. Crie um repositório novo (ex.: `gestor-obras`) na sua conta.
2. Suba os arquivos desta pasta:
   ```bash
   cd gestor-obras
   git init
   git add .
   git commit -m "Gestor Obras: sistema multi-obra + obra Ruas de Terra"
   git branch -M main
   git remote add origin https://github.com/<seu-usuario>/gestor-obras.git
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Source: `main` / root** → Save.
4. Em ~1 min o site fica em `https://<seu-usuario>.github.io/gestor-obras/`.

## Como adicionar uma nova obra

1. Crie `dados/<id-da-obra>.js` no mesmo formato do `ruas-de-terra.js`:
   ```js
   window.OBRAS = window.OBRAS || {};
   window.OBRAS["<id-da-obra>"] = {
     id:'<id-da-obra>', nome:'…', contrato:'…', contratada:'Gestor Engenharia',
     local:'…', prazoMeses: 0, inicioISO:'AAAA-MM-DD',
     ruas:['…'],                                   // ou trechos/lotes da obra
     frentes:[ {id:1, nome:'…'}, … ],              // capítulos/frentes de serviço
     cronograma:[ {frenteId:1, pctMes:[0,0,0,0,0,0]}, … ],  // % previsto por mês (soma 100 por frente)
     servicos:[ {rua:'…', capId:1, servico:'BGS', un:'M3', qtdPrev:0}, … ]  // serviços físicos, sem R$
   };
   ```
2. Inclua o script no `index.html`, junto dos outros:
   ```html
   <script src="dados/<id-da-obra>.js"></script>
   ```
3. Adicione o id em `dados/_index.js` (define a ordem dos cards).

### Obra externa (encaminha para outro sistema)

Para uma obra que tem o **próprio sistema em outro endereço** (ex.: a Teotônio Vilela),
cadastre-a como externa — o card no painel apenas encaminha para a URL ao ser clicado:

```js
window.OBRAS["<id>"] = {
  id:'<id>', externo:true, url:'https://<seu-usuario>.github.io/<outro-repo>/',
  nome:'…', contrato:'…', local:'…', valorGlobal: 0   // valorGlobal é opcional
};
```

Já vem cadastrada assim a obra **Teotônio Vilela** (`dados/teotonio-vilela.js`), que abre o
repositório `teotonio-vilela` em nova aba.

> Dica: os dados da obra 119 foram gerados automaticamente a partir das planilhas
> orçamentárias e do cronograma físico-financeiro. Para novas obras, dá para repetir o
> mesmo processo de extração.

## Backend opcional (Google Sheets) — como a Teotônio

O app funciona local (dados no navegador) por padrão. Para **sincronizar RDOs e lançamentos
entre vários celulares via Google Sheets** (leitura por CSV publicado, gravação por Apps
Script/JSONP com fila offline e login por usuário), há o backend pronto:
- `Code.gs` — cole no Apps Script da planilha.
- `SETUP-BACKEND.md` — passo a passo para montar a planilha, publicar os CSVs, fazer o deploy
  e colar as 3 URLs no `CONFIG` do `index.html`.

Enquanto o `CONFIG.appsScript` estiver vazio, o backend fica desligado e nada muda.

## O que fica para uma próxima versão

- Análise com IA (Gemini).
- Exportação de RDO/medição em PDF no modelo oficial.

## Observações técnicas

- **Sem valores (R$) no acompanhamento físico.** Cada serviço tem quantidade prevista e
  unidade; o campo lança a quantidade executada e o sistema calcula o **% de avanço** por
  serviço, por frente e por rua. O **valor total do contrato** aparece apenas como
  informação no painel de obras (home).
- **Serviço avulso ("Outro").** No RDO, a frente "➕ Outro serviço (avulso)" permite lançar um
  serviço descrito livremente (não previsto). Ele fica registrado no histórico, mas **não conta
  no avanço nem na medição física** — igual aos serviços "OUTRO" do sistema Teotônio.
- **Projetos.** Aba que lista os desenhos de projeto por rua (pavimentação, drenagem,
  terraplenagem) e os **renderiza embutidos com PDF.js** (Mozilla, vendorizado em
  `vendor/pdfjs/`) — funciona em **qualquer navegador/dispositivo e offline**, sem depender
  do leitor de PDF do sistema. Tem **zoom** (reduzir / ampliar / ajustar à largura, 40%–400%,
  com scroll ao ampliar) e botões de abrir em nova aba e baixar. Os arquivos ficam em
  `projetos/<rua>/` e são registrados em `projetos` no arquivo da obra (o gerador copia e
  cataloga automaticamente; Memória de cálculo e Orçamento ficam de fora).
- **Diário de Obra (RDO interno).** Tela própria, um diário por data, com **mão de obra**
  (função × quantidade), **equipamentos**, clima por período (manhã/tarde), condição do dia,
  ocorrências e a lista de **serviços lançados no dia** (puxada automaticamente do Campo/RDO).
  Botão **🖨 Imprimir RDO** gera um relatório A4 formatado (com logo, efetivo, equipamentos,
  serviços e assinaturas) pronto para PDF/impressão. Guardado em `gestor:diario:<obraId>`.
- **Painel Executivo — visual.** Além dos KPIs e da curva S, traz **duas animações de rua**
  (o asfalto avança sobre a rua de terra conforme o % físico de cada rua, com faixa e trator
  em movimento) e um **mapa de avanço por estaca** (heatmap por estaca/rua montado a partir dos
  trechos lançados no RDO), com **filtros por frente/serviço e por mês**.
- **Avanço físico médio** = média simples dos % dos serviços (índice físico não-ponderado,
  já que serviços têm unidades diferentes — m², m³, ml, un). É um indicador de progresso, não
  uma medição contratual.
- **Curva S**: o previsto vem do **percentual mensal do cronograma** (não de R$); o realizado
  é o % médio acumulado dos apontamentos.
- **Itens indiretos removidos** na curadoria (transporte, taxas de destinação, ensaios de
  laboratório, mão de obra de projeto, locações, placa, vistoria, sondagem etc.). Ajuste livre:
  edite/adicione serviços em `servicos` no arquivo da obra.
- A **data de início** (`inicioISO`) da obra 119 está provisória; ajuste para a data real da
  ordem de serviço em `dados/ruas-de-terra.js`.
