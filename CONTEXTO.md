# Gestor — Controle de Obras · Documento de Contexto

> **Para que serve este arquivo:** dar a uma nova sessão (ou a outra pessoa) todo o
> contexto do projeto sem precisar reler o histórico de conversa. Descreve o app, as
> decisões tomadas, o que está pendente e como trabalhar no repositório.
>
> **Última atualização:** commit `5d6c02a` · Service Worker `v23`

---

## 1. O que é o app

PWA **estático** para acompanhamento **físico** de obras públicas (SIURB/PMSP), usado pela
**Gestor Engenharia**. Criado e mantido por **Leonardo Maciel** (engenheiro, não
desenvolvedor de formação — a comunicação deve evitar jargão de dev).

- **Sem valores em R$** no acompanhamento: cada serviço tem quantidade prevista e unidade;
  o campo lança a quantidade executada e o sistema calcula **% de avanço** por serviço,
  frente e rua. O valor global do contrato aparece só como informação no painel de obras.
- **Multi-obra.** Hoje: `ruas-de-terra` (gerida no app) e `teotonio` (externa — o card só
  encaminha para outro sistema).
- Publicado em **GitHub Pages** a partir do branch `main`:
  `https://leoribeiromac-cmyk.github.io/gestor-obras/`
- Backend **opcional** em Google Apps Script + Google Sheets.

### Contexto humano importante
O Leonardo vai **apresentar o sistema para a empresa**. Daí vieram várias features
(Modo Apresentação, modo demonstração, relatórios). Ele decidiu **não construir importador
de obras**: a autonomia de cadastrar obras é o "seguro" dele para os próximos
empreendimentos. **Não sugerir de novo** — obras continuam sendo cadastradas por arquivo.

---

## 2. Estrutura do repositório

```
gestor-obras/
├── index.html              App inteiro (~2.380 linhas: CSS + telas + lógica)
├── Code.gs                 Backend Apps Script (~600 linhas) — colar no editor da planilha
├── sw.js                   Service Worker (cache do PWA)
├── manifest.json           PWA
├── CONTEXTO.md             Este arquivo
├── README.md               Documentação de uso
├── SETUP-BACKEND.md        Passo a passo do backend
├── dados/
│   ├── _index.js           window.OBRAS_ORDEM — ordem dos cards
│   ├── ruas-de-terra.js    Obra 119 (56 serviços, 6 frentes, 2 ruas)
│   └── teotonio-vilela.js  Obra externa (só encaminha)
├── js/                     Só 3 módulos, todos realmente usados
│   ├── auth/session.js     GestorAuth.setSession (chamado no login)
│   ├── ui/saveBar.js       Barra de status de sincronização
│   └── ui/centralHoje.js   "Central de Campo" (topo do Lançar serviços)
├── assets/                 Logo, ícones, favicon
├── projetos/               PDFs de projeto por rua
├── vendor/                 pdfjs, xlsx, gsap, lenis (vendorizados)
├── intro/                  Abertura cinematográfica (antes do login)
├── tests/sCurve.test.js    Testes de cálculo (rodar: node tests/sCurve.test.js)
└── .github/workflows/ci.yml
```

**O `index.html` é o app.** Quase tudo vive nele. Os `js/` são complementos.

---

## 3. Modelo de dados

### Obra (`dados/<id>.js` → `window.OBRAS[id]`)
```js
{
  id, nome, contrato, contratada, local, objeto, valorGlobal,
  prazoMeses, inicioISO,
  ruas: ['Rua A','Rua B'],
  estacas: { 'Rua A': 12, 'Rua B': 18 },        // nº de estacas por rua
  frentes: [{id:1, nome:'Serviços Preliminares'}, ...],
  cronograma: [{frenteId:1, pctMes:[85.97, 3.11, ...]}, ...],   // % previsto/mês
  projetos: [{rua, disciplina, cod, arquivo}],
  servicos: [{rua, capId, servico, descricaoOrig, un, qtdPrev}]  // capId = id da frente
}
```
Obra externa: `{id, externo:true, url, nome, contrato, local, valorGlobal}`.

### Lançamento (RDO)
```js
{ id, clientId, dataISO, rua, capId, servico, un, qtd,
  estIni, estFim, clima, obs, avulso, usuario,
  fotos: [{thumb:'<dataURL 320px>', url:'drive_id:<fileId>' | 'https://...'}],
  criadoEm }
```
> `efetivo` ainda existe em registros antigos, mas **foi removido do formulário** —
> efetivo é do Diário de Obra (por função), não por serviço.

### Diário
```js
{ id, dataISO, climaManha, climaTarde, condicao,
  pessoal:[{funcao,qtd}], equipamentos:[{nome,qtd}],
  ocorrencias, usuario, criadoEm }
```

### Armazenamento local
| Chave | Conteúdo |
|---|---|
| `gestor:rdo:<obraId>` | lançamentos (localStorage) |
| `gestor:diario:<obraId>` | diários |
| `gestor:outbox` | fila de envio ao servidor |
| `gestor:token` / `gestor:usuario` | sessão |
| `gestor:tema` | light/dark |
| `gestor:demo` | versão do modo demonstração (`DEMO_VER`) |
| IndexedDB `gestorFotos` / store `fotos` | **imagens em resolução cheia** (1280px) |

**Por que IndexedDB:** o localStorage é pequeno demais para imagens. A miniatura (320px)
fica no localStorage para desenhar rápido; a imagem grande vai para o IndexedDB e é usada
em download e impressão.

---

## 4. Telas (NAV)

| Grupo | Tela | id | O que faz |
|---|---|---|---|
| Análise | Painel Executivo | `executivo` | KPIs, **alertas de desvio**, Curva S, avanço por rua/frente, cenas 3D por estaca, mapa de estacas, botão do Relatório Executivo |
| Análise | Serviços | `servicos` | Serviços por frente, previsto × executado |
| Análise | Medição Física | `medicao` | Produção do mês por serviço + exportar CSV |
| Operação | Lançar serviços | `rdo` | **Central de Campo** no topo + formulário de apontamento (com fotos) |
| Operação | Diário de Obra | `diario` | Efetivo, equipamentos, clima, ocorrências, imprimir RDO |
| Operação | Equipamentos | `equip` | Apontamento (horas/paradas/horímetro/combustível/assinatura), cadastros, medição Excel e PDF |
| Operação | Histórico | `historico` | RDOs por data, editar/excluir, PDF e Excel |
| Documentos | **Galeria de Fotos** | `galeria` | Grade de fotos, filtros rua/mês, download com marca d'água |
| Documentos | Projetos | `projetos` | PDFs renderizados com PDF.js, zoom |

---

## 5. Funcionalidades-chave e onde estão

### Cálculo (base de tudo)
- `avancoServ(o)` — quantidade acumulada por serviço
- `pctServ(s,av)` / `mediaPct(servicos,av)` — % por serviço / média simples
- `pontos(o)`, `curvaPrev(o,pts)`, `curvaReal(o,pts)` — Curva S
- `frenteStats(o)` — realizado × previsto por frente (base dos alertas)
- `nivelDesvio(d)` — `crit` (≤ −15%), `aten` (−5 a −15%), `bom` (≥ +5%), `ok`

### Alertas de desvio
`alertasCard(o)` no Painel Executivo. Card vermelho/amarelo listando frentes atrasadas;
se não houver, mostra confirmação verde. A tabela de frentes tem colunas
Realizado / Previsto / Desvio.

### Relatórios (todos em HTML → `window.print()`)
| Função | Documento |
|---|---|
| `htmlRDO(o,dd,numero)` | RDO A4 retrato, com **Registro Fotográfico** |
| `htmlExecutivo(o)` | Relatório Executivo A4 (KPIs, Curva S, desvio por frente, ruas, destaques) |
| `htmlMedicaoEquip(o,aps,periodo)` | Medição de Equipamentos A4 paisagem (resumo + diário por equipamento, disponibilidade) |
| `wsRDO(...)` / `medicaoEquipExcel()` | versões Excel (xlsx-js-style) |

`scriptImprimir()` injeta um `aoCarregar()` que **espera as imagens carregarem** antes de
imprimir (failsafe 8s) e **não imprime quando embutido em iframe** (usado nas
pré-visualizações da apresentação).

### Fotos
Fluxo completo:
1. `fotosSelecionadas()` → `comprimirImg()` gera **thumb 320px** + **full 1280px**
2. Ao salvar: thumb no lançamento (localStorage), full no **IndexedDB**
   (`fotoGuardarFull`), e `enviarFotos()` manda a full ao Drive **só depois** que o
   servidor confirma a linha (evita corrida com `addBatchRDO`)
3. O backend salva **privado** no Drive e grava `drive_id:<fileId>` na planilha
4. `fotoMelhorSrc()` resolve a melhor imagem: **IndexedDB → servidor (`obterFoto`) → thumb**
5. `comMarcaDagua(f,o,src)` desenha a tarja e devolve JPEG

**Marca d'água** (4 linhas, canto inferior esquerdo) + assinatura do app no canto superior
direito (para não colidir):
```
<obra>                                    [Gestor — Controle de Obras, canto sup. dir.]
<serviço>  ·  <trecho>
<rua>  ·  <frente>
<data>  ·  <responsável>  ·  <contrato>
```
> A **quantidade foi removida** de propósito: ela é do lançamento inteiro, não daquela
> foto — poderia sugerir que a foto comprova o total medido.

### Modo Apresentação (`abrirApresentacao()`)
Overlay fullscreen, auto-avança ~8,5 s, setas/espaço/Esc. **11 cenas** com dados:

`capa → capacidades → obra (Curva S) → a obra em números → avanço por estaca → galeria →
projetos → Relatório Executivo → RDO → Medição de Equipamentos → encerramento`

- Cenas por obra só entram **se houver dados** (`getLanc(o.id).length`).
- `apFitDoc1()` mede o tamanho real do documento e escala para caber inteiro (A4 sem corte).
- Botão **▶ Apresentar** na home e na barra lateral.

### Modo Demonstração (`carregarDemo()` / `sairDemo()`)
Popula as obras com dados fictícios **só no navegador**. Essencial para apresentar.
- `_demoSeed(o)` gera ~210 lançamentos, 14 diários, e **16 fotos genéricas** desenhadas
  em canvas (`_demoFoto`), variadas por frente e por índice.
- `_demoEquip()` devolve 3 equipamentos e 7 apontamentos.
- **Nada é enviado ao servidor com a demo ligada** — todos os caminhos de gravação
  checam `isDemo()`. Isso foi um bug corrigido: antes, lançar algo em modo demo ia para a
  planilha real.
- `DEMO_VER` versiona o conteúdo: se a demo estiver ligada com versão antiga,
  `conferirDemoDesatualizada()` regenera sozinha ao abrir. **Suba `DEMO_VER` sempre que
  mudar o conteúdo da demo**, senão o usuário continua vendo o conteúdo velho.
- No PDF gerado a partir da demo, a seção de fotos diz "imagens ilustrativas
  (demonstração)".

### Sincronização
- Fila `gestor:outbox` → `outboxFlush()` envia por **POST (FormData)**, nunca por URL.
- `atualizaOutboxUI()` dispara `gestor:syncStateChange`; o `saveBar.js` mostra a barra
  **só quando há algo a dizer** (pendente / sem conexão / erro). Some quando está tudo
  sincronizado e na demo (onde o aviso já está fixo no topo).
- `carregarObra()` lê do servidor via `obterRDO`/`obterDiario` e **cai para o CSV
  publicado** se o backend não conhecer essas ações (ver pendências).

---

## 6. Backend (`Code.gs`)

Planilha única para todas as obras. Abas: `RDO`, `Diario`, `Equipamentos`, `Locadoras`,
`ApontEquip`, `Auditoria`. Colunas resolvidas **pelo nome do cabeçalho** (ordem não importa).

### Ações
| Ação | O que faz |
|---|---|
| `ping` | teste |
| `login` | valida usuário/senha, devolve token + perfil (6 h) |
| `obterRDO` / `obterDiario` | **leitura privada** (substituem o CSV público) |
| `addBatchRDO` | grava lançamento (dedup por `clientId`); cria colunas `clientId`, `usuario`, `fotos` se faltarem |
| `updateRDO` / `deleteRDO` | edição/exclusão |
| `rdoFoto` | salva a foto **privada** no Drive, devolve `drive_id:<id>` e anexa na coluna `fotos` |
| `obterFoto` | devolve a imagem privada como data URI |
| `addDiario` / `updateDiario` / `deleteDiario` | diário (upsert por obra+data) |
| `equipListar`, `equipCadastrar`, `equipDesativar`, `locadoraCadastrar`, `equipApontar`, `equipApagar`, `equipApontamentos` | equipamentos |

Segurança: senha com **hash SHA-256** (aceita texto puro para compatibilidade), **bloqueio
após 5 tentativas** (15 min), token em cache, aba de **Auditoria**, e `EXIGIR_TOKEN`.

Propriedades do script: `USUARIOS` (JSON) e `EXIGIR_TOKEN=true`.

### ⚠️ Como publicar (só o Leonardo consegue)
Existe a skill **`publicar-backend-gestor`** com o passo a passo e verificação.
Resumo:
1. Planilha → **Extensões → Apps Script**
2. Colar o `Code.gs` por cima e salvar
3. **Implantar → Gerenciar implantações → ✏️ Editar → Versão: Nova versão → Implantar**
   — **nunca** "Nova implantação" (isso cria uma URL diferente e o app continua na antiga)
4. Aceitar a autorização do Drive, se pedir

**Verificar** (abre no navegador): `<URL_/exec>?action=obterRDO`
- `TOKEN_INVALIDO` → ✅ versão nova no ar
- `Ação desconhecida: "obterRDO"` → ❌ não pegou

---

## 7. Pendências e riscos conhecidos

### 🔴 O backend publicado está DESATUALIZADO
Confirmado em teste: `obterRDO` responde "Ação desconhecida". Consequências:
- A leitura cai no **CSV publicado** (funciona, mas os CSVs são públicos)
- `obterFoto` não existe → fotos antigas (sem imagem cheia local) não recuperam a versão
  grande

**Ação:** republicar o Apps Script (seção 6).

### 🟡 CSVs ainda públicos
`CONFIG.csv` aponta para planilhas publicadas na web. Depois de republicar o backend e
confirmar que `obterRDO` funciona, **despublicar os CSVs** no Google Sheets — hoje eles
anulam parte do ganho da leitura privada.

### 🟡 Fotos anteriores à correção
Fotos tiradas antes do commit `b21f7bf` não têm a imagem cheia no aparelho. Saem em 320px
(ampliadas) até o backend novo permitir buscar o original.

---

## 8. Decisões tomadas (não reabrir sem pedido)

| Decisão | Motivo |
|---|---|
| **Sem importador de obras** | A autonomia de criar obras é o "seguro" do Leonardo na empresa |
| **Sem valores (R$)** no acompanhamento | Modelo físico por definição |
| **Efetivo fora do lançamento** | Efetivo é do Diário, por função |
| **Quantidade fora da marca d'água** | É do lançamento, não da foto |
| **Excel sem fotos** | Decisão explícita do usuário |
| Central de Campo em **Lançar serviços** | O Painel Executivo é da diretoria; a Central é do campo |
| Endpoints de pendências/aprovação **removidos** | Existiam no backend sem nenhuma tela |

---

## 9. Como trabalhar neste repositório

### Git
- Branch de trabalho: **`claude/bold-wozniak-fmedci`**
- O usuário quer o **merge em `main`** a cada entrega (o Pages publica de `main`).
  Fluxo usado:
  ```bash
  git add -A && git commit -m "..."
  git push origin claude/bold-wozniak-fmedci
  git checkout main && git merge --ff-only claude/bold-wozniak-fmedci
  git push origin main
  git checkout claude/bold-wozniak-fmedci
  ```
- Ele **pergunta com frequência "fez o merge?"** — confirme olhando `origin/main`, não só o local.

### Sempre que mudar arquivos servidos
**Suba a versão do cache** em `sw.js` (`gestor-obras-vNN`), senão o usuário continua vendo
a versão antiga. Hoje: **v23**. E oriente o **Ctrl/Cmd+Shift+R**.

### Testar (o ambiente tem Playwright + Chromium)
```bash
python3 -m http.server 8080 &        # servir a pasta
NODE_PATH=/opt/node22/lib/node_modules node script.js
# chromium: /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```
Padrão que funciona bem: injetar `localStorage` (`gestor:token`) via `addInitScript`, abrir
`index.html?intro=off`, clicar em `button[onclick="carregarDemo()"]`, navegar por
`estado.tela` + `render()`, e tirar screenshots. **Sempre verificar** erros de página e 404.

Validar sintaxe do `index.html`:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');
const re=/<script>([\s\S]*?)<\/script>/g;let m,i=0;
while((m=re.exec(h))){i++;try{new Function(m[1]);}catch(e){console.log('ERRO',i,e.message);}}
console.log('ok',i)"
```

Testes de cálculo: `node tests/sCurve.test.js` (é assim que o CI roda).

### Cuidados aprendidos (erros já cometidos)
- **`pkill` mata o próprio shell** deste ambiente (exit 144). Evite.
- Scripts Python de edição: o `open(...).write()` no fim **não roda se um `assert`
  anterior falhar** — já causou uma edição "fantasma" (função chamada mas não definida).
  Prefira aplicar e validar **uma substituição por vez**.
- Ao recortar trechos por índice de string, cuidado com **ocorrências repetidas** — já
  deixou uma função duplicada no arquivo (a segunda sobrescrevia a primeira).
- `esc()` dentro de `onclick="fn('${esc(x)}')"` não protege aspas simples: o HTML
  decodifica `&#39;` de volta. Nenhum dado atual tem apóstrofo, mas é uma armadilha.

---

## 10. Histórico do trabalho (o que foi feito e por quê)

Em ordem cronológica, do mais antigo ao mais recente:

| Commit | Entrega |
|---|---|
| `fc0650b` | Revisão geral: **login por POST** (senha saiu da URL), acessibilidade por teclado, limpeza do SW e código morto |
| `abf2b04` | Gravações por POST, **painel consolidado na home**, **Modo Apresentação** |
| `4e52886` | Cenas "A obra em números" e "Avanço por estaca" |
| `4ca91b6` | **Medição de Equipamentos em PDF** + cena de relatórios |
| `973f70d` | **Modo demonstração** (dados fictícios locais) |
| `4f4a6f8` | Relatórios em proporção A4 na apresentação + cena de Projetos |
| `13f8be5` | RDO e Medição em **cenas separadas** |
| `5f7ece3` | Relatórios sem corte lateral; RDO passa a usar o dia mais completo |
| `0f5b53e` | **Alertas de desvio** + **Relatório Executivo em PDF** |
| `c968077` | Cena do Relatório Executivo na apresentação |
| `1b22181` | **Fotos no RDO** + **rastreabilidade de usuário** |
| `153fab2` | Correção: demo não grava mais no servidor |
| `3f1f135` | Correção: foto só é enviada após a linha existir (corrida) |
| `4c9548f` | Efetivo removido do lançamento; foto passa a renderizar no PDF |
| `a4991ac` / `73ba44f` | Fotos genéricas na demo + demo que se regenera sozinha |
| `849e8e9` / `d018582` | **(feitos com outra ferramenta, "antigravity")** endpoints privados, RBAC, CI, Central de Hoje, Pendências |
| `91fc2d5` | **Revisão dessas mudanças**: corrigiu fotos quebradas, barra de status que mentia, 404, 10 módulos órfãos, CONFIG duplicado |
| `b45de84` | **Galeria de Fotos**, Central movida para Lançar serviços, endpoints mortos removidos, fallback CSV |
| `b21f7bf` | Imagem cheia no IndexedDB + marca d'água proporcional |
| `ffaff22` | Quantidade fora da marca d'água |
| `5d6c02a` | Cena da Galeria na apresentação |

### Sobre a revisão do "antigravity"
Outra ferramenta de IA gerou ~1.400 linhas. Trouxe coisas boas (**leitura privada**, **hash
de senha**, **bloqueio de tentativas**, **auditoria**, CI) mas deixou problemas que foram
corrigidos em `91fc2d5` e `b45de84`:
- fotos privadas no Drive sem o app saber ler → **nenhuma foto aparecia**
- barra "tudo sincronizado" fixa, ligada a um módulo que o app não usava
- 404 em `js/domain/diario.js`; 10 de 13 módulos nunca chamados
- 5 endpoints no backend sem tela nenhuma
- dois `CONFIG` diferentes

**Lição para a próxima sessão:** se aparecerem mudanças feitas fora daqui, **rodar o app no
navegador e conferir 404 + erros de console + módulos órfãos** antes de seguir.

---

## 11. Ideias mapeadas e ainda não feitas

| Ideia | Impacto | Esforço |
|---|---|---|
| Resumo diário automático por e-mail (Apps Script) | Gestor recebe sem abrir o app | Baixo-médio |
| Assinatura digital no RDO (reusar o canvas dos equipamentos) | Fecha o documento | Baixo |
| Busca e filtros no Histórico | Hoje são 81 RDOs em lista corrida | Baixo |
| GPS no apontamento + mapa | Comprova presença em campo | Médio |
| Relatório mensal de efetivo | Mesmo padrão da medição de equipamentos | Baixo-médio |
| Perfis de acesso na interface (o backend já tem perfil) | Campo × engenheiro × diretoria | Médio |
| Comparativo entre obras | Linguagem de diretoria | Médio |
| Replanejamento de cronograma pelo app | Aditivos/paralisações | Médio |

**Descartado:** importador de obras (ver seção 8).

---

## 12. Estilo de comunicação com o usuário

- Português do Brasil, direto, **sem jargão de desenvolvedor**.
- Ele testa de verdade e volta com problemas concretos ("foto pequena", "marca d'água
  gigante"). **Investigar a causa real** antes de responder — várias vezes o sintoma
  estava longe da causa.
- Ele valoriza quando o problema é assumido sem rodeio e já vem corrigido.
- Confirmar merges olhando o **remoto**.
- Ao entregar algo visual, **mandar screenshot** (o ambiente gera com Playwright).
