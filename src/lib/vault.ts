/**
 * v2 vault format, shared with tools/vault_tool.py (see CLAUDE.md):
 *   [16 chars salt][16 chars IV][base64(AES-256-GCM(json) || 16-byte tag)]
 *   key = PBKDF2-HMAC-SHA256(password, salt as UTF-8, 600000 iterations, 256 bits)
 * Parameters are fixed here, not stored in the file. The salt is kept for the vault's lifetime
 * (so a derived key stays valid across saves); every save uses a fresh IV.
 */
import { randomChars } from "./random";

export const ITERATIONS = 600_000;
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface Entry {
  id: string;
  name: string;
  username: string;
  url: string;
  password: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultData {
  version: 2;
  entries: Entry[];
}

/** Everything needed to re-encrypt without asking for the password again. */
export interface VaultKey {
  salt: string;
  key: CryptoKey;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong master password or corrupted vault");
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function splitVault(content: string): { salt: string; iv: string; data: Uint8Array<ArrayBuffer> } {
  const text = content.trim();
  if (text.length <= 32) throw new Error("Not a vault file");
  try {
    return { salt: text.slice(0, 16), iv: text.slice(16, 32), data: fromBase64(text.slice(32)) };
  } catch {
    throw new Error("Not a vault file");
  }
}

export function newSalt(): string {
  return randomChars(ALPHANUMERIC, 16);
}

/**
 * Raw 256-bit vault key bytes. Only needed to enrol fingerprint unlock (to wrap them);
 * callers must not keep them around.
 */
export async function deriveRawKey(password: string, salt: string): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: ITERATIONS },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** Turn raw key bytes into a non-extractable AES-GCM key. */
export async function importVaultKey(raw: Uint8Array<ArrayBuffer>, salt: string): Promise<VaultKey> {
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { salt, key };
}

export async function deriveKey(password: string, salt: string): Promise<VaultKey> {
  const raw = await deriveRawKey(password, salt);
  try {
    return await importVaultKey(raw, salt);
  } finally {
    raw.fill(0);
  }
}

export function vaultSalt(content: string): string {
  return splitVault(content).salt;
}

function parseVaultData(json: string): VaultData {
  const data = JSON.parse(json) as Partial<VaultData>;
  if (data.version !== 2 || !Array.isArray(data.entries)) throw new Error("Unsupported vault content");
  return { version: 2, entries: data.entries.map(normalizeEntry) };
}

function normalizeEntry(e: Partial<Entry>): Entry {
  const now = new Date().toISOString();
  return {
    id: e.id || crypto.randomUUID(),
    name: e.name ?? "",
    username: e.username ?? "",
    url: e.url ?? "",
    password: e.password ?? "",
    notes: e.notes ?? "",
    createdAt: e.createdAt || now,
    updatedAt: e.updatedAt || e.createdAt || now,
  };
}

/** Decrypt with an already-derived key (salt must match). */
export async function decryptWithKey(content: string, vaultKey: VaultKey): Promise<VaultData> {
  const { salt, iv, data } = splitVault(content);
  if (salt !== vaultKey.salt) throw new WrongPasswordError();
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: encoder.encode(iv) }, vaultKey.key, data);
  } catch {
    throw new WrongPasswordError();
  }
  return parseVaultData(decoder.decode(plain));
}

export async function decryptVault(content: string, password: string): Promise<{ data: VaultData; vaultKey: VaultKey }> {
  const vaultKey = await deriveKey(password, splitVault(content).salt);
  return { data: await decryptWithKey(content, vaultKey), vaultKey };
}

export async function encryptVault(data: VaultData, vaultKey: VaultKey): Promise<string> {
  const iv = randomChars(ALPHANUMERIC, 16);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: encoder.encode(iv) },
    vaultKey.key,
    encoder.encode(JSON.stringify(data)),
  );
  return vaultKey.salt + iv + toBase64(new Uint8Array(cipher));
}
