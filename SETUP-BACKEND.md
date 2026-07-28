# Ativar o backend (Google Sheets) — como a Teotônio

Por padrão o app roda **local** (dados no navegador). Seguindo os passos abaixo, os
lançamentos e diários passam a ser **gravados numa planilha Google** e **lidos de volta**
em qualquer aparelho — leitura via CSV publicado, gravação via Apps Script (JSONP) com fila
offline e login por usuário.

> Estes passos exigem a sua conta Google (não dá para automatizar). Ao final, você só cola
> **3 URLs** no `CONFIG` do `index.html`, dá `git push`, e está no ar.

## 1. Criar a planilha e as abas
1. Crie uma planilha em **https://sheets.new** — nome sugerido: `Gestor Obras — Dados`.
2. Renomeie a primeira aba para **`RDO`** e ponha estes cabeçalhos na **linha 1** (um por coluna, A, B, C…):

   ```
   id | clientId | obra | data | rua | capId | servico | un | qtd | efetivo | estIni | estFim | clima | obs | avulso | criadoEm | timestamp
   ```

3. Crie uma segunda aba **`Diario`** com os cabeçalhos:

   ```
   id | obra | data | climaManha | climaTarde | condicao | pessoal | equipamentos | ocorrencias | criadoEm
   ```

> A ordem das colunas não importa (o script acha pelo nome), mas os **nomes** devem bater.

## 2. Colar o backend (Apps Script)
1. Na planilha: **Extensões ▸ Apps Script**.
2. Apague o conteúdo de `Code.gs` e **cole o arquivo `Code.gs`** deste repositório. Salve (💾).
3. **Implantar ▸ Nova implantação ▸** tipo **App da Web**:
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa
   - **Implantar** → autorize o acesso (login Google) → **copie a URL `…/exec`**.
4. Teste: abra `SUA_URL_EXEC?action=ping` no navegador — deve responder
   `{"ok":true,"pong":true,"abas":["RDO","Diario"]}`.

## 3. Configurar o login
Ainda no Apps Script: **⚙ Configurações do projeto ▸ Propriedades do script ▸ Adicionar**:

| Propriedade | Valor |
|---|---|
| `USUARIOS` | `{"Leonardo":"senha1","Wallace":"senha2","Guilherme":"senha3"}` |
| `EXIGIR_TOKEN` | `true` |

Troque as senhas. Os **nomes** (chaves) devem ser os mesmos que aparecem no dropdown do login.

## 4. Publicar as abas como CSV (leitura)
1. Na planilha: **Arquivo ▸ Compartilhar ▸ Publicar na web**.
2. Aba **`RDO`** → formato **Valores separados por vírgula (.csv)** → **Publicar** → copie a URL.
3. Repita para a aba **`Diario`**.

## 5. Colar as 3 URLs no app
Em `index.html`, localize o bloco `const CONFIG = {…}` e preencha:

```js
const CONFIG = {
  appsScript: 'COLE_AQUI_A_URL_/exec',
  csv: {
    rdo:    'COLE_AQUI_O_CSV_DA_ABA_RDO',
    diario: 'COLE_AQUI_O_CSV_DA_ABA_DIARIO'
  },
  usuarios: ['Leonardo', 'Wallace', 'Guilherme'],  // mesmos nomes do USUARIOS
  exigirLogin: true
};
```

## 6. Publicar
```bash
cd "C:\Users\leori\Downloads\gestor-obras"; git add -A; git commit -m "Ativa backend Google Sheets"; git push
```

Em ~1 minuto o app passa a **pedir login** e a **gravar/ler do Sheets**.

---

## Como funciona (bom saber)
- **Gravação:** cada lançamento/diário é enviado ao Apps Script (JSONP). Se estiver **offline**,
  fica numa **fila** (aparece um selo "⇅ N p/ enviar" no canto) e é reenviado sozinho quando a
  conexão volta. O reenvio é seguro: o servidor **não duplica** (dedup por `clientId`) e o diário
  é **1 por obra+data** (regrava em vez de duplicar).
- **Leitura:** ao abrir uma obra, o app lê os CSVs, filtra pela obra e mostra os dados. O CSV
  publicado do Google atualiza a cada **~5 minutos**, então um lançamento recém-feito aparece
  **na hora** (via fila local) e se reconcilia com o servidor quando o CSV atualiza.
- **Multi-obra:** a mesma planilha atende todas as obras — a coluna `obra` separa. Para uma obra
  nova, nada muda no backend; o app já grava com o `obra` certo.
- **Modo local:** enquanto `CONFIG.appsScript` estiver vazio, nada disso liga — o app funciona
  só com o navegador (útil para demonstração).

## Segurança
- Troque as senhas do `USUARIOS`. Com `EXIGIR_TOKEN=true`, quem não tem senha **não grava**.
- A leitura é pública (CSV) — os dados de produção da obra ficam visíveis para quem tiver a URL
  do CSV. Não coloque dados sensíveis nas abas.

---

# Notas Fiscais (DANFE) — o que o backend precisa

O módulo **Notas Fiscais** funciona sozinho no aparelho. Para as notas
sincronizarem entre celulares e a imagem ir para o Drive, o `Code.gs` deste
repositório precisa estar publicado (é o mesmo arquivo — basta republicar).

## Abas
Não precisa criar nada à mão: o script cria as abas **`NotasFiscais`** e
**`Pedidos`** na primeira vez que forem usadas, já com os cabeçalhos certos.
Se preferir criar antes:

```
NotasFiscais: id | clientId | obra | numero | serie | chave | dataEmissao | dataEntrada |
              cnpj | razaoSocial | nomeFantasia | municipio | uf | vProd | vFrete | vTotal |
              vBaseICMS | vICMS | itens | obs | responsavel | status | driveId | driveLink |
              leitura | historico | usuario | criadoEm | atualizadoEm

Pedidos:      id | obra | numero | data | fornecedor | cnpj | itens | status | usuario | criadoEm
```

## Onde as imagens ficam no Drive
O script cria e organiza sozinho, tudo **privado**:

```
Notas Fiscais Gestor Obras (Privado)/
└── <id da obra>/
    └── <ano>/
        └── <mês por extenso>/
            └── NF-<número>_<id>.jpg
```

Refotografar a mesma nota **substitui** o arquivo, não acumula cópias.

## Leitura automática da nota (OCR + IA) — opcional
Sem isso o app continua funcionando: ele lê o **código de barras da DANFE** e a
**chave de acesso** (que já dá número, série, CNPJ do emitente e UF com certeza)
e o restante é digitado. Ligando a leitura por imagem, o resto vem preenchido
também.

Em **⚙ Configurações do projeto ▸ Propriedades do script**:

| Propriedade | Valor |
|---|---|
| `GEMINI_API_KEY` | a chave da API (pegue em https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | `gemini-2.5-flash` — opcional, é o padrão |

Escolhi o Gemini porque o backend já é Google (Apps Script + Sheets + Drive):
basta a chave numa propriedade, sem conta de serviço, sem projeto no Google
Cloud e sem biblioteca nova. **A chave nunca aparece no app** — quem chama a API
é o Apps Script.

Para conferir se pegou, abra no navegador:
`SUA_URL_EXEC?action=nfListar&obra=ruas-de-terra`

- `TOKEN_INVALIDO` → ✅ a versão nova está no ar
- `Ação desconhecida: "nfListar"` → ❌ faltou republicar

> **Por que não consultar a SEFAZ pela chave?** A consulta oficial do XML exige
> certificado digital A1/A3 da empresa, que o Apps Script não consegue usar. Por
> isso a ordem é: código de barras → chave de acesso → leitura da imagem →
> digitação. A chave sozinha já entrega os campos que mais dão erro de digitação.

## Segurança
- Todas as ações de nota fiscal exigem token (login), como as demais.
- As imagens ficam **privadas** no Drive; o app as busca pelo backend.
- Toda gravação, alteração, exclusão e leitura automática entra na aba
  **`Auditoria`**, com usuário, data e o que mudou.


## Não está lendo os dados da nota? Use o botão de teste

Dentro do app, em **Notas Fiscais**, tem o botão **🔎 Testar leitura**. Ele fala
com o servidor e diz em português o que está faltando — inclusive o passo a passo
para resolver. É por ali que se descobre a causa, em vez de adivinhar.

As três causas, em ordem de frequência:

| O que o teste diz | O que fazer |
|---|---|
| "O backend publicado está desatualizado" | Republicar o `Code.gs` (Implantar ▸ Gerenciar implantações ▸ ✏️ Editar ▸ Nova versão) |
| "O Apps Script ainda não tem permissão para acessar a internet" | No editor do script, escolher a função **`autorizarInternet`** e clicar em **▶ Executar**, aceitando a autorização |
| "A propriedade GEMINI_API_KEY não está no script" | Cadastrar a chave nas Propriedades do script |

> A permissão de internet é o tropeço mais comum: colar o `Code.gs` e implantar
> **não** dispara o pedido de autorização.
>
> E não adianta rodar o `nfDiag` para isso: sem a `GEMINI_API_KEY` cadastrada ele
> volta antes de tocar na internet, termina em menos de um segundo e o Google não
> pergunta nada. A função **`autorizarInternet`** existe só para forçar a pergunta —
> ela não faz outra coisa.
