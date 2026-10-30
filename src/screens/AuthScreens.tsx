import { useState } from "react";
import { Icon } from "../components/Icon";
import { PasswordInput } from "../components/PasswordInput";

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <img className="auth-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="VaultureLight logo" width={140} height={140} />
      <h1 className="auth-title">VaultureLight</h1>
      <div className="auth-body">{children}</div>
    </main>
  );
}

function Status({ busy, error }: { busy: string | null; error: string | null }) {
  return (
    <>
      {busy && (
        <div className="status">
          <div className="progress" role="progressbar" aria-label={busy} />
          <p className="hint">{busy}</p>
        </div>
      )}
      {error && !busy && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

interface CommonProps {
  busy: string | null;
  error: string | null;
}

export function SignInScreen({ ready, busy, error, onSignIn }: CommonProps & { ready: boolean; onSignIn: () => void }) {
  return (
    <AuthLayout>
      <p className="hint">Your vault is stored encrypted in your Google Drive.</p>
      <button type="button" className="button" disabled={!ready || !!busy} onClick={onSignIn}>
        Sign in with Google
      </button>
      <Status busy={busy ?? (ready || error ? null : "Loading Google sign-in…")} error={error} />
    </AuthLayout>
  );
}

interface UnlockScreenProps extends CommonProps {
  email: string;
  /** Set when this device can unlock with a fingerprint. */
  onFingerprint?: () => void;
  onUnlock: (password: string) => void;
  onSignOut: () => void;
}

export function UnlockScreen({ email, busy, error, onFingerprint, onUnlock, onSignOut }: UnlockScreenProps) {
  const [password, setPassword] = useState("");
  return (
    <AuthLayout>
      <p className="hint">Connected as {email}</p>
      {onFingerprint && (
        <>
          <button type="button" className="button" onClick={onFingerprint} disabled={!!busy}>
            <Icon name="fingerprint" />
            Unlock with fingerprint
          </button>
          <p className="hint">or with your master password</p>
        </>
      )}
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (password && !busy) onUnlock(password);
        }}
      >
        <PasswordInput placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!onFingerprint} />
        <button type="submit" className="button" disabled={!password || !!busy}>
          Unlock
        </button>
      </form>
      <button type="button" className="button text" onClick={onSignOut} disabled={!!busy}>
        Sign out
      </button>
      <Status busy={busy} error={error} />
    </AuthLayout>
  );
}

interface ImportScreenProps extends CommonProps {
  email: string;
  onImport: (file: File, password: string) => void;
  onSignOut: () => void;
}

export function ImportScreen({ email, busy, error, onImport, onSignOut }: ImportScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  return (
    <AuthLayout>
      <p className="hint">
        Connected as {email}
        <br />
        No vault found in <code>/Vaulture</code> in your Google Drive. Import your <code>passwords.vault</code> to create it.
      </p>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (file && password && !busy) onImport(file, password);
        }}
      >
        <label className="button file-button">
          <Icon name="uploadFile" />
          <span>{file ? file.name : "Choose a .vault file"}</span>
          <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <PasswordInput placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="button" disabled={!file || !password || !!busy}>
          Import to Google Drive
        </button>
      </form>
      <button type="button" className="button text" onClick={onSignOut} disabled={!!busy}>
        Sign out
      </button>
      <Status busy={busy} error={error} />
    </AuthLayout>
  );
}
