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
