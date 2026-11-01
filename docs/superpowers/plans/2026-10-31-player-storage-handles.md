# Leitura direta da pasta de MP3 — plano de implementação

> **Para agentes executores:** subskill obrigatória: `superpowers:executing-plans` para execução nativa. Cada tarefa termina com testes e uma conferência manual.

**Objetivo:** Permitir catalogar e acessar no Quest uma biblioteca de ~2,40 GiB sem copiar os MP3 para a cota do site.

**Arquitetura:** A File System Access API escolhe uma pasta sob gesto do usuário. O IndexedDB v2 mantém stores `tracks`, `fileHandles` e `audio`; faixas diretas guardam metadados, handle da pasta e caminho relativo, e não guardam blob de áudio. Faixas antigas ou selecionadas pelo fallback podem continuar com blob.

**Stack:** HTML, CSS, JavaScript vanilla, File System Access API, IndexedDB, Service Worker, `jsmediatags` local e Node `node:test` sem dependências.

**Design:** [../specs/2026-10-31-player-storage-handles-design.md](../specs/2026-10-31-player-storage-handles-design.md)

## Restrições globais

- `showDirectoryPicker()` deve ser chamado diretamente por um gesto do usuário e somente em contexto seguro (HTTPS/localhost).
- Detectar a API em runtime; não inferir suporte pelo user-agent.
- Armazenar MP3 originais no headset, não em blobs do site, no modo pasta direta.
- Persistir handles no IndexedDB e renovar permissão somente em ação explícita do usuário.
- Migração do banco para v2 preserva a biblioteca existente e os blobs antigos.
- Remover referências do site nunca apaga arquivos originais.
- Não avançar para reprodução/crossfade antes do usuário confirmar o teste desta revisão no Quest.

## Arquivos e responsabilidades

- `db.js`: schema v2; metadados, blobs do fallback e handles de pastas; delete seguro sem tocar no filesystem original.
- `app.js`: seleção de pasta, varredura recursiva, permissão/reconexão, fallback, estados e progresso.
- `index.html` / `style.css`: botão e status de pasta/permissão, mantendo controles grandes e fallback.
- `metadata.js`: leitura de tags e duração de `File` temporário.
- `sw.js`: manter shell offline versionado.
- `tests/storage.test.js`, `tests/app.test.js`: testes unitários puros para schema/helpers/estado.
- `README.md`: transferência dos arquivos ao Quest, HTTPS, teste ~20 MP3, permissões e fallback.

## Foco de revisão

1. Browser sem `showDirectoryPicker`: seletores atuais continuam visíveis e o fallback nunca tenta salvar mais que a cota.
2. Permissão revogada ou não persistida: UI pede autorização novamente e não mostra faixas como reproduzíveis sem acesso.
3. Remover faixa/pasta: apaga somente referências/metadados do site, nunca os MP3 do usuário.
4. Upgrade IndexedDB v1→v2: faixas/blob já existentes continuam listáveis e removíveis.
5. Revarredura após cancelamento: ignora duplicatas por nome+tamanho e não duplica handles.

---

### Task 1: Evoluir o banco para referências a pastas

**Arquivos:**
- Modificar: `db.js`
- Modificar: `tests/storage.test.js`

**Interfaces:**
- `saveDirectTrack(track: Track, folderId: string): Promise<void>` grava metadados e relação com pasta, sem tocar no store `audio`.
- `saveFolderHandle(folderId: string, name: string, handle: FileSystemDirectoryHandle): Promise<void>` e `getFolderHandle(folderId: string): Promise<FolderHandleRecord | null>`.
- `getAudio(id)` continua retornando blob para tracks antigos/fallback.
- `Track` acrescenta `source: 'blob' | 'handle'`, `folderId: string | null` e `relativePath: string | null`.

- [ ] **Passo 1: Adicionar teste RED de chave e referência direta**: salvar uma faixa direta não cria registro de áudio; salvar faixa fallback continua criando.
- [ ] **Passo 2: Migrar para DB_VERSION 2** criando `fileHandles` sem remover stores/índices existentes; faixas antigas recebem comportamento compatível `source: 'blob'`.
- [ ] **Passo 3: Implementar operações de pasta/faixa** com transações para guardar handle + metadado e remoção da referência sem apagar arquivos do headset.
- [ ] **Passo 4: Rodar `node --test tests/storage.test.js`**; esperado: migração/funções documentadas passam.

### Task 2: Varredura direta e permissões

**Arquivos:**
- Modificar: `app.js`
- Modificar: `index.html`
- Modificar: `style.css`
- Modificar: `tests/app.test.js`

**Interfaces:**
- Produz `window.PlayerApp.scanDirectory(directoryHandle, {onProgress, isCancelled})` para enumerar MP3 recursivamente e salvar somente metadados/paths.
- Usa `window.MusicDB.saveFolderHandle`, `saveDirectTrack`, `findDuplicate`, `window.MediaMetadata.readMetadata` e `readDuration`.

- [ ] **Passo 1: Adicionar testes RED** para detecção de capacidade, isolamento de estado de cancelamento e derivação de caminhos relativos.
- [ ] **Passo 2: Adicionar botão “Escolher pasta no Quest”** que usa `showDirectoryPicker()` em gesto direto; detectar ausência e manter seletores de arquivos.
- [ ] **Passo 3: Enumerar diretórios aninhados** iterativamente, filtrar `.mp3`/`audio/mpeg`, ignorar duplicatas e salvar faixa sem blob, atualizando progresso e cancelamento.
- [ ] **Passo 4: Persistir handle raiz e restaurar acesso** com `queryPermission({mode:'read'})`; chamar `requestPermission()` somente em botão explícito quando necessário.
- [ ] **Passo 5: Implementar fallback por input** com aviso de que copia áudio para IndexedDB; se tamanho do lote exceder espaço estimado livre, não iniciar cópia e explicar a alternativa de pasta direta.
- [ ] **Passo 6: Rodar testes Node** e conferir visualmente os estados: disponível, indisponível, permissão requerida, pasta ausente.

### Task 3: Ajustar medidor, remoções, PWA e documentação

**Arquivos:**
- Modificar: `app.js`
- Modificar: `index.html`
- Modificar: `README.md`
- Modificar: `tests/app.test.js`

**Interfaces:**
- A tela mostra origem por faixa, estado do acesso à pasta e quota usada pelo site sem incluir bytes que continuam na pasta local.
- Remoções eliminam stores `tracks`, `audio` e ligações correspondentes de `fileHandles`, mas jamais invocam métodos de escrita/deleção no handle.

- [ ] **Passo 1: Adicionar testes RED** para remoção somente de referências e relatório de uso/estimativa.
- [ ] **Passo 2: Implementar remoção individual, por pasta e biblioteca** compatível com `source:'handle'|'blob'`.
- [ ] **Passo 3: Atualizar README** com transferência de MP3 ao Quest, publicação HTTPS, API/permite, renovação de permissão e fallback.
- [ ] **Passo 4: Rodar `node --test tests/*.test.js` e `node --check` nos scripts**; validar JSON do manifesto.
- [ ] **Passo 5: Teste manual no Quest com ~20 MP3**: escolher a pasta, recarregar, abrir offline, confirmar estado de permissão, cancelar/revarrer, remover referência e verificar que o arquivo original continua no headset.

## Critério de parada

Entregar esta revisão e aguardar o usuário confirmar o teste com ~20 MP3 no Quest. Não iniciar a etapa de reprodução antes dessa confirmação.
