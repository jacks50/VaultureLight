/**
 * Google Drive v3 access for /Vaulture/passwords.vault and /Vaulture/devices.json.
 * With the drive.file scope the app only sees files it created itself, so the folder and
 * the vault are always created by the app (first-run import).
 */
import { AuthError, currentToken, forgetToken } from "./google";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "Vaulture";
const VAULT_NAME = "passwords.vault";
const DEVICES_NAME = "devices.json";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const VAULT_MIME = "application/octet-stream";
const JSON_MIME = "application/json";

/**
 * `version` holds the content's md5Checksum: it changes only when the content does, unlike Drive's
 * own `version` field, which also increases on server-side changes invisible to the user.
 * Used to detect saves from another device.
 */
export interface DriveFile {
  id: string;
  version: string;
}

export class DriveError extends Error {}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const token = currentToken();
  if (!token) throw new AuthError("Google session expired");
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveError("Cannot reach Google Drive, check your connection");
  }
  if (response.status === 401) {
    forgetToken();
    throw new AuthError("Google session expired");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new DriveError(`Google Drive error ${response.status}: ${body?.error?.message ?? response.statusText}`);
  }
  return response;
}

async function findOne(query: string, fields: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams({
    q: `${query} and trashed = false`,
    fields: `files(${fields})`,
    orderBy: "modifiedTime desc",
    pageSize: "1",
    spaces: "drive",
  });
  const { files } = await (await request(`${API}/files?${params}`)).json();
  return files?.[0] ?? null;
}

function findFolder(): Promise<Record<string, string> | null> {
  return findOne(`name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and 'root' in parents`, "id");
}

export async function getUserEmail(): Promise<string> {
  const { user } = await (await request(`${API}/about?fields=user(emailAddress)`)).json();
  return user?.emailAddress ?? "";
}

async function findFile(name: string): Promise<DriveFile | null> {
  const folder = await findFolder();
  if (!folder) return null;
  const file = await findOne(`name = '${name}' and '${folder.id}' in parents`, "id,md5Checksum");
  return file ? { id: file.id, version: file.md5Checksum } : null;
}

async function createFile(name: string, content: string, mimeType: string): Promise<DriveFile> {
  let folder = await findFolder();
  if (!folder) {
    folder = await (
      await request(`${API}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME, parents: ["root"] }),
      })
    ).json();
  }
  const metadata = { name, parents: [folder!.id], mimeType };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  body.append("file", new Blob([content], { type: mimeType }));
  const file = await (await request(`${UPLOAD}/files?uploadType=multipart&fields=id,md5Checksum`, { method: "POST", body })).json();
  return { id: file.id, version: file.md5Checksum };
}

/** Replace a file's content; returns its new checksum. */
async function updateFile(fileId: string, content: string, mimeType: string): Promise<string> {
  const { md5Checksum } = await (
    await request(`${UPLOAD}/files/${fileId}?uploadType=media&fields=md5Checksum`, {
      method: "PATCH",
      headers: { "Content-Type": mimeType },
      body: content,
    })
  ).json();
  return md5Checksum;
}

export async function getVersion(fileId: string): Promise<string> {
  const { md5Checksum } = await (await request(`${API}/files/${fileId}?fields=md5Checksum`)).json();
  return md5Checksum;
}

export async function downloadFile(fileId: string): Promise<string> {
  return (await request(`${API}/files/${fileId}?alt=media`, { cache: "no-store" })).text();
}

export const findVault = () => findFile(VAULT_NAME);
export const downloadVault = downloadFile;
export const createVault = (content: string) => createFile(VAULT_NAME, content, VAULT_MIME);
export const updateVault = (fileId: string, content: string) => updateFile(fileId, content, VAULT_MIME);

// Fingerprint unlock registry (see lib/passkey.ts), stored next to the vault
export const findDevices = () => findFile(DEVICES_NAME);
export const createDevices = (content: string) => createFile(DEVICES_NAME, content, JSON_MIME);
export const updateDevices = (fileId: string, content: string) => updateFile(fileId, content, JSON_MIME);
