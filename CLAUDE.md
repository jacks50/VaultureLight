# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

VaultureLight is a PWA password manager for phone and PC. The encrypted vault lives in the user's Google Drive at `/Vaulture/passwords.vault`. It replaces two sibling projects: `../vaulture` (Android/Kotlin) and `../VaultuReact` (Next.js). `tools/vault_tool.py` migrated their vault files. See `PLAN.md` for the roadmap and decisions.

## Commands

```sh
npm run dev          # http://localhost:5173 ; http://localhost:5173/?demo shows the vault UI with fake data, no Google needed
npm test             # vitest; run a single file: npx vitest run tests/vault.test.ts
npm run typecheck
npm run build        # type-check + static build into dist/ (base /VaultureLight/ for GitHub Pages)
```

The Google OAuth client ID is `VITE_GOOGLE_CLIENT_ID` in `.env`. It's public, not a secret.

The local Node version is 18. That's why Vite 6 and Vitest 3 are used (newer versions need Node 20 or 22). Dependencies are pinned exactly (`.npmrc` `save-exact`).

### Migration tool

```sh
python3 tools/vault_tool.py gather <folder> [-o passwords.txt] [-j passwords.json] [-r] [--keep-duplicates]
python3 tools/vault_tool.py encrypt passwords.json [-o passwords.vault] [--legacy]
python3 tools/vault_tool.py decrypt passwords.vault [-o vault.json]
```

All tool commands prompt for the password. Their only dependency is `cryptography`. Intended workflow: run `gather -j`, review and edit the JSON by hand, then run `encrypt` to produce the final vault for the new app.

## Vault formats

**v1 (legacy, shared by both sibling apps)**
- Layout: `salt (16 ASCII chars) + IV (16 ASCII chars) + base64(AES-256-CBC, PKCS7)`.
- Key: PBKDF2-HMAC-SHA256 over the password, with the salt string's UTF-8 bytes as salt, 65536 iterations and a 32-byte key.
- Plaintext: a JSON object that maps `passwordUID` to `{passwordId, passwordName, passwordUsername, passwordURL, passwordValue, loginId, passwordUID}`.
- References: `../vaulture/app/src/main/java/ch/jacks/vaulture/util/CryptUtil.kt` and `../VaultuReact/src/utils/encryption/encryptDecrypt.tsx`.

**v2 (new app)**
- Layout: the same as v1, `salt (16 ASCII chars) + IV (16 ASCII chars) + base64(ciphertext + 16-byte GCM tag)`, with no header or settings block. This is deliberate: the user wants files to keep the legacy layout.
- Crypto: PBKDF2-HMAC-SHA256 over the password, with the salt string's UTF-8 bytes as salt, 600,000 iterations and a 32-byte key, then AES-256-GCM with the 16-byte IV string. These settings are fixed in code (the app must hardcode them too), and all of it works with browser WebCrypto natively.
- Plaintext: `{version: 2, entries: [{id, name, username, url, password, notes, createdAt, updatedAt}]}`.
- Telling v1 and v2 apart: the files look the same, so the tool tries v2 first. A GCM tag failure then falls back to v1.

## App architecture

- **Hard constraint: nothing persisted in the browser.** No localStorage or IndexedDB, and no caching of data. The vault, the derived `CryptoKey`, the entries and the Google access token live only in React state and module memory. Lock or reload means signing in again. Don't add browser storage.
- **`src/lib/vault.ts`:** the v2 format in WebCrypto. The salt is kept for the vault's lifetime, so the derived key can re-encrypt on save without the password. Every save uses a fresh IV. `tests/fixtures/sample.vault` was made by `vault_tool.py` (password `fixture-password`) and keeps the two implementations compatible.
- **`src/lib/google.ts`:** Google Identity Services token model, `drive.file` scope only. `requestToken()`/`ensureToken()` must be called synchronously inside click handlers, before any `await`, or the popup gets blocked.
- **`src/lib/drive.ts`:** Drive v3 REST via `fetch`. With `drive.file`, the app only sees files it created, so `/Vaulture` and the vault are created by the app's import flow. Drive's `version` field is recorded at load and compared before each save to detect saves from another device.
- **`src/App.tsx`:** the screen state machine (`signin`, then `import` or `unlock`, then `vault`) plus save, reload, conflict and lock logic. Unsaved state is tracked as `rev !== savedRev`.
- **`src/lib/passkey.ts` (fingerprint unlock):**
  - Each device's passkey PRF output goes through HKDF to an AES-GCM key. That key wraps the raw vault key, bound by additional data to the credential ID and the vault salt.
  - Entries live in `/Vaulture/devices.json` in Drive.
  - The raw key exists only briefly: `deriveRawKey`/`importVaultKey` in `vault.ts`, and it's zeroed afterwards. The in-memory vault key stays non-extractable.
  - Enrolment is two clicks (password check, then fingerprint), so the WebAuthn prompt runs inside a user gesture.
  - The RP ID is `jacks50.github.io`, which is shared with all the user's GitHub Pages sites (same origin).
  - `tests/passkey.test.ts` uses a fake authenticator.
- **Google grant:** sign-out only forgets the token and doesn't revoke the grant. Revoking forced the consent screen every time.
- **Security hardening:**
  - The CSP is injected only into the production build, by the plugin in `vite.config.ts`. The dev server needs inline scripts.
  - Trusted Types are enforced. The only script URL allowed is Google's sign-in script, through the policy in `google.ts`.
  - `assetsInlineLimit: 0` keeps `data:` URIs out of the build, so `font-src` and `img-src` can stay `'self'`.
  - Google's sign-in script tries to add inline styles. That's blocked on purpose and harmless, because the app doesn't use Google's button.
  - `main.tsx` refuses to run inside a frame.
  - Copies go through `lib/clipboard.ts`, which clears the clipboard after 30 seconds.
  - Test CSP changes with `npm run build && npx vite preview --port 5173` (5173 is an authorized OAuth origin; the app is at `/VaultureLight/`).
- **UI:** plain CSS in `src/styles.css`, mimicking VaultuReact's MUI dark theme (black, white, `#b71c1c`). Icons are Material Symbols SVGs inlined at build time via `?raw` (`src/components/Icon.tsx`).

## vault_tool.py behavior

- **gather sorting:** output is sorted by name, then username (case-insensitive). When name and username are the same, the entry from the older file (by mtime) comes first.
- **gather duplicates:** entries that match exactly (name, username, URL and password) are merged into one block that lists all source files.
- **gather skipped files:** files that fail to decrypt are skipped and reported on stderr.
- **gather JSON output:** `-j` writes the merged entries as a JSON array, in the same order. Each entry is `{passwordName, passwordUsername, passwordURL, passwordValue, notes, updateDate}`, where `updateDate` is the source file's mtime.
- **encrypt validation:** every entry needs a `passwordName`.
- **encrypt ids and dates:** entries get fresh UUIDs, because old vault versions reuse `passwordUID`. `updateDate` (or the older `sourceDate`) becomes `createdAt`/`updatedAt`.
- **encrypt safety check:** the vault is decrypted again before writing, and nothing is written if the result doesn't match.
- **Plaintext outputs:** every plaintext file is written with mode 600.
