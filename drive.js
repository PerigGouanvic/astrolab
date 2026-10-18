// drive.js — source Google Drive pour contenu astrologique (fiches planètes).
// Scope `drive.file` : accès uniquement aux fichiers créés ou ouverts par l'app.
// Flow implicite (GIS token flow) — pas de secret côté client, token en mémoire
// + localStorage avec expiration.

const CLIENT_ID = '178447645683-l3ls02t7f7ksjphqbv87d7m15d7vri5b.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER = 'astrolab';
const PLANETS_FOLDER = 'planets';

const TOKEN_KEY = 'astrolab.drive.token';
const FOLDER_KEY = 'astrolab.drive.planetsFolderId';

let accessToken = null;
let tokenClient = null;
let planetsFolderId = null;
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
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(FOLDER_KEY);
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
