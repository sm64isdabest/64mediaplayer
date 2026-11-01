# Player pessoal para Quest — plano de implementação

> **Para agentes executores:** subskill obrigatória: `superpowers:executing-plans` para execução nativa, ou `superpowers:subagent-driven-development` se o usuário escolher execução por subagentes. Cada tarefa termina com uma conferência manual independente.

**Objetivo:** Entregar a etapa 1: um site estático que importa MP3, salva blobs e metadados em stores separados do IndexedDB, lista a biblioteca e informa o armazenamento.

**Arquitetura:** Aplicação vanilla servida por HTTPS/localhost, sem build. Scripts clássicos carregados com `defer` em ordem: parser, `db.js`, `metadata.js`, `app.js`. `app.js` coordena a tela; `db.js` isola operações IndexedDB; `metadata.js` encapsula `jsmediatags` local e leitura de duração. O service worker guarda os arquivos do shell para a página poder abrir offline; as faixas ficam apenas no IndexedDB local.

**Stack:** HTML, CSS, JavaScript vanilla em scripts clássicos, IndexedDB, Service Worker, Web App Manifest e `jsmediatags` vendorizado, versão 3.9.7, BSD-3-Clause.

**Design:** [../specs/2026-10-31-player-pessoal-etapa-1-design.md](../specs/2026-10-31-player-pessoal-etapa-1-design.md)

## Restrições globais

- Selecionar MP3 por `.mp3` ou `audio/mpeg`; validar essas indicações no código porque `accept` é apenas uma dica. Não tentar decodificar o arquivo inteiro para validar codec nesta etapa.
- HTML, CSS e JavaScript puros; sem framework e sem etapa de build.
- Manter blobs de áudio separados dos metadados no IndexedDB.
- Detectar duplicatas por nome normalizado em NFC, convertido para minúsculas, + tamanho exato em bytes; não recalcular ou carregar blobs para montar a lista.
- Solicitar persistência e estimar armazenamento quando as APIs estiverem disponíveis.
- Preservar pastas de `webkitRelativePath`; pedir coleção do lote no fluxo sem pasta.
- Manter controles grandes, tema escuro e leitura confortável no Meta Quest 3S.
- Implementar somente a etapa 1; esperar o teste e a confirmação do usuário no Quest antes de avançar.

## Arquivos e responsabilidades

- `index.html`: semântica da tela, seletores de MP3, estado de importação, medidor e área da biblioteca.
- `style.css`: tema escuro, alvos grandes, layout adaptável e linhas de altura fixa para virtualização.
- `app.js`: inicialização, eventos da interface, importação, cancelamento, progresso, lista virtualizada e atualização do medidor.
- `db.js`: abertura/versionamento do IndexedDB e operações transacionais para faixas, blobs, duplicatas, pastas e limpeza.
- `metadata.js`: interface Promises sobre leitura ID3, capa e duração, com fallback para nome do arquivo.
- `manifest.json`: metadados básicos do PWA e caminhos relativos para instalação.
- `assets/app-icon.svg`: ícone vetorial local referenciado pelo manifesto, sem ferramenta de build.
- `sw.js`: cache versionado do shell e estratégia de atualização que funcione em publicação sob subpasta.
- `vendor/jsmediatags.min.js` e `vendor/LICENSE.md`: distribuição local do parser e aviso BSD-3-Clause.
- `README.md`: execução local, teste manual com 20 MP3 e publicação estática em GitHub Pages/Cloudflare Pages.

## Foco de revisão

1. Arquivo `.mp3` com MIME vazio ou `audio/mpeg`: aceitar pela extensão e importar normalmente.
2. MP3 sem tags ID3 legíveis: mostrar título pelo nome e continuar sem interromper o lote.
3. Selecionar novamente um lote após cancelamento: faixas já gravadas devem ser ignoradas, sem criar duplicatas.
4. Erro ao gravar uma faixa por falta de quota: preservar as anteriores, indicar a falha e permitir retomar o lote.
5. Navegador sem seletor de diretórios ou Storage API: oferecer coleção manual e indicar indisponibilidade do medidor/persistência sem quebrar a biblioteca.

---

### Tarefa 1: Montar a estrutura visual e o manifesto

**Arquivos:**
- Criar: `index.html`
- Modificar: `style.css`
- Criar: `manifest.json`
- Criar: `assets/app-icon.svg`

**Interfaces:**
- Produz: IDs estáveis para os controles `file-input`, `folder-input`, `import-cancel`, `import-progress`, `storage-used`, `storage-available`, `track-count`, `track-list` e `empty-state`; `app.js` os usa na tarefa 3.

- [ ] **Passo 1: Criar a estrutura HTML acessível** com rótulos para os dois seletores, coleção, botão de cancelar, progresso com texto/valores, estatísticas e lista vazia.
- [ ] **Passo 2: Criar o tema escuro em `style.css`** com fontes legíveis a distância, botões/alvos de pelo menos 48 CSS px e layout utilizável em tela estreita e em paisagem.
- [ ] **Passo 3: Criar `manifest.json`** com `lang` `pt-BR`, `start_url` relativo, `display` standalone e cores do tema escuro.
- [ ] **Passo 4: Criar `assets/app-icon.svg`** como ícone vetorial local e referenciá-lo no manifesto com tamanho `any` e MIME `image/svg+xml`.
- [ ] **Passo 5: Conferir a tela vazia** servindo o diretório com `py -m http.server 8000`; abrir `http://localhost:8000` no Chrome e verificar a 400 px de largura e em paisagem. Esperado: nenhum controle cortado e seletores identificáveis sem depender de hover.

### Tarefa 2: Criar a camada de metadados e armazenamento

**Arquivos:**
- Criar: `db.js`
- Criar: `metadata.js`
- Criar: `vendor/jsmediatags.min.js`
- Criar: `vendor/LICENSE.md`
- Modificar: `index.html`

**Interfaces:**
- Produz `window.MusicDB`: `openDB(): Promise<IDBDatabase>`, `listTracks(): Promise<Track[]>`, `findDuplicate(name: string, size: number): Promise<Track | null>`, `saveTrack(track: Track, blob: Blob): Promise<void>`, `getAudio(id: string): Promise<Blob | null>`, `deleteTrack(id: string): Promise<void>`, `deleteFolder(folder: string): Promise<void>`, `clearLibrary(): Promise<void>`.
- Produz `window.MediaMetadata`: `readMetadata(file: File): Promise<{title: string, artist: string, album: string, cover: Blob | null}>` e `readDuration(file: File): Promise<number | null>`.
- `Track`: `{id, name, title, artist, album, folder, size, mimeType, duration, importedAt, duplicateKey, cover}`; `folder` sempre é uma string, usando `Sem pasta` como coleção padrão. `duplicateKey` combina nome em NFC/minúsculo e tamanho exato em bytes.
- Consome: a distribuição minificada de `jsmediatags` via `window.jsmediatags`; armazenar imagem de capa como `Blob` junto aos metadados e áudio no store próprio.

- [ ] **Passo 1: Adicionar a distribuição de navegador da versão 3.9.7** em `vendor/jsmediatags.min.js` e preservar o aviso de licença BSD-3-Clause em `vendor/LICENSE.md`.
- [ ] **Passo 2: Implementar `openDB()` e stores `tracks` e `audio`** em `db.js`; crie o índice `tracks.folder` e índice único `tracks.duplicateKey`. `saveTrack()` deve gravar metadados e blob numa única transação para cada faixa.
- [ ] **Passo 3: Implementar leitura de metadados em `metadata.js`** usando tags ID3 reconhecidas, título alternativo pelo nome sem extensão e capa opcional; nenhuma falha de tags deve rejeitar o arquivo.
- [ ] **Passo 4: Implementar `readDuration()`** por leitura temporária de metadados do elemento de áudio e revogar todo object URL em sucesso, erro e timeout.
- [ ] **Passo 5: Carregar os scripts locais com `defer` em `index.html`** nesta ordem: parser, `db.js`, `metadata.js`; deixar `app.js` para a tarefa 3.
- [ ] **Passo 6: Conferir manualmente no Chrome** chamando `MediaMetadata.readMetadata()` e `MusicDB.saveTrack()` com arquivos escolhidos no DevTools. Esperado: MP3 com e sem tags têm resultado; reabrir o IndexedDB mostra um item no store de metadados e um blob correspondente no store `audio`.

### Tarefa 3: Implementar importação, progresso, retomada e lista

**Arquivos:**
- Criar: `app.js`
- Modificar: `index.html`
- Modificar: `style.css`
- Remover: `script.js` (placeholder vazio do esqueleto inicial)

**Interfaces:**
- Consome: `db.js` e `metadata.js` da tarefa 2 e os IDs de `index.html` da tarefa 1.
- Produz: importação de `FileList` com caminho completo da pasta quando disponível, lote rotulado manualmente sem caminho, atualização de `Track[]` e lista virtualizada com linhas de 88 CSS px e seis linhas de overscan.

- [ ] **Passo 1: Configurar os seletores** com `accept=".mp3,audio/mpeg"`; detectar suporte a `webkitdirectory` e ocultar/desativar apenas o seletor de pasta quando não houver suporte. Carregar scripts locais com `defer` na ordem parser, `db.js`, `metadata.js`, `app.js`.
- [ ] **Passo 2: Derivar pastas e coleção** de `webkitRelativePath`; quando não houver caminho, pedir o nome da coleção uma vez por lote e usar `Sem pasta` se o usuário escolher continuar sem nome.
- [ ] **Passo 3: Implementar o processamento sequencial do lote**: aceitar MP3 indicado pela extensão ou MIME, verificar duplicata por nome normalizado + tamanho, ler tags/duração, gravar faixa e blob atomicamente, atualizar `n/total` e contadores de adicionadas/ignoradas/falhas. Um erro de tag usa o título pelo nome; um erro de gravação conta falha e continua sem apagar as anteriores.
- [ ] **Passo 4: Implementar cancelar e retomar**: parar antes da próxima faixa, preservar commits concluídos e, ao selecionar o mesmo lote novamente, pular itens persistidos sem duplicá-los.
- [ ] **Passo 5: Implementar a lista virtualizada**: ordenar por título para apresentação nesta etapa, criar somente linhas visíveis e overscan, exibir capa ou placeholder, título, artista, álbum, duração e pasta.
- [ ] **Passo 6: Conferir importação manual com 20 MP3** no Chrome. Incluir um arquivo `.mp3` com `File.type` vazio e uma faixa sem tags; esperado: ambos importam, a faixa sem tags aparece pelo nome, cancelar preserva concluídas, repetir o lote pula duplicatas e rolar a lista não cria centenas de nós simultâneos. Quando disponível, conferir o caminho da pasta; no Quest sem seletor de pasta, conferir o campo de coleção manual.

### Tarefa 4: Adicionar medidor, gestão, cache offline e instruções

**Arquivos:**
- Criar: `sw.js`
- Modificar: `app.js`
- Modificar: `index.html`
- Modificar: `README.md`

**Interfaces:**
- Consome: `db.js`, interface da tarefa 1, parser local e importador da tarefa 3.
- Produz: ações para remover faixa, pasta ou biblioteca; atualização de uso e cota; solicitação de persistência; abertura offline do shell; instruções de teste e publicação.

- [ ] **Passo 1: Implementar o medidor** com `navigator.storage.estimate()`, exibindo uso, cota e disponível; quando ausente ou rejeitada, mostrar estado indisponível sem interromper a tela.
- [ ] **Passo 2: Solicitar armazenamento persistente** em gesto explícito de importação, mostrar se foi concedido e manter a importação funcional se for recusado.
- [ ] **Passo 3: Implementar remoções** de faixa, pasta e tudo, com confirmação para pasta/biblioteca e atualização imediata de lista, contagem e medidor.
- [ ] **Passo 4: Implementar e registrar `sw.js`** com precache versionado dos arquivos efetivamente criados e caminho relativo baseado no escopo. Esperado: primeira visita em HTTPS/localhost instala cache; nova visita sem rede abre a interface, biblioteca continua disponível via IndexedDB.
- [ ] **Passo 5: Escrever no `README.md`** instruções para servidor local, HTTPS/hosting estático, teste de 20 MP3 no Quest e limites que exigem verificar no aparelho (seletor de pastas, quota/persistência e codecs).
- [ ] **Passo 6: Fazer conferência integrada**: importar 20 MP3, recarregar, ficar offline e recarregar, testar remoção de uma faixa/pasta/tudo, confirmar valores do medidor e comparar contagem antes/depois. No DevTools, simular ausência de `navigator.storage`, rejeição de `navigator.storage.persist()` e uma rejeição isolada de `MusicDB.saveTrack()`; esperado: estado de armazenamento indisponível/recusado, falha individual visível e faixas previamente salvas preservadas.

## Critério de parada da etapa

Entregar os arquivos completos e o roteiro de teste. A etapa termina quando o usuário confirmar que importação, persistência e medidor funcionam no Quest com aproximadamente 20 MP3. Não iniciar reprodução ou qualquer funcionalidade da etapa 2 antes dessa confirmação.
