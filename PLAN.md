# VaultureLight plan

A PWA password manager for phone and PC. The encrypted vault lives in Google Drive at `/Vaulture/passwords.vault`. Nothing is stored in the browser.

## Decisions

- **Hosting:** Vite + React + TypeScript, plain CSS, built as a static site for GitHub Pages (`https://jacks50.github.io/VaultureLight/`).
- **Style:** the same look as VaultuReact. Dark theme, black background, white text, red `#b71c1c` toolbar and danger actions, Roboto font (bundled), responsive card grid.
- **Crypto:** WebCrypto only, using the v2 format (see `CLAUDE.md`). The salt stays fixed for the vault's lifetime, and a fresh IV is used on every save. The salt only changes with the master password.
- **Storage:** none in the browser (no localStorage or IndexedDB, and no caching of data). Vault, key, master password and Google token live in memory only. A refresh or lock means signing in again.
- **Drive:** the `drive.file` scope only. The app creates `/Vaulture` and `passwords.vault` itself, by importing from a local file on first run, so it finds them on every device. Signing in uses Google Identity Services (token model). No API key or Picker is needed.
- **Save:** manual Save button. Changes stay in memory until saved, with an unsaved-changes indicator and a `beforeunload` warning.
- **Conflicts:** the Drive file version is recorded when the vault loads. On Save, if Drive has a newer version, you choose between overwriting it and reloading (which discards your changes).
- **No lock:** closing the app (tab or PWA) drops everything from memory, which signs you out. Only Sign out is in the UI. There's no auto-lock, by the user's choice.
- **Fingerprint (phase 4):** WebAuthn PRF. `/Vaulture/devices.json` holds, per device, the vault key wrapped by that passkey's PRF output.

## Phase 1: Core app (done, except testing against the real Google Drive)

- [x] Vite/React/TS scaffold in this folder, with `vault_tool.py` copied to `tools/`
- [x] Crypto module (v2 decrypt/encrypt, password-derived key) with a test against a `vault_tool.py` fixture
- [x] Google sign-in and Drive client (find or create `/Vaulture/passwords.vault`, download, upload with a version check)
- [x] First run: import a local `passwords.vault` into Drive
- [x] Unlock with the master password
- [x] List with search, and card actions: open URL, copy username, copy password, delete with confirmation
- [x] Add and edit dialog (name, username, URL, password, notes; show/hide)
- [x] Password generator: length 12–36, digits 4–12, symbols 4–12, using `crypto.getRandomValues`
- [x] Save button, unsaved indicator, conflict dialog (Reload / Overwrite)
- [x] Lock and sign out (with a confirmation when there are unsaved changes)
- [ ] End-to-end test with the real OAuth client ID

## Phase 2: Security (done, except testing sign-in on the production build)

- [x] Lock button removed; closing the app means signing out
- [x] Clipboard cleared 30 seconds after a copy (retried when the app regains focus, and cleared on sign-out)
- [x] CSP `<meta>` (production build only): `default-src 'none'`, Google endpoints only, Trusted Types, no `data:`
- [x] Refuses to run inside a frame (clickjacking)
- [x] No spellcheck, autocorrect or autocomplete on fields
- [x] Exact pinned dependency versions
- [ ] Sign-in tested on the production build (`npm run build && npx vite preview --port 5173`)

## Phase 3: Install and deploy (done)

- [x] Web app manifest and icons (no service worker)
- [x] GitHub Actions deploy to GitHub Pages: actions pinned to SHAs, `npm ci --ignore-scripts`, tests before build
- [x] Live at https://jacks50.github.io/VaultureLight/ (repo `jacks50/VaultureLight`; every push to `main` redeploys)
- [ ] Tested on phone and PC: install, sign in, unlock, save, sync between devices

## Phase 4: Fingerprint unlock (built, to be tested on real devices)

- [x] Enrol a passkey with PRF, and store the wrapped vault key in `/Vaulture/devices.json` (master password confirmed first)
- [x] Unlock with the passkey, falling back to the master password
- [x] Remove a device (the passkey itself must also be deleted in the OS or Google Password Manager settings)
- [x] Sign out no longer revokes the Google grant (that forced the consent screen and test-app warning on every sign-in)
- [ ] Tested on Android and PC
