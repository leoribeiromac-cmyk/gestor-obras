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


## Consulta da nota pela chave de acesso — **já vem ligada**

O backend consulta o **consultadanfe.com**, que é gratuito e **não pede cadastro
nem token**. O apontador fotografa o código de barras da DANFE, o app lê a chave
e busca a nota: os campos vêm do **XML autorizado pela SEFAZ**, e o **PDF oficial
do DANFE** vem junto e passa a ser o arquivo guardado no Drive (melhor do que a
foto tirada no barracão).

Não precisa configurar nada. O que existe são ajustes opcionais em
**⚙ Configurações do projeto ▸ Propriedades do script**:

| Propriedade | Para que serve |
|---|---|
| `NFE_API_URL` | outro serviço (use `{chave}` no lugar da chave). **`off` desliga a consulta** |
| `NFE_API_TOKEN` | token, se o serviço pedir |
| `NFE_API_HEADER` | cabeçalho do token (padrão `Authorization`) |
| `NFE_API_PREFIXO` | prefixo do token (padrão `Bearer `) |
| `NFE_API_METODO` | `GET` ou `POST` |
| `NFE_API_CAMPO` | nome do campo da chave (padrão `chave`) |

### Limites do consultadanfe (importante)

| Regra | Valor |
|---|---|
| Janela de datas | **Só o mês corrente** (e o anterior, se hoje for antes do dia 15) |
| Modelo | Apenas **NF-e modelo 55** |
| Ritmo | 60 consultas por minuto |

Ou seja: **lançar a nota assim que ela chega é o que faz o caminho bom funcionar.**
Nota velha cai automaticamente na leitura do PDF ou da imagem — o app não trava,
só avisa "a SEFAZ não devolveu essa nota".

O backend entende as respostas: XML puro, XML em base64 (`xml_base64`) ou XML
dentro de JSON. Erros viram mensagem em português — nota não autorizada, fora da
janela, contingência, SEFAZ fora do ar ou limite de consultas.

## Ordem em que o app tenta ler a nota

1. **Chave de acesso** — do texto do PDF ou do código de barras da foto. Tem
   dígito verificador, então ou está certa ou é recusada.
2. **Consulta pela chave** → dados oficiais da NF-e + PDF oficial do DANFE.
3. **Texto do PDF** → mandado para a IA, sem OCR no meio.
4. **Imagem** → OCR + IA.
5. **Digitação**, sempre disponível.


---

# Níveis de acesso (perfis)

Cada pessoa entra com o seu usuário e o sistema mostra só o que o perfil dela
permite. **A regra vale também no servidor** — esconder botão no app não impede
ninguém de mandar o pedido direto.

## Os cinco perfis

| Perfil | Para quem | O que abre |
|---|---|---|
| `campo` | apontador no canteiro | Lançar serviços, Diário, Equipamentos (apontar), Notas Fiscais, Histórico, Serviços, Galeria, Projetos |
| `administrativo` | escritório / suprimentos | Painel, Medição, Equipamentos (inclusive cadastro), Notas Fiscais, Pedidos, Histórico, Galeria, Projetos |
| `engenharia` | engenheiro da obra | Tudo da obra: lança, confere, analisa e exporta |
| `diretoria` | acompanhamento | Só consulta: Painel, Medição, Histórico, Notas, Galeria, Projetos |
| `admin` | você | Tudo, e é o único que apaga registro dos outros |

Quem entra com um perfil que o sistema não conhece cai em `engenharia`.

## Regra de exclusão

**Apaga quem lançou, ou o administrador.** Nem engenharia nem diretoria apagam
lançamento de terceiro. Registro antigo sem dono (coluna `usuario` vazia) só o
administrador apaga. Toda tentativa negada fica na aba **Auditoria**, com a ação
`EXCLUSAO_NEGADA`.

## Como cadastrar — **pelo próprio app**

Entrando como administrador, aparece o botão **Usuários** na tela inicial (e o
ícone de capacete no rodapé do menu, dentro de uma obra). Ali dá para criar,
editar o perfil, trocar a senha e excluir — sem abrir o Apps Script e **sem mexer
no código do site**.

A senha é guardada **embaralhada** (hash SHA-256) e nunca volta para o app.

Para essa tela funcionar, a propriedade **`EXIGIR_TOKEN` precisa estar como
`true`**. Sem ela o backend fica aberto, e deixar a lista de senhas ser reescrita
por qualquer um que descubra a URL seria dar a chave da casa. Se estiver
faltando, o próprio app avisa e ensina onde ligar.

Travas que o servidor aplica, não importa o que o app mande:

- só o perfil `admin` entra na tela;
- ninguém exclui o próprio usuário nem tira o próprio acesso de administrador;
- o sistema nunca fica sem nenhum administrador;
- toda criação, alteração e exclusão vai para a aba **Auditoria**.

> **A tela de login virou campo livre.** Antes era uma lista fixa escrita no
> `index.html`, então usuário novo não conseguia entrar até alguém editar o
> código. Agora a pessoa digita o nome, com sugestão dos nomes já conhecidos.

## Como cadastrar — pela planilha (jeito antigo)

Em **⚙ Configurações do projeto ▸ Propriedades do script**, na propriedade
`USUARIOS`, troque a senha simples por um objeto com senha e perfil:

```json
{
  "Leonardo":  { "senha": "sua-senha",  "perfil": "admin" },
  "Wallace":   { "senha": "senha-dele", "perfil": "campo" },
  "Guilherme": { "senha": "senha-dele", "perfil": "engenharia" },
  "Marcia":    { "senha": "senha-dela", "perfil": "administrativo" },
  "Diretoria": { "senha": "senha-dela", "perfil": "diretoria" }
}
```

O formato antigo (`"Nome": "senha"`) continua valendo: quem estiver assim entra
como `engenharia`, menos o Leonardo, que já era tratado como `admin`.

Depois de mexer no `USUARIOS`, **acrescente o nome novo em `CONFIG.usuarios`** no
`index.html` — é a lista do dropdown do login.

> **Sem servidor** (`CONFIG.appsScript` vazio) todo mundo é admin, de propósito:
> o app local é do próprio usuário e travar tela ali só atrapalharia.
