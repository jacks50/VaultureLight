import { useMemo, useState } from "react";
import { ConfirmDialog } from "../components/Dialog";
import { EntryDialog, type EntryDraft } from "../components/EntryDialog";
import { GeneratorDialog } from "../components/GeneratorDialog";
import { PasswordCard } from "../components/PasswordCard";
import { useToast } from "../components/Toast";
import { Toolbar } from "../components/Toolbar";
import { CLEAR_AFTER_MS, copyAndClear } from "../lib/clipboard";
import type { Entry } from "../lib/vault";

interface VaultScreenProps {
  entries: Entry[];
  dirty: boolean;
  saving: boolean;
  onChange: (entries: Entry[]) => void;
  onSave: () => void;
  onFingerprint: () => void;
  onSignOut: () => void;
}

const byName = (a: Entry, b: Entry) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
  a.username.localeCompare(b.username, undefined, { sensitivity: "base" });

export function VaultScreen({ entries, dirty, saving, onChange, onSave, onFingerprint, onSignOut }: VaultScreenProps) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  // undefined: closed, null: new entry
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [generating, setGenerating] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? entries.filter((e) => [e.name, e.username, e.url].some((v) => v.toLowerCase().includes(q)))
      : entries;
    return [...list].sort(byName);
  }, [entries, search]);

  const copy = async (label: string, value: string) => {
    try {
      await copyAndClear(value);
      toast(`${label} copied, the clipboard is cleared in ${CLEAR_AFTER_MS / 1000} s`, "success");
    } catch {
      toast("Cannot access the clipboard", "error");
    }
  };

  const submit = (draft: EntryDraft) => {
    const now = new Date().toISOString();
    if (editing) {
      onChange(entries.map((e) => (e.id === editing.id ? { ...e, ...draft, updatedAt: now } : e)));
    } else {
      onChange([...entries, { ...draft, id: crypto.randomUUID(), createdAt: now, updatedAt: now }]);
    }
    setEditing(undefined);
  };

  return (
    <div className="vault">
      <Toolbar
        search={search}
        onSearch={setSearch}
        dirty={dirty}
        saving={saving}
        onAdd={() => setEditing(null)}
        onGenerate={() => setGenerating(true)}
        onSave={onSave}
        onFingerprint={onFingerprint}
        onSignOut={onSignOut}
      />
      {dirty && (
        <div className="unsaved-banner" role="status">
          Unsaved changes, they are only in this window.
          <button type="button" className="button small" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      <main className="grid">
        {visible.map((entry) => (
          <PasswordCard
            key={entry.id}
            entry={entry}
            onOpen={() => setEditing(entry)}
            onDelete={() => setDeleting(entry)}
            onCopy={copy}
          />
        ))}
        {visible.length === 0 && <p className="hint empty">{search ? "No password matches your search." : "No passwords yet."}</p>}
      </main>

      {editing !== undefined && (
        <EntryDialog entry={editing} onSubmit={submit} onClose={() => setEditing(undefined)} onCopy={copy} />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete password"
          message={
            <>
              Delete <strong>{deleting.name}</strong>? It is removed from Google Drive at the next save.
            </>
          }
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onChange(entries.filter((e) => e.id !== deleting.id));
            setDeleting(null);
          }}
        />
      )}
      {generating && (
        <GeneratorDialog
          onClose={() => setGenerating(false)}
          onCopy={(password) => {
            copy("Password", password);
            setGenerating(false);
          }}
        />
      )}
    </div>
  );
}
