(function (root) {
  'use strict';

  function fallbackTitle(file) {
    return String(file.name || 'Música sem título').replace(/\.mp3$/i, '').trim() || 'Música sem título';
  }

  function textValue(value) {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value.data === 'string') return value.data.trim();
    return '';
  }

  function readMetadata(file) {
    const fallback = { title: fallbackTitle(file), artist: '', album: '', cover: null };
    const parser = root.jsmediatags;
    if (!parser || typeof parser.read !== 'function') return Promise.resolve(fallback);
    return new Promise((resolve) => {
      parser.read(file, {
        onSuccess: ({ tags = {} } = {}) => {
          let cover = null;
          const picture = tags.picture;
          if (picture && picture.data && picture.format) {
            try { cover = new Blob([new Uint8Array(picture.data)], { type: picture.format }); } catch (_) { cover = null; }
          }
          resolve({ title: textValue(tags.title) || fallback.title, artist: textValue(tags.artist), album: textValue(tags.album), cover });
        },
        onError: () => resolve(fallback),
      });
    });
  }

  function readDuration(file) {
    return new Promise((resolve) => {
      let url;
      let audio;
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (audio) { audio.removeAttribute('src'); audio.load(); }
        if (url) URL.revokeObjectURL(url);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 8000);
      try {
        url = URL.createObjectURL(file);
        audio = new Audio();
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
        audio.onerror = () => finish(null);
        audio.src = url;
      } catch (_) { finish(null); }
    });
  }

  root.MediaMetadata = { readMetadata, readDuration };
})(typeof window === 'undefined' ? globalThis : window);
