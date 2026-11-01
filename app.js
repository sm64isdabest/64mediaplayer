(function (root) {
  'use strict';

  function validateCatalog(payload) {
    if (!payload || payload.version !== 1 || !Array.isArray(payload.tracks)) throw new Error('O catálogo público está em formato inválido.');
    for (const track of payload.tracks) {
      let url;
      try { url = new root.URL(track.url); } catch (_) { throw new Error('O catálogo público contém uma faixa inválida.'); }
      if (!track || typeof track.id !== 'string' || typeof track.title !== 'string' || url.protocol !== 'https:' || typeof track.assetName !== 'string') {
        throw new Error('O catálogo público contém uma faixa inválida.');
      }
    }
    return payload.tracks;
  }

  async function loadCatalog(url = './music-catalog.json', fetcher = root.fetch?.bind(root)) {
    if (typeof fetcher !== 'function') throw new Error('Este navegador não consegue carregar o catálogo.');
    const response = await fetcher(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Catálogo indisponível (HTTP ${response.status}).`);
    return validateCatalog(await response.json());
  }

  function fisherYates(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function buildPlayOrder(tracks, shuffle = false, random = Math.random, currentId = null) {
    const ids = tracks.map((track) => track.id);
    if (!shuffle) return ids;
    const pinned = currentId && ids.includes(currentId) ? currentId : null;
    const remaining = ids.filter((id) => id !== pinned);
    const upcoming = fisherYates(remaining, random);
    return pinned ? [pinned, ...upcoming] : upcoming;
  }

  function buildNextCycle(tracks, currentId, shuffle = false, random = Math.random) {
    if (!shuffle) return tracks.map((track) => track.id);
    const hasCurrent = tracks.some((track) => track.id === currentId);
    const remaining = tracks.filter((track) => track.id !== currentId).map((track) => track.id);
    return [...fisherYates(remaining, random), ...(hasCurrent ? [currentId] : [])];
  }

  function adjacentTrackId(order, currentId, direction, loopMode = 'off', automatic = false) {
    if (!order.length) return null;
    if (direction === 'next' && automatic && loopMode === 'track' && currentId && order.includes(currentId)) return currentId;
    const currentIndex = order.indexOf(currentId);
    if (currentIndex < 0) return direction === 'previous' ? order[order.length - 1] : order[0];
    const step = direction === 'previous' ? -1 : 1;
    const targetIndex = currentIndex + step;
    if (targetIndex >= 0 && targetIndex < order.length) return order[targetIndex];
    if (loopMode === 'all') return direction === 'previous' ? order[order.length - 1] : order[0];
    return direction === 'previous' ? currentId : null;
  }

  function filterByFolders(tracks, folders) {
    const selected = new Set(folders || []);
    return selected.size ? tracks.filter((track) => selected.has(track.folder || 'Sem pasta')) : [...tracks];
  }

  function nextFolderSelection(currentFolders, folder, checked, selectAll = false) {
    if (selectAll) return new Set();
    const next = new Set(currentFolders || []);
    if (checked) next.add(folder);
    else next.delete(folder);
    return next;
  }

  function seekTarget(value, duration) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || !Number.isFinite(duration) || duration <= 0) return null;
    return Math.max(0, Math.min(numericValue, duration));
  }

  function normalizeSearchText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  }

  function searchTracks(tracks, query, favoritesOnly = false, favorites = []) {
    const needle = normalizeSearchText(query).trim();
    const favoriteIds = new Set(favorites || []);
    return (tracks || []).filter((track) => {
      if (favoritesOnly && !favoriteIds.has(track.id)) return false;
      if (!needle) return true;
      const searchable = [track.title, track.name, track.artist, track.album, track.folder].map(normalizeSearchText).join(' ');
      return searchable.includes(needle);
    });
  }

  function toggleFavorite(favorites, trackId) {
    const unique = [...new Set(favorites || [])];
    return unique.includes(trackId) ? unique.filter((id) => id !== trackId) : [...unique, trackId];
  }

  function recordPlay(history, trackId, playedAt = Date.now(), limit = 100) {
    const entry = { trackId, playedAt };
    const maximum = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 100;
    return [entry, ...(history || [])].slice(0, maximum);
  }

  function insertQueueNext(queue, trackId) {
    return [trackId, ...(queue || [])];
  }

  function moveQueueItem(queue, fromIndex, toIndex) {
    const result = [...(queue || [])];
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < 0 || fromIndex >= result.length || toIndex >= result.length) return result;
    const [item] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, item);
    return result;
  }

  function removeQueueItem(queue, index) {
    const result = [...(queue || [])];
    if (!Number.isInteger(index) || index < 0 || index >= result.length) return result;
    result.splice(index, 1);
    return result;
  }

  function configureMediaSession(session, metadata, handlers, MetadataConstructor = root.MediaMetadata) {
    if (!session) return false;
    if (MetadataConstructor) {
      try { session.metadata = new MetadataConstructor(metadata); } catch (_) { /* Metadata is optional on partial implementations. */ }
    }
    for (const [action, handler] of Object.entries(handlers || {})) {
      try { session.setActionHandler(action, handler); } catch (_) { /* Keep the other supported actions. */ }
    }
    return true;
  }

  function virtualWindow(count, scrollTop, viewportHeight, rowHeight = 88, overscan = 6) {
    const maxScroll = Math.max(0, count * rowHeight - viewportHeight);
    const clampedScroll = Math.min(Math.max(0, scrollTop), maxScroll);
    const first = Math.floor(clampedScroll / rowHeight);
    const start = Math.max(0, first - overscan);
    const end = Math.min(count, first + Math.ceil(viewportHeight / rowHeight) + overscan);
    return { start, end, top: start * rowHeight, bottom: (count - end) * rowHeight, clampedScroll };
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    const value = Math.floor(seconds);
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  function boot() {
    const doc = root.document;
    if (!doc) return;
    const byId = (id) => doc.getElementById(id);
    const list = byId('track-list');
    const empty = byId('empty-state');
    const status = byId('catalog-status');
    const retry = byId('catalog-retry');
    const audio = byId('audio-deck');
    const folderOptions = byId('folder-filter-options');
    let rows = [];
    let visibleRows = [];
    let selectedFolders = new Set();
    let playOrder = [];
    let currentId = null;
    let shuffle = false;
    let loopMode = 'off';
    let lastMetadataTrackId = Symbol('unset');
    let seeking = false;

    function currentTrack() { return rows.find((track) => track.id === currentId) || null; }
    function scopedTracks() { return filterByFolders(rows, selectedFolders); }

    function updateStatus(message) {
      byId('player-message').textContent = message || '';
    }

    function updateMediaSession() {
      const track = currentTrack();
      const mediaSession = root.navigator?.mediaSession;
      if (track?.id !== lastMetadataTrackId) {
        const iconUrl = root.location?.href ? new root.URL('./assets/app-icon.svg', root.location.href).href : './assets/app-icon.svg';
        const metadata = track ? {
          title: track.title || track.name,
          artist: track.artist || 'Artista desconhecido',
          album: track.album || '64 Media Player',
          artwork: [{ src: iconUrl, sizes: '512x512', type: 'image/svg+xml' }],
        } : { title: '64 Media Player', artist: '', album: '' };
        configureMediaSession(mediaSession, metadata, {
          play: () => togglePlayback(true),
          pause: () => togglePlayback(false),
          previoustrack: () => moveTrack('previous', false),
          nexttrack: () => moveTrack('next', false),
          seekbackward: (details) => seekBy(-(details.seekOffset || 10)),
          seekforward: (details) => seekBy(details.seekOffset || 10),
          seekto: (details) => { if (Number.isFinite(details.seekTime)) seekTo(details.seekTime); },
        });
        lastMetadataTrackId = track?.id ?? null;
      }
      if (mediaSession) {
        try { mediaSession.playbackState = audio.paused ? (track ? 'paused' : 'none') : 'playing'; } catch (_) { /* Browser support varies. */ }
      }
    }

    function updatePlayer() {
      const track = currentTrack();
      byId('current-title').textContent = track ? (track.title || track.name) : 'Escolha uma música';
      byId('current-artist').textContent = track ? [track.artist, track.album].filter(Boolean).join(' · ') : 'Pronto para reproduzir';
      const playButton = byId('play-toggle');
      playButton.textContent = audio.paused ? '▶' : 'Ⅱ';
      playButton.setAttribute('aria-label', audio.paused ? 'Reproduzir' : 'Pausar');
      byId('elapsed-time').textContent = formatDuration(audio.currentTime);
      const duration = Number.isFinite(audio.duration) ? audio.duration : (Number.isFinite(track?.duration) ? track.duration : Number.NaN);
      byId('duration-time').textContent = formatDuration(duration);
      const seek = byId('seek-control');
      if (!seeking) seek.value = Number.isFinite(audio.duration) && audio.duration > 0 ? String(Math.round(audio.currentTime / audio.duration * 1000)) : '0';
      seek.disabled = !Number.isFinite(audio.duration) || audio.duration <= 0;
      byId('volume-control').value = String(audio.volume);
      byId('shuffle-toggle').setAttribute('aria-pressed', String(shuffle));
      byId('shuffle-toggle').textContent = shuffle ? 'Aleatório: ligado' : 'Aleatório: desligado';
      const loopLabels = { off: 'Repetir: desligado', track: 'Repetir: faixa', all: 'Repetir: lista' };
      byId('loop-toggle').textContent = loopLabels[loopMode];
      byId('loop-toggle').setAttribute('aria-label', loopLabels[loopMode]);
      byId('loop-toggle').setAttribute('aria-pressed', String(loopMode !== 'off'));
      updateMediaSession();
      render();
    }

    function renderFolderOptions() {
      const folders = [...new Set(rows.map((track) => track.folder || 'Sem pasta'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const fragment = doc.createDocumentFragment();
      const allLabel = doc.createElement('label'); allLabel.className = 'folder-option';
      const all = doc.createElement('input'); all.type = 'checkbox'; all.checked = selectedFolders.size === 0; all.dataset.allFolders = 'true';
      allLabel.append(all, doc.createTextNode('Todas as pastas')); fragment.append(allLabel);
      for (const folder of folders) {
        const label = doc.createElement('label'); label.className = 'folder-option';
        const checkbox = doc.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = folder; checkbox.checked = selectedFolders.has(folder);
        label.append(checkbox, doc.createTextNode(folder)); fragment.append(label);
      }
      folderOptions.replaceChildren(fragment);
      const title = selectedFolders.size ? `${selectedFolders.size} pasta(s) selecionada(s)` : 'Todas as pastas';
      byId('folder-filter-summary').textContent = title;
    }

    function render() {
      visibleRows = scopedTracks().sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'pt-BR'));
      byId('track-count').textContent = String(visibleRows.length);
      byId('library-label').textContent = selectedFolders.size ? 'Músicas filtradas' : 'Todas as músicas';
      empty.hidden = visibleRows.length > 0;
      list.hidden = visibleRows.length === 0;
      if (!visibleRows.length) { list.replaceChildren(); return; }
      const window = virtualWindow(visibleRows.length, list.scrollTop, list.clientHeight || 520, 88, 6);
      if (window.clampedScroll !== list.scrollTop) list.scrollTop = window.clampedScroll;
      const fragment = doc.createDocumentFragment();
      const top = doc.createElement('div'); top.style.height = `${window.top}px`; fragment.append(top);
      for (const track of visibleRows.slice(window.start, window.end)) {
        const row = doc.createElement('article'); row.className = `track-row${track.id === currentId ? ' is-current' : ''}`;
        const cover = doc.createElement('div'); cover.className = 'track-cover'; cover.textContent = '♫'; cover.setAttribute('aria-hidden', 'true');
        const info = doc.createElement('div'); info.className = 'track-info';
        const title = doc.createElement('strong'); title.textContent = track.title || track.name;
        const details = doc.createElement('span'); details.textContent = [track.artist, track.album, track.folder].filter(Boolean).join(' · ');
        info.append(title, details);
        const duration = doc.createElement('span'); duration.className = 'track-duration'; duration.textContent = Number.isFinite(track.duration) ? formatDuration(track.duration) : '—';
        const play = doc.createElement('button'); play.className = 'row-play'; play.type = 'button'; play.dataset.playId = track.id;
        play.textContent = track.id === currentId && !audio.paused ? 'Ⅱ' : '▶'; play.setAttribute('aria-label', `${track.id === currentId && !audio.paused ? 'Pausar' : 'Tocar'} ${track.title || track.name}`);
        row.append(cover, info, duration, play); fragment.append(row);
      }
      const bottom = doc.createElement('div'); bottom.style.height = `${window.bottom}px`; fragment.append(bottom);
      list.replaceChildren(fragment);
    }

    function setCurrent(track, autoplay = true) {
      if (!track) return;
      currentId = track.id;
      if (shuffle) playOrder = buildPlayOrder(visibleRows, true, Math.random, currentId);
      else playOrder = buildPlayOrder(visibleRows, false, Math.random, currentId);
      audio.src = track.url;
      audio.load();
      updatePlayer();
      if (autoplay) togglePlayback(true);
    }

    async function togglePlayback(forcePlay = null) {
      try {
        if (forcePlay === false || (forcePlay === null && !audio.paused)) { audio.pause(); updateStatus('Pausado'); }
        else {
          if (!currentTrack()) {
            const first = playOrder[0] || visibleRows[0]?.id;
            const track = visibleRows.find((item) => item.id === first);
            if (!track) { updateStatus('Nenhuma faixa disponível neste escopo.'); return; }
            setCurrent(track, false);
          }
          await audio.play();
          updateStatus('Reproduzindo');
        }
      } catch (_) {
        updateStatus('Não foi possível reproduzir esta faixa. Verifique a conexão e tente novamente.');
      }
      updatePlayer();
    }

    function moveTrack(direction, automatic = false) {
      if (direction === 'next' && loopMode === 'all' && currentId && playOrder.indexOf(currentId) === playOrder.length - 1) {
        playOrder = buildNextCycle(visibleRows, currentId, shuffle);
      }
      const nextId = adjacentTrackId(playOrder, currentId, direction, loopMode, automatic);
      if (!nextId) {
        if (direction === 'next') { audio.pause(); updateStatus('Fim da lista.'); updatePlayer(); }
        return;
      }
      const nextTrack = visibleRows.find((track) => track.id === nextId);
      if (!nextTrack) return;
      if (nextId === currentId) {
        audio.currentTime = 0;
        if (automatic) togglePlayback(true);
        else updatePlayer();
        return;
      }
      currentId = nextId;
      audio.src = nextTrack.url;
      audio.load();
      updatePlayer();
      togglePlayback(true);
    }

    function seekTo(value) {
      const target = seekTarget(value, audio.duration);
      if (target === null) return;
      audio.currentTime = target;
      updatePlayer();
    }

    function seekBy(offset) {
      if (!Number.isFinite(audio.duration)) return;
      seekTo(audio.currentTime + offset);
    }

    function applyScope() {
      renderFolderOptions();
      const oldTrack = currentTrack();
      visibleRows = scopedTracks();
      if (oldTrack && !visibleRows.some((track) => track.id === currentId)) {
        audio.pause(); audio.removeAttribute('src'); audio.load(); currentId = null;
      }
      playOrder = buildPlayOrder(visibleRows, shuffle, Math.random, currentId);
      list.scrollTop = 0;
      updatePlayer();
      updateStatus(selectedFolders.size ? 'Escopo de reprodução atualizado.' : 'Escopo em todas as pastas.');
    }

    function onFolderChange(event) {
      const checkbox = event.target.closest('input[type="checkbox"]');
      if (!checkbox) return;
      selectedFolders = nextFolderSelection(selectedFolders, checkbox.value, checkbox.checked, checkbox.dataset.allFolders === 'true');
      applyScope();
    }

    async function refresh() {
      retry.hidden = true;
      status.textContent = 'Carregando biblioteca pública…';
      try {
        rows = await loadCatalog('./music-catalog.json');
        status.textContent = `Biblioteca pública · ${rows.length} faixas · requer internet para reproduzir`;
        empty.querySelector('p').textContent = 'O catálogo ainda não contém músicas.';
        renderFolderOptions();
        playOrder = buildPlayOrder(scopedTracks(), shuffle);
        render();
      } catch (error) {
        rows = []; render();
        status.textContent = root.navigator?.onLine === false ? 'Você está offline. Conecte-se para carregar a biblioteca pública.' : (error.message || 'Não foi possível carregar o catálogo.');
        empty.querySelector('p').textContent = 'Verifique sua conexão e tente carregar o catálogo novamente.';
        retry.hidden = false;
      }
    }

    retry.addEventListener('click', refresh);
    byId('play-toggle').addEventListener('click', () => togglePlayback());
    byId('previous-track').addEventListener('click', () => {
      if (audio.currentTime > 3) { audio.currentTime = 0; updatePlayer(); }
      else moveTrack('previous');
    });
    byId('next-track').addEventListener('click', () => moveTrack('next'));
    byId('shuffle-toggle').addEventListener('click', () => {
      shuffle = !shuffle;
      playOrder = buildPlayOrder(visibleRows, shuffle, Math.random, currentId);
      updatePlayer(); updateStatus(shuffle ? 'Aleatório ativado.' : 'Aleatório desativado.');
    });
    byId('loop-toggle').addEventListener('click', () => {
      loopMode = loopMode === 'off' ? 'track' : loopMode === 'track' ? 'all' : 'off';
      updatePlayer();
    });
    byId('seek-control').addEventListener('input', (event) => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      seekTo(Number(event.target.value) / 1000 * audio.duration);
    });
    byId('seek-control').addEventListener('pointerdown', () => { seeking = true; });
    byId('seek-control').addEventListener('pointerup', () => { seeking = false; });
    byId('seek-control').addEventListener('blur', () => { seeking = false; });
    byId('volume-control').addEventListener('input', (event) => { audio.volume = Math.max(0, Math.min(1, Number(event.target.value))); updatePlayer(); });
    folderOptions.addEventListener('change', onFolderChange);
    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-play-id]');
      if (!button) return;
      const track = visibleRows.find((item) => item.id === button.dataset.playId);
      if (track?.id === currentId && !audio.paused) togglePlayback(false);
      else setCurrent(track, true);
    });
    list.addEventListener('scroll', render, { passive: true });
    root.addEventListener('resize', render);
    root.addEventListener('online', refresh);
    audio.addEventListener('timeupdate', updatePlayer);
    audio.addEventListener('durationchange', updatePlayer);
    audio.addEventListener('loadedmetadata', updatePlayer);
    audio.addEventListener('play', () => { updateStatus('Reproduzindo'); updatePlayer(); });
    audio.addEventListener('pause', updatePlayer);
    audio.addEventListener('ended', () => moveTrack('next', true));
    audio.addEventListener('error', () => updateStatus('Erro ao carregar a faixa. Verifique a conexão e tente outra música.'));
    if (root.navigator && 'serviceWorker' in root.navigator) root.navigator.serviceWorker.register('./sw.js').catch(() => {});
    refresh();
  }

  root.PlayerApp = { loadCatalog, validateCatalog, virtualWindow, formatDuration, fisherYates, buildPlayOrder, buildNextCycle, adjacentTrackId, filterByFolders, nextFolderSelection, seekTarget, normalizeSearchText, searchTracks, toggleFavorite, recordPlay, insertQueueNext, moveQueueItem, removeQueueItem, configureMediaSession };
  if (root.document) boot();
})(typeof window === 'undefined' ? globalThis : window);
