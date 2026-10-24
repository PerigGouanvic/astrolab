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

// SHA-256 pur JS — fallback quand crypto.subtle est indisponible
// (contexte non sécurisé : http://perig:8787, http://tailscale, etc.).
// Implémentation standard FIPS 180-4, pas de dépendance externe.
function sha256Pure(message) {
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const msgBytes = typeof message === 'string'
    ? new TextEncoder().encode(message)
    : new Uint8Array(message);
  const l = msgBytes.length * 8;
  const k = ((448 - (l + 1)) % 512 + 512) % 512;
  const padded = new Uint8Array((l + 1 + k + 64) / 8);
  padded.set(msgBytes);
  padded[msgBytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, l, false); // big-endian 32-bit pour les bits hauts
  // l sur 64 bits big-endian : les 4 premiers octets = bits hauts (toujours 0 pour nous)
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let i = 0; i < padded.length; i += 64) {
    const W = new Uint32Array(64);
    for (let t = 0; t < 16; t++) {
      W[t] = (padded[i + t*4] << 24) | (padded[i + t*4 + 1] << 16) | (padded[i + t*4 + 2] << 8) | padded[i + t*4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t-15], 7) ^ rotr(W[t-15], 18) ^ (W[t-15] >>> 3);
      const s1 = rotr(W[t-2], 17) ^ rotr(W[t-2], 19) ^ (W[t-2] >>> 10);
      W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i*4] = (H[i] >>> 24) & 0xff;
    out[i*4+1] = (H[i] >>> 16) & 0xff;
    out[i*4+2] = (H[i] >>> 8) & 0xff;
    out[i*4+3] = H[i] & 0xff;
  }
  return out;
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  let hash;
  if (crypto.subtle) {
    hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  } else {
    hash = sha256Pure(data);
  }
  return btoa(String.fromCharCode(...hash))
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

// ---------- Auth flow (Authorization Code + PKCE) ----------

export function signIn() {
  return new Promise(async (resolve, reject) => {
    if (!codeClient) return reject(new Error('Drive non initialisé'));

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    codeClient.callback = async (resp) => {
      if (resp.error) return reject(new Error(resp.error));

      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: resp.code,
            client_id: CLIENT_ID,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: window.location.origin,
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

export async function savePlanetToDrive(key, data) {
  if (!accessToken) throw new Error('Drive non connecté');
  const folderId = await ensurePlanetsFolder();
  const name = `${key}.json`;
  const existingId = await findFileInFolder(folderId, name);
  await uploadJSON(folderId, name, data, existingId);
}

// ---------- Scrapbook (blobs binaires) ----------

export async function ensureScrapbookFolder() {
  if (scrapbookFolderId) return scrapbookFolderId;
  const rootId = await findOrCreateFolder(ROOT_FOLDER);
  scrapbookFolderId = await findOrCreateFolder(SCRAPBOOK_FOLDER, rootId);
  localStorage.setItem(SCRAP_FOLDER_KEY, scrapbookFolderId);
  return scrapbookFolderId;
}

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

export async function uploadScrapBlob(name, blob, mimeType = 'image/webp') {
  if (!accessToken) throw new Error('Drive non connecté');
  const folderId = await ensureScrapbookFolder();
  return uploadBlob(folderId, name, blob, mimeType);
}

export async function loadBlobFromDrive(fileId) {
  if (!accessToken) throw new Error('Drive non connecté');
  const res = await driveFetch(`files/${fileId}?alt=media`);
  return res.blob();
}

export async function deleteDriveFile(fileId) {
  if (!accessToken) return;
  try {
    await driveFetch(`files/${fileId}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('deleteDriveFile', fileId, e.message);
  }
}