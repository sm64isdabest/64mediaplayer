# Catálogo público de MP3 — plano de implementação

> **Para agentes executores:** usar `superpowers:executing-plans` para execução nativa. Cada tarefa termina com verificação, commit e push.

**Objetivo:** Publicar a biblioteca MP3 como assets públicos de um GitHub Release e listá-la no site do GitHub Pages sem copiar os áudios para o repositório, Pages, IndexedDB ou cache offline.

**Arquitetura:** `music/` é a origem local e permanece fora do Git. Um utilitário Node local usa o `gh` autenticado para sincronizar os MP3 com a tag estável `music-library`, gera `music-catalog.json` somente após validar a release e o Pages carrega esse catálogo compacto. O navegador solicita cada áudio sob demanda; áudio exige internet.

**Stack:** HTML/CSS/JavaScript vanilla, Node 22, parser `jsmediatags` já vendorizado, GitHub CLI, GitHub Pages, GitHub Releases e `node:test`.

**Spec:** [../specs/2026-10-31-pages-github-release-design.md](../specs/2026-10-31-pages-github-release-design.md)

## Restrições globais

- Nunca adicionar MP3 ou token de GitHub ao histórico Git nem ao pacote Pages.
- Não remover nem limpar dados antigos do IndexedDB automaticamente.
- Uma Release pode ter até 1.000 assets; cada arquivo deve ficar abaixo de 2 GiB.
- Publicar/atualizar o catálogo só depois de confirmar todos os assets necessários.
- Cache do service worker cobre somente shell e catálogo, nunca MP3.
- Não declarar EQ/crossfade funcionais sem verificar CORS de asset real e testar no Quest.
- Fazer commit e push de cada tarefa em arquivos selecionados explicitamente; nunca usar `git add -A`.
- Manter o código estático; scripts de publicação são ferramentas locais, não dependências de runtime do site.

## Arquivos e responsabilidades

- `.gitignore`: excluir `music/` e diretório temporário de assets.
- `scripts/publish-music.mjs`: varredura, metadados ID3, nomes determinísticos, validação, sincronização da Release, criação do catálogo.
- `tests/publish-music.test.js`: testes unitários dos helpers e validações sem rede.
- `music-catalog.json`: dados públicos compactos referenciando os assets da Release.
- `app.js`: carregar catálogo remoto/local publicado, listar e apresentar erros de conexão.
- `index.html` / `style.css`: substituir importação/medidor local por estado de biblioteca pública e conectividade.
- `sw.js`: cachear catálogo e shell; nunca interceptar nem armazenar conteúdo de áudio.
- `README.md`: publicar/atualizar Release e explicar acesso público e requisito de internet.
- `db.js` e `tests/storage.test.js`: remover do carregamento e do projeto quando deixarem de ser usados; não apagar bancos já gravados no navegador.

## Foco de revisão

1. Repetir publicação não cria duplicatas nem muda URLs de assets inalterados — testar nomes determinísticos e retomada.
2. Falha parcial de upload nunca gera catálogo que aponte para arquivos ausentes — testar validação final antes da escrita do JSON.
3. MP3 com nomes iguais em pastas distintas não colidem — testar asset keys baseadas no caminho relativo normalizado.
4. Catálogo indisponível ou malformado produz estado compreensível e mantém a interface utilizável — testar carregamento vazio, válido e erro.
5. Navegação offline não faz parecer que áudio remoto está disponível — testar cópia do catálogo/shell e ausência de URLs de MP3 na lista de cache.

---

### Task 1: Criar publicador local seguro e testável

**Arquivos:**
- Criar: `.gitignore`
- Criar: `scripts/publish-music.mjs`
- Criar: `tests/publish-music.test.js`

**Interfaces:**
- `createCatalogEntries(files, metadataByPath, releaseAssets) -> Track[]` cria um registro por MP3, com ID e nome de asset determinísticos a partir do caminho relativo normalizado.
- `validateLibrary(files, releaseAssets) -> { errors, missingAssets }` verifica MP3, limite de 1.000, tamanhos, colisões e completude.
- `readTags(filePath) -> Promise<Metadata>` usa `vendor/jsmediatags.min.js`; tags ausentes/erro usam o nome do arquivo e duração desconhecida.
- O comando local oferece `--dry-run` como padrão e `--publish` para sincronizar a tag `music-library`; exige `gh auth status` válido e nunca imprime credenciais.

- [ ] **Passo 1: Escrever testes RED** para IDs/nome de asset estáveis em caminhos repetidos/Unicode, fallback de título, limite de 1.000, MP3 inválido, tamanho acima de 2 GiB e asset ausente.
- [ ] **Passo 2: Rodar `node --test tests/publish-music.test.js`** e confirmar que falha por helpers ausentes.
- [ ] **Passo 3: Implementar varredura e helpers** usando `fs/promises`, `crypto` nativo e o parser vendorizado, sem dependências npm.
- [ ] **Passo 4: Implementar preflight em `--dry-run`**: resumo agregado de quantidade, bytes, erros e nomes dos assets; não imprimir títulos/nomes de arquivos no log.
- [ ] **Passo 5: Rodar `node --test tests/publish-music.test.js`**; esperado: todos os casos passam sem rede.
- [ ] **Passo 6: Commit e push** somente `.gitignore`, `scripts/publish-music.mjs` e `tests/publish-music.test.js`.

### Task 2: Sincronizar assets e gerar catálogo completo

**Arquivos:**
- Modificar: `scripts/publish-music.mjs`
- Testar: `tests/publish-music.test.js`
- Gerar: `music-catalog.json`

**Interfaces:**
- `publishLibrary({ root, publish }) -> Promise<Catalog>` cria/atualiza a Release `music-library`, envia assets faltantes ou alterados e resolve os `browser_download_url`.
- Credenciais são obtidas pelo GitHub CLI autenticado; nenhuma credencial é salva no repositório.

- [ ] **Passo 1: Escrever testes RED** para publicação retomável, upload alterado, paginação/lista completa de assets e garantia de que catálogo não é escrito após falha.
- [ ] **Passo 2: Rodar os testes** e confirmar a falha esperada.
- [ ] **Passo 3: Implementar a sincronização** com criação de Release/tag e upload HTTP em streaming direto de cada MP3, autenticado pelo `gh` local; manter o token apenas em memória, substituir assets alterados e retomar falhas sem copiar os 2,4 GiB para staging.
- [ ] **Passo 4: Validar a Release inteira** contra os caminhos locais e só então escrever `music-catalog.json` em substituição atômica; o catálogo contém metadados e URLs públicas, nunca blobs ou imagens de capa embutidas.
- [ ] **Passo 5: Testar `--dry-run` com a pasta local completa** e revisar somente a contagem, tamanho total, maior arquivo, colisões e erros; não listar nomes/títulos.
- [ ] **Passo 6: Rodar suíte completa e `--dry-run`**; esperado: testes verdes, 673 MP3, 2,4 GiB agregados e zero erros, sem saída de nomes/tags.
- [ ] **Passo 7: Commit e push** somente `scripts/publish-music.mjs` e `tests/publish-music.test.js`; nenhum MP3 entra no commit.
- [ ] **Passo 8: Executar `--publish`** para publicar os 673 MP3 encontrados, autorizado pelo usuário; validar contagem, digest/tamanho e correspondência 1:1 antes de gerar o catálogo.
- [ ] **Passo 9: Commit e push** somente `music-catalog.json`; nenhum MP3 entra no commit.

### Task 3: Trocar importação local por catálogo do Pages

**Arquivos:**
- Modificar: `app.js`
- Modificar: `index.html`
- Modificar: `style.css`
- Modificar: `tests/app.test.js`
- Modificar: `tests/shell.test.js`

**Interfaces:**
- `loadCatalog(url) -> Promise<Track[]>` valida versão e campos necessários do JSON.
- A renderização usa `Track.url` para áudio futuro e mantém paginação virtual para 600+ linhas; esta tarefa continua sem implementar controles de reprodução.

- [ ] **Passo 1: Escrever testes RED** para catálogo válido/vazio/malformado, URL pública, erro de rede, busca/carregamento sem `MusicDB` e ausência dos controles de upload antigos.
- [ ] **Passo 2: Rodar os testes** e confirmar as falhas esperadas.
- [ ] **Passo 3: Implementar carregamento do catálogo** com feedback de carregando, offline, erro e retry, preservando lista virtualizada e metadados.
- [ ] **Passo 4: Atualizar a interface** para indicar biblioteca pública/online e remover importação por arquivo, seleção de pasta, progresso de upload local e medidor de quota.
- [ ] **Passo 5: Desconectar `db.js` do HTML e do shell**; preservar os dados que já existirem no IndexedDB sem os apagar.
- [ ] **Passo 6: Rodar testes de app/shell** e revisar acessibilidade e layout responsivo.
- [ ] **Passo 7: Commit e push** somente os arquivos de interface e testes alterados.

### Task 4: PWA, documentação e validação dos links

**Arquivos:**
- Modificar: `sw.js`
- Modificar: `README.md`
- Modificar: `tests/shell.test.js`
- Modificar: `manifest.json` somente se a publicação Pages exigir ajuste de `scope`/`start_url`.

- [ ] **Passo 1: Escrever teste** garantindo que `music-catalog.json` entra no shell offline e que nenhum padrão/cache inclui URLs ou bytes MP3.
- [ ] **Passo 2: Atualizar o service worker** para cachear somente app e catálogo, com chave versionada e estratégia explícita para a coleção.
- [ ] **Passo 3: Atualizar README** com URL Pages, Release público, publicação/atualização, privacidade pública e requisito de internet para tocar.
- [ ] **Passo 4: Rodar `node --test tests/*.test.js`, `node --check` em scripts JS e `git diff --check`**; validar JSON do manifesto e catálogo.
- [ ] **Passo 5: Confirmar por requisição HTTP** que um asset real responde com tipo MP3 e suporte a leitura parcial; registrar CORS como questão da etapa futura de Web Audio.
- [ ] **Passo 6: Commit e push** somente service worker, documentação, manifesto quando alterado e testes.

## Parada desta revisão

Publicar/listar a biblioteca online e entregar o link Pages para teste no Quest. Aguardar a confirmação de que o catálogo carrega com centenas de faixas antes de adicionar play/pause, fila, Media Session, crossfade, histórico, EQ ou outros recursos do player.
