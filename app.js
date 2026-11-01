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

  function boot() {
    const doc = root.document;
    if (!doc) return;
    const byId = (id) => doc.getElementById(id);
    const filesInput = byId('file-input');
    const folderInput = byId('folder-input');
    const collectionField = byId('collection-field');
    const collectionName = byId('collection-name');
    const startImport = byId('start-import');
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
    let cancelled = false;
    let rows = [];
    let coverUrls = [];

    if (!('webkitdirectory' in doc.createElement('input'))) folderInput.parentElement.hidden = true;
    const say = (text) => { message.textContent = text || ''; };

    function render() {
      rows.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'pt-BR'));
      byId('track-count').textContent = String(rows.length);
      empty.hidden = rows.length > 0;
      list.hidden = rows.length === 0;
      coverUrls.forEach((url) => URL.revokeObjectURL(url));
      coverUrls = [];
      if (!rows.length) { list.replaceChildren(); return; }
      const rowHeight = 88;
      const start = Math.max(0, Math.floor(list.scrollTop / rowHeight) - 6);
      const visible = Math.ceil((list.clientHeight || 520) / rowHeight) + 12;
      const end = Math.min(rows.length, start + visible);
      const fragment = doc.createDocumentFragment();
      const top = doc.createElement('div'); top.style.height = `${start * rowHeight}px`; fragment.append(top);
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
        row.append(cover, info, duration); fragment.append(row);
      }
      const bottom = doc.createElement('div'); bottom.style.height = `${(rows.length - end) * rowHeight}px`; fragment.append(bottom);
      list.replaceChildren(fragment);
    }

    async function refresh() { try { rows = await root.MusicDB.listTracks(); render(); } catch (error) { say(`Não foi possível abrir a biblioteca: ${error.message}`); } }

    function formatDuration(seconds) {
      const value = Math.floor(seconds);
      return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
    }

    async function runImport(files) {
      const collection = collectionName.value;
      const valid = files.filter(isMp3);
      const total = files.length;
      if (!valid.length) { say('Selecione arquivos MP3 para importar.'); return; }
      collectionField.hidden = true;
      progressWrap.hidden = false;
      cancelButton.hidden = false;
      cancelButton.disabled = false;
      cancelled = false;
      let added = 0; let skipped = 0; let failed = total - valid.length; let processed = failed;
      progressBar.value = 0;
      progressLabel.textContent = 'Importando sua biblioteca';
      progressCount.textContent = `0/${total}`;
      say(failed ? `${failed} arquivo(s) ignorado(s): formato diferente de MP3.` : 'Preparando arquivos…');
      for (const file of valid) {
        if (cancelled) break;
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
        status.textContent = cancelled ? 'Cancelando após a faixa atual…' : `${added} importadas · ${skipped} duplicadas · ${failed} falhas`;
        if (processed % 5 === 0 || processed === total) await refresh();
      }
      await refresh();
      cancelButton.hidden = true;
      progressLabel.textContent = cancelled ? 'Importação pausada' : 'Lote concluído';
      status.textContent = `${added} importadas · ${skipped} duplicadas · ${failed} falhas`;
      say(cancelled ? 'Lote pausado. Selecione os mesmos arquivos para continuar; os já salvos serão ignorados.' : 'Importação concluída. Seus arquivos permanecem neste navegador.');
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
    cancelButton.addEventListener('click', () => { cancelled = true; cancelButton.disabled = true; });
    list.addEventListener('scroll', render, { passive: true });
    root.addEventListener('resize', render);
    root.addEventListener('unhandledrejection', (event) => { say(event.reason?.message || 'Ocorreu um erro inesperado.'); });
    refresh();
  }

  root.PlayerApp = { isMp3, folderFor, formatDuration: (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` };
  if (root.document) boot();
})(typeof window === 'undefined' ? globalThis : window);
