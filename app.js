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

  function loadStoredJson(storage, key, fallback) {
    try {
      const value = storage?.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) { return fallback; }
  }

  function saveStoredJson(storage, key, value) {
    try {
      if (!storage || typeof storage.setItem !== 'function') return false;
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) { return false; }
  }

  function reconcileCatalogState(favorites, history, tracks) {
    const available = new Set((tracks || []).map((track) => track.id));
    const validFavorites = [...new Set((Array.isArray(favorites) ? favorites : []).filter((id) => typeof id === 'string' && available.has(id)))];
    const validHistory = (Array.isArray(history) ? history : []).filter((entry) => entry && typeof entry.trackId === 'string' && available.has(entry.trackId) && (typeof entry.playedAt === 'number' || typeof entry.playedAt === 'string')).slice(0, 100);
    return { favorites: validFavorites, history: validHistory };
  }

  function consumeQueue(queue) {
    const [trackId = null, ...remaining] = queue || [];
    return { trackId, queue: remaining };
  }

  function nextQueuedTarget(queue, queueResumeId, order, currentId, loopMode = 'off', automatic = false) {
    if (queue?.length) {
      const resumeId = queueResumeId === undefined ? adjacentTrackId(order, currentId, 'next', loopMode, automatic) : queueResumeId;
      const next = consumeQueue(queue);
      return { ...next, queueResumeId: resumeId, fromQueue: true, resuming: false };
    }
    if (queueResumeId !== undefined) return { trackId: queueResumeId, queue: [], queueResumeId: undefined, fromQueue: false, resuming: true };
    return null;
  }

  function recordStartedSession(history, trackId, sessionId, lastSessionId, playedAt = Date.now()) {
    if (!trackId || sessionId === lastSessionId) return { history: history || [], lastSessionId };
    return { history: recordPlay(history, trackId, playedAt), lastSessionId: sessionId };
  }

  function beginPlaybackSession(sessionId, audioEnded) {
    return audioEnded ? sessionId + 1 : sessionId;
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
    let searchQuery = '';
    let favoritesOnly = false;
    let lastMetadataTrackId = Symbol('unset');
    let seeking = false;
    let favorites = [];
    let history = [];
    let queue = [];
    let playbackSession = 0;
    let lastRecordedSession = -1;
    let queueResumeId;
    let stateLoaded = false;
    let storage = null;
    try { storage = root.localStorage || null; } catch (_) { storage = null; }

    function currentTrack() { return rows.find((track) => track.id === currentId) || null; }
    function scopedTracks() { return filterByFolders(rows, selectedFolders); }
    function visibleTracks() { return searchTracks(scopedTracks(), searchQuery, favoritesOnly, favorites); }

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
      byId('track-search').placeholder = selectedFolders.size ? 'Buscar nas pastas selecionadas…' : 'Buscar em todas as pastas…';
    }

    function render() {
      visibleRows = visibleTracks().sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'pt-BR'));
      byId('track-count').textContent = String(visibleRows.length);
      byId('library-label').textContent = selectedFolders.size ? 'Músicas filtradas' : 'Todas as músicas';
      empty.hidden = visibleRows.length > 0;
      list.hidden = visibleRows.length === 0;
      if (!visibleRows.length) {
        empty.querySelector('h3').textContent = rows.length ? 'Nenhuma música encontrada' : 'A biblioteca está vazia';
        empty.querySelector('p').textContent = rows.length ? 'Tente outro termo ou ajuste os filtros.' : 'O catálogo ainda não contém músicas.';
        list.replaceChildren();
        return;
      }
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
        const isFavorite = favorites.includes(track.id);
        const favorite = doc.createElement('button'); favorite.className = 'row-action row-favorite'; favorite.type = 'button'; favorite.dataset.favoriteId = track.id;
        favorite.textContent = isFavorite ? '♥' : '♡'; favorite.setAttribute('aria-pressed', String(isFavorite));
        favorite.setAttribute('aria-label', `${isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${track.title || track.name}`);
        const addQueue = doc.createElement('button'); addQueue.className = 'row-action'; addQueue.type = 'button'; addQueue.dataset.queueId = track.id;
        addQueue.textContent = '+'; addQueue.setAttribute('aria-label', `Adicionar à fila: ${track.title || track.name}`);
        const playNext = doc.createElement('button'); playNext.className = 'row-action row-play-next'; playNext.type = 'button'; playNext.dataset.playNextId = track.id;
        playNext.textContent = 'A seguir'; playNext.title = 'Tocar a seguir'; playNext.setAttribute('aria-label', `Tocar a seguir: ${track.title || track.name}`);
        const play = doc.createElement('button'); play.className = 'row-play'; play.type = 'button'; play.dataset.playId = track.id;
        play.textContent = track.id === currentId && !audio.paused ? 'Ⅱ' : '▶'; play.setAttribute('aria-label', `${track.id === currentId && !audio.paused ? 'Pausar' : 'Tocar'} ${track.title || track.name}`);
        row.append(cover, info, duration, favorite, addQueue, playNext, play); fragment.append(row);
      }
      const bottom = doc.createElement('div'); bottom.style.height = `${window.bottom}px`; fragment.append(bottom);
      list.replaceChildren(fragment);
    }

    function renderQueue() {
      const queueList = byId('queue-list');
      const fragment = doc.createDocumentFragment();
      queue.forEach((trackId, index) => {
        const track = rows.find((item) => item.id === trackId);
        if (!track) return;
        const item = doc.createElement('li'); item.className = 'drawer-row';
        const title = doc.createElement('span'); title.className = 'drawer-track-title'; title.textContent = track.title || track.name;
        const artist = doc.createElement('span'); artist.className = 'drawer-track-meta'; artist.textContent = track.artist || track.folder || '';
        const info = doc.createElement('span'); info.className = 'drawer-track-info'; info.append(title, artist);
        const actions = doc.createElement('span'); actions.className = 'drawer-actions';
        for (const [action, label, symbol, disabled] of [
          ['up', 'Mover para cima', '↑', index === 0],
          ['down', 'Mover para baixo', '↓', index === queue.length - 1],
          ['remove', 'Remover da fila', '×', false],
        ]) {
          const button = doc.createElement('button'); button.className = 'row-action'; button.type = 'button'; button.dataset.queueAction = action; button.dataset.queueIndex = String(index);
          button.textContent = symbol; button.disabled = disabled; button.setAttribute('aria-label', `${label}: ${track.title || track.name}`); actions.append(button);
        }
        item.append(info, actions); fragment.append(item);
      });
      queueList.replaceChildren(fragment);
      byId('queue-count').textContent = String(queue.length);
      byId('queue-empty').hidden = queue.length > 0;
    }

    function renderHistory() {
      const historyList = byId('history-list');
      const fragment = doc.createDocumentFragment();
      history.forEach((entry, index) => {
        const track = rows.find((item) => item.id === entry.trackId);
        if (!track) return;
        const item = doc.createElement('li'); item.className = 'drawer-row';
        const title = doc.createElement('span'); title.className = 'drawer-track-title'; title.textContent = track.title || track.name;
        const played = doc.createElement('span'); played.className = 'drawer-track-meta';
        const time = new Date(entry.playedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        played.textContent = [track.artist, time].filter(Boolean).join(' · ');
        const info = doc.createElement('span'); info.className = 'drawer-track-info'; info.append(title, played);
        const play = doc.createElement('button'); play.className = 'row-action'; play.type = 'button'; play.dataset.historyId = track.id; play.dataset.historyIndex = String(index);
        play.textContent = '▶'; play.setAttribute('aria-label', `Reproduzir do histórico: ${track.title || track.name}`);
        item.append(info, play); fragment.append(item);
      });
      historyList.replaceChildren(fragment);
      byId('history-count').textContent = String(history.length);
      byId('history-empty').hidden = history.length > 0;
      byId('clear-history').hidden = history.length === 0;
    }

    function setCurrent(track, autoplay = true) {
      if (!track) return;
      currentId = track.id;
      queueResumeId = undefined;
      playbackSession++;
      if (shuffle) playOrder = buildPlayOrder(scopedTracks(), true, Math.random, currentId);
      else playOrder = buildPlayOrder(scopedTracks(), false, Math.random, currentId);
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
            const first = visibleRows[0]?.id || playOrder[0];
            const track = visibleRows.find((item) => item.id === first);
            if (!track) { updateStatus('Nenhuma faixa disponível neste escopo.'); return; }
            setCurrent(track, false);
          }
          if (audio.ended) {
            audio.currentTime = 0;
            playbackSession = beginPlaybackSession(playbackSession, true);
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
      if (direction === 'previous') queueResumeId = undefined;
      if (direction === 'next' && queue.length && queueResumeId === undefined && loopMode === 'all' && currentId && playOrder.indexOf(currentId) === playOrder.length - 1) {
        playOrder = buildNextCycle(scopedTracks(), currentId, shuffle);
      }
      if (direction === 'next' && (queue.length || queueResumeId !== undefined)) {
        const next = nextQueuedTarget(queue, queueResumeId, playOrder, currentId, loopMode, automatic);
        queue = next.queue;
        queueResumeId = next.queueResumeId;
        renderQueue();
        if (next.resuming && !next.trackId) {
          queueResumeId = undefined;
          audio.pause(); updateStatus('Fim da lista.'); updatePlayer();
          return;
        }
        const targetPool = next.fromQueue ? rows : scopedTracks();
        const nextTrack = targetPool.find((track) => track.id === next.trackId);
        if (nextTrack) {
          currentId = nextTrack.id;
          playbackSession++;
          audio.src = nextTrack.url;
          audio.load();
          updatePlayer();
          togglePlayback(true);
          return;
        }
        if (next.resuming) queueResumeId = undefined;
      }
      if (direction === 'next' && loopMode === 'all' && currentId && playOrder.indexOf(currentId) === playOrder.length - 1) {
        playOrder = buildNextCycle(scopedTracks(), currentId, shuffle);
      }
      const nextId = adjacentTrackId(playOrder, currentId, direction, loopMode, automatic);
      if (!nextId) {
        if (direction === 'next') { audio.pause(); updateStatus('Fim da lista.'); updatePlayer(); }
        return;
      }
      const nextTrack = scopedTracks().find((track) => track.id === nextId);
      if (!nextTrack) return;
      if (nextId === currentId) {
        audio.currentTime = 0;
        if (automatic) { playbackSession++; togglePlayback(true); }
        else updatePlayer();
        return;
      }
      currentId = nextId;
      playbackSession++;
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
      visibleRows = visibleTracks();
      if (oldTrack && !scopedTracks().some((track) => track.id === currentId)) {
        audio.pause(); audio.removeAttribute('src'); audio.load(); currentId = null;
      }
      queueResumeId = undefined;
      playOrder = buildPlayOrder(scopedTracks(), shuffle, Math.random, currentId);
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
        if (!stateLoaded) {
          const saved = reconcileCatalogState(
            loadStoredJson(storage, '64mp:favorites:v1', []),
            loadStoredJson(storage, '64mp:history:v1', []),
            rows,
          );
          favorites = saved.favorites;
          history = saved.history;
          saveStoredJson(storage, '64mp:favorites:v1', favorites);
          saveStoredJson(storage, '64mp:history:v1', history);
          stateLoaded = true;
        }
        status.textContent = `Biblioteca pública · ${rows.length} faixas · requer internet para reproduzir`;
        empty.querySelector('p').textContent = 'O catálogo ainda não contém músicas.';
        renderFolderOptions();
        playOrder = buildPlayOrder(scopedTracks(), shuffle);
        render();
        renderQueue();
        renderHistory();
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
      playOrder = buildPlayOrder(scopedTracks(), shuffle, Math.random, currentId);
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
    byId('track-search').addEventListener('input', (event) => {
      searchQuery = event.target.value;
      list.scrollTop = 0;
      render();
    });
    byId('favorites-only').addEventListener('click', (event) => {
      favoritesOnly = !favoritesOnly;
      event.currentTarget.setAttribute('aria-pressed', String(favoritesOnly));
      event.currentTarget.textContent = favoritesOnly ? '♥ Favoritos: ligados' : '♡ Favoritos';
      list.scrollTop = 0;
      render();
    });
    byId('clear-history').addEventListener('click', () => {
      history = [];
      saveStoredJson(storage, '64mp:history:v1', history);
      renderHistory();
    });
    byId('queue-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-queue-action]');
      if (!button) return;
      const index = Number(button.dataset.queueIndex);
      if (button.dataset.queueAction === 'up') queue = moveQueueItem(queue, index, index - 1);
      else if (button.dataset.queueAction === 'down') queue = moveQueueItem(queue, index, index + 1);
      else if (button.dataset.queueAction === 'remove') queue = removeQueueItem(queue, index);
      renderQueue();
    });
    byId('history-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-history-id]');
      if (!button) return;
      const track = rows.find((item) => item.id === button.dataset.historyId);
      if (track) setCurrent(track, true);
    });
    list.addEventListener('click', (event) => {
      const favoriteButton = event.target.closest('[data-favorite-id]');
      if (favoriteButton) {
        favorites = toggleFavorite(favorites, favoriteButton.dataset.favoriteId);
        saveStoredJson(storage, '64mp:favorites:v1', favorites);
        render();
        return;
      }
      const queueButton = event.target.closest('[data-queue-id], [data-play-next-id]');
      if (queueButton) {
        const trackId = queueButton.dataset.queueId || queueButton.dataset.playNextId;
        queue = queueButton.hasAttribute('data-play-next-id') ? insertQueueNext(queue, trackId) : [...queue, trackId];
        renderQueue();
        updateStatus(queueButton.hasAttribute('data-play-next-id') ? 'Faixa adicionada para tocar a seguir.' : 'Faixa adicionada ao fim da fila.');
        return;
      }
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
    audio.addEventListener('playing', () => {
      const result = recordStartedSession(history, currentId, playbackSession, lastRecordedSession, Date.now());
      if (result.lastSessionId !== lastRecordedSession) {
        history = result.history;
        lastRecordedSession = result.lastSessionId;
        saveStoredJson(storage, '64mp:history:v1', history);
        renderHistory();
      }
    });
    audio.addEventListener('pause', updatePlayer);
    audio.addEventListener('ended', () => moveTrack('next', true));
    audio.addEventListener('error', () => updateStatus('Erro ao carregar a faixa. Verifique a conexão e tente outra música.'));
    if (root.navigator && 'serviceWorker' in root.navigator) root.navigator.serviceWorker.register('./sw.js').catch(() => {});
    refresh();
  }

  root.PlayerApp = { loadCatalog, validateCatalog, virtualWindow, formatDuration, fisherYates, buildPlayOrder, buildNextCycle, adjacentTrackId, filterByFolders, nextFolderSelection, seekTarget, normalizeSearchText, searchTracks, toggleFavorite, recordPlay, insertQueueNext, moveQueueItem, removeQueueItem, loadStoredJson, saveStoredJson, reconcileCatalogState, consumeQueue, nextQueuedTarget, recordStartedSession, beginPlaybackSession, configureMediaSession };
  if (root.document) boot();
})(typeof window === 'undefined' ? globalThis : window);
