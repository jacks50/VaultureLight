// Development-only preview with fake data (`npm run dev`, then /?demo, /?demo=edit or /?demo=generator).
import { useState } from "react";
import { EntryDialog } from "./components/EntryDialog";
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
      onSignOut={() => undefined}
    />
    </>
  );
}
