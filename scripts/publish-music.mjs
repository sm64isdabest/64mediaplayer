import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tagParser = require('../vendor/jsmediatags.min.js');
const MAX_RELEASE_ASSETS = 1000;
const MAX_ASSET_BYTES = 2 ** 31;
const DEFAULT_MUSIC_DIR = path.resolve('music');
const RELEASE_TAG = 'music-library';
const execFileAsync = promisify(execFile);

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
  const availableAssets = releaseAssets === null ? null : assetMap(releaseAssets);
  const missingAssets = [];

  if (!files.length) errors.push({ code: 'empty-library' });
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
    if (availableAssets) {
      const remote = availableAssets.get(assetName);
      if (!remote) missingAssets.push(assetName);
      else if ((Number.isFinite(Number(remote.size)) && Number(remote.size) !== Number(file.size)) || (file.digest && remote.digest && file.digest !== remote.digest)) {
        errors.push({ code: 'asset-integrity', relativePath });
      }
    }
  }
  if (availableAssets) for (const assetName of availableAssets.keys()) {
    if (!seenAssetNames.has(assetName)) errors.push({ code: 'unexpected-asset' });
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

export function flattenAssetPages(pages) {
  return (Array.isArray(pages) ? pages.flat(Infinity) : []).filter((asset) => asset && typeof asset.name === 'string');
}

export function buildUploadPlan(files, releaseAssets) {
  const assets = assetMap(releaseAssets);
  return files.map((file) => {
    const assetName = makeAssetName(file.relativePath || file.name);
    const existing = assets.get(assetName);
    const unchanged = existing && file.digest && existing.digest === file.digest && existing.size === file.size;
    return { file, assetName, existing, action: unchanged ? 'skip' : existing ? 'replace' : 'upload' };
  });
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
  });
}

function parseRepoSlug(remote) {
  const match = String(remote || '').trim().match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (!match) throw new Error('A origem Git precisa apontar para um repositório do GitHub.');
  return match[1].replace(/\.git$/i, '');
}

function createGhClient({ root, repo }) {
  let releaseId;
  let token;
  async function gh(args) {
    try {
      const { stdout } = await execFileAsync('gh', args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      return stdout.trim();
    } catch (error) {
      const message = error.code === 'ENOENT'
        ? 'GitHub CLI não encontrado. Instale o GitHub CLI oficial e autentique com `gh auth login`.'
        : `Comando do GitHub CLI falhou (código ${Number.isInteger(error.code) ? error.code : 'não disponível'}).`;
      const failure = new Error(message);
      failure.notFound = /HTTP 404|Not Found/i.test(String(error.stderr || ''));
      throw failure;
    }
  }
  return {
    async ensureAuth() {
      try {
        await gh(['auth', 'status']);
        token = await gh(['auth', 'token']);
        if (!token) throw new Error('empty token');
      }
      catch (error) { throw new Error(error.message.includes('não encontrado') ? error.message : 'GitHub CLI sem autenticação válida; execute `gh auth login`.'); }
    },
    async ensureRelease() {
      try {
        const release = JSON.parse(await gh(['release', 'view', RELEASE_TAG, '--repo', repo, '--json', 'databaseId']));
        releaseId = release.databaseId;
      } catch (error) {
        if (!error.notFound) throw error;
        await gh(['release', 'create', RELEASE_TAG, '--repo', repo, '--title', 'Biblioteca de músicas', '--notes', 'Assets MP3 públicos do 64 Media Player.']);
        const release = JSON.parse(await gh(['release', 'view', RELEASE_TAG, '--repo', repo, '--json', 'databaseId']));
        releaseId = release.databaseId;
      }
    },
    async listAssets() {
      if (!releaseId) throw new Error('Release ainda não foi aberta.');
      const raw = await gh(['api', '--paginate', '--slurp', `repos/${repo}/releases/${releaseId}/assets?per_page=100`]);
      return flattenAssetPages(JSON.parse(raw));
    },
    async uploadFile(file, assetName, { replace = false, existing } = {}) {
      if (replace && existing?.id) await gh(['api', '--method', 'DELETE', `repos/${repo}/releases/assets/${existing.id}`]);
      const url = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(file.size),
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: createReadStream(file.filePath),
          duplex: 'half',
        });
      } catch (_) { throw new Error('Falha de rede ao enviar um asset MP3 para a Release.'); }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`GitHub recusou o upload do asset (HTTP ${response.status}).`);
      }
      await response.body?.cancel();
    },
    clearAuth() {
      token = undefined;
    },
  };
}

async function localRepositorySlug(root) {
  const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], { cwd: root, windowsHide: true });
  return parseRepoSlug(stdout);
}

async function writeCatalogAtomic(root, catalog) {
  const output = path.join(root, 'music-catalog.json');
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await rename(temporary, output);
}

export async function publishLibrary({ root = path.resolve('.'), publish = false, client } = {}) {
  const musicRoot = path.join(root, 'music');
  const files = await scanMusicDirectory(musicRoot);
  const initialValidation = validateLibrary(files);
  if (initialValidation.errors.length) throw new Error(`Biblioteca inválida: ${[...new Set(initialValidation.errors.map((error) => error.code))].join(', ')}.`);
  const summary = summarizeLibrary(files);
  if (!publish) return { summary, catalog: null, uploaded: 0 };

  const repoClient = client || createGhClient({ root, repo: await localRepositorySlug(root) });
  try {
    await repoClient.ensureAuth();
    await repoClient.ensureRelease();
    let releaseAssets = await repoClient.listAssets();
    // Keep the number of simultaneously open MP3 streams low on Windows.
    const hashedFiles = [];
    for (const file of files) hashedFiles.push({ ...file, digest: await hashFile(file.filePath) });
    const plan = buildUploadPlan(hashedFiles, releaseAssets);
    const toUpload = plan.filter((item) => item.action !== 'skip');
    for (let index = 0; index < toUpload.length; index++) {
      const item = toUpload[index];
      await repoClient.uploadFile(item.file, item.assetName, { replace: item.action === 'replace', existing: item.existing });
      if ((index + 1) % 10 === 0 || index + 1 === toUpload.length) console.log(`Upload ${index + 1}/${toUpload.length}`);
    }
    releaseAssets = await repoClient.listAssets();

    const validation = validateLibrary(hashedFiles, releaseAssets);
    if (validation.errors.length || validation.missingAssets.length) {
      throw new Error(`Release incompleta após upload: ${validation.missingAssets.length} asset(s) ausente(s), ${validation.errors.length} erro(s). O catálogo anterior foi preservado.`);
    }
    const metadataEntries = [];
    for (const file of hashedFiles) metadataEntries.push([file.relativePath, await readTags(file.filePath)]);
    const tracks = createCatalogEntries(hashedFiles, new Map(metadataEntries), releaseAssets);
    const catalog = { version: 1, releaseTag: RELEASE_TAG, tracks };
    await writeCatalogAtomic(root, catalog);
    console.log(`Release validada: ${tracks.length} faixas; ${toUpload.length} asset(s) enviados/substituídos; catálogo gravado.`);
    return { summary, catalog, uploaded: toUpload.length };
  } finally {
    repoClient.clearAuth?.();
  }
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
  try {
    const { summary } = await publishLibrary({ root: process.cwd(), publish });
    if (!publish) {
      console.log(`Prévia local: ${summary.count} MP3, ${formatBytes(summary.totalBytes)} no total, maior ${formatBytes(summary.largestBytes)}.`);
      console.log('Nenhum arquivo foi enviado.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
