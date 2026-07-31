# Gestor — Controle de Obras

Sistema **único e multi-obra** da Gestor Engenharia para acompanhamento **físico** de obras
públicas (SIURB/PMSP): painel executivo, serviços, RDO de campo, **diário de obra**, medição
física, **controle de notas fiscais de material** e histórico.
O acompanhamento é por **serviço físico** (quantidade × unidade) e **percentual de avanço** —
**sem valores em R$** e **sem itens indiretos** (transporte, taxas, ensaios, mão de obra de
projeto, locações etc. ficam de fora).

É um app **100% estático** (um `index.html` + arquivos de dados). Não precisa de servidor,
banco de dados nem build. Os lançamentos de campo (RDO) ficam salvos no **`localStorage` do
navegador** — ou seja, **por dispositivo** (não sincroniza entre celulares).

Obras cadastradas: **119 — Ruas de Terra** (Agrimensor Sugaya + Astrogildo Pereira,
Ata 079/SMSUB/COGEL) e **Ranário — Estrada Vicinal SQE-479** (contrato 22.926-0, DER-SP),
esta última já com as quantidades do aditivo/supressão.

---

## Estrutura

```
gestor-obras/
  index.html            App completo (telas + lógica)
  js/nf/notas.js        Módulo de Notas Fiscais (DANFE): leitura, estoque, painel
  dados/
    _index.js           Lista/ordem das obras exibidas
    ruas-de-terra.js    Dados da obra 119 (identidade + frentes + serviços + cronograma)
    ranario.js          Dados da obra Ranário / DER 22.926-0 (pós aditivo)
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

## RDO em PDF e turnos

O RDO agora sai em **PDF de arquivo** (jsPDF vendorizado em `vendor/jspdf/`,
não CDN — o app roda offline), além do Excel e do modelo de impressão que já
existiam. A impressão do navegador serve no escritório; no celular do canteiro
ela pede impressora e abre pop-up. O PDF sai pronto para anexar em e-mail ou
WhatsApp. No **Histórico** dá para escolher o período e gerar **um PDF por
dia** do mês inteiro, que é o que a fiscalização pede na entrega da medição.

Cada linha de **efetivo**, de **equipamento** e cada **lançamento de serviço**
tem **turno (diurno/noturno)** — obra urbana vira a noite para não fechar via
de dia, e o RDO precisa separar o que foi feito em cada turno. O PDF traz uma
tabela de serviços por turno (a do noturno só aparece se houver), e a faixa de
resumo mostra o efetivo no formato `8 + 3 not.`. No Excel o turno vai junto do
nome, para não quebrar as mesclagens do modelo.

## Planejamento reverso

Aba **Análise ▸ Planejamento reverso**. A curva S diz se a obra está atrasada;
ela não diz o que fazer na segunda-feira. Esta tela parte do **fim do contrato**
e volta no calendário: com o ritmo que cada serviço tem, **quando ele precisa
começar** para ainda terminar no prazo.

O ritmo (unid/dia útil) vem, nesta ordem: do campo `produtividade` do serviço,
quando declarado no arquivo da obra; senão, do **observado nos lançamentos**
(executado ÷ dias com apontamento, marcado como *obs.* na tabela); sem nenhum
dos dois, o serviço aparece como **sem ritmo** — não se inventa número para
serviço que nunca foi medido.

Cada linha traz saldo, dias necessários, data-limite de início, folga em dias
úteis e a situação (atrasado · crítico, folga ≤ 10 dias úteis · no prazo ·
concluído). Para o que já passou da data, mostra o **ritmo necessário** para
ainda fechar no prazo. Dias úteis são de segunda a sexta — feriado não entra,
então a folga sai um pouco otimista.

## Clima automático e backup (backend)

No editor do Apps Script, rode **`configurarGatilhos()`** uma vez. Isso agenda:

- **`backupDiario`** (02h) — cópia da planilha na pasta "Backups Gestor Obras"
  do Drive, mantendo as 14 mais recentes.
- **`registrarClimaAuto`** (05h) — chuva de ontem pela **Open-Meteo** (grátis,
  sem chave) gravada na aba `Diario`, colunas `chuvaAuto` e `climaFonte`
  (criadas sozinhas). É a contraprova objetiva do clima apontado no RDO — base
  de pleito de prorrogação por dia improdutivo, que só se sustenta com dado de
  fonte independente. Não havendo diário na data, a linha é criada só com data e
  chuva, para o dia ficar documentado.

Como o app é multi-obra, as coordenadas ficam na propriedade do script
**`COORDENADAS`**, uma entrada por obra — obra sem coordenada é pulada:

```json
{"ruas-de-terra": {"lat": -23.53, "lon": -46.45}}
```

## Apoio à Medição (item contratual)

Aba **Análise ▸ Apoio à Medição**. O campo aponta o serviço como ele existe na
obra ("BGS", "binder", "guia"); a medição é paga por **item do contrato**, que
quase nunca é 1:1 com o serviço apontado. A ponte é a **matriz de
coeficientes**, declarada no arquivo da obra:

```js
coeficientes: [
  { servico:'BINDER', item:'04.20.05', descricao:'Concreto asfáltico binder',
    unItem:'T',  coef:1.0 },
  { servico:'BINDER', item:'04.20.11', descricao:'Pintura de ligação',
    unItem:'M2', coef:11.5 }   // 11,5 m² de pintura por tonelada de binder
]
```

`consumo do item = quantidade executada do serviço × coef`. O nome em `servico`
casa com o dos serviços da obra (maiúsculas/minúsculas não importam), e um mesmo
serviço pode alimentar vários itens. Filtra-se o mês e exporta-se o **CSV de
conferência** (separador `;`, decimal com vírgula) para confrontar com a coluna
do mês da Planilha Geral.

É **prévia de conferência, não medição oficial**. Serviço avulso fica de fora —
não tem item contratual. Sem matriz declarada, a aba mostra o formato a usar.

## Analista IA (Gemini)

Aba **Análise ▸ Analista IA**. Gera resumo executivo, projeção de prazo,
gargalos e comparativo entre frentes a partir do que já foi lançado.

A chave é **do próprio usuário** (grátis em `aistudio.google.com/app/apikey`),
fica guardada só no navegador dele e vai direto para o Google — o app não
intermedia nem guarda no servidor. Sem chave configurada, a aba explica como
obter uma.

O que é enviado é o **resumo já calculado** da obra (percentual por frente
contra o cronograma, saldo por serviço, produção do período, projeção de
término), não a base inteira: contexto menor responde melhor, e nada de valores
em R$ ou dados pessoais sai daqui. A resposta vem em HTML e é estilizada pelo
app. Acesso: engenharia, diretoria e administrador.

## O que fica para uma próxima versão

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
- **No celular.** É onde o apontador usa o app, de pé, no sol, com uma mão. Barra
  inferior com as quatro telas do dia ao alcance do polegar, tabela vira cartão (não
  se rola de lado em nenhuma tela), alvo de toque de 44px, campo com 16px (evita o
  zoom automático do iPhone) e **formulário que sobe de baixo**, como folha, em vez
  de caixa no meio da tela. Medido em 360, 390 e 430px de largura.
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
- **Previsão de término.** Cartão no Painel Executivo com **duas** projeções, de propósito:
  no **ritmo desde o início** (que conta os meses parados) e no **ritmo dos últimos 3 meses**
  (como a obra anda agora). Cada uma mostra o mês previsto e quantos meses cai antes ou depois
  do prazo de contrato. Obra sem avanço lançado não recebe projeção — não há ritmo para
  calcular. Um número só esconderia obra que parou e voltou a produzir.
- **Itens indiretos removidos** na curadoria (transporte, taxas de destinação, ensaios de
  laboratório, mão de obra de projeto, locações, placa, vistoria, sondagem etc.). Ajuste livre:
  edite/adicione serviços em `servicos` no arquivo da obra.
- A **data de início** (`inicioISO`) da obra 119 está provisória; ajuste para a data real da
  ordem de serviço em `dados/ruas-de-terra.js`.

---

## Notas Fiscais (DANFE)

Aba **Suprimentos ▸ Notas Fiscais**. Feita para o apontador em campo: o caminho
normal é **fotografar a nota e conferir** — não digitar.

### Como o apontador usa
1. **Nova nota fiscal** → **Fotografar a nota**, ou **Escolher arquivo (PDF ou imagem)**.
2. O app guarda a imagem da nota (a 1ª página, no caso do PDF) no aparelho e
   manda para o Drive **em segundo plano**.
3. Enquanto isso, tenta ler os dados nesta ordem:
   1. **Chave de acesso** — do texto do PDF ou do código de barras da foto.
      Tem dígito verificador: ou está certa, ou é recusada;
   2. **Consulta da nota pela chave** (já vem ligada, via consultadanfe.com)
      → **dados oficiais do XML da NF-e** com todos os itens, e o **PDF oficial
      do DANFE**, que passa a ser o arquivo guardado. É o melhor caminho:
      nada de OCR. Só vale para notas do mês corrente;
   3. **Texto do PDF** → interpretado pela IA, sem OCR no meio;
   4. **Imagem** → OCR + IA;
   5. o que faltar, **digita**.

> **Tem o PDF da DANFE? Use o PDF.** O texto vem embutido no arquivo, então a
> leitura sai certa. Fotografar é o plano B.
4. A tela de conferência abre preenchida. Campo que a leitura não teve certeza
   vem **marcado em amarelo com "confira"** — e tudo é editável.
   Quando **nada** foi lido, o formulário abre **enxuto**, só com o essencial:
   empresa, data, itens com o valor, frete e valor da nota. O botão
   **"Mostrar todos os campos"** abre o resto (número, série, chave, CNPJ,
   ICMS, status, quantidades) sem perder o que já foi digitado.
5. **Salvar**. Nada trava se a leitura falhar: dá para salvar só com o número e o valor.

O leitor de código de barras é o do próprio navegador (`BarcodeDetector`),
disponível no **Chrome do Android** — que é o aparelho do campo. Em aparelho sem
suporte o app avisa e segue pela leitura da imagem ou pela digitação da chave.

### O que o módulo faz junto
- **Fornecedor** reconhecido pelo CNPJ: da segunda nota em diante já vem preenchido,
  sem cadastrar duas vezes. O CNPJ é validado pelo dígito verificador.
- **Materiais**: o catálogo é aprendido das próprias notas. O app sugere o vínculo
  quando a descrição bate (e **não** confunde bitolas — "DN 400" não casa com "DN 600").
- **Estoque**: ao salvar, gera a entrada com **lote** (`NF <número>/<série>`), atualiza
  saldo e mantém o caminho de volta até a nota que originou cada movimento.
  Reenviar a mesma nota **não** dá entrada em dobro.
- **Saída de estoque**: registra o consumo (material, quantidade, data, frente, rua,
  quem retirou). O saldo passa a ser *o que ainda tem*, não *o que chegou*. Saída acima
  do saldo **avisa e pede confirmação** em vez de bloquear — no canteiro o material sai
  antes de a nota ser lançada. Só quem registrou, ou o administrador, apaga.
- **Histórico de preço**: aba **Preços** com menor, médio (ponderado pela quantidade),
  maior e último preço de cada material, variação desde a primeira compra e o
  fornecedor que cobrou menos.
- **Divergências**: aponta itens + frete que não fecham com o total, CNPJ inválido,
  chave inválida e nota sem número.
- **Painel**: valor recebido, notas por mês, principais fornecedores, materiais mais
  recebidos, notas por obra e situação da conferência.
- **Pesquisa** por número, fornecedor, CNPJ, material, responsável, valor, status e período.
- **Auditoria**: quem cadastrou, quem alterou, o que mudou e como a nota foi lida.

### Status
`Recebida → Em análise → Conferida → Divergência encontrada → Integrada ao estoque →
Cancelada`

### Sem backend
Funciona igual, só que as notas ficam **no aparelho** (como o RDO) e a imagem não
sobe para o Drive. Para ligar a sincronização e a leitura por imagem, veja
**SETUP-BACKEND.md**.


---

## Níveis de acesso

Cada pessoa entra com o seu usuário e vê só o que o perfil dela permite:

| Perfil | O que faz |
|---|---|
| **Campo** | Lança serviço, diário, notas fiscais e fotos. Aponta equipamento |
| **Administrativo** | Suprimentos e escritório: notas, estoque, equipamentos, relatórios |
| **Engenharia** | Tudo da obra — lança, confere, analisa e exporta |
| **Diretoria** | Só consulta: painel, medição, histórico, notas, projetos |
| **Administrador** | Tudo, e é o único que apaga registro dos outros |

**Quem apaga:** o administrador, ou a própria pessoa que lançou. A regra vale
também no servidor — esconder o botão no app não impediria ninguém. Tentativa
negada fica registrada na aba de Auditoria.

**Cadastro pelo próprio app:** entrando como administrador aparece o botão
**Usuários** na tela inicial. Ali se cria, muda o perfil, troca a senha e exclui —
sem abrir o Apps Script e sem mexer no código. A senha fica embaralhada no
servidor e nunca volta para o app. Detalhes em **SETUP-BACKEND.md**.

## No celular

O app é usado no canteiro, de pé e com uma mão. Por isso:

- **Barra inferior** com as telas do dia a dia (Lançar, Diário, Notas, Fotos),
  montada conforme o perfil de quem entrou
- **Alvos de toque de 44px** — dá para acertar de luva
- **As tabelas viram cartões**: nome do serviço como título e um valor por linha,
  sem rolar de lado
- Campos com letra de 16px, que evita o zoom automático do iPhone
