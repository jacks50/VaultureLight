/**
 * Google sign-in with Google Identity Services (token model).
 * The access token lives in this module's memory only — never in any browser storage.
 */
const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const EXPIRY_MARGIN_MS = 60_000;

export const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

// Trusted Types (enforced by the CSP): the only script URL this app may ever load
interface ScriptUrlPolicy {
  createScriptURL(url: string): string;
}
declare global {
  interface Window {
    trustedTypes?: { createPolicy(name: string, rules: { createScriptURL(url: string): string }): ScriptUrlPolicy };
  }
}
const scriptUrlPolicy: ScriptUrlPolicy = window.trustedTypes?.createPolicy("vaulturelight-gis", {
  createScriptURL: (url) => {
    if (url !== GIS_SRC) throw new TypeError(`Script URL not allowed: ${url}`);
    return url;
  },
}) ?? { createScriptURL: (url) => url };

let gisLoading: Promise<void> | null = null;
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let pending: { resolve: (token: string) => void; reject: (err: Error) => void } | null = null;
let accessToken: string | null = null;
let expiresAt = 0;

export class AuthError extends Error {}

function loadGis(): Promise<void> {
  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrlPolicy.createScriptURL(GIS_SRC);
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoading = null;
      reject(new AuthError("Cannot reach Google, check your connection"));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

/** Load the Google library ahead of time so the sign-in popup opens directly on click. */
export async function initGoogle(): Promise<void> {
  if (!CLIENT_ID) throw new AuthError("Google client ID missing (VITE_GOOGLE_CLIENT_ID)");
  await loadGis();
  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      const p = pending;
      pending = null;
      if (response.error || !response.access_token) {
        p?.reject(new AuthError(response.error_description || "Google sign-in failed"));
        return;
      }
      if (!google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
        p?.reject(new AuthError("Google Drive access was not granted"));
        return;
      }
      accessToken = response.access_token;
      expiresAt = Date.now() + Number(response.expires_in) * 1000;
      p?.resolve(accessToken);
    },
    error_callback: (error) => {
      const p = pending;
      pending = null;
      p?.reject(new AuthError(error.type === "popup_closed" ? "Sign-in cancelled" : "Google sign-in failed"));
    },
  });
}

/**
 * Open the Google sign-in popup. Must be called synchronously from a click handler
 * (after initGoogle resolved), otherwise browsers block the popup.
 */
export function requestToken(): Promise<string> {
  if (!tokenClient) return Promise.reject(new AuthError("Google sign-in is not ready yet"));
  pending?.reject(new AuthError("Sign-in superseded"));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient!.requestAccessToken({ prompt: "" });
  });
}

/** Current token, or null when missing / about to expire. */
export function currentToken(): string | null {
  return accessToken && Date.now() < expiresAt - EXPIRY_MARGIN_MS ? accessToken : null;
}

/** Current token if still valid, otherwise a new one (call from a click handler). */
export function ensureToken(): Promise<string> {
  const token = currentToken();
  return token ? Promise.resolve(token) : requestToken();
}

export function forgetToken(): void {
  accessToken = null;
  expiresAt = 0;
}

/**
 * Forget the token without revoking the app's Drive grant: revoking would make Google show the
 * full consent screen (and the "unverified app" warning) on every sign-in.
 */
export function signOut(): void {
  forgetToken();
}
