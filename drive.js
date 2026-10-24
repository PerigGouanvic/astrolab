// drive.js — source Google Drive pour contenu astrologique (fiches planètes).
// Scope `drive.file` : accès uniquement aux fichiers créés ou ouverts par l'app.
// Flow implicite (GIS token flow) — pas de secret côté client, token en mémoire
// + localStorage avec expiration.

const CLIENT_ID = '178447645683-l3ls02t7f7ksjphqbv87d7m15d7vri5b.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER = 'astrolab';
const PLANETS_FOLDER = 'planets';
const SCRAPBOOK_FOLDER = 'scrapbook';

const TOKEN_KEY = 'astrolab.drive.token';
const FOLDER_KEY = 'astrolab.drive.planetsFolderId';
const SCRAP_FOLDER_KEY = 'astrolab.drive.scrapbookFolderId';

let accessToken = null;
let tokenClient = null;
let planetsFolderId = null;
let scrapbookFolderId = null;
let onAuthChange = () => {};

function waitForGIS() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - start > 10000) return reject(new Error('Google Identity Services non chargé (bloqué par uBlock ?)'));
      setTimeout(check, 100);
    };
    check();
  });
}

function loadStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (expiresAt > Date.now() + 60000) return token;
  } catch {}
  localStorage.removeItem(TOKEN_KEY);
  return null;
}

function storeToken(token, expiresInSec) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    token,
    expiresAt: Date.now() + (expiresInSec * 1000)
  }));
}

export async function initDrive(onChange) {
  if (typeof onChange === 'function') onAuthChange = onChange;
  await waitForGIS();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {}
  });
  accessToken = loadStoredToken();
  planetsFolderId = localStorage.getItem(FOLDER_KEY) || null;
  scrapbookFolderId = localStorage.getItem(SCRAP_FOLDER_KEY) || null;
  onAuthChange(isAuthenticated());
}

export function isAuthenticated() {
  return !!accessToken;
}

export function signIn() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('Drive non initialisé'));
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error));
      accessToken = resp.access_token;
      storeToken(accessToken, resp.expires_in || 3600);
      onAuthChange(true);
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch {}
  }
  accessToken = null;
  planetsFolderId = null;
  scrapbookFolderId = null;
  nativeScrapbookFolderIds.clear();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(FOLDER_KEY);
  localStorage.removeItem(SCRAP_FOLDER_KEY);
  onAuthChange(false);
}

async function driveFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `https://www.googleapis.com/drive/v3/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    accessToken = null;
    localStorage.removeItem(TOKEN_KEY);
    onAuthChange(false);
    throw new Error('Token Drive expiré — reconnecte-toi');
  }
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res;
}

// Dédoublonnage des créations de dossier par (name, parentId) : si deux
// callsites concurrents demandent le même dossier avant qu'il existe, un
// seul HTTP POST passe. Évite les dossiers en double (bug observé fin
// 2026-10-24 : deux `scrapbook/` dans Drive à cause de courses entre
// uploadScrapBlob et saveScrapbookDataToDrive au boot).
const inflightFolderCreates = new Map();  // `${name}|${parentId}` → Promise<id>

async function findOrCreateFolder(name, parentId = null) {
  const key = `${name}|${parentId ?? 'root'}`;
  if (inflightFolderCreates.has(key)) return inflightFolderCreates.get(key);
  const p = (async () => {
    const parentClause = parentId ? `and '${parentId}' in parents` : `and 'root' in parents`;
    const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' ${parentClause} and trashed=false`;
    const searchRes = await driveFetch(`files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&spaces=drive`);
    const { files } = await searchRes.json();
    if (files && files.length > 0) return files[0].id;  // orderBy createdTime → le plus ancien gagne
    const metadata = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) metadata.parents = [parentId];
    const createRes = await driveFetch('files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });
    const { id } = await createRes.json();
    return id;
  })();
  inflightFolderCreates.set(key, p);
  try { return await p; }
  finally { inflightFolderCreates.delete(key); }
}

export async function ensurePlanetsFolder() {
  if (planetsFolderId) return planetsFolderId;
  const rootId = await findOrCreateFolder(ROOT_FOLDER);
  planetsFolderId = await findOrCreateFolder(PLANETS_FOLDER, rootId);
  localStorage.setItem(FOLDER_KEY, planetsFolderId);
  return planetsFolderId;
}

async function findFileInFolder(folderId, name) {
  const q = `name='${name}' and '${folderId}' in parents and trashed=false`;
  const res = await driveFetch(`files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  const { files } = await res.json();
  return files && files.length > 0 ? files[0].id : null;
}

async function uploadJSON(folderId, name, content, existingFileId = null) {
  const boundary = 'astrolab_' + Math.random().toString(36).slice(2);
  const metadata = existingFileId ? { name } : { name, parents: [folderId] };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    `--${boundary}--`,
    ''
  ].join('\r\n');
  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
  await driveFetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
}

// Uploade tous les fichiers planète depuis la source locale vers Drive.
// `fetchLocal(key)` doit renvoyer le texte JSON brut (pour préserver la mise en forme).
export async function syncPlanetsToDrive(planetKeys, fetchLocalRawText, onProgress) {
  const folderId = await ensurePlanetsFolder();
  let i = 0;
  for (const key of planetKeys) {
    const text = await fetchLocalRawText(key);
    const name = `${key}.json`;
    const existingId = await findFileInFolder(folderId, name);
    await uploadJSON(folderId, name, text, existingId);
    i++;
    if (onProgress) onProgress(i, planetKeys.length, key);
  }
}

// Charge une fiche planète depuis Drive. Renvoie null si non connecté ou introuvable.
// Si le folder ID n'est pas en cache (nav privée, APK fraîche, resign in après
// signout qui l'a effacé), appelle ensurePlanetsFolder pour aller le chercher
// sur Drive — findOrCreateFolder trouvera le dossier existant sous ce CLIENT_ID.
export async function loadPlanetFromDrive(key) {
  if (!accessToken) return null;
  if (!planetsFolderId) planetsFolderId = localStorage.getItem(FOLDER_KEY) || null;
  if (!planetsFolderId) {
    try { await ensurePlanetsFolder(); }
    catch { return null; }
  }
  const fileId = await findFileInFolder(planetsFolderId, `${key}.json`);
  if (!fileId) return null;
  const res = await driveFetch(`files/${fileId}?alt=media`);
  return res.json();
}

// Sauvegarde une fiche planète sur Drive. Crée le fichier s'il n'existe pas
// (ex: nouvelle planète que Perig commence à documenter), le patche sinon.
export async function savePlanetToDrive(key, data) {
  if (!accessToken) throw new Error('Drive non connecté');
  const folderId = await ensurePlanetsFolder();
  const name = `${key}.json`;
  const existingId = await findFileInFolder(folderId, name);
  await uploadJSON(folderId, name, data, existingId);
}

// ---------- Scrapbook (blobs binaires : images, plus tard audio/vidéo) ----------
// Dossier dédié `astrolab/scrapbook/`, flat : un fichier par variante,
// nommé `<itemId>-<variant>.webp` (ex. `abc123-thumb.webp`, `abc123-full.webp`).
// Les IDs Drive sont stockés dans l'item scrapbook ; le nom de fichier n'est
// qu'une étiquette lisible côté Drive, l'app ne s'en sert pas pour résoudre.

export async function ensureScrapbookFolder() {
  if (scrapbookFolderId) return scrapbookFolderId;
  const rootId = await findOrCreateFolder(ROOT_FOLDER);
  scrapbookFolderId = await findOrCreateFolder(SCRAPBOOK_FOLDER, rootId);
  localStorage.setItem(SCRAP_FOLDER_KEY, scrapbookFolderId);
  return scrapbookFolderId;
}

// Sous-dossier `astrolab/scrapbook/<nativeId>/` : chaque natif y range ses
// blobs images et son `data.json`. Nommer les sous-dossiers par id évite
// toute collision si deux natifs ont le même prénom.
const nativeScrapbookFolderIds = new Map();  // nativeId → folderId
export async function ensureNativeScrapbookFolder(nativeId) {
  if (nativeScrapbookFolderIds.has(nativeId)) return nativeScrapbookFolderIds.get(nativeId);
  const scrapRoot = await ensureScrapbookFolder();
  const id = await findOrCreateFolder(nativeId, scrapRoot);
  nativeScrapbookFolderIds.set(nativeId, id);
  return id;
}

// Upload multipart d'un Blob binaire. Retourne l'ID Drive créé.
async function uploadBlob(folderId, name, blob, mimeType, existingFileId = null) {
  const boundary = 'astrolab_' + Math.random().toString(36).slice(2);
  const metadata = existingFileId ? { name } : { name, parents: [folderId], mimeType };
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const binaryPrefix = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const binarySuffix = `\r\n--${boundary}--\r\n`;
  const body = new Blob([metaPart, binaryPrefix, blob, binarySuffix]);
  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`;
  const res = await driveFetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  const { id } = await res.json();
  return id;
}

// Uploade un blob dans astrolab/scrapbook/<nativeId>/. Retourne l'ID Drive.
// `nativeId` requis depuis 2026-10-24 pour éviter que les blobs de natifs
// différents se mélangent dans un même dossier.
export async function uploadScrapBlob(nativeId, name, blob, mimeType = 'image/webp') {
  if (!accessToken) throw new Error('Drive non connecté');
  if (!nativeId) throw new Error('uploadScrapBlob: nativeId manquant');
  const folderId = await ensureNativeScrapbookFolder(nativeId);
  return uploadBlob(folderId, name, blob, mimeType);
}

// Récupère un blob depuis Drive par son ID. Retourne un Blob natif
// (à passer à URL.createObjectURL côté app).
export async function loadBlobFromDrive(fileId) {
  if (!accessToken) throw new Error('Drive non connecté');
  const res = await driveFetch(`files/${fileId}?alt=media`);
  return res.blob();
}

// ---------- Natifs (JSON unique astrolab/natives.json) ----------
// Un seul fichier à la racine du dossier astrolab/ qui porte l'état complet
// (natives[] + currentId). Résolution de conflit : last-write-wins sur le
// champ `savedAt` que l'app pose au moment du save.

export async function loadNativesFromDrive() {
  if (!accessToken) return null;
  const rootId = await findOrCreateFolder(ROOT_FOLDER);
  const fileId = await findFileInFolder(rootId, 'natives.json');
  if (!fileId) return null;
  const res = await driveFetch(`files/${fileId}?alt=media`);
  return res.json();
}

export async function saveNativesToDrive(data) {
  if (!accessToken) throw new Error('Drive non connecté');
  const rootId = await findOrCreateFolder(ROOT_FOLDER);
  const existingId = await findFileInFolder(rootId, 'natives.json');
  await uploadJSON(rootId, 'natives.json', data, existingId);
}

// ---------- Scrapbook — items JSON (texte, positions, refs de blobs) ----------
// Un fichier par natif : astrolab/scrapbook/<nativeId>.json.
// Les blobs images continuent de vivre à côté dans le même dossier via
// uploadScrapBlob/loadBlobFromDrive — c'est le JSON qui porte les fileId.

// Depuis 2026-10-24 : le JSON vit dans astrolab/scrapbook/<nativeId>/data.json.
// Fallback de lecture sur l'ancien emplacement astrolab/scrapbook/<nativeId>.json
// pour les devices qui n'ont pas encore vu la migration.
export async function loadScrapbookDataFromDrive(nativeId) {
  if (!accessToken) return null;
  const subFolderId = await ensureNativeScrapbookFolder(nativeId);
  const fileId = await findFileInFolder(subFolderId, 'data.json');
  if (fileId) {
    const res = await driveFetch(`files/${fileId}?alt=media`);
    return res.json();
  }
  // Fallback : ancien emplacement à plat.
  const scrapRoot = await ensureScrapbookFolder();
  const legacyId = await findFileInFolder(scrapRoot, `${nativeId}.json`);
  if (!legacyId) return null;
  const legacyRes = await driveFetch(`files/${legacyId}?alt=media`);
  return legacyRes.json();
}

export async function saveScrapbookDataToDrive(nativeId, data) {
  if (!accessToken) throw new Error('Drive non connecté');
  const folderId = await ensureNativeScrapbookFolder(nativeId);
  const existingId = await findFileInFolder(folderId, 'data.json');
  await uploadJSON(folderId, 'data.json', data, existingId);
}

// Déplace un fichier d'un dossier parent à un autre, sans copier (fileId
// reste valide, les références dans les JSON restent intactes).
export async function moveFile(fileId, newParentId, oldParentId) {
  if (!accessToken) throw new Error('Drive non connecté');
  await driveFetch(`files/${fileId}?addParents=${newParentId}&removeParents=${oldParentId}&fields=id,parents`, {
    method: 'PATCH',
  });
}

// Liste les fichiers non-dossier directement sous astrolab/scrapbook/ (racine
// du scrapbook, pas les sous-dossiers par natif). Utilisé pour la migration
// one-shot des blobs et de l'ancien JSON à plat.
export async function listScrapbookRootFiles() {
  if (!accessToken) return { folderId: null, files: [] };
  const folderId = await ensureScrapbookFolder();
  const q = `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`;
  const res = await driveFetch(`files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=1000&spaces=drive`);
  const { files } = await res.json();
  return { folderId, files: files || [] };
}

// Supprime un fichier Drive — version qui throw plutôt que de logger, pour
// que la migration (où on tient à savoir si ça a réussi) puisse décider.
export async function deleteDriveFileStrict(fileId) {
  if (!accessToken) throw new Error('Drive non connecté');
  await driveFetch(`files/${fileId}`, { method: 'DELETE' });
}

// Supprime un fichier Drive (nettoyage lors de la purge d'un item scrapbook).
// Best-effort : si ça rate, on log et on avance — l'orphelin dans Drive n'est
// pas critique côté app.
export async function deleteDriveFile(fileId) {
  if (!accessToken) return;
  try {
    await driveFetch(`files/${fileId}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('deleteDriveFile', fileId, e.message);
  }
}
