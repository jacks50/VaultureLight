/**
 * Google Drive v3 access for /Vaulture/passwords.vault.
 * With the drive.file scope the app only sees files it created itself, so the folder and
 * the vault are always created by the app (first-run import).
 */
import { AuthError, currentToken, forgetToken } from "./google";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "Vaulture";
const FILE_NAME = "passwords.vault";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const VAULT_MIME = "application/octet-stream";

/** Drive `version` increases on every change; used to detect saves from another device. */
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

export async function findVault(): Promise<DriveFile | null> {
  const folder = await findFolder();
  if (!folder) return null;
  const file = await findOne(`name = '${FILE_NAME}' and '${folder.id}' in parents`, "id,version");
  return file ? { id: file.id, version: file.version } : null;
}

export async function getVersion(fileId: string): Promise<string> {
  const { version } = await (await request(`${API}/files/${fileId}?fields=version`)).json();
  return version;
}

export async function downloadVault(fileId: string): Promise<string> {
  return (await request(`${API}/files/${fileId}?alt=media`, { cache: "no-store" })).text();
}

export async function createVault(content: string): Promise<DriveFile> {
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
  const metadata = { name: FILE_NAME, parents: [folder!.id], mimeType: VAULT_MIME };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  body.append("file", new Blob([content], { type: VAULT_MIME }));
  const file = await (await request(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, { method: "POST", body })).json();
  return { id: file.id, version: file.version };
}

/** Replace the vault content; returns the new Drive version. */
export async function updateVault(fileId: string, content: string): Promise<string> {
  const { version } = await (
    await request(`${UPLOAD}/files/${fileId}?uploadType=media&fields=version`, {
      method: "PATCH",
      headers: { "Content-Type": VAULT_MIME },
      body: content,
    })
  ).json();
  return version;
}
