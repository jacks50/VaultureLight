/**
 * Fingerprint unlock with WebAuthn passkeys and the PRF extension.
 *
 * Enrolling a device creates a passkey; its PRF output (a secret only that passkey can produce,
 * after user verification) is turned by HKDF into an AES-GCM key that wraps the raw vault key.
 * The wrapped key lives in /Vaulture/devices.json in Drive — nothing is stored in the browser.
 * Unlocking evaluates PRF again (fingerprint / screen lock) to unwrap the vault key.
 */
import { fromBase64, toBase64 } from "./vault";

const encoder = new TextEncoder();
const HKDF_INFO = encoder.encode("VaultureLight fingerprint unlock v1");
const TIMEOUT_MS = 120_000;

export interface DeviceEntry {
  id: string;
  name: string;
  /** base64url, as WebAuthn uses for credential ids */
  credentialId: string;
  prfSalt: string;
  /** Salt of the vault this key belongs to; a new master password makes the entry stale. */
  vaultSalt: string;
  iv: string;
  wrappedKey: string;
  createdAt: string;
}

export interface DevicesFile {
  version: 1;
  devices: DeviceEntry[];
}

export class PasskeyError extends Error {}

export function parseDevices(text: string): DevicesFile {
  const data = JSON.parse(text) as Partial<DevicesFile>;
  if (data.version !== 1 || !Array.isArray(data.devices)) throw new Error("Unsupported devices.json");
  return { version: 1, devices: data.devices };
}

export async function isPasskeyAvailable(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== "undefined" &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

function random(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

function toBytes(source: BufferSource): Uint8Array<ArrayBuffer> {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  return new Uint8Array(view); // copy into a plain ArrayBuffer
}

async function wrappingKey(prfOutput: BufferSource): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", toBytes(prfOutput), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: HKDF_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Binds a wrapped key to its credential and vault, so entries cannot be swapped. */
function associatedData(entry: Pick<DeviceEntry, "credentialId" | "vaultSalt">): Uint8Array<ArrayBuffer> {
  return encoder.encode(`${entry.credentialId}|${entry.vaultSalt}`);
}

function webauthnError(err: unknown): Error {
  if (err instanceof PasskeyError) return err;
  if (err instanceof DOMException && err.name === "NotAllowedError") return new PasskeyError("Fingerprint cancelled or timed out");
  if (err instanceof DOMException && err.name === "InvalidStateError") return new PasskeyError("This device already has a passkey for VaultureLight");
  return new PasskeyError(err instanceof Error ? err.message : "Fingerprint unlock failed");
}

async function evaluatePrf(credentialId: string, prfSalt: Uint8Array<ArrayBuffer>): Promise<BufferSource> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId) }],
      userVerification: "required",
      timeout: TIMEOUT_MS,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  })) as PublicKeyCredential | null;
  const output = assertion?.getClientExtensionResults().prf?.results?.first;
  if (!output) throw new PasskeyError("This device does not support fingerprint unlock (no PRF)");
  return output;
}

/**
 * Create a passkey on this device and wrap `rawKey` with it.
 * Can ask for the fingerprint twice: some authenticators only return the PRF secret on use, not on creation.
 */
export async function enrollDevice(rawKey: Uint8Array<ArrayBuffer>, vaultSalt: string, name: string, account: string): Promise<DeviceEntry> {
  try {
    const prfSalt = random(32);
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "VaultureLight" },
        user: { id: random(16), name: account || "VaultureLight", displayName: `VaultureLight (${name})` },
        challenge: random(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
        timeout: TIMEOUT_MS,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    })) as PublicKeyCredential | null;
    if (!credential) throw new PasskeyError("Passkey creation failed");
    const prf = credential.getClientExtensionResults().prf;
    if (!prf?.enabled) throw new PasskeyError("This device does not support fingerprint unlock (no PRF)");

    const credentialId = toBase64Url(new Uint8Array(credential.rawId));
    const output = prf.results?.first ?? (await evaluatePrf(credentialId, prfSalt));
    const iv = random(12);
    const entry = { credentialId, vaultSalt };
    const wrapped = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: associatedData(entry) },
      await wrappingKey(output),
      rawKey,
    );
    return {
      id: crypto.randomUUID(),
      name,
      credentialId,
      prfSalt: toBase64(prfSalt),
      vaultSalt,
      iv: toBase64(iv),
      wrappedKey: toBase64(new Uint8Array(wrapped)),
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    throw webauthnError(err);
  }
}

/** Ask for the fingerprint and unwrap the raw vault key of the matching enrolled device. */
export async function unlockWithDevice(devices: DeviceEntry[]): Promise<{ entry: DeviceEntry; rawKey: Uint8Array<ArrayBuffer> }> {
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: devices.map((d) => ({ type: "public-key" as const, id: fromBase64Url(d.credentialId) })),
        userVerification: "required",
        timeout: TIMEOUT_MS,
        extensions: {
          prf: { evalByCredential: Object.fromEntries(devices.map((d) => [d.credentialId, { first: fromBase64(d.prfSalt) }])) },
        },
      },
    })) as PublicKeyCredential | null;
    if (!assertion) throw new PasskeyError("Fingerprint unlock failed");
    const credentialId = toBase64Url(new Uint8Array(assertion.rawId));
    const entry = devices.find((d) => d.credentialId === credentialId);
    if (!entry) throw new PasskeyError("This passkey is not enrolled any more");
    const output = assertion.getClientExtensionResults().prf?.results?.first;
    if (!output) throw new PasskeyError("This device does not support fingerprint unlock (no PRF)");
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(entry.iv), additionalData: associatedData(entry) },
      await wrappingKey(output),
      fromBase64(entry.wrappedKey),
    );
    return { entry, rawKey: new Uint8Array(raw) };
  } catch (err) {
    if (err instanceof DOMException && err.name === "OperationError") throw new PasskeyError("Fingerprint key does not match, enable it again");
    throw webauthnError(err);
  }
}

/** Default device name from the platform, e.g. "Android phone" or "Windows PC". */
export function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android phone";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux PC";
  return "This device";
}
