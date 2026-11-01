import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tagParser = require('../vendor/jsmediatags.min.js');
const MAX_RELEASE_ASSETS = 1000;
const MAX_ASSET_BYTES = 2 ** 31;
const DEFAULT_MUSIC_DIR = path.resolve('music');

export function normalizeRelativePath(value) {
  return String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).join('/').normalize('NFC');
}

export function makeAssetName(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const digest = createHash('sha256').update(normalizedPath).digest('hex').slice(0, 32);
  const extension = path.posix.extname(normalizedPath).toLowerCase() || '.mp3';
  return `track-${digest}${extension}`;
}

function isMp3(file) {
  return /\.mp3$/i.test(file.name || file.relativePath || '') || String(file.type || '').toLowerCase() === 'audio/mpeg';
}

function stripMp3Extension(name) {
  return String(name || 'Música sem título').replace(/\.mp3$/i, '').trim() || 'Música sem título';
}

function plainTag(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value.data === 'string') return value.data.trim();
  return '';
}

function assetMap(releaseAssets) {
  if (releaseAssets instanceof Map) return releaseAssets;
  return new Map((releaseAssets || []).filter((asset) => asset && asset.name).map((asset) => [asset.name, asset]));
}

function metadataValue(metadataByPath, relativePath) {
  if (metadataByPath instanceof Map) return metadataByPath.get(relativePath) || {};
  return metadataByPath?.[relativePath] || {};
}

export function createCatalogEntries(files, metadataByPath = {}, releaseAssets = []) {
  const assets = assetMap(releaseAssets);
  return files.map((file) => {
    const relativePath = normalizeRelativePath(file.relativePath || file.name);
    const name = path.posix.basename(relativePath);
    const metadata = metadataValue(metadataByPath, relativePath);
    const assetName = makeAssetName(relativePath);
    const asset = assets.get(assetName);
    const folder = path.posix.dirname(relativePath);
    return {
      id: assetName.slice(0, -4),
      assetName,
      name,
      title: plainTag(metadata.title) || stripMp3Extension(name),
      artist: plainTag(metadata.artist),
      album: plainTag(metadata.album),
      folder: folder === '.' ? 'Sem pasta' : folder,
      relativePath,
      size: Number(file.size) || 0,
      duration: Number.isFinite(metadata.duration) ? metadata.duration : null,
      mimeType: 'audio/mpeg',
      url: asset?.browser_download_url || '',
    };
  });
}

export function validateLibrary(files, releaseAssets = null) {
  const errors = [];
  const seenPaths = new Set();
  const seenAssetNames = new Set();
  const availableAssets = releaseAssets === null ? null : new Set(assetMap(releaseAssets).keys());
  const missingAssets = [];

  if (files.length > MAX_RELEASE_ASSETS) errors.push({ code: 'too-many-assets' });
  for (const file of files) {
    const relativePath = normalizeRelativePath(file.relativePath || file.name);
    const assetName = makeAssetName(relativePath);
    if (!isMp3(file)) errors.push({ code: 'invalid-type', relativePath });
    if (Number(file.size) >= MAX_ASSET_BYTES) errors.push({ code: 'file-too-large', relativePath });
    if (seenPaths.has(relativePath)) errors.push({ code: 'duplicate-path', relativePath });
    if (seenAssetNames.has(assetName)) errors.push({ code: 'asset-name-collision', relativePath });
    seenPaths.add(relativePath);
    seenAssetNames.add(assetName);
    if (availableAssets && !availableAssets.has(assetName)) missingAssets.push(assetName);
  }
  return { errors, missingAssets };
}

export function readTags(filePath) {
  const name = path.basename(filePath);
  const fallback = { title: stripMp3Extension(name), artist: '', album: '', duration: null };
  return new Promise((resolve) => {
    try {
      tagParser.read(filePath, {
        onSuccess: ({ tags = {} } = {}) => resolve({
          title: plainTag(tags.title) || fallback.title,
          artist: plainTag(tags.artist),
          album: plainTag(tags.album),
          duration: null,
        }),
        onError: () => resolve(fallback),
      });
    } catch (_) {
      resolve(fallback);
    }
  });
}

export async function scanMusicDirectory(root = DEFAULT_MUSIC_DIR) {
  const files = [];
  async function visit(directory, base = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = normalizeRelativePath(path.posix.join(base, entry.name));
      if (entry.isDirectory()) await visit(fullPath, relativePath);
      else if (entry.isFile() && /\.mp3$/i.test(entry.name)) {
        const info = await stat(fullPath);
        files.push({ relativePath, name: entry.name, size: info.size, type: 'audio/mpeg', filePath: fullPath });
      }
    }
  }
  await visit(root);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));
}

export function summarizeLibrary(files) {
  const validation = validateLibrary(files);
  const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  const largestBytes = files.reduce((largest, file) => Math.max(largest, Number(file.size) || 0), 0);
  return { count: files.length, totalBytes, largestBytes, errors: validation.errors };
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

async function main() {
  const publish = process.argv.includes('--publish');
  const unexpected = process.argv.slice(2).filter((arg) => arg !== '--publish' && arg !== '--dry-run');
  if (unexpected.length) {
    console.error('Uso: node scripts/publish-music.mjs [--dry-run|--publish]');
    process.exitCode = 2;
    return;
  }
  const files = await scanMusicDirectory();
  const summary = summarizeLibrary(files);
  const label = publish ? 'Preflight de publicação' : 'Prévia local';
  console.log(`${label}: ${summary.count} MP3, ${formatBytes(summary.totalBytes)} no total, maior ${formatBytes(summary.largestBytes)}.`);
  if (summary.errors.length) {
    const counts = new Map();
    for (const error of summary.errors) counts.set(error.code, (counts.get(error.code) || 0) + 1);
    console.error(`Validação falhou: ${[...counts].map(([code, count]) => `${count} ${code}`).join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  console.log(publish ? 'Preflight aprovado; a sincronização será iniciada pela próxima etapa.' : 'Nenhum arquivo foi enviado.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
