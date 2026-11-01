(function (root) {
  'use strict';

  function isMp3(file) {
    return /\.mp3$/i.test(file.name || '') || String(file.type || '').toLowerCase() === 'audio/mpeg';
  }

  function folderFor(file, collection) {
    const relative = String(file.webkitRelativePath || '').replace(/\\/g, '/');
    if (relative.includes('/')) return relative.split('/').slice(0, -1).join('/') || 'Sem pasta';
    return String(collection || '').trim() || 'Sem pasta';
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024; let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value.toFixed(1)} ${units[unit]}`;
  }

  function createBatchControl() {
    let cancelled = false;
    return { cancel: () => { cancelled = true; }, isCancelled: () => cancelled };
  }

  function supportsDirectoryPicker(environment) {
    const target = environment || root;
    return !!(target && target.isSecureContext && typeof target.showDirectoryPicker === 'function');
  }

  function makeRelativePath(directoryParts, fileName) {
    return [...(directoryParts || []), String(fileName || '')].filter(Boolean).join('/');
  }

  function exceedsAvailableStorage(files, estimate) {
    if (!estimate || !Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) return false;
    const needed = Array.from(files || []).reduce((total, file) => total + (Number(file.size) || 0), 0);
    return needed > Math.max(0, estimate.quota - estimate.usage);
  }

  function makeId() {
    return root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function scanDirectory(directoryHandle, options = {}) {
    const database = options.database || root.MusicDB;
    const metadata = options.metadata || root.MediaMetadata;
    if (!directoryHandle || !directoryHandle.entries || !database || !metadata) throw new Error('A pasta selecionada não pode ser lida neste navegador.');
    const folderId = options.folderId || makeId();
    await database.saveFolderHandle(folderId, directoryHandle.name || 'Músicas do Quest', directoryHandle);
    const stack = [{ handle: directoryHandle, parts: [] }];
    let processed = 0; let added = 0; let skipped = 0; let failed = 0;
    while (stack.length) {
      if (options.isCancelled && options.isCancelled()) break;
      const current = stack.pop();
      for await (const [name, entry] of current.handle.entries()) {
        if (options.isCancelled && options.isCancelled()) break;
        if (entry.kind === 'directory') { stack.push({ handle: entry, parts: [...current.parts, name] }); continue; }
        if (entry.kind !== 'file' || !isMp3({ name, type: '' })) continue;
        processed++;
        const relativePath = makeRelativePath(current.parts, name);
        try {
          const file = await entry.getFile();
          if (await database.findDuplicate(file.name || name, file.size)) skipped++;
          else {
            const meta = await metadata.readMetadata(file);
            const duration = await metadata.readDuration(file);
            await database.saveDirectTrack({
              id: makeId(), name: file.name || name, title: meta.title || (file.name || name).replace(/\.mp3$/i, ''),
              artist: meta.artist || '', album: meta.album || '', folder: current.parts.join('/') || directoryHandle.name || 'Músicas do Quest',
              size: file.size, mimeType: file.type || 'audio/mpeg', duration, importedAt: Date.now(),
              duplicateKey: database.makeDuplicateKey(file.name || name, file.size), cover: meta.cover,
              source: 'handle', folderId, relativePath,
            }, folderId);
            added++;
          }
        } catch (_) { failed++; }
        if (options.onProgress) await options.onProgress({ processed, added, skipped, failed, relativePath });
      }
    }
    return { folderId, processed, added, skipped, failed, cancelled: !!(options.isCancelled && options.isCancelled()) };
  }

  function virtualWindow(count, scrollTop, viewportHeight, rowHeight = 88, overscan = 6) {
    const maxScroll = Math.max(0, count * rowHeight - viewportHeight);
    const clampedScroll = Math.min(Math.max(0, scrollTop), maxScroll);
    const first = Math.floor(clampedScroll / rowHeight);
    const start = Math.max(0, first - overscan);
    const end = Math.min(count, first + Math.ceil(viewportHeight / rowHeight) + overscan);
    return { start, end, top: start * rowHeight, bottom: (count - end) * rowHeight, clampedScroll };
  }

  function boot() {
    const doc = root.document;
    if (!doc) return;
    const byId = (id) => doc.getElementById(id);
    const filesInput = byId('file-input');
    const folderInput = byId('folder-input');
    const collectionField = byId('collection-field');
    const collectionName = byId('collection-name');
    const startImport = byId('start-import');
    const chooseQuestFolder = byId('choose-quest-folder');
    const reconnectFolder = byId('reconnect-folder');
    const folderAccess = byId('folder-access');
    const cancelButton = byId('import-cancel');
    const progressWrap = byId('progress-wrap');
    const progressBar = byId('import-progress');
    const progressCount = byId('progress-count');
    const progressLabel = byId('progress-label');
    const status = byId('import-status');
    const message = byId('import-message');
    const list = byId('track-list');
    const empty = byId('empty-state');
    const pending = { files: [], fromFolder: false };
    let activeBatch = null;
    let rows = [];
    let coverUrls = [];
    let persistenceRequested = false;

    if (!('webkitdirectory' in doc.createElement('input'))) byId('folder-picker').hidden = true;
    if (!supportsDirectoryPicker(root)) chooseQuestFolder.hidden = true;
    const say = (text) => { message.textContent = text || ''; };

    function render() {
      rows.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'pt-BR'));
      byId('track-count').textContent = String(rows.length);
      updateFolderOptions();
      empty.hidden = rows.length > 0;
      list.hidden = rows.length === 0;
      coverUrls.forEach((url) => URL.revokeObjectURL(url));
      coverUrls = [];
      if (!rows.length) { list.replaceChildren(); return; }
      const rowHeight = 88;
      const window = virtualWindow(rows.length, list.scrollTop, list.clientHeight || 520, rowHeight, 6);
      if (window.clampedScroll !== list.scrollTop) list.scrollTop = window.clampedScroll;
      const { start, end } = window;
      const fragment = doc.createDocumentFragment();
      const top = doc.createElement('div'); top.style.height = `${window.top}px`; fragment.append(top);
      for (const track of rows.slice(start, end)) {
        const row = doc.createElement('article'); row.className = 'track-row';
        const cover = doc.createElement('div'); cover.className = 'track-cover';
        if (track.cover) { const img = doc.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(track.cover); coverUrls.push(img.src); cover.append(img); }
        else { cover.textContent = '♫'; cover.setAttribute('aria-hidden', 'true'); }
        const info = doc.createElement('div'); info.className = 'track-info';
        const title = doc.createElement('strong'); title.textContent = track.title || track.name;
        const details = doc.createElement('span'); details.textContent = [track.artist, track.album, track.folder].filter(Boolean).join(' · ');
        info.append(title, details);
        const duration = doc.createElement('span'); duration.className = 'track-duration'; duration.textContent = Number.isFinite(track.duration) ? formatDuration(track.duration) : '—';
        const remove = doc.createElement('button'); remove.className = 'row-remove'; remove.type = 'button'; remove.textContent = 'Remover'; remove.setAttribute('aria-label', `Remover ${track.title || track.name}`); remove.dataset.removeId = track.id;
        row.append(cover, info, duration, remove); fragment.append(row);
      }
      const bottom = doc.createElement('div'); bottom.style.height = `${window.bottom}px`; fragment.append(bottom);
      list.replaceChildren(fragment);
    }

    async function refresh() { try { rows = await root.MusicDB.listTracks(); render(); } catch (error) { say(`Não foi possível abrir a biblioteca: ${error.message}`); } }

    async function refreshFolderAccess() {
      const ids = [...new Set(rows.filter((track) => track.source === 'handle' && track.folderId).map((track) => track.folderId))];
      reconnectFolder.hidden = !ids.length;
      if (!ids.length) { folderAccess.textContent = 'Nenhuma pasta do Quest vinculada'; return; }
      let needsPermission = false;
      for (const id of ids) {
        try {
          const record = await root.MusicDB.getFolderHandle(id);
          if (!record || !record.handle) { needsPermission = true; continue; }
          const permission = await record.handle.queryPermission({ mode: 'read' });
          if (permission !== 'granted') needsPermission = true;
        } catch (_) { needsPermission = true; }
      }
      folderAccess.textContent = needsPermission ? 'A pasta precisa ser localizada ou autorizada novamente' : 'Acesso às pastas do Quest disponível';
      reconnectFolder.hidden = !needsPermission;
    }

    async function restoreFolderAccess() {
      const ids = [...new Set(rows.filter((track) => track.source === 'handle' && track.folderId).map((track) => track.folderId))];
      let granted = 0;
      for (const id of ids) {
        const record = await root.MusicDB.getFolderHandle(id);
        if (!record || !record.handle) continue;
        let permission = await record.handle.queryPermission({ mode: 'read' });
        if (permission !== 'granted') permission = await record.handle.requestPermission({ mode: 'read' });
        if (permission === 'granted') granted++;
      }
      folderAccess.textContent = granted ? `${granted} pasta(s) autorizada(s)` : 'Acesso não concedido. Escolha a pasta novamente.';
      reconnectFolder.hidden = granted === ids.length;
    }

    async function runDirectoryImport(handle) {
      if (activeBatch) { say('Já há uma importação em andamento. Aguarde ou cancele o lote atual.'); return; }
      const batch = createBatchControl(); activeBatch = batch;
      collectionField.hidden = true; progressWrap.hidden = false; cancelButton.hidden = false; cancelButton.disabled = false;
      progressBar.value = 0; progressLabel.textContent = 'Catalogando MP3 na pasta do Quest'; progressCount.textContent = '0';
      say('Os arquivos permanecem na pasta do Quest; o site salva somente a referência e os metadados.');
      try {
        const result = await scanDirectory(handle, {
          isCancelled: batch.isCancelled,
          onProgress: ({ processed, added, skipped, failed }) => {
            progressCount.textContent = String(processed);
            status.textContent = `${added} adicionadas · ${skipped} duplicadas · ${failed} falhas`;
            progressLabel.textContent = 'Faixas encontradas';
            if (processed % 5 === 0) return refresh();
          },
        });
        folderAccess.textContent = 'Pasta do Quest vinculada';
        await refresh(); await refreshFolderAccess(); await updateStorage();
        progressLabel.textContent = result.cancelled ? 'Varredura pausada' : 'Varredura concluída';
        progressCount.textContent = String(result.processed);
        status.textContent = `${result.added} adicionadas · ${result.skipped} duplicadas · ${result.failed} falhas`;
        say(result.cancelled ? 'Varredura pausada. Escolha novamente a pasta para continuar; as faixas já catalogadas serão ignoradas.' : 'Catálogo salvo. Os MP3 continuam na pasta do Quest.');
      } catch (error) { say(error.message || 'Não foi possível ler a pasta selecionada.'); }
      finally { cancelButton.hidden = true; progressBar.value = 100; if (activeBatch === batch) activeBatch = null; }
    }

    async function updateStorage() {
      const storage = root.navigator && root.navigator.storage;
      if (!storage || typeof storage.estimate !== 'function') { byId('storage-used').textContent = 'Indisponível'; byId('storage-available').textContent = '—'; byId('storage-persistence').textContent = 'Armazenamento persistente indisponível'; return; }
      try {
        const { usage = 0, quota = 0 } = await storage.estimate();
        byId('storage-used').textContent = formatBytes(usage);
        byId('storage-available').textContent = quota ? formatBytes(Math.max(0, quota - usage)) : 'Indisponível';
      } catch (_) { byId('storage-used').textContent = 'Indisponível'; byId('storage-available').textContent = '—'; }
    }

    async function requestPersistence() {
      if (persistenceRequested) return;
      persistenceRequested = true;
      const storage = root.navigator && root.navigator.storage;
      if (!storage || typeof storage.persist !== 'function') { byId('storage-persistence').textContent = 'Persistência indisponível; o navegador ainda pode limpar dados antigos'; return; }
      try { byId('storage-persistence').textContent = await storage.persist() ? 'Armazenamento persistente concedido' : 'Persistência recusada pelo navegador'; }
      catch (_) { byId('storage-persistence').textContent = 'Não foi possível solicitar persistência'; }
    }

    function updateFolderOptions() {
      const select = byId('remove-folder-select');
      const selected = select.value;
      const folders = [...new Set(rows.map((track) => track.folder || 'Sem pasta'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      select.replaceChildren(...folders.map((folder) => { const option = doc.createElement('option'); option.value = folder; option.textContent = folder; return option; }));
      if (folders.includes(selected)) select.value = selected;
      byId('library-actions').hidden = rows.length === 0;
      byId('remove-folder').disabled = folders.length === 0;
    }

    function formatDuration(seconds) {
      const value = Math.floor(seconds);
      return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
    }

    async function runImport(files) {
      if (activeBatch) { say('Já há uma importação em andamento. Aguarde ou cancele o lote atual.'); return; }
      const valid = files.filter(isMp3);
      if (!valid.length) { say('Selecione arquivos MP3 para importar.'); return; }
      try {
        const storage = root.navigator && root.navigator.storage;
        const estimate = storage && typeof storage.estimate === 'function' ? await storage.estimate() : null;
        if (exceedsAvailableStorage(valid, estimate)) {
          say('Este lote ultrapassa o espaço estimado disponível no navegador. Nada foi copiado; use “Escolher pasta no Quest” para manter os MP3 no headset.');
          return;
        }
      } catch (_) { /* Estimate may be unavailable; IndexedDB remains the final quota check. */ }
      const batch = createBatchControl();
      activeBatch = batch;
      await requestPersistence();
      const collection = collectionName.value;
      const total = files.length;
      collectionField.hidden = true;
      progressWrap.hidden = false;
      cancelButton.hidden = false;
      cancelButton.disabled = false;
      let added = 0; let skipped = 0; let failed = total - valid.length; let processed = failed;
      progressBar.value = 0;
      progressLabel.textContent = 'Importando sua biblioteca';
      progressCount.textContent = `0/${total}`;
      say(failed ? `${failed} arquivo(s) ignorado(s): formato diferente de MP3.` : 'Preparando arquivos…');
      for (const file of valid) {
        if (batch.isCancelled()) break;
        try {
          if (await root.MusicDB.findDuplicate(file.name, file.size)) skipped++;
          else {
            const meta = await root.MediaMetadata.readMetadata(file);
            const duration = await root.MediaMetadata.readDuration(file);
            const track = {
              id: (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name, title: meta.title || file.name.replace(/\.mp3$/i, ''),
              artist: meta.artist || '', album: meta.album || '', folder: folderFor(file, collection),
              size: file.size, mimeType: file.type || 'audio/mpeg', duration, importedAt: Date.now(),
              duplicateKey: root.MusicDB.makeDuplicateKey(file.name, file.size), cover: meta.cover,
            };
            await root.MusicDB.saveTrack(track, file); added++;
          }
        } catch (error) { failed++; }
        processed++;
        progressBar.value = Math.round(processed * 100 / total);
        progressCount.textContent = `${processed}/${total}`;
        status.textContent = batch.isCancelled() ? 'Cancelando após a faixa atual…' : `${added} importadas · ${skipped} duplicadas · ${failed} falhas`;
        if (processed % 5 === 0 || processed === total) await refresh();
      }
      await refresh();
      await updateStorage();
      cancelButton.hidden = true;
      progressLabel.textContent = batch.isCancelled() ? 'Importação pausada' : 'Lote concluído';
      status.textContent = `${added} importadas · ${skipped} duplicadas · ${failed} falhas`;
      say(batch.isCancelled() ? 'Lote pausado. Selecione os mesmos arquivos para continuar; os já salvos serão ignorados.' : 'Importação concluída. Seus arquivos permanecem neste navegador.');
      if (activeBatch === batch) activeBatch = null;
    }

    function selected(input, fromFolder) {
      pending.files = Array.from(input.files || []);
      pending.fromFolder = fromFolder;
      input.value = '';
      if (!pending.files.length) return;
      const hasPaths = pending.files.some((file) => file.webkitRelativePath && file.webkitRelativePath.includes('/'));
      collectionField.hidden = hasPaths;
      if (hasPaths) runImport(pending.files);
      else {
        collectionName.value = '';
        collectionName.focus();
        say('Dê um nome à pasta/coleção deste lote para encontrá-lo depois.');
      }
    }

    filesInput.addEventListener('change', () => selected(filesInput, false));
    folderInput.addEventListener('change', () => selected(folderInput, true));
    startImport.addEventListener('click', () => runImport(pending.files));
    chooseQuestFolder.addEventListener('click', async () => {
      try { await runDirectoryImport(await root.showDirectoryPicker({ mode: 'read' })); }
      catch (error) { if (error.name !== 'AbortError') say(error.message || 'Não foi possível escolher uma pasta.'); }
    });
    reconnectFolder.addEventListener('click', async () => {
      try { await restoreFolderAccess(); }
      catch (_) { folderAccess.textContent = 'Não foi possível restaurar a permissão. Escolha a pasta novamente.'; }
    });
    cancelButton.addEventListener('click', () => { activeBatch?.cancel(); cancelButton.disabled = true; });
    list.addEventListener('scroll', render, { passive: true });
    list.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-remove-id]');
      if (!button) return;
      try { await root.MusicDB.deleteTrack(button.dataset.removeId); await refresh(); await updateStorage(); say('Música removida.'); }
      catch (_) { say('Não foi possível remover esta música.'); }
    });
    byId('remove-folder').addEventListener('click', async () => {
      const folder = byId('remove-folder-select').value;
      if (!folder || !root.confirm(`Remover todas as músicas de “${folder}”?`)) return;
      try { await root.MusicDB.deleteFolder(folder); await refresh(); await updateStorage(); say(`Coleção “${folder}” removida.`); }
      catch (_) { say('Não foi possível remover esta coleção.'); }
    });
    byId('clear-library').addEventListener('click', async () => {
      if (!root.confirm('Apagar todas as músicas desta biblioteca?')) return;
      try { await root.MusicDB.clearLibrary(); await refresh(); await updateStorage(); say('Biblioteca apagada.'); }
      catch (_) { say('Não foi possível apagar a biblioteca.'); }
    });
    root.addEventListener('resize', render);
    if (root.navigator && 'serviceWorker' in root.navigator) root.navigator.serviceWorker.register('./sw.js').catch(() => say('Modo offline indisponível neste contexto. Use HTTPS ou localhost.'));
    root.addEventListener('unhandledrejection', (event) => { say(event.reason?.message || 'Ocorreu um erro inesperado.'); });
    refresh().then(refreshFolderAccess);
    updateStorage();
  }

  root.PlayerApp = { isMp3, folderFor, formatBytes, createBatchControl, virtualWindow, formatDuration: (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, supportsDirectoryPicker, makeRelativePath, exceedsAvailableStorage, scanDirectory };
  if (root.document) boot();
})(typeof window === 'undefined' ? globalThis : window);
