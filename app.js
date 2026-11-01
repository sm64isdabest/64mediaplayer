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

  function virtualWindow(count, scrollTop, viewportHeight, rowHeight = 88, overscan = 6) {
    const maxScroll = Math.max(0, count * rowHeight - viewportHeight);
    const clampedScroll = Math.min(Math.max(0, scrollTop), maxScroll);
    const first = Math.floor(clampedScroll / rowHeight);
    const start = Math.max(0, first - overscan);
    const end = Math.min(count, first + Math.ceil(viewportHeight / rowHeight) + overscan);
    return { start, end, top: start * rowHeight, bottom: (count - end) * rowHeight, clampedScroll };
  }

  function formatDuration(seconds) {
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
    let rows = [];

    function render() {
      rows.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'pt-BR'));
      byId('track-count').textContent = String(rows.length);
      empty.hidden = rows.length > 0;
      list.hidden = rows.length === 0;
      if (!rows.length) { list.replaceChildren(); return; }
      const rowHeight = 88;
      const window = virtualWindow(rows.length, list.scrollTop, list.clientHeight || 520, rowHeight, 6);
      if (window.clampedScroll !== list.scrollTop) list.scrollTop = window.clampedScroll;
      const fragment = doc.createDocumentFragment();
      const top = doc.createElement('div'); top.style.height = `${window.top}px`; fragment.append(top);
      for (const track of rows.slice(window.start, window.end)) {
        const row = doc.createElement('article'); row.className = 'track-row';
        const cover = doc.createElement('div'); cover.className = 'track-cover'; cover.textContent = '♫'; cover.setAttribute('aria-hidden', 'true');
        const info = doc.createElement('div'); info.className = 'track-info';
        const title = doc.createElement('strong'); title.textContent = track.title || track.name;
        const details = doc.createElement('span'); details.textContent = [track.artist, track.album, track.folder].filter(Boolean).join(' · ');
        info.append(title, details);
        const duration = doc.createElement('span'); duration.className = 'track-duration'; duration.textContent = Number.isFinite(track.duration) ? formatDuration(track.duration) : '—';
        row.append(cover, info, duration); fragment.append(row);
      }
      const bottom = doc.createElement('div'); bottom.style.height = `${window.bottom}px`; fragment.append(bottom);
      list.replaceChildren(fragment);
    }

    async function refresh() {
      retry.hidden = true;
      status.textContent = 'Carregando biblioteca pública…';
      try {
        rows = await loadCatalog('./music-catalog.json');
        status.textContent = `Biblioteca pública · ${rows.length} faixas · requer internet para reproduzir`;
        empty.querySelector('p').textContent = 'O catálogo ainda não contém músicas.';
        render();
      } catch (error) {
        rows = [];
        render();
        status.textContent = root.navigator?.onLine === false ? 'Você está offline. Conecte-se para carregar a biblioteca pública.' : (error.message || 'Não foi possível carregar o catálogo.');
        empty.querySelector('p').textContent = 'Verifique sua conexão e tente carregar o catálogo novamente.';
        retry.hidden = false;
      }
    }

    retry.addEventListener('click', refresh);
    list.addEventListener('scroll', render, { passive: true });
    root.addEventListener('resize', render);
    if (root.navigator && 'serviceWorker' in root.navigator) root.navigator.serviceWorker.register('./sw.js').catch(() => {});
    root.addEventListener('online', refresh);
    refresh();
  }

  root.PlayerApp = { loadCatalog, validateCatalog, virtualWindow, formatDuration };
  if (root.document) boot();
})(typeof window === 'undefined' ? globalThis : window);
