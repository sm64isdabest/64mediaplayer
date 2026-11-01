# Etapa 4 do player — plano de implementação

> **Para agentes executores:** usar `superpowers:executing-plans` para execução nativa. Cada tarefa termina com verificação, commit e push.

**Objetivo:** Adicionar busca, favoritos, histórico persistente e fila editável ao player público, preservando a reprodução nativa validada no Quest.

**Arquitetura:** A biblioteca continua vindo do catálogo público e as músicas continuam em streaming pelo elemento `<audio>` atual. Busca, favoritos e fila são integrados ao modelo da lista virtualizada; favoritos e histórico ficam em `localStorage`, vinculados aos IDs do catálogo, e a fila existe durante a sessão atual.

**Stack:** HTML, CSS e JavaScript vanilla; Node `node:test`; GitHub Pages e GitHub Release.

**Spec:** Requisitos da etapa 4 no pedido original desta conversa, em especial busca instantânea por metadados/pasta, fila com "tocar a seguir"/reordenação/remoção, histórico persistente e favoritos com filtro.

## Restrições globais

- Manter HTML, CSS e JavaScript vanilla, sem etapa de build.
- Não baixar, armazenar em cache, copiar ao Git ou salvar no navegador os MP3.
- Não adicionar `crossOrigin`, Web Audio, EQ ou crossfade nesta etapa.
- Manter a busca e as mudanças de filtros fluidas na biblioteca de 673 faixas, preservando a virtualização.
- Tornar controles de fila e favoritos utilizáveis por toque e ponteiro no Quest.
- Fazer commits por tarefa e push de cada alteração; selecionar arquivos explicitamente e preservar mudanças preexistentes não relacionadas.

## Decisões de implementação propostas

- Busca sem distinção entre maiúsculas/minúsculas em título, artista, álbum e pasta, combinada com o escopo de pastas.
- Favoritos persistidos no navegador por IDs estáveis do catálogo, com filtro "Somente favoritos".
- Histórico persistente das últimas 100 reproduções, ordenado da mais recente para a mais antiga; tocar a mesma faixa registra uma nova entrada.
- Fila em memória durante a sessão, permite entradas repetidas, controles por botões de mover para cima/baixo e remover, e "Tocar a seguir" insere logo depois da faixa atual.
- A fila tem prioridade sobre o escopo normal quando uma faixa de fila é a próxima; ao esgotar a fila, a navegação retoma a ordem atual de reprodução.
- Painéis recolhíveis para fila e histórico, sem deslocar os controles fixos do player.

## Review Focus

1. Texto com acentos, espaços e caixa diferente deve encontrar a mesma faixa — testar busca normalizada.
2. IDs removidos de uma futura versão do catálogo não devem quebrar favoritos nem histórico — testar reconciliação com IDs desconhecidos.
3. Reproduzir faixas repetidas deve registrar eventos separados e respeitar o limite de 100 itens — testar a borda do histórico.
4. Fila vazia, índice no começo/fim e IDs repetidos não devem produzir salto incorreto — testar inserção "a seguir", reordenação, remoção e consumo.
5. Estado inválido ou `localStorage` indisponível não deve impedir a biblioteca e o player de carregar — testar leitura e gravação resilientes.

---

### Task 1: Implementar os modelos puros de etapa 4

**Arquivos:**
- Modificar: `app.js`
- Modificar: `tests/app.test.js`

**Interfaces:**
- `searchTracks(tracks, query, favoritesOnly, favorites) -> Track[]` filtra título, artista, álbum e pasta sem alterar a ordem de entrada.
- `toggleFavorite(favorites, trackId) -> string[]` alterna um ID e retorna uma coleção sem duplicatas.
- `recordPlay(history, trackId, playedAt, limit = 100) -> HistoryEntry[]` adiciona um evento mais recente e limita o tamanho.
- `insertQueueNext(queue, trackId) -> string[]`, `moveQueueItem(queue, fromIndex, toIndex) -> string[]` e `removeQueueItem(queue, index) -> string[]` retornam novas filas sem mutar os argumentos. A fila guarda apenas faixas pendentes; "tocar a seguir" insere no início.

- [ ] **Passo 1: Escrever testes RED** para busca normalizada e combinação com favoritos, alternância sem duplicatas, histórico com eventos repetidos e limite 100, e fila com inserir, mover e remover índices válidos/inválidos.
- [ ] **Passo 2: Rodar `node --test tests/app.test.js`** e confirmar falhas pela ausência dos helpers.
- [ ] **Passo 3: Implementar os helpers** em `app.js` sem dependências e exportá-los em `PlayerApp`.
- [ ] **Passo 4: Rodar `node --test tests/app.test.js`** e confirmar aprovação.
- [ ] **Passo 5: Commit e push** dos helpers e testes.

### Task 2: Integrar estado persistente e ações do player

**Arquivos:**
- Modificar: `app.js`
- Modificar: `tests/app.test.js`

**Interfaces:**
- O boot carrega e salva favoritos/histórico por funções pequenas que toleram JSON inválido, exceções de armazenamento e IDs que não estão no catálogo.
- Eventos `play` confirmados pelo elemento de áudio atualizam o histórico sem registrar tentativas de reprodução que falharam.
- Uma faixa tocada a seguir é consumida antes da navegação normal; o restante da fila conserva ordem e duplicatas.

- [ ] **Passo 1: Escrever testes RED** para desserialização inválida, falha de `localStorage`, limpeza de IDs inexistentes do catálogo e precedência/consumo da fila.
- [ ] **Passo 2: Rodar `node --test tests/app.test.js`** e confirmar as falhas esperadas.
- [ ] **Passo 3: Implementar persistência segura** com chaves versionadas `64mp:favorites:v1` e `64mp:history:v1`, ligando eventos reais de reprodução e estado de fila aos modelos puros.
- [ ] **Passo 4: Rodar `node --test tests/app.test.js`** e confirmar aprovação.
- [ ] **Passo 5: Commit e push** desta integração.

### Task 3: Integrar busca, favoritos, fila e histórico à interface

**Arquivos:**
- Modificar: `index.html`
- Modificar: `style.css`
- Modificar: `app.js`
- Modificar: `tests/shell.test.js`

**Interfaces:**
- Campo de busca: `#track-search`; alternância de favoritos: `#favorites-only`.
- Ações da faixa: botão `data-favorite-id`, `data-queue-id` e `data-play-next-id`.
- Painéis: `#queue-panel` e `#history-panel`, com ações delegadas para mover/remover itens, reproduzir entrada do histórico e limpar histórico.

- [ ] **Passo 1: Escrever testes RED de shell** para busca, filtro de favoritos, painéis, ações de fila e histórico, e rótulos acessíveis em controles de toque.
- [ ] **Passo 2: Rodar `node --test tests/shell.test.js`** e confirmar falha esperada.
- [ ] **Passo 3: Implementar controles e estados vazios** mantendo a busca instantânea, lista virtualizada e layout responsivo; botões de mover ordem substituem arraste.
- [ ] **Passo 4: Rodar `node --test tests/shell.test.js`** e confirmar aprovação.
- [ ] **Passo 5: Commit e push** da interface da etapa 4.

### Task 4: Verificar integração e registrar comportamento

**Arquivos:**
- Modificar: `README.md`
- Verificar: `app.js`, `index.html`, `style.css`, `sw.js`, `tests/*.test.js`

- [ ] **Passo 1: Rodar `node --test tests/*.test.js`, `node --check app.js` e `git diff --check`**; confirmar todos os testes aprovados e nenhum erro de sintaxe/espaçamento.
- [ ] **Passo 2: Conferir** que o service worker não armazena áudio e que busca/filtros continuam usando a lista virtualizada.
- [ ] **Passo 3: Documentar** armazenamento local de favoritos/histórico, fila volátil e limite do histórico no README.
- [ ] **Passo 4: Commit e push** da documentação.
- [ ] **Passo 5: Entregar o link Pages** e roteiro curto para o usuário confirmar busca, favoritos, fila e histórico no Quest.

## Parada desta etapa

Concluir quando busca, favoritos, histórico e fila estiverem publicados e o usuário confirmar no Quest. Crossfade e EQ permanecem adiados até haver entrega de áudio com CORS aprovada.
