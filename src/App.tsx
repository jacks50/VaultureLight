import { useEffect, useState } from "react";
import { ConfirmDialog, Dialog } from "./components/Dialog";
import { useToast } from "./components/Toast";
import { clearIfCopied } from "./lib/clipboard";
import { createVault, downloadVault, DriveError, type DriveFile, findVault, getUserEmail, getVersion, updateVault } from "./lib/drive";
import { AuthError, ensureToken, initGoogle, requestToken, signOut } from "./lib/google";
import { decryptVault, decryptWithKey, encryptVault, type Entry, type VaultKey, WrongPasswordError } from "./lib/vault";
import { ImportScreen, SignInScreen, UnlockScreen } from "./screens/AuthScreens";
import { VaultScreen } from "./screens/VaultScreen";

type Screen = "signin" | "import" | "unlock" | "vault";

/** Everything lives in memory only; locking or reloading the page drops it. */
interface Unlocked {
  vaultKey: VaultKey;
  entries: Entry[];
  /** Incremented on every change; equal to savedRev when nothing is unsaved. */
  rev: number;
  savedRev: number;
}

function errorMessage(err: unknown): string {
  if (err instanceof WrongPasswordError) return "Wrong master password";
  if (err instanceof AuthError || err instanceof DriveError) return err.message;
  return err instanceof Error ? err.message : "Unexpected error";
}

export default function App() {
  const toast = useToast();
  const [googleReady, setGoogleReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("signin");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<DriveFile | null>(null);
  const [vault, setVault] = useState<Unlocked | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const dirty = !!vault && vault.rev !== vault.savedRev;

  useEffect(() => {
    initGoogle()
      .then(() => setGoogleReady(true))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Run a step of the sign-in / unlock flow with a progress message and error display. */
  const run = async (message: string, step: () => Promise<void>) => {
    setBusy(message);
    setError(null);
    try {
      await step();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleSignIn = () => {
    const token = requestToken(); // synchronously in the click, so the popup is not blocked
    run("Looking for /Vaulture/passwords.vault…", async () => {
      await token;
      const [userEmail, found] = await Promise.all([getUserEmail(), findVault()]);
      setEmail(userEmail);
      setFile(found);
      setScreen(found ? "unlock" : "import");
    });
  };

  const handleUnlock = (password: string) => {
    const token = ensureToken();
    run("Unlocking…", async () => {
      await token;
      const current = file ?? (await findVault());
      if (!current) {
        setScreen("import");
        return;
      }
      const version = await getVersion(current.id);
      const { data, vaultKey } = await decryptVault(await downloadVault(current.id), password);
      setFile({ id: current.id, version });
      setVault({ vaultKey, entries: data.entries, rev: 0, savedRev: 0 });
      setScreen("vault");
    });
  };

  const handleImport = (source: File, password: string) => {
    const token = ensureToken();
    run("Importing to Google Drive…", async () => {
      await token;
      const content = (await source.text()).trim();
      const { data, vaultKey } = await decryptVault(content, password);
      const existing = await findVault();
      if (existing) {
        setFile(existing);
        setScreen("unlock");
        throw new Error("A vault already exists in /Vaulture, unlock it instead");
      }
      setFile(await createVault(content));
      setVault({ vaultKey, entries: data.entries, rev: 0, savedRev: 0 });
      setScreen("vault");
      toast("Vault imported to Google Drive", "success");
    });
  };

  const handleSave = async (force = false) => {
    if (!file || !vault || saving) return;
    const token = ensureToken();
    setSaving(true);
    try {
      await token;
      if (!force && (await getVersion(file.id)) !== file.version) {
        setConflict(true);
        return;
      }
      const savingRev = vault.rev;
      const content = await encryptVault({ version: 2, entries: vault.entries }, vault.vaultKey);
      const version = await updateVault(file.id, content);
      setFile({ ...file, version });
      setVault((v) => v && { ...v, savedRev: savingRev });
      toast("Saved to Google Drive", "success");
    } catch (err) {
      toast(`Not saved: ${errorMessage(err)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    if (!file || !vault) return;
    setConflict(false);
    const token = ensureToken();
    setSaving(true);
    try {
      await token;
      const version = await getVersion(file.id);
      const data = await decryptWithKey(await downloadVault(file.id), vault.vaultKey);
      setFile({ ...file, version });
      setVault({ ...vault, entries: data.entries, rev: 0, savedRev: 0 });
      toast("Reloaded from Google Drive", "success");
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        // The master password was changed on another device: the current key no longer fits
        lock();
        setError("The vault was re-encrypted on another device, unlock it again");
      } else {
        toast(`Not reloaded: ${errorMessage(err)}`, "error");
      }
    } finally {
      setSaving(false);
    }
  };

  /** Drop the decrypted vault and key; used when the key no longer fits the Drive file. */
  const lock = () => {
    setVault(null);
    setConflict(false);
    setScreen("unlock");
  };

  const leave = () => {
    lock();
    clearIfCopied();
    signOut();
    setFile(null);
    setEmail("");
    setError(null);
    setScreen("signin");
  };

  if (screen === "vault" && vault) {
    return (
      <>
        <VaultScreen
          entries={vault.entries}
          dirty={dirty}
          saving={saving}
          onChange={(entries) => setVault((v) => v && { ...v, entries, rev: v.rev + 1 })}
          onSave={() => handleSave()}
          onSignOut={() => (dirty ? setConfirmSignOut(true) : leave())}
        />
        {conflict && (
          <Dialog
            title="Vault changed on another device"
            onClose={() => setConflict(false)}
            actions={
              <>
                <button type="button" className="button" onClick={() => setConflict(false)}>
                  Cancel
                </button>
                <button type="button" className="button danger" onClick={handleReload}>
                  Reload
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => {
                    setConflict(false);
                    handleSave(true);
                  }}
                >
                  Overwrite
                </button>
              </>
            }
          >
            <p>The vault in Google Drive was saved from another device since you opened it.</p>
            <p>
              <strong>Reload</strong> loads that version and discards your unsaved changes.
              <br />
              <strong>Overwrite</strong> replaces it with your version, discarding the other device's changes.
            </p>
          </Dialog>
        )}
        {confirmSignOut && (
          <ConfirmDialog
            title="Unsaved changes"
            message="Your changes are not saved to Google Drive and will be lost."
            confirmLabel="Sign out anyway"
            danger
            onCancel={() => setConfirmSignOut(false)}
            onConfirm={() => {
              setConfirmSignOut(false);
              leave();
            }}
          />
        )}
      </>
    );
  }

  if (screen === "unlock") {
    return <UnlockScreen email={email} busy={busy} error={error} onUnlock={handleUnlock} onSignOut={leave} />;
  }
  if (screen === "import") {
    return <ImportScreen email={email} busy={busy} error={error} onImport={handleImport} onSignOut={leave} />;
  }
  return <SignInScreen ready={googleReady} busy={busy} error={error} onSignIn={handleSignIn} />;
}
