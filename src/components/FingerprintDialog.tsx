import { useState } from "react";
import { defaultDeviceName, type DeviceEntry } from "../lib/passkey";
import { Dialog } from "./Dialog";
import { Icon, IconButton } from "./Icon";
import { PasswordInput } from "./PasswordInput";

interface FingerprintDialogProps {
  available: boolean;
  devices: DeviceEntry[];
  vaultSalt: string;
  busy: string | null;
  error: string | null;
  /** True once the master password is checked; then the fingerprint step is shown. */
  verified: boolean;
  /** Step 1: check the master password (no fingerprint yet). */
  onVerify: (password: string) => Promise<boolean>;
  /** Step 2: create the passkey; a separate click so the browser allows the fingerprint prompt. */
  onEnroll: (name: string) => void;
  onRemove: (device: DeviceEntry) => void;
  onClose: () => void;
}

export function FingerprintDialog({ available, devices, vaultSalt, busy, error, verified, onVerify, onEnroll, onRemove, onClose }: FingerprintDialogProps) {
  const [name, setName] = useState(defaultDeviceName);
  const [password, setPassword] = useState("");

  return (
    <Dialog
      title="Fingerprint unlock"
      onClose={onClose}
      actions={
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <p>
        Each device gets its own passkey, protected by its fingerprint or screen lock. Your master password is still needed if
        the fingerprint fails.
      </p>

      {devices.length > 0 && (
        <ul className="device-list">
          {devices.map((d) => (
            <li key={d.id}>
              <Icon name="fingerprint" />
              <span className="device-name">
                {d.name}
                <small>
                  {d.vaultSalt === vaultSalt ? `Added ${new Date(d.createdAt).toLocaleDateString()}` : "Outdated: master password changed"}
                </small>
              </span>
              <IconButton icon="delete" label={`Remove ${d.name}`} danger disabled={!!busy} onClick={() => onRemove(d)} />
            </li>
          ))}
        </ul>
      )}

      {!available ? (
        <p className="error">This browser or device has no fingerprint / screen lock support for passkeys.</p>
      ) : !verified ? (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password && name.trim() && !busy && (await onVerify(password))) setPassword("");
          }}
        >
          <label className="field">
            <span>Name of this device</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
          </label>
          <label className="field">
            <span>Master password</span>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="button" disabled={!password || !name.trim() || !!busy}>
            Enable on this device
          </button>
        </form>
      ) : (
        <button type="button" className="button" disabled={!!busy} onClick={() => onEnroll(name.trim())}>
          <Icon name="fingerprint" />
          Use my fingerprint
        </button>
      )}

      {busy && <p className="hint">{busy}</p>}
      {error && !busy && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
