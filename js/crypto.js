// All files are encrypted with a random AES-256-GCM "master key".
// The master key is wrapped (AES-KW) with a key derived from the secret calculator code (PBKDF2-SHA256),
// so changing the code never requires re-encrypting the files.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITERATIONS = 310000;

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKek(code, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Create a brand-new vault for `code`. Returns { config, masterKey }. */
export async function createVault(code) {
  const masterKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const config = await wrapForCode(masterKey, code);
  return { config, masterKey };
}

export async function wrapForCode(masterKey, code) {
  const salt = randomBytes(16);
  const kek = await deriveKek(code, salt);
  const wrapped = await crypto.subtle.wrapKey('raw', masterKey, kek, 'AES-KW');
  return { salt, wrapped: new Uint8Array(wrapped), iterations: ITERATIONS };
}

/** Returns the master key if `code` is correct, otherwise null. */
export async function unlock(config, code) {
  try {
    const kek = await deriveKek(code, config.salt);
    return await crypto.subtle.unwrapKey('raw', config.wrapped, kek, 'AES-KW', { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  } catch {
    return null; // AES-KW integrity check failed -> wrong code
  }
}

export async function encryptBytes(key, data) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv, data: ct };
}

export async function decryptBytes(key, box) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.iv }, key, box.data);
}

export async function encryptJSON(key, obj) {
  return encryptBytes(key, enc.encode(JSON.stringify(obj)));
}

export async function decryptJSON(key, box) {
  return JSON.parse(dec.decode(await decryptBytes(key, box)));
}
