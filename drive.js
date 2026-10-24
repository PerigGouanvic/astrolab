// drive.js — source Google Drive pour contenu astrologique (fiches planètes).
// Scope `drive.file` : accès uniquement aux fichiers créés ou ouverts par l'app.
// Flow Authorization Code + PKCE (initCodeClient) — remplace le flux implicite
// (initTokenClient) déprécié par Google et bloqué sur navigateur standard.
// L'APK WebView tolérait encore l'ancien flux, d'où le différentiel APK OK / browser KO.

const CLIENT_ID = '178447645683-l3ls02t7f7ksjphqbv87d7m15d7vri5b.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER = 'astrolab';
const PLANETS_FOLDER = 'planets';
const SCRAPBOOK_FOLDER = 'scrapbook';

const TOKEN_KEY = 'astrolab.drive.token';
const FOLDER_KEY = 'astrolab.drive.planetsFolderId';
const SCRAP_FOLDER_KEY = 'astrolab.drive.scrapbookFolderId';

let accessToken = null;
let codeClient = null;
let planetsFolderId = null;
let scrapbookFolderId = null;
let onAuthChange = () => {};

// ---------- PKCE (Proof Key for Code Exchange) ----------

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- GIS loader ----------

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

// ---------- Token storage ----------

function loadStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (expiresAt > Date.now() + 60000) return token;
  } catch {}
  // Token expiré mais on garde le refresh_token dans le stockage
  return null;
}

function storeToken(token, expiresInSec, refreshToken = null) {
  const prev = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    token,
    expiresAt: Date.now() + (expiresInSec * 1000),
    refreshToken: refreshToken || prev.refreshToken || null
  }));
}

async function refreshAccessToken() {
  const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
  if (!stored.refreshToken) return null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken
      })
    });
    if (!res.ok) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    const data = await res.json();
    accessToken = data.access_token;
    storeToken(accessToken, data.expires_in || 3600, data.refresh_token || stored.refreshToken);
    return accessToken;
  } catch {
    return null;
  }
}

// ---------- Init ----------

export async function initDrive(onChange) {
  if (typeof onChange === 'function') onAuthChange = onChange;
  await waitForGIS();
  codeClient = google.accounts.oauth2.initCodeClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {} // sera remplacé dans signIn()
  });
  accessToken = loadStoredToken();
  planetsFolderId = localStorage.getItem(FOLDER_KEY) || null;
  scrapbookFolderId = localStorage.getItem(SCRAP_FOLDER_KEY) || null;
  onAuthChange(isAuthenticated());
}

export function isAuthenticated() {
  return !!accessToken;
}

// ---------- Auth flow (Authorization Code + PKCE) ----------

export function signIn() {
  return new Promise(async (resolve, reject) => {
    if (!codeClient) return reject(new Error('Drive non initialisé'));

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    codeClient.callback = async (resp) => {
      if (resp.error) return reject(new Error(resp.error));

      // Échange authorization code → access token + refresh token
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: resp.code,
            client_id: CLIENT_ID,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
          })
        });
        if (!tokenRes.ok) {
          const err = await tokenRes.text();
          return reject(new Error(`Token exchange failed: ${err}`));
        }
        const data = await tokenRes.json();
        accessToken = data.access_token;
        storeToken(accessToken, data.expires_in || 3600, data.refresh_token || null);
        onAuthChange(true);
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    codeClient.requestCode({ prompt: 'consent' });
  });
}

export function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch {}
  }
  accessToken = null;
  planetsFolderId = null;
  scrapbookFolderId = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(FOLDER_KEY);
  localStorage.removeItem(SCRAP_FOLDER_KEY);
  onAuthChange(false);
}

// ---------- Drive API wrapper ----------

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
    // Tente un refresh silencieux avant d'abandonner
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryRes = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${refreshed}`,
          ...(options.headers || {})
        }
      });
      if (retryRes.ok) return retryRes;
    }
    accessToken = null;
    localStorage.removeItem(TOKEN_KEY);
    onAuthChange(false);
    throw new Error('Token Drive expiré — reconnecte-toi');
  }
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res;
}

// ---------- Folder helpers ----------

async function findOrCreateFolder(name, parentId = null) {
  const parentClause = parentId ? `and '${parentId}' in parents` : `and 'root' in parents`;
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' ${parentClause} and trashed=false`;
  const searchRes = await driveFetch(`files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  const { files } = await searchRes.json();
  if (files && files.length > 0) return files[0].id;
  const metadata = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) metadata.parents = [parentId];
  const createRes = await driveFetch('files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });
  const { id } = await createRes.json();
  return id;
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

// ---------- JSON upload / download ----------

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

// Uploade un blob dans astrolab/scrapbook/. Retourne l'ID Drive.
export async function uploadScrapBlob(name, blob, mimeType = 'image/webp') {
  if (!accessToken) throw new Error('Drive non connecté');
  const folderId = await ensureScrapbookFolder();
  return uploadBlob(folderId, name, blob, mimeType);
}

// Récupère un blob depuis Drive par son ID. Retourne un Blob natif
// (à passer à URL.createObjectURL côté app).
export async function loadBlobFromDrive(fileId) {
  if (!accessToken) throw new Error('Drive non connecté');
  const res = await driveFetch(`files/${fileId}?alt=media`);
  return res.blob();
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