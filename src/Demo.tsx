// Development-only preview with fake data (`npm run dev`, then /?demo, /?demo=edit, =generator or =fingerprint).
import { useState } from "react";
import { EntryDialog } from "./components/EntryDialog";
import { FingerprintDialog } from "./components/FingerprintDialog";
import { GeneratorDialog } from "./components/GeneratorDialog";
import type { Entry } from "./lib/vault";
import { VaultScreen } from "./screens/VaultScreen";

const now = new Date().toISOString();
const SAMPLE: Entry[] = ["GitHub", "Amazon", "Netflix", "Bank", "Email provider", "Swiss Post", "Steam"].map((name, i) => ({
  id: crypto.randomUUID(),
  name,
  username: i % 3 === 2 ? "" : `user${i}@example.com`,
  url: i % 2 ? "" : `${name.toLowerCase().replace(/\s/g, "")}.com`,
  password: `fake-password-${i}`,
  notes: "",
  createdAt: now,
  updatedAt: now,
}));

export default function Demo() {
  const [entries, setEntries] = useState(SAMPLE);
  const [rev, setRev] = useState(0);
  const view = new URLSearchParams(location.search).get("demo");
  return (
    <>
    {view === "edit" && <EntryDialog entry={entries[0]} onSubmit={() => undefined} onClose={() => undefined} onCopy={() => undefined} />}
    {view === "fingerprint" && (
      <FingerprintDialog
        available
        devices={[
          { id: "1", name: "Android phone", credentialId: "", prfSalt: "", vaultSalt: "S", iv: "", wrappedKey: "", createdAt: now },
          { id: "2", name: "Old PC", credentialId: "", prfSalt: "", vaultSalt: "OLD", iv: "", wrappedKey: "", createdAt: now },
        ]}
        vaultSalt="S"
        busy={null}
        error={null}
        verified={false}
        onVerify={async () => false}
        onEnroll={() => undefined}
        onRemove={() => undefined}
        onClose={() => undefined}
      />
    )}
    {view === "generator" && <GeneratorDialog onClose={() => undefined} onCopy={() => undefined} />}
    <VaultScreen
      entries={entries}
      dirty={rev > 0}
      saving={false}
      onChange={(e) => {
        setEntries(e);
        setRev((r) => r + 1);
      }}
      onSave={() => setRev(0)}
      onFingerprint={() => undefined}
      onSignOut={() => undefined}
    />
    </>
  );
}
